import { Response } from 'express';
import { randomUUID } from 'crypto';
import { AiService } from '../services/ai.service';
import { DocumentService } from '../services/document.service';
import { PromptSynthesisService } from '../services/prompt-synthesis.service';
import { asyncHandler } from '../middleware/error.middleware';
import { AppError } from '../middleware/error.middleware';
import { loggerUtil } from '../utils/logger.util';
import { GenerateDocRequest, DocumentSection, DocumentStructure } from '../types/document.types';
import { AuthRequest } from './chat.controller';
import { ConversationRepository } from '../repositories/conversation.repository';
import { MessageRepository } from '../repositories/message.repository';

/**
 * Document Controller
 *
 * Flow:
 *  create:     conversationId → synthesize prompt → AI generates JSON → assign UUIDs → save v(N+1) → stream .docx
 *  edit:       conversationId → synthesize prompt + latest doc JSON → AI returns partial → merge by UUID → save v(N+1) → stream .docx
 *  standalone: prompt string → AI generates JSON → assign UUIDs → stream .docx (no conversation)
 */
export class DocumentController {
    private aiService: AiService;
    private documentService: DocumentService;
    private conversationRepo: ConversationRepository;
    private promptSynthesisService: PromptSynthesisService;
    private messageRepo: MessageRepository;

    constructor() {
        this.aiService = new AiService();
        this.documentService = new DocumentService();
        this.conversationRepo = new ConversationRepository();
        this.promptSynthesisService = new PromptSynthesisService();
        this.messageRepo = new MessageRepository();
    }

    // ── Utility: Assign UUIDs to all sections recursively ─────────────────────
    private assignSectionIds(sections: DocumentSection[]): void {
        for (const section of sections) {
            if (!section.id) {
                section.id = randomUUID();
            }
            // Recurse into nested sections (two_column, section_block)
            if (section.sections && section.sections.length > 0) {
                this.assignSectionIds(section.sections);
            }
        }
    }

    // ── Utility: Merge partial edit result with previous sections ──────────────
    private mergeSections(
        previous: DocumentSection[],
        updated: DocumentSection[],
        deletedIds?: string[]
    ): DocumentSection[] {
        // Step 1: Start with a deep copy of previous sections and index valid IDs
        let merged = previous.map(s => ({ ...s }));
        const previousIdSet = new Set<string>();
        for (const s of previous) {
            if (s.id) previousIdSet.add(s.id);
        }

        // Step 2: Separate updated sections into "modified" (existing id) and "new" (no id or invalid id)
        const modifiedById = new Map<string, DocumentSection>();
        const newSections: DocumentSection[] = [];

        for (const section of updated) {
            // Only classify as modified if its ID actually exists in previous version
            if (section.id && previousIdSet.has(section.id)) {
                modifiedById.set(section.id, section);
            } else {
                // If AI generated an unrecognized ID, strip it so a proper one is assigned
                const cleanSection = { ...section };
                if (cleanSection.id && !previousIdSet.has(cleanSection.id)) {
                    delete cleanSection.id;
                }
                newSections.push(cleanSection);
            }
        }

        loggerUtil.info('[MERGE] Classified updated sections', {
            modifiedCount: modifiedById.size,
            newCount: newSections.length,
            newSectionSummary: newSections.map(s => ({
                type: s.type,
                afterId: s.afterId || '(no afterId)',
                content: (s.content || '').substring(0, 80),
            })),
        });

        // Step 3: Replace modified sections in-place
        merged = merged.map(s => {
            if (s.id && modifiedById.has(s.id)) {
                const replacement = modifiedById.get(s.id)!;
                delete replacement.afterId;
                return replacement;
            }
            return s;
        });

        // Step 4: Insert new sections (BEFORE deleting, so afterId pointing to a deleted section still works!)
        let lastInsertedIndex: number | null = null;

        for (const section of newSections) {
            const cleaned = { ...section };
            delete cleaned.afterId;

            if (section.afterId) {
                const targetIdx = merged.findIndex(s => s.id === section.afterId);
                if (targetIdx !== -1) {
                    const insertPos = targetIdx + 1;
                    loggerUtil.info('[MERGE] Inserting section after targetId', {
                        afterId: section.afterId,
                        atIndex: insertPos,
                        type: section.type,
                    });
                    merged.splice(insertPos, 0, cleaned);
                    lastInsertedIndex = insertPos;
                } else {
                    // Fallback if targetId not found: if we recently inserted, continue sequentially; else append
                    if (lastInsertedIndex !== null) {
                        const baseIdx: number = lastInsertedIndex;
                        const seqInsertPos: number = baseIdx + 1;
                        loggerUtil.warn('[MERGE] afterId target not found — continuing sequentially after last inserted', {
                            afterId: section.afterId,
                            atIndex: seqInsertPos,
                            type: section.type,
                        });
                        merged.splice(seqInsertPos, 0, cleaned);
                        lastInsertedIndex = seqInsertPos;
                    } else {
                        loggerUtil.warn('[MERGE] afterId target not found — appending at end', {
                            afterId: section.afterId,
                            type: section.type,
                        });
                        merged.push(cleaned);
                        lastInsertedIndex = merged.length - 1;
                    }
                }
            } else {
                // No afterId: if part of a contiguous new section block, continue sequentially!
                if (lastInsertedIndex !== null) {
                    const baseIdx: number = lastInsertedIndex;
                    const contInsertPos: number = baseIdx + 1;
                    loggerUtil.info('[MERGE] Inserting contiguous section sequentially', {
                        atIndex: contInsertPos,
                        type: section.type,
                    });
                    merged.splice(contInsertPos, 0, cleaned);
                    lastInsertedIndex = contInsertPos;
                } else {
                    loggerUtil.info('[MERGE] Appending section at end of document', { type: section.type });
                    merged.push(cleaned);
                    lastInsertedIndex = merged.length - 1;
                }
            }
        }

        // Step 5: Remove deleted sections AFTER insertions are complete
        if (deletedIds && deletedIds.length > 0) {
            const deleteSet = new Set(deletedIds);
            const beforeLen = merged.length;
            merged = merged.filter(s => !s.id || !deleteSet.has(s.id));
            loggerUtil.info('[MERGE] After delete step', {
                requestedDeletions: deleteSet.size,
                actuallyRemovedCount: beforeLen - merged.length,
                remainingCount: merged.length,
            });
        }

        return merged;
    }

    /**
     * Generate or edit a DOCX document
     * POST /api/document/generate
     * Body: { conversationId?, intent?, prompt?, documentType?, template? }
     */
    generate = asyncHandler(async (req: AuthRequest, res: Response) => {
        const {
            prompt,
            documentType,
            template,
            conversationId,
            intent,
            messageId,
        } = req.body as GenerateDocRequest;

        const userId = req.userId!;

        // Validate: either conversationId or prompt must be provided
        if (!conversationId && (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0)) {
            throw new AppError(400, 'Either conversationId or a non-empty prompt string is required');
        }

        if (conversationId) {
            // Security check: ensure user owns this conversation
            const conversation = await this.conversationRepo.findByIdAndUser(conversationId, userId);
            if (!conversation) {
                throw new AppError(404, 'Conversation not found or access denied');
            }
        }

        loggerUtil.info('Document generation request received', {
            promptLength: prompt?.length || 0,
            documentType: documentType || 'auto',
            template: template || 'generic',
            conversationId: conversationId || 'none',
            intent: intent || 'create',
            userId
        });

        // ── Step 1: Resolve the prompt ────────────────────────────────────────────
        let finalPrompt: string;

        if (conversationId) {
            loggerUtil.info('Synthesizing prompt from conversation history', { conversationId });
            finalPrompt = await this.promptSynthesisService.synthesizePrompt(conversationId);
            loggerUtil.info('Prompt synthesis complete', {
                conversationId,
                synthesizedLength: finalPrompt.length,
            });
        } else {
            finalPrompt = prompt!.trim();
        }

        // ── Step 2: Branch by intent ──────────────────────────────────────────────
        let structure: DocumentStructure;
        let usageMetadata: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined;

        if (intent === 'edit' && conversationId) {
            // ── EDIT FLOW: partial update via UUID merge ──────────────────────────
            const latestVersion = await this.conversationRepo.getLatestDocumentVersion(conversationId);

            if (latestVersion) {
                loggerUtil.info('Edit mode: using latest doc version', {
                    conversationId,
                    version: latestVersion.version,
                    fileName: latestVersion.fileName,
                });

                const editPrompt = [
                    `=== CURRENT DOCUMENT STRUCTURE (with section UUIDs) ===`,
                    JSON.stringify(latestVersion.structure),
                    `\n=== USER EDIT INSTRUCTION ===`,
                    finalPrompt,
                ].join('\n');

                const { editResult, usageMetadata: editUsage } =
                    await this.aiService.editDocumentStructure(editPrompt, template || 'generic');

                usageMetadata = editUsage;

                // Assign UUIDs to new sections
                this.assignSectionIds(editResult.updatedSections);

                // Merge with previous version
                const previousStructure = latestVersion.structure as DocumentStructure;
                const mergedSections = this.mergeSections(
                    previousStructure.sections,
                    editResult.updatedSections,
                    editResult.deletedIds
                );

                // Rebuild full structure: keep metadata from previous, use merged sections
                structure = {
                    ...previousStructure,
                    sections: mergedSections,
                };

                loggerUtil.info('Edit merge complete', {
                    previousSections: previousStructure.sections.length,
                    updatedSections: editResult.updatedSections.length,
                    deletedIds: editResult.deletedIds?.length || 0,
                    mergedSections: mergedSections.length,
                });
            } else {
                // No previous version found — fall through to create flow
                loggerUtil.warn('Edit requested but no previous version found — generating fresh', { conversationId });
                const result = await this.aiService.generateDocumentStructure(
                    finalPrompt, documentType?.trim(), template || 'generic'
                );
                structure = result.structure;
                usageMetadata = result.usageMetadata;
                this.assignSectionIds(structure.sections);
            }
        } else {
            // ── CREATE FLOW: full document generation ─────────────────────────────
            const result = await this.aiService.generateDocumentStructure(
                finalPrompt, documentType?.trim(), template || 'generic'
            );
            structure = result.structure;
            usageMetadata = result.usageMetadata;

            // Assign UUIDs to all sections
            this.assignSectionIds(structure.sections);
        }

        // ── Step 3: Save new version to conversation ──────────────────────────────
        if (conversationId) {
            try {
                const savedVersion = await this.conversationRepo.saveDocumentVersion(conversationId, {
                    structure,
                    prompt: finalPrompt,
                    fileName: structure.fileName,
                    promptTokens: usageMetadata?.promptTokens,
                    completionTokens: usageMetadata?.completionTokens,
                    totalTokens: usageMetadata?.totalTokens,
                    createdAt: new Date(),
                });

                loggerUtil.info('Document version saved', {
                    conversationId,
                    version: savedVersion,
                    fileName: structure.fileName,
                });

                // Link the saved document version back to the triggering assistant message
                if (savedVersion !== null && messageId) {
                    await this.messageRepo.linkDocumentVersion(messageId, savedVersion);
                }
            } catch (versionErr) {
                loggerUtil.error('Failed to save document version', versionErr as Error, { conversationId });
            }
        }

        // ── Step 4: Build DOCX and stream to client ───────────────────────────────
        const buffer = await this.documentService.buildDocx(structure);
        const fileName = structure.fileName || 'document.docx';

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Content-Length', buffer.length.toString());

        loggerUtil.info('Document generated and sent successfully', { fileName, fileSize: buffer.length });
        res.send(buffer);
    });

    /**
     * Generate document structure only (preview/debug)
     * POST /api/document/preview
     */
    preview = asyncHandler(async (req: AuthRequest, res: Response) => {
        const { prompt, documentType, template } = req.body as GenerateDocRequest;

        if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
            throw new AppError(400, 'Prompt is required and must be a non-empty string');
        }

        const { structure, usageMetadata } = await this.aiService.generateDocumentStructure(
            prompt.trim(),
            documentType?.trim(),
            template || 'generic'
        );

        res.status(200).json({
            success: true,
            message: 'Document structure generated',
            data: structure,
            usage: usageMetadata,
        });
    });

    /**
     * Download a specific version of a document for a conversation.
     * Rebuilds the DOCX from the stored JSON without calling the AI.
     * GET /api/document/conversations/:conversationId/download?version=N
     */
    download = asyncHandler(async (req: AuthRequest, res: Response) => {
        const { conversationId } = req.params;
        const versionParam = req.query.version as string;
        const userId = req.userId!;

        if (!conversationId) {
            throw new AppError(400, 'Conversation ID is required');
        }

        const conv = await this.conversationRepo.findByIdAndUser(conversationId, userId);
        if (!conv || !conv.document || !conv.document.versions || conv.document.versions.length === 0) {
            throw new AppError(404, 'No generated document found for this conversation');
        }

        let targetVersion = conv.document.currentVersion; // default to latest

        if (versionParam) {
            const requestedVersion = parseInt(versionParam, 10);
            if (isNaN(requestedVersion)) {
                throw new AppError(400, 'Invalid version parameter');
            }
            if (requestedVersion > conv.document.currentVersion || requestedVersion < 1) {
                throw new AppError(404, `Document version v${requestedVersion} not found`);
            }
            targetVersion = requestedVersion;
        }

        // The array is chronological, find the specific version
        const versionData = conv.document.versions.find(v => v.version === targetVersion);
        if (!versionData) {
            throw new AppError(404, `Document version v${targetVersion} structure is missing`);
        }

        const structure = versionData.structure as DocumentStructure;

        // Rebuild the DOCX from JSON
        const buffer = await this.documentService.buildDocx(structure);
        const fileName = structure.fileName || `document-v${targetVersion}.docx`;

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Content-Length', buffer.length.toString());

        loggerUtil.info('Document re-downloaded successfully', { conversationId, version: targetVersion, fileName, fileSize: buffer.length });
        res.send(buffer);
    });
}

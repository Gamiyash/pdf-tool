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
import { extractSectionsFromDocx } from '../services/docx-parser.service';

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

    /**
     * Save user edits from the browser editor by parsing the DOCX binary.
     * Extracts section content using our embedded section bookmarks.
     * Updates only changed sections in the current version — NO new version created.
     * POST /api/document/conversations/:conversationId/save-edits?version=N
     */
    saveUserEdits = asyncHandler(async (req: AuthRequest, res: Response) => {
        const { conversationId } = req.params;
        const versionParam = req.query.version as string;
        const userId = req.userId!;

        const conv = await this.conversationRepo.findByIdAndUser(conversationId, userId);
        if (!conv?.document?.versions?.length) {
            throw new AppError(404, 'Document not found for this conversation');
        }

        // Determine target version
        const targetVersion = versionParam
            ? parseInt(versionParam, 10)
            : conv.document.currentVersion;

        const versionData = conv.document.versions.find(v => v.version === targetVersion);
        if (!versionData) throw new AppError(404, `Version v${targetVersion} not found`);

        const buffer = req.body as Buffer;
        if (!buffer || buffer.length === 0) {
            throw new AppError(400, 'Request body must be a non-empty DOCX binary');
        }

        // Parse the DOCX binary
        const parsed = await extractSectionsFromDocx(buffer);
        const structure = versionData.structure as DocumentStructure;
        let changedSections = 0;

        // ── DIAGNOSTIC: Log what the parser found vs what the JSON structure has ──
        const structureSectionIds: string[] = [];
        const collectIds = (sections: DocumentSection[]) => {
            for (const s of sections) {
                if (s.id) structureSectionIds.push(s.id);
                if (s.sections) collectIds(s.sections);
            }
        };
        collectIds(structure.sections);

        loggerUtil.info('[CONTROLLER] === SAVE-EDITS DIAGNOSTIC ===', {
            conversationId,
            targetVersion,
            structureSectionCount: structureSectionIds.length,
            parsedSectionCount: parsed.sections.size,
            matchedIds: structureSectionIds.filter(id => parsed.sections.has(id)),
            unmatchedStructureIds: structureSectionIds.filter(id => !parsed.sections.has(id)),
            extraParsedIds: [...parsed.sections.keys()].filter(id => !structureSectionIds.includes(id)),
            orphanBlockCount: parsed.orphanBlocks.length,
            orphanContentLines: parsed.orphanContent.length,
            orphanPreviews: parsed.orphanBlocks.map(b => ({
                lines: b.lines.map(l => l.substring(0, 60)),
                beforeId: b.beforeSectionId,
                afterId: b.afterSectionId,
            })),
        });

        // Quick helper to strip markdown to safely compare raw text
        const stripMarkdown = (text: string) => {
            return text.replace(/(\*\*|__)(.*?)\1/g, '$2').replace(/(\*|_)(.*?)\1/g, '$2').replace(/#/g, '').trim();
        };

        // ── Update section-level content ───────────────────────────────────────────
        const updateSectionsRecursive = (sections: DocumentSection[]) => {
            for (const section of sections) {
                if (!section.id) continue;
                const extracted = parsed.sections.get(section.id);

                if (!extracted) {
                    loggerUtil.info('[CONTROLLER] Section NOT matched in parsed DOCX (bookmark missing?)', {
                        sectionId: section.id,
                        sectionType: section.type,
                        contentPreview: (section.content || '').substring(0, 80),
                    });
                }

                if (extracted) {
                    loggerUtil.info('[CONTROLLER] Section MATCHED', {
                        sectionId: section.id,
                        sectionType: section.type,
                        origContentPreview: (section.content || '').substring(0, 80),
                        extractedContentPreview: (extracted.content || '').substring(0, 80),
                    });
                    // Type morphing: Auto-change type if user replaced a paragraph with a table in Word
                    if (extracted.rows && extracted.rows.length > 0 && (!extracted.content || extracted.content.trim() === '')) {
                        if (section.type !== 'table') {
                            section.type = 'table';
                            if (!section.rows) section.rows = [];
                            delete section.content;
                            changedSections++;
                        }
                    }
                    // Type morphing: Auto-change type if user deleted a table and wrote text
                    if (extracted.content && extracted.content.trim() !== '' && (!extracted.rows || extracted.rows.length === 0)) {
                        if (section.type === 'table') {
                            section.type = 'paragraph';
                            delete section.rows;
                            changedSections++;
                        }
                    }

                    if (section.type === 'table') {
                        if (extracted.rows) {
                            let tableChanged = false;

                            const newRows = extracted.rows.map((extRow, r) => {
                                const origRow = section.rows?.[r];
                                return {
                                    isHeader: origRow ? origRow.isHeader : r === 0,
                                    cells: (extRow.cells || []).map((extCell, c) => {
                                        const origCell = origRow?.cells[c];
                                        const oPlain = origCell ? stripMarkdown(origCell.text || '') : '';
                                        const ePlain = (extCell.text || '').trim();

                                        if (origCell && oPlain === ePlain) {
                                            return origCell; // Preserve formatting completely if text matches
                                        }

                                        tableChanged = true;
                                        return {
                                            ...(origCell || {}),
                                            text: ePlain
                                        };
                                    })
                                };
                            });

                            if (section.rows?.length !== newRows.length || tableChanged) {
                                section.rows = newRows as any;
                                changedSections++;
                            }
                        }
                    } else if (section.type === 'bullet_list' || section.type === 'numbered_list') {
                        const newItemsPlain = (extracted.content || '').split('\n').map(i => i.trim()).filter(Boolean);
                        let listChanged = false;

                        const mergedItems = newItemsPlain.map((extItem, index) => {
                            const origItem = (section.items || [])[index];
                            if (origItem && stripMarkdown(origItem) === extItem) {
                                return origItem; // Preserve formatting completely if text matches
                            }
                            listChanged = true;
                            return extItem;
                        });

                        if (section.items?.length !== newItemsPlain.length || listChanged) {
                            section.items = mergedItems;
                            changedSections++;
                        }
                        delete section.textRuns;
                        if (extracted.parasRuns && extracted.parasRuns.length > 0) {
                            section.itemRuns = extracted.parasRuns;
                        }
                    } else if (section.type === 'references') {
                        const lines = (extracted.content || '').split('\n').map(l => l.trim()).filter(Boolean);
                        if (lines.length > 0) {
                            let newTitle = 'References';
                            let extItems: string[] = [];

                            if (lines[0].toLowerCase().includes('reference')) {
                                newTitle = lines[0];
                                extItems = lines.slice(1);
                                if (extracted.parasRuns && extracted.parasRuns.length > 0) {
                                    section.titleRuns = extracted.parasRuns[0];
                                    section.itemRuns = extracted.parasRuns.slice(1);
                                }
                            } else {
                                extItems = lines;
                                if (extracted.parasRuns && extracted.parasRuns.length > 0) {
                                    section.itemRuns = extracted.parasRuns;
                                }
                            }

                            if (extItems.length > 0) {
                                section.items = extItems;
                            }
                            section.content = newTitle;
                            delete section.textRuns;
                            changedSections++;
                        }
                    } else if (section.type === 'callout') {
                        let extText = (extracted.content || '').trim();
                        if (!extText && extracted.rows && extracted.rows.length > 0) {
                            extText = extracted.rows.flatMap(r => r.cells.map(c => c.text)).join('\n').trim();
                        }
                        if (extText) {
                            const origPlain = stripMarkdown(section.content || '');
                            if (origPlain !== extText) {
                                section.content = extText;
                                changedSections++;
                            }
                        }
                        delete section.textRuns;
                        if (extracted.parasRuns && extracted.parasRuns.length > 0) {
                            section.parasRuns = extracted.parasRuns;
                        }
                    } else if (section.type === 'heading') {
                        // Headings have a single title line. Only extract line 0 to prevent paragraph text from merging into heading
                        const extLines = (extracted.content || '').split('\n').map(l => l.trim()).filter(Boolean);
                        const extHeadingText = extLines[0] || (extracted.content || '').trim();
                        const origHeadingText = stripMarkdown(section.content || '');

                        let headingChanged = false;
                        if (extHeadingText && origHeadingText !== extHeadingText) {
                            section.content = extHeadingText;
                            headingChanged = true;
                        }

                        if (extracted.textRuns && extracted.textRuns.length > 0) {
                            const textRunsCombined = extracted.textRuns.map(r => r.text).join('').trim();
                            if (textRunsCombined === extHeadingText || textRunsCombined === origHeadingText) {
                                if (JSON.stringify(section.textRuns) !== JSON.stringify(extracted.textRuns)) {
                                    section.textRuns = extracted.textRuns as any;
                                    headingChanged = true;
                                }
                            } else {
                                delete section.textRuns;
                            }
                        }

                        if (headingChanged) {
                            changedSections++;
                        }
                    } else {
                        const origPlain = stripMarkdown(section.content || (section.textRuns || []).map(r => r.text).join('') || '');
                        const extPlain = (extracted.content || '').trim();

                        let sectionUpdated = false;

                        if (origPlain !== extPlain) {
                            section.content = extPlain;
                            sectionUpdated = true;
                        }

                        if (extracted.textRuns && JSON.stringify(section.textRuns) !== JSON.stringify(extracted.textRuns)) {
                            section.textRuns = extracted.textRuns as any;
                            sectionUpdated = true;
                        }

                        if (extracted.parasRuns && extracted.parasRuns.length > 1) {
                            if (JSON.stringify(section.parasRuns) !== JSON.stringify(extracted.parasRuns)) {
                                section.parasRuns = extracted.parasRuns as any;
                                sectionUpdated = true;
                            }
                        } else if (section.parasRuns) {
                            delete section.parasRuns;
                            sectionUpdated = true;
                        }

                        if (sectionUpdated) {
                            changedSections++;
                        }
                    }
                }

                // Recurse into nested sections (two_column etc.)
                if (section.sections) updateSectionsRecursive(section.sections);
            }
        };

        updateSectionsRecursive(structure.sections);

        // ── Reorder sections if user moved them ─────────────────────────────────
        // (Only applies to top-level sections for now)
        const currentOrder = structure.sections.map(s => s.id).filter(Boolean) as string[];
        const newOrder = parsed.sectionOrder;

        // Determine if relative order of sections actually changed
        let orderChanged = false;
        if (newOrder.length > 0) {
            const currentOrderFiltered = currentOrder.filter(id => newOrder.includes(id));
            const newOrderFiltered = newOrder.filter(id => currentOrder.includes(id));
            if (JSON.stringify(currentOrderFiltered) !== JSON.stringify(newOrderFiltered)) {
                orderChanged = true;
            }
        }

        if (orderChanged) {
            const sectionMap = new Map(structure.sections.map(s => [s.id!, s]));
            const reordered = newOrder.map(id => sectionMap.get(id)).filter(Boolean) as DocumentSection[];

            // Preserve any un-bookmarked / missing sections at their original relative positions
            const missingSections = structure.sections.filter(s => s.id && !newOrder.includes(s.id));

            for (const missing of missingSections) {
                const origIndex = structure.sections.findIndex(s => s.id === missing.id);
                let insertIndex = -1;
                // Find nearest previous section in original structure that is in reordered
                for (let i = origIndex - 1; i >= 0; i--) {
                    const prevId = structure.sections[i].id;
                    const pos = reordered.findIndex(s => s.id === prevId);
                    if (pos !== -1) {
                        insertIndex = pos + 1;
                        break;
                    }
                }

                if (insertIndex !== -1) {
                    reordered.splice(insertIndex, 0, missing);
                } else {
                    // Try finding nearest next section
                    let nextInsertIndex = -1;
                    for (let i = origIndex + 1; i < structure.sections.length; i++) {
                        const nextId = structure.sections[i].id;
                        const pos = reordered.findIndex(s => s.id === nextId);
                        if (pos !== -1) {
                            nextInsertIndex = pos;
                            break;
                        }
                    }
                    if (nextInsertIndex !== -1) {
                        reordered.splice(nextInsertIndex, 0, missing);
                    } else {
                        reordered.push(missing);
                    }
                }
            }

            structure.sections = reordered;

            loggerUtil.info('Section order updated from user edit', { conversationId, newOrder });
        }

        // ── Update document-level fields ─────────────────────────────────────────
        const dl = parsed.documentLevel;
        let docLevelChanged = false;

        if (dl.margins && JSON.stringify(dl.margins) !== JSON.stringify(structure.margins)) {
            structure.margins = dl.margins;
            docLevelChanged = true;
        }

        if (dl.pageSize && JSON.stringify(dl.pageSize) !== JSON.stringify(structure.pageSize)) {
            structure.pageSize = dl.pageSize;
            docLevelChanged = true;
        }

        if (dl.headerLeft !== undefined || dl.headerCenter !== undefined || dl.headerRight !== undefined ||
            dl.footerLeft !== undefined || dl.footerCenter !== undefined || dl.footerRight !== undefined) {

            const currentHF = structure.headerFooter || {};
            const newHF = {
                ...currentHF,
                ...(dl.headerLeft !== undefined && { headerLeft: dl.headerLeft }),
                ...(dl.headerLeftRuns !== undefined && { headerLeftRuns: dl.headerLeftRuns }),
                ...(dl.headerCenter !== undefined && { headerCenter: dl.headerCenter }),
                ...(dl.headerCenterRuns !== undefined && { headerCenterRuns: dl.headerCenterRuns }),
                ...(dl.headerRight !== undefined && { headerRight: dl.headerRight }),
                ...(dl.headerRightRuns !== undefined && { headerRightRuns: dl.headerRightRuns }),
                ...(dl.footerLeft !== undefined && { footerLeft: dl.footerLeft }),
                ...(dl.footerLeftRuns !== undefined && { footerLeftRuns: dl.footerLeftRuns }),
                ...(dl.footerCenter !== undefined && { footerCenter: dl.footerCenter }),
                ...(dl.footerCenterRuns !== undefined && { footerCenterRuns: dl.footerCenterRuns }),
                ...(dl.footerRight !== undefined && { footerRight: dl.footerRight }),
                ...(dl.footerRightRuns !== undefined && { footerRightRuns: dl.footerRightRuns }),
            };

            if (JSON.stringify(currentHF) !== JSON.stringify(newHF)) {
                structure.headerFooter = newHF;
                docLevelChanged = true;
            }
        }

        // ── Handle new orphan content (user added text outside any bookmark) ─────────
        // If the frontend editor changes formatting (color, font, bold) it may strip embedded
        // bookmarks. In that case, section text appears as orphan content even though it already
        // exists in structure.sections. We must deduplicate before inserting.
        //
        // Strategy: compare orphan line text against ALL existing section content.
        // If the text already exists (exact or substring), skip inserting it.
        const normalize = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
        const existingSectionTexts = new Set<string>();
        // Also keep raw normalized content for substring checks
        const existingSectionFullTexts: string[] = [];
        const collectSectionTexts = (sections: DocumentSection[]) => {
            for (const s of sections) {
                if (s.content) {
                    const n = normalize(s.content);
                    existingSectionTexts.add(n);
                    existingSectionFullTexts.push(n);
                }
                if (s.sections) collectSectionTexts(s.sections);
                if (s.items) s.items.forEach(i => existingSectionTexts.add(normalize(i)));
            }
        };
        collectSectionTexts(structure.sections);

        // Helper: check if orphan text is already contained somewhere in existing sections
        const isOrphanDuplicate = (orphanText: string): boolean => {
            const n = normalize(orphanText);
            if (!n || n.length < 6) return true; // Skip empty/tiny
            // Exact match
            if (existingSectionTexts.has(n)) return true;
            // Substring match: orphan line is part of an existing section's content
            for (const fullText of existingSectionFullTexts) {
                if (fullText.includes(n)) return true;
            }
            return false;
        };

        if (parsed.orphanBlocks.length > 0) {
            // If most sections lost their bookmarks, the editor stripped them.
            // In this case orphan content is NOT new user text — it's existing content
            // that lost its bookmark. Skip ALL orphan insertion to prevent duplication.
            const orphanRate = parsed.orphanBlocks.reduce((n, b) => n + b.lines.filter(t => t.trim()).length, 0);
            const matchedCount = parsed.sections.size;
            const existingCount = structure.sections.length;
            const unmatchedCount = existingCount - matchedCount;

            if (unmatchedCount > existingCount * 0.5) {
                // More than half of sections lost bookmarks — editor stripped them en masse
                loggerUtil.warn('[CONTROLLER] Majority of section bookmarks stripped by editor. Skipping ALL orphan insertion to prevent duplication.', {
                    orphanRate,
                    matchedCount,
                    existingCount,
                    unmatchedCount,
                });
            } else {
                for (const block of parsed.orphanBlocks) {
                    const newSections = block.lines
                        .filter(t => !isOrphanDuplicate(t))
                        .map(text => ({
                            id: randomUUID(),
                            type: 'paragraph' as const,
                            content: text,
                            textRuns: [{
                                text,
                                fontSize: 22,
                                font: structure.theme?.fontFamily || 'Arial',
                                color: structure.theme?.textColor || '333333',
                            }]
                        }));

                    if (newSections.length > 0) {
                        loggerUtil.info('[CONTROLLER] Inserting genuinely new orphan sections', {
                            count: newSections.length,
                            previews: newSections.map(s => s.content.substring(0, 60)),
                            beforeId: block.beforeSectionId,
                            afterId: block.afterSectionId,
                        });
                    }

                    if (newSections.length === 0) continue;

                    if (block.beforeSectionId) {
                        const idx = structure.sections.findIndex(s => s.id === block.beforeSectionId);
                        if (idx !== -1) {
                            structure.sections.splice(idx + 1, 0, ...newSections);
                            continue;
                        }
                    }

                    if (block.afterSectionId) {
                        const idx = structure.sections.findIndex(s => s.id === block.afterSectionId);
                        if (idx !== -1) {
                            structure.sections.splice(idx, 0, ...newSections);
                            continue;
                        }
                    }

                    // Fallback: append to end (never prepend to top)
                    structure.sections.push(...newSections);
                }
            }
        }

        // ── Persist ─────────────────────────────────────────────────────────
        if (changedSections > 0 || orderChanged || parsed.orphanBlocks.length > 0 || docLevelChanged) {
            await this.conversationRepo.updateDocumentVersion(conversationId, targetVersion, structure);
        }

        loggerUtil.info('User edits saved', {
            conversationId,
            version: targetVersion,
            changedSections,
            orderChanged,
            docLevelChanged,
            orphanAdded: parsed.orphanContent.length,
        });

        res.status(200).json({
            success: true,
            message: 'Edits saved successfully',
            changedSections,
            orderChanged,
            docLevelChanged,
        });
    });
}

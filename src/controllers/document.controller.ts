import { Request, Response } from 'express';
import { AiService } from '../services/ai.service';
import { DocumentService } from '../services/document.service';
import { PromptSynthesisService } from '../services/prompt-synthesis.service';
import { asyncHandler } from '../middleware/error.middleware';
import { AppError } from '../middleware/error.middleware';
import { loggerUtil } from '../utils/logger.util';
import { GenerateDocRequest } from '../types/document.types';
import { ConversationRepository } from '../repositories/conversation.repository';

/**
 * Document Controller
 *
 * Flow:
 *  create: conversationId → synthesize prompt → AI generates JSON → save as v(N+1) → stream .docx
 *  edit:   conversationId → synthesize prompt + latest doc JSON → AI updates JSON → save as v(N+1) → stream .docx
 *  standalone: prompt string → AI generates JSON → stream .docx (no conversation)
 */
export class DocumentController {
    private aiService: AiService;
    private documentService: DocumentService;
    private conversationRepo: ConversationRepository;
    private promptSynthesisService: PromptSynthesisService;

    constructor() {
        this.aiService = new AiService();
        this.documentService = new DocumentService();
        this.conversationRepo = new ConversationRepository();
        this.promptSynthesisService = new PromptSynthesisService();
    }

    /**
     * Generate or edit a DOCX document
     * POST /api/document/generate
     * Body: { conversationId?, intent?, prompt?, documentType?, template? }
     */
    generate = asyncHandler(async (req: Request, res: Response) => {
        const {
            prompt,
            documentType,
            template,
            conversationId,
            intent,
        } = req.body as GenerateDocRequest;

        // Validate: either conversationId or prompt must be provided
        if (!conversationId && (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0)) {
            throw new AppError(400, 'Either conversationId or a non-empty prompt string is required');
        }

        loggerUtil.info('Document generation request received', {
            promptLength: prompt?.length || 0,
            documentType: documentType || 'auto',
            template: template || 'generic',
            conversationId: conversationId || 'none',
            intent: intent || 'create',
        });

        // ── Step 1: Resolve the prompt ────────────────────────────────────────────
        let finalPrompt: string;

        if (conversationId) {
            // Chat-based flow: synthesize prompt from conversation history
            loggerUtil.info('Synthesizing prompt from conversation history', { conversationId });
            finalPrompt = await this.promptSynthesisService.synthesizePrompt(conversationId);
            loggerUtil.info('Prompt synthesis complete', {
                conversationId,
                synthesizedLength: finalPrompt.length,
            });
        } else {
            // Standalone flow: use the provided prompt directly
            finalPrompt = prompt!.trim();
        }

        // ── Step 2: For edit intent, attach previous document structure ───────────
        if (intent === 'edit' && conversationId) {
            const latestVersion = await this.conversationRepo.getLatestDocumentVersion(conversationId);

            if (latestVersion) {
                loggerUtil.info('Edit mode: using latest doc version', {
                    conversationId,
                    version: latestVersion.version,
                    fileName: latestVersion.fileName,
                });

                finalPrompt = [
                    `You are updating an existing document. Apply ONLY the user's edit instructions — keep all other sections intact.`,
                    `Return the COMPLETE updated document JSON (full structure, not a diff).\n`,
                    `=== CURRENT DOCUMENT STRUCTURE ===`,
                    JSON.stringify(latestVersion.structure),
                    `\n=== USER EDIT INSTRUCTION ===`,
                    finalPrompt,
                ].join('\n');
            } else {
                loggerUtil.warn('Edit requested but no previous version found — generating fresh', { conversationId });
            }
        }

        // ── Step 1: AI generates document structure ───────────────────────────────
        const { structure, usageMetadata } = await this.aiService.generateDocumentStructure(
            finalPrompt,
            documentType?.trim(),
            template || 'generic'
        );

        // ── Step 2: Save new version to conversation ──────────────────────────────
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
            } catch (versionErr) {
                loggerUtil.error('Failed to save document version', versionErr as Error, { conversationId });
            }
        }

        // ── Step 5: Build DOCX and stream to client ───────────────────────────────
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
    preview = asyncHandler(async (req: Request, res: Response) => {
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
}

import { getGeminiModel } from '../config/gemini.config';
import { loggerUtil } from '../utils/logger.util';
import { MemoryService } from './memory.service';

// ── Synthesis system prompt ─────────────────────────────────────────────────
// This AI's sole job: read the full conversation context and produce a single,
// dense, machine-readable paragraph describing exactly what the user wants to
// generate/edit, so the Document Generation API can act on it with precision.
const SYNTHESIS_SYSTEM_PROMPT = `You are a document-generation prompt synthesizer.
Your ONLY task is to read a conversation between a user and an AI document assistant, then
produce a single highly detailed paragraph that a separate Document Generation API will use
as its instructions.

RULES:
- Output MUST be a single dense paragraph (no headers, no bullet points, no multiple paragraphs).
- Include ALL specifics agreed upon in the conversation:
    • Document type (academic proposal, business report, technical spec, etc.)
    • Topic / title / subject matter
    • Target audience and tone (formal academic, casual business, technical, etc.)
    • Exact sections / headings required and their order
    • Formatting preferences: fonts, theme (Academic / Business / Technical), TOC, page numbers
    • Special components: tables, references, callout boxes, blockquotes, empty sections kept
    • Any content detail explicitly approved by the user
- DO NOT start with "The user wants..." or "This prompt is about...".
  Write it as a direct imperative instruction to the generator (e.g. "Create an academic proposal...").
- OMIT all chat meta-discussion, greetings, filler, and clarification questions.
- Output ONLY the prompt text. No preamble, no markdown fences, no labels.
`;

export class PromptSynthesisService {
    private memoryService: MemoryService;

    constructor() {
        this.memoryService = new MemoryService();
    }

    /**
     * Synthesize a complete, detailed document generation prompt from the
     * entire conversation history (compact summary + recent verbatim messages).
     *
     * Context combination:
     *  - compactedMemory  → dense summary of the older chat turns (if compacted)
     *  - recentMessages   → last KEEP_LAST_N_MESSAGES turns verbatim
     * Together they represent 100% of the conversation with no message loss.
     */
    async synthesizePrompt(conversationId: string): Promise<string> {
        loggerUtil.info('Starting prompt synthesis', { conversationId });

        // Reuse getContextForRequest — gives us the same compact + recent combo
        // that the chat AI sees, without triggering a second compaction cycle.
        const { compactedMemory, recentMessages } =
            await this.memoryService.getContextForRequest(conversationId);

        // Build the text payload to send to the synthesis model
        const parts: string[] = [];

        if (compactedMemory && compactedMemory.trim().length > 0) {
            parts.push(`=== CONVERSATION HISTORY SUMMARY (older turns) ===\n${compactedMemory}`);
        }

        if (recentMessages.length > 0) {
            const verbatim = recentMessages
                .map(m => `[${m.role.toUpperCase()}]: ${m.content}`)
                .join('\n\n');
            parts.push(`=== RECENT MESSAGES (verbatim) ===\n${verbatim}`);
        }

        if (parts.length === 0) {
            // Edge-case: brand new conversation with no history yet
            loggerUtil.warn('Prompt synthesis called on empty conversation, using fallback', { conversationId });
            return 'Generate a professional document based on the conversation request.';
        }

        const contextText = parts.join('\n\n');

        loggerUtil.info('Sending synthesis request to Gemini', {
            conversationId,
            contextLength: contextText.length,
            hasCompactedMemory: !!compactedMemory,
            recentMessageCount: recentMessages.length,
        });

        const model = getGeminiModel();
        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: contextText }] }],
            systemInstruction: SYNTHESIS_SYSTEM_PROMPT,
            generationConfig: {
                temperature: 0.2, // Low temperature — factual extraction, not creative
            },
        });

        const synthesized = result.response.text().trim();

        loggerUtil.info('Prompt synthesis complete', {
            conversationId,
            synthesizedLength: synthesized.length,
        });

        return synthesized;
    }
}

import { getGeminiModel } from '../config/gemini.config';
import { loggerUtil } from '../utils/logger.util';
import { ConversationRepository } from '../repositories/conversation.repository';
import { MessageRepository } from '../repositories/message.repository';
import { IMessage } from '../models/message.model';

// ── Token budget constants ─────────────────────────────────────────────────
// 3 chars ≈ 1 token (conservative estimate)
const COMPACT_TRIGGER_CHARS = 21_000;  // 7,000 tokens → trigger compaction
const COMPACT_TARGET_CHARS = 3_000;  // 1,000 tokens → target output size
const KEEP_LAST_N_MESSAGES = 2;       // Always keep verbatim, never compact

// ── Compaction AI prompt ───────────────────────────────────────────────────
const COMPACTION_PROMPT = `You are a memory compaction AI for a document generation assistant.
Your ONLY task is to compress a conversation history into a single dense summary.

RULES:
- Output MUST be under ${COMPACT_TARGET_CHARS} characters
- Preserve ALL key facts: document topic, type, requirements, user decisions, formatting specs
- Preserve technical specifics: fonts, sections, structure, academic/business template choices
- Use dense bullet points — no prose, no filler, no greetings
- Write in 3rd person: "User wants...", "AI proposed...", "User approved..."
- OMIT: greetings, filler phrases, repetition, meta-discussion about the conversation
- The summary will be given to the AI as context for the next message — make it factually complete

Output ONLY the summary text. No preamble, no labels.
`;

export interface MemoryContext {
    compactedMemory: string | null;
    recentMessages: IMessage[];
    wasCompacted: boolean;
}

/**
 * MemoryService — implements rolling compaction (LangChain ConversationSummaryBufferMemory pattern).
 *
 * Flow per request:
 *  1. Load compaction state from DB (compactedMemory + compactedMessageCount)
 *  2. Fetch uncompacted messages (messages AFTER compactedMessageCount)
 *  3. If total chars > COMPACT_TRIGGER_CHARS → compact uncompacted msgs → save to DB
 *  4. Return { compactedMemory, last-3-messages } for chat AI
 */
export class MemoryService {
    private conversationRepo: ConversationRepository;
    private messageRepo: MessageRepository;

    constructor() {
        this.conversationRepo = new ConversationRepository();
        this.messageRepo = new MessageRepository();
    }

    /**
     * Main entry point called before every chat request.
     * Compacts if needed, then returns the context to inject into the prompt.
     */
    async getContextForRequest(conversationId: string): Promise<MemoryContext> {
        // 1. Load lightweight compaction state
        const state = await this.conversationRepo.getCompactionState(conversationId);
        if (!state) {
            return { compactedMemory: null, recentMessages: [], wasCompacted: false };
        }

        const { compactedMemory, compactedMessageCount } = state;

        // 2. Fetch all messages that are NOT yet compacted (messages after the compact offset)
        // We only want chat messages (not doc AI results) — both user and assistant chat messages
        const uncompacted = await this.messageRepo.getMessagesFrom(
            conversationId,
            compactedMessageCount,
            200
        );

        // 3. Calculate total context size
        const compactedChars = compactedMemory?.length ?? 0;
        const uncompactedChars = uncompacted.reduce((sum, m) => sum + m.content.length, 0);
        const totalChars = compactedChars + uncompactedChars;

        loggerUtil.info('Memory state check', {
            conversationId,
            compactedChars,
            uncompactedMessages: uncompacted.length,
            uncompactedChars,
            totalChars,
            triggerAt: COMPACT_TRIGGER_CHARS,
        });

        let finalCompactedMemory = compactedMemory || null;
        let wasCompacted = false;

        // 4. Compact if over budget (and there's enough to compact beyond the last 3 kept verbatim)
        const compactableMessages = uncompacted.slice(0, Math.max(0, uncompacted.length - KEEP_LAST_N_MESSAGES));

        if (totalChars > COMPACT_TRIGGER_CHARS && compactableMessages.length > 0) {
            loggerUtil.info('Triggering memory compaction', {
                conversationId,
                totalChars,
                compactableMessages: compactableMessages.length,
            });

            finalCompactedMemory = await this.compact(
                conversationId,
                compactedMemory ?? null,
                compactableMessages,
                compactedMessageCount
            );
            wasCompacted = true;
        }

        // 5. Decide which messages to send verbatim:
        //    - If compaction just ran (or a prior compaction exists), the old history is already
        //      captured in the summary → only pass the last KEEP_LAST_N_MESSAGES verbatim.
        //    - If compaction has NEVER run (totalChars still under budget), return ALL messages
        //      verbatim so the AI has the full, untruncated conversation.
        const hasCompactedContext = wasCompacted || (finalCompactedMemory !== null && finalCompactedMemory.length > 0);
        const recentMessages = hasCompactedContext
            ? uncompacted.slice(-KEEP_LAST_N_MESSAGES)
            : uncompacted;   // full verbatim history — no truncation until budget exceeded

        return {
            compactedMemory: finalCompactedMemory,
            recentMessages,
            wasCompacted,
        };
    }

    /**
     * Run the compaction AI call and persist the result.
     */
    private async compact(
        conversationId: string,
        existingMemory: string | null,
        messagesToCompact: IMessage[],
        prevCompactedCount: number
    ): Promise<string> {
        // Build the conversation text to compress
        const conversationText = messagesToCompact
            .map(m => `[${m.role.toUpperCase()}]: ${m.content}`)
            .join('\n\n');

        const fullPrompt = existingMemory
            ? `EXISTING SUMMARY (expand/update this with new messages below):\n${existingMemory}\n\nNEW MESSAGES TO INCORPORATE:\n${conversationText}`
            : conversationText;

        try {
            const model = getGeminiModel();
            const result = await model.generateContent({
                contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
                systemInstruction: COMPACTION_PROMPT,
                generationConfig: {
                    temperature: 0.3,          // Low temp → factual, dense, deterministic
                },
            });

            const newMemory = result.response.text().trim();

            // Persist: new message count = prevCompactedCount + messages we just compacted
            const newCompactedCount = prevCompactedCount + messagesToCompact.length;
            await this.conversationRepo.updateCompactedMemory(conversationId, newMemory, newCompactedCount);

            loggerUtil.info('Memory compaction complete', {
                conversationId,
                newMemoryChars: newMemory.length,
                newCompactedCount,
            });

            return newMemory;
        } catch (err) {
            loggerUtil.error('Memory compaction failed — continuing without compaction', err as Error);
            // Non-fatal: return existing memory so the request can still proceed
            return existingMemory ?? '';
        }
    }
}

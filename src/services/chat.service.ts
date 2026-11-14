import { SchemaType } from '@google/generative-ai';
import { getGeminiModel } from '../config/gemini.config';
import { env } from '../config/env.config';
import { AppError } from '../middleware/error.middleware';
import { loggerUtil } from '../utils/logger.util';
import { ConversationRepository } from '../repositories/conversation.repository';
import { MessageRepository } from '../repositories/message.repository';
import { MemoryService } from './memory.service';
import { AiChatResponse, ChatResponse } from '../types/chat.types';
import { MessageIntent } from '../models/message.model';

// ── System prompt (pinned — never compacted, always applied via systemInstruction) ──
const CHAT_SYSTEM_PROMPT = `
=== YOUR ROLE ===
You are an expert Document Generation Assistant. Your job is to help the user plan, research, brainstorm, and prepare content for professional documents.
CRITICAL: You DO NOT create the actual document itself. The actual document generation is handled by a separate API. Your role is STRICTLY to reply to the user, help them finalize the content, manage their requests, and decide if they want to 'create' or 'edit'.

=== DOCUMENT GENERATION CAPABILITIES ===
- We can generate any type of professional document: Academic, Business, Technical, Legal, Creative, etc.
- We support elements like: Headings, Rich Text Paragraphs, Bullet/Numbered Lists, Tables, Table of Contents, Blockquotes, Callout boxes, and Professional References.
- We have adaptive themes: Academic (Times New Roman, formal), Business (Calibri, clean), Technical (Arial, specs).

=== RESPONSE FORMAT (CRITICAL) ===
You must STRICTLY follow this JSON response structure. ALWAYS respond with ONLY valid JSON.
NEVER wrap the JSON in markdown code fences (no \`\`\`). NEVER put any text outside the JSON object.
Your JSON must match this exact schema:

{"reply": "Your conversational response.", "intent": "chatting"}

RULES FOR THE reply FIELD:
- Plain text or markdown is fine INSIDE the string value.
- NEVER use triple backticks (\`\`\`) anywhere inside the reply string — use indentation or dashes for code/outlines instead.
- Escape all double-quotes inside the reply as \\".
- The reply string must be on a SINGLE logical JSON line (use \\n for line breaks).

=== INTENT CLASSIFICATION RULES ===
Analyze the user's latest message AND the [DOCUMENT STATE] context below to classify their intent. Default to "chatting" when in doubt.

1. "create" -> Use ONLY when ALL of these are true:
   - The [DOCUMENT STATE] says NO document has been generated yet.
   - The user explicitly says they are ready to generate/build the document RIGHT NOW.
   - Trigger phrases: "generate the document", "create it now", "build the doc", "go ahead and create", "start the document generation" and anything that looks user wanted to generate not just this some words.
   - Asking for a plan, outline, or content summary is NOT "create" — it is "chatting".

2. "edit" -> Use when EITHER of these is true:
   - The [DOCUMENT STATE] says a document ALREADY EXISTS, AND the user asks to regenerate, rebuild, update, fix, or modify it.
   - The [DOCUMENT STATE] says a document ALREADY EXISTS, AND the user gives any instruction that would result in generating a new version.
   - Trigger phrases: "regenerate", "rebuild the doc", "update the document", "change section X", "fix the heading", "redo the conclusion", "modify the formatting", "create a new version" and anything that looks user wanted to edit not just this some words.
   - IMPORTANT: If a document already exists and the user asks to "create" or "generate", treat it as "edit" — they want a new version, not a fresh start.

3. "chatting" -> Everything else: questions, brainstorming, requesting outlines/skeletons/plans,
   researching, summarizing, approval discussions, follow-up planning questions. This is the DEFAULT.
   - When in doubt, ALWAYS choose "chatting".

=== STRICT BEHAVIOR RULES ===
- NEVER generate the actual document JSON, layouts, or styling in this chat.
- Be helpful, professional, and concise.
- Help the user finalize their requirements before they trigger 'create'.
- If a user asks for a skeleton/outline/plan, provide it in the reply as plain text (no triple backticks). Set intent to "chatting".
`;

export class ChatService {
    private conversationRepo: ConversationRepository;
    private messageRepo: MessageRepository;
    private memoryService: MemoryService;

    constructor() {
        this.conversationRepo = new ConversationRepository();
        this.messageRepo = new MessageRepository();
        this.memoryService = new MemoryService();
    }

    /**
     * Send a message to the AI and get a response.
     * Memory is handled entirely by MemoryService (rolling compaction).
     */
    async sendMessage(
        userId: string,
        messageContent: string,
        existingConversationId?: string
    ): Promise<ChatResponse> {
        try {
            if (!messageContent || messageContent.trim().length === 0) {
                throw new AppError(400, 'Message cannot be empty');
            }

            // 1. Resolve or create conversation
            let conversationId: string;
            let conversationTitle = 'New Conversation';

            if (existingConversationId) {
                const conv = await this.conversationRepo.findByIdAndUser(existingConversationId, userId);
                if (!conv) {
                    throw new AppError(404, 'Conversation not found or unauthorized');
                }
                conversationId = conv._id.toString();
                conversationTitle = conv.title;
            } else {
                const title = messageContent.substring(0, 40).trim() + (messageContent.length > 40 ? '...' : '');
                const newConv = await this.conversationRepo.create(userId, title);
                conversationId = newConv._id.toString();
                conversationTitle = title;
            }

            // 2. Get memory context + check if a document already exists (in parallel)
            const [{ compactedMemory, recentMessages, wasCompacted }, latestDocVersion] = await Promise.all([
                this.memoryService.getContextForRequest(conversationId),
                this.conversationRepo.getLatestDocumentVersion(conversationId),
            ]);

            const hasExistingDocument = !!latestDocVersion;

            // 3. Build Gemini contents array
            const contents: any[] = [];

            //  a) Inject compacted memory as a synthetic turn (if any)
            if (compactedMemory) {
                contents.push({
                    role: 'user',
                    parts: [{ text: `[Conversation history summary — treat as full context]:\n${compactedMemory}` }]
                });
                contents.push({
                    role: 'model',
                    parts: [{ text: 'Understood. I have the full context from the conversation history.' }]
                });
            }

            //  b) Inject document state so the AI classifies intent correctly
            const docStateText = hasExistingDocument
                ? `[DOCUMENT STATE]: A document has already been generated for this conversation (version ${latestDocVersion!.version}, filename: "${latestDocVersion!.fileName}"). Any user request to regenerate, rebuild, update, or change the document MUST be classified as "edit", NOT "create".`
                : `[DOCUMENT STATE]: No document has been generated yet for this conversation. If the user asks to build or generate a document, classify as "create".`;

            contents.push({ role: 'user', parts: [{ text: docStateText }] });
            contents.push({ role: 'model', parts: [{ text: 'Understood. I will use this document state to guide my intent classification.' }] });

            //  b) Recent messages verbatim (last 3, always full content)
            for (const msg of recentMessages) {
                if (!msg.content) continue;
                contents.push({
                    role: msg.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: msg.content }]
                });
            }

            //  c) New user message
            contents.push({
                role: 'user',
                parts: [{ text: messageContent }]
            });

            // 4. Save user message (fire-and-forget)
            const saveUserMsgPromise = this.messageRepo.create({
                conversationId,
                role: 'user',
                content: messageContent
            });

            // 5. Call Chat AI
            loggerUtil.info('Sending chat to Gemini', {
                conversationId,
                totalTurns: contents.length,
                compactedMemoryChars: compactedMemory?.length ?? 0,
                recentMessageCount: recentMessages.length,
                wasCompacted,
            });

            const model = getGeminiModel();
            const startTime = Date.now();

            const result = await model.generateContent({
                contents,
                systemInstruction: CHAT_SYSTEM_PROMPT,
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 6096,
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: SchemaType.OBJECT,
                        properties: {
                            reply: { type: SchemaType.STRING },
                            intent: {
                                type: SchemaType.STRING,
                                format: 'enum',
                                enum: ['create', 'edit', 'chatting']
                            }
                        },
                        required: ['reply', 'intent']
                    }
                },
            });

            const responseText = result.response.text();
            const responseTimeMs = Date.now() - startTime;

            // 6. Parse response
            const aiResponse = this.parseAiResponse(responseText);


            // 7. Save assistant message + update conversation, and await synthesis in parallel
            const usageMetadata = result.response.usageMetadata;
            // Wait for user message save first (needed for message count accuracy)
            await saveUserMsgPromise;

            // Save assistant message and increment count in parallel
            const [assistantMsg] = await Promise.all([
                this.messageRepo.create({
                    conversationId,
                    role: 'assistant',
                    content: aiResponse.reply,
                    intent: aiResponse.intent,
                    metadata: {
                        model: env.GEMINI_MODEL || 'gemini-2.5-flash',
                        responseTimeMs,
                        promptTokens: usageMetadata?.promptTokenCount,
                        completionTokens: usageMetadata?.candidatesTokenCount,
                        totalTokens: usageMetadata?.totalTokenCount,
                        tokensUsed: usageMetadata?.candidatesTokenCount,
                    }
                }),
                this.conversationRepo.incrementMessageCountBy(conversationId, 2),
            ]);

            return {
                reply: aiResponse.reply,
                intent: aiResponse.intent,
                conversationId,
                conversationTitle,
                assistantMessageId: (assistantMsg._id as any).toString(),
            };

        } catch (error) {
            loggerUtil.error('Chat service error', error as Error);
            if (error instanceof AppError) throw error;
            throw new AppError(500, 'Failed to process chat message');
        }
    }

    /**
     * Parse AI response strictly enforcing format.
     * Primary: JSON.parse(). Fallback: position-based boundary extraction.
     */
    private parseAiResponse(text: string): AiChatResponse {
        try {
            let cleaned = text.trim();

            // Strip outer markdown code fences wrapping the entire JSON
            cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

            // Attempt direct parse first
            let parsed: any;
            try {
                parsed = JSON.parse(cleaned);
            } catch (firstErr) {
                // Position-based fallback: works even on 10k+ char replies with LaTeX/math.
                loggerUtil.warn('Direct JSON.parse failed, attempting boundary-based extraction', {
                    error: (firstErr as Error).message
                });

                // 1. Extract intent — it's short and near the end, safe to regex
                const intentMatch = cleaned.match(/"intent"\s*:\s*"(create|edit|chatting)"/);
                if (!intentMatch) throw firstErr;

                // 2. Find the opening quote of the reply VALUE
                const replyKeyIdx = cleaned.indexOf('"reply"');
                if (replyKeyIdx === -1) throw firstErr;
                const colonIdx = cleaned.indexOf(':', replyKeyIdx + '"reply"'.length);
                const replyOpenQuoteIdx = cleaned.indexOf('"', colonIdx + 1);
                if (replyOpenQuoteIdx === -1) throw firstErr;

                // 3. Walk backward from the 'intent' field to find the closing quote of reply
                const intentFieldIdx = cleaned.lastIndexOf('"intent"');
                let pos = intentFieldIdx - 1;
                while (pos > replyOpenQuoteIdx && /[\s,\n\r]/.test(cleaned[pos])) {
                    pos--;
                }
                if (cleaned[pos] !== '"') throw firstErr;

                // 4. Extract the raw escaped string content
                const rawEscaped = cleaned.substring(replyOpenQuoteIdx + 1, pos);

                // 5. Unescape
                let reply: string;
                try {
                    reply = JSON.parse('"' + rawEscaped + '"');
                } catch {
                    reply = rawEscaped
                        .replace(/\\n/g, '\n')
                        .replace(/\\t/g, '\t')
                        .replace(/\\r/g, '\r')
                        .replace(/\\"/g, '"')
                        .replace(/\\\\/g, '\\');
                }

                parsed = { reply, intent: intentMatch[1] };
                loggerUtil.warn('Successfully recovered response via boundary extraction');
            }

            if (!parsed.reply || typeof parsed.reply !== 'string') {
                throw new Error('Missing or invalid "reply" field');
            }

            const validIntents = ['create', 'edit', 'chatting'];
            let intent = parsed.intent;

            if (!validIntents.includes(intent)) {
                loggerUtil.warn(`Invalid intent "${intent}" returned by AI, defaulting to "chatting"`);
                intent = 'chatting';
            }

            return {
                reply: parsed.reply,
                intent: intent as MessageIntent
            };
        } catch (error) {
            loggerUtil.error('Failed to parse AI chat response', error as Error, { rawText: text });
            throw new AppError(500, 'AI returned an invalid response format');
        }
    }
}

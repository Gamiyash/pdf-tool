// ============================================================
// Chat System Types
// ============================================================

import { IConversation } from '../models/conversation.model';
import { IMessage, MessageIntent } from '../models/message.model';

/**
 * Request body for sending a chat message
 */
export interface SendMessageRequest {
    conversationId?: string;   // Omit to start a new conversation
    message: string;
}

/**
 * Response from the chat API
 */
export interface ChatResponse {
    reply: string;
    intent: MessageIntent;
    conversationId: string;
    conversationTitle: string;
}

/**
 * Raw AI chat response (parsed from Gemini JSON output)
 */
export interface AiChatResponse {
    reply: string;
    intent: MessageIntent;
}

/**
 * Options for fetching messages
 */
export interface GetMessagesOptions {
    limit?: number;
    before?: Date;     // Cursor-based pagination: get messages before this date
}

/**
 * Options for fetching conversations
 */
export interface GetConversationsOptions {
    page?: number;
    limit?: number;
    status?: 'active' | 'archived';
}

/**
 * Paginated conversations response
 */
export interface PaginatedConversations {
    conversations: IConversation[];
    pagination: {
        currentPage: number;
        totalPages: number;
        totalItems: number;
        itemsPerPage: number;
    };
}

// Re-export for convenience
export type { IConversation, IMessage, MessageIntent };

import Message, { IMessage, MessageRole, MessageIntent, IMessageMetadata } from '../models/message.model';
import { GetMessagesOptions } from '../types/chat.types';
import { loggerUtil } from '../utils/logger.util';
import { Types } from 'mongoose';

// ============================================================
// Message Repository — all MongoDB operations for messages
// ============================================================

export interface CreateMessageData {
    conversationId: string;
    role: MessageRole;
    content: string;
    summary?: string;             // Short version used in history (assistant only)
    intent?: MessageIntent | null;
    metadata?: IMessageMetadata;
}

export class MessageRepository {

    /**
     * Create a new message
     */
    async create(data: CreateMessageData): Promise<IMessage> {
        const message = await Message.create({
            conversationId: new Types.ObjectId(data.conversationId),
            role: data.role,
            content: data.content,
            summary: data.summary,
            intent: data.intent || null,
            metadata: data.metadata || {},
        });

        loggerUtil.info('Message created', {
            messageId: message._id,
            conversationId: data.conversationId,
            role: data.role,
            intent: data.intent || null,
        });

        return message;
    }

    /**
     * Get messages for a conversation (oldest first for chat display)
     */
    async findByConversation(conversationId: string, options: GetMessagesOptions = {}): Promise<IMessage[]> {
        const {
            limit = 50,
            before,
        } = options;

        const filter: Record<string, any> = {
            conversationId: new Types.ObjectId(conversationId),
        };

        if (before) {
            filter.createdAt = { $lt: before };
        }

        return Message.find(filter)
            .sort({ createdAt: 1 })
            .limit(limit)
            .exec();
    }

    /**
     * Get the most recent N messages for context building
     * Returns messages in chronological order (oldest first)
     */
    async getRecentMessages(conversationId: string, limit: number = 20): Promise<IMessage[]> {
        const messages = await Message.find({
            conversationId: new Types.ObjectId(conversationId),
        })
            .sort({ createdAt: -1 })
            .limit(limit)
            .exec();

        // Reverse to get chronological order
        return messages.reverse();
    }

    /**
     * Get messages after a given skip offset (chronological order).
     * Used to fetch messages that have NOT yet been compacted.
     * fromIndex = compactedMessageCount (number of already-compacted messages)
     */
    async getMessagesFrom(conversationId: string, fromIndex: number, limit: number = 200): Promise<IMessage[]> {
        return Message.find({
            conversationId: new Types.ObjectId(conversationId),
        })
            .sort({ createdAt: 1 })
            .skip(fromIndex)
            .limit(limit)
            .exec();
    }

    /**
     * Total message count for a conversation
     */
    async getMessageCount(conversationId: string): Promise<number> {
        return Message.countDocuments({
            conversationId: new Types.ObjectId(conversationId),
        }).exec();
    }

    /**
     * Count messages in a conversation
     */
    async countByConversation(conversationId: string): Promise<number> {
        return Message.countDocuments({
            conversationId: new Types.ObjectId(conversationId),
        }).exec();
    }

    /**
     * Delete all messages for a conversation (used when deleting conversation)
     */
    async deleteByConversation(conversationId: string): Promise<number> {
        const result = await Message.deleteMany({
            conversationId: new Types.ObjectId(conversationId),
        }).exec();

        loggerUtil.info('Messages deleted for conversation', {
            conversationId,
            deletedCount: result.deletedCount,
        });

        return result.deletedCount;
    }
}

import Conversation, { IConversation, IDocumentVersion } from '../models/conversation.model';
import { GetConversationsOptions, PaginatedConversations } from '../types/chat.types';
import { loggerUtil } from '../utils/logger.util';

// ============================================================
// Conversation Repository — all MongoDB operations for conversations
// ============================================================

export class ConversationRepository {

    /**
     * Create a new conversation
     */
    async create(userId: string, title: string): Promise<IConversation> {
        const conversation = await Conversation.create({
            userId,
            title,
            status: 'active',
            lastMessageAt: new Date(),
            messageCount: 0,
            document: null,
        });

        loggerUtil.info('Conversation created', {
            conversationId: conversation._id,
            userId,
        });

        return conversation;
    }

    /**
     * Find conversation by ID
     */
    async findById(id: string): Promise<IConversation | null> {
        return Conversation.findById(id).exec();
    }

    /**
     * Find conversation by ID — verify it belongs to the user
     */
    async findByIdAndUser(id: string, userId: string): Promise<IConversation | null> {
        return Conversation.findOne({ _id: id, userId }).exec();
    }

    /**
     * Get paginated list of user's conversations (most recent first)
     */
    async findByUser(userId: string, options: GetConversationsOptions = {}): Promise<PaginatedConversations> {
        const {
            page = 1,
            limit = 20,
            status,
        } = options;

        const filter: Record<string, any> = { userId };
        if (status) {
            filter.status = status;
        }

        const skip = (page - 1) * limit;

        const [conversations, totalItems] = await Promise.all([
            Conversation.find(filter)
                .sort({ updatedAt: -1 })
                .skip(skip)
                .limit(limit)
                .select('-document.versions.structure')  // Exclude heavy data in list
                .exec(),
            Conversation.countDocuments(filter).exec(),
        ]);

        return {
            conversations,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(totalItems / limit),
                totalItems,
                itemsPerPage: limit,
            },
        };
    }

    /**
     * Increment message count by N and update lastMessageAt (single DB call)
     */
    async incrementMessageCountBy(id: string, n: number): Promise<void> {
        await Conversation.findByIdAndUpdate(id, {
            $inc: { messageCount: n },
            $set: { lastMessageAt: new Date() },
        }).exec();
    }

    /**
     * Increment message count by 1 (alias for backwards compat)
     */
    async incrementMessageCount(id: string): Promise<void> {
        return this.incrementMessageCountBy(id, 1);
    }

    /**
     * Persist the result of a memory compaction.
     * Stores the AI-generated summary and marks how many messages it covers.
     */
    async updateCompactedMemory(id: string, memory: string, messageCount: number): Promise<void> {
        await Conversation.findByIdAndUpdate(id, {
            $set: {
                compactedMemory: memory,
                compactedMessageCount: messageCount,
            },
        }).exec();
    }

    /**
     * Lightweight read of only the fields needed for memory state checks.
     */
    async getCompactionState(id: string): Promise<{
        compactedMemory?: string;
        compactedMessageCount: number;
        messageCount: number;
    } | null> {
        const conv = await Conversation.findById(id)
            .select('compactedMemory compactedMessageCount messageCount')
            .exec();
        if (!conv) return null;
        return {
            compactedMemory: conv.compactedMemory,
            compactedMessageCount: conv.compactedMessageCount ?? 0,
            messageCount: conv.messageCount,
        };
    }

    /**
     * Get the latest document version for a conversation (lightweight — only versions field)
     */
    async getLatestDocumentVersion(id: string): Promise<IDocumentVersion | null> {
        const conv = await Conversation.findById(id)
            .select('document.versions document.currentVersion')
            .exec();
        if (!conv?.document?.versions?.length) return null;
        const versions = conv.document.versions;
        return versions[versions.length - 1] ?? null;
    }

    /**
     * Update conversation fields (title, status, etc.)
     */
    async update(id: string, updates: Partial<Pick<IConversation, 'title' | 'status'>>): Promise<IConversation | null> {
        return Conversation.findByIdAndUpdate(id, { $set: updates }, { new: true }).exec();
    }

    /**
     * Save a document version to the conversation.
     * Auto-calculates the next version number — caller does NOT need a separate findById.
     * Returns the version number saved, or null if conversation not found.
     */
    async saveDocumentVersion(
        id: string,
        data: Omit<IDocumentVersion, 'version'>
    ): Promise<number | null> {
        const existing = await Conversation.findById(id).select('document').lean().exec();
        if (!existing) return null;

        const nextVersion = (existing.document?.currentVersion ?? 0) + 1;
        const version: IDocumentVersion = { ...data, version: nextVersion };

        if (!existing.document) {
            // First version: initialize the document field ($push can't target null)
            await Conversation.findByIdAndUpdate(id, {
                $set: { document: { currentVersion: nextVersion, versions: [version] } },
            }).exec();
        } else {
            // Subsequent versions: push to existing array
            await Conversation.findByIdAndUpdate(id, {
                $push: { 'document.versions': version },
                $set: { 'document.currentVersion': nextVersion },
            }).exec();
        }

        return nextVersion;
    }

    /**
     * Soft delete — archive the conversation
     */
    async archive(id: string): Promise<IConversation | null> {
        return this.update(id, { status: 'archived' });
    }

    /**
     * Hard delete conversation (use with caution)
     */
    async delete(id: string): Promise<boolean> {
        const result = await Conversation.findByIdAndDelete(id).exec();
        return !!result;
    }
}

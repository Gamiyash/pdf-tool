import { Request, Response } from 'express';
import { ChatService } from '../services/chat.service';
import { ConversationRepository } from '../repositories/conversation.repository';
import { MessageRepository } from '../repositories/message.repository';
import { asyncHandler, AppError } from '../middleware/error.middleware';
import { SendMessageRequest } from '../types/chat.types';
import { loggerUtil } from '../utils/logger.util';

export interface AuthRequest extends Request {
    userId?: string;
}

export class ChatController {
    private chatService: ChatService;
    private conversationRepo: ConversationRepository;
    private messageRepo: MessageRepository;

    constructor() {
        this.chatService = new ChatService();
        this.conversationRepo = new ConversationRepository();
        this.messageRepo = new MessageRepository();
    }

    /**
     * Send a new message to the AI
     * POST /api/chat/send
     */
    sendMessage = asyncHandler(async (req: AuthRequest, res: Response) => {
        const { message, conversationId } = req.body as SendMessageRequest;
        const userId = req.userId || 'anonymous-user'; // Fallback until auth middleware is added

        if (!message || typeof message !== 'string' || message.trim() === '') {
            throw new AppError(400, 'Message is required');
        }

        const response = await this.chatService.sendMessage(userId, message, conversationId);

        res.status(200).json({
            success: true,
            message: 'Message sent successfully',
            data: response,
        });
    });

    /**
     * Get paginated conversations for a user
     * GET /api/chat/conversations
     */
    getConversations = asyncHandler(async (req: AuthRequest, res: Response) => {
        const userId = req.userId || 'anonymous-user';
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const status = req.query.status as 'active' | 'archived' | undefined;

        const result = await this.conversationRepo.findByUser(userId, { page, limit, status });

        res.status(200).json({
            success: true,
            message: 'Conversations retrieved successfully',
            data: result.conversations,
            pagination: result.pagination,
        });
    });

    /**
     * Get conversation details safely
     * GET /api/chat/conversations/:id
     */
    getConversationDetails = asyncHandler(async (req: AuthRequest, res: Response) => {
        const { id } = req.params;
        const userId = req.userId || 'anonymous-user';

        const conversation = await this.conversationRepo.findByIdAndUser(id, userId);

        if (!conversation) {
            throw new AppError(404, 'Conversation not found');
        }

        res.status(200).json({
            success: true,
            message: 'Conversation retrieved successfully',
            data: conversation,
        });
    });

    /**
     * Get messages for a specific conversation
     * GET /api/chat/conversations/:id/messages
     */
    getMessages = asyncHandler(async (req: AuthRequest, res: Response) => {
        const { id } = req.params;
        const userId = req.userId || 'anonymous-user';
        const limit = parseInt(req.query.limit as string) || 50;
        const beforeStr = req.query.before as string | undefined;

        // Security check: ensure user owns this conversation
        const conversation = await this.conversationRepo.findByIdAndUser(id, userId);
        if (!conversation) {
            throw new AppError(404, 'Conversation not found');
        }

        const before = beforeStr ? new Date(beforeStr) : undefined;

        const messages = await this.messageRepo.findByConversation(id, { limit, before });

        res.status(200).json({
            success: true,
            message: 'Messages retrieved successfully',
            data: messages,
        });
    });

    /**
     * Archive/delete a conversation
     * DELETE /api/chat/conversations/:id
     */
    deleteConversation = asyncHandler(async (req: AuthRequest, res: Response) => {
        const { id } = req.params;
        const userId = req.userId || 'anonymous-user';

        const conversation = await this.conversationRepo.findByIdAndUser(id, userId);
        if (!conversation) {
            throw new AppError(404, 'Conversation not found');
        }

        // Hard delete conversation and messages
        await Promise.all([
            this.conversationRepo.delete(id),
            this.messageRepo.deleteByConversation(id)
        ]);

        loggerUtil.info('Conversation and messages deleted', { conversationId: id, userId });

        res.status(200).json({
            success: true,
            message: 'Conversation deleted successfully',
        });
    });
}

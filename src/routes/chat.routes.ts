import { Router } from 'express';
import { ChatController } from '../controllers/chat.controller';

import { requireAuth } from '../middleware/auth.middleware';

const router = Router();
const chatController = new ChatController();

/**
 * Chat API Routes
 * Base: /api/chat
 */

// Core chat endpoint
router.post('/send', requireAuth, chatController.sendMessage);

// Conversation management
router.get('/conversations', requireAuth, chatController.getConversations);
router.get('/conversations/:id', requireAuth, chatController.getConversationDetails);
router.delete('/conversations/:id', requireAuth, chatController.deleteConversation);

// Message retrieval
router.get('/conversations/:id/messages', requireAuth, chatController.getMessages);

export default router;

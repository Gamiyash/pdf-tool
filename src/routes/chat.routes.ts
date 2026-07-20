import { Router } from 'express';
import { ChatController } from '../controllers/chat.controller';

const router = Router();
const chatController = new ChatController();

/**
 * Chat API Routes
 * Base: /api/chat
 */

// Core chat endpoint
router.post('/send', chatController.sendMessage);

// Conversation management
router.get('/conversations', chatController.getConversations);
router.get('/conversations/:id', chatController.getConversationDetails);
router.delete('/conversations/:id', chatController.deleteConversation);

// Message retrieval
router.get('/conversations/:id/messages', chatController.getMessages);

export default router;

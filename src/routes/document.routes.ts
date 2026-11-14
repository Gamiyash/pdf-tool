import { Router } from 'express';
import express from 'express';
import { DocumentController } from '../controllers/document.controller';

import { requireAuth } from '../middleware/auth.middleware';

const router = Router();
const documentController = new DocumentController();

/**
 * Document Generation Routes
 *
 * POST /api/document/generate  - Generate DOCX from prompt (returns file download)
 * POST /api/document/preview   - Preview document structure as JSON (for debugging)
 */
router.post('/generate', requireAuth, documentController.generate);
router.post('/preview', requireAuth, documentController.preview);

// ── Download Stored Version ──────────────────────────────────────────────────
router.get('/conversations/:conversationId/download', requireAuth, documentController.download);

// ── Save User Edits (raw DOCX binary → parse → update JSON in-place) ─────────
router.post(
    '/conversations/:conversationId/save-edits',
    requireAuth,
    express.raw({ type: 'application/octet-stream', limit: '25mb' }),
    documentController.saveUserEdits
);

export default router;


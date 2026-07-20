import { Router } from 'express';
import { DocumentController } from '../controllers/document.controller';

const router = Router();
const documentController = new DocumentController();

/**
 * Document Generation Routes
 *
 * POST /api/document/generate  - Generate DOCX from prompt (returns file download)
 * POST /api/document/preview   - Preview document structure as JSON (for debugging)
 */
router.post('/generate', documentController.generate);
router.post('/preview', documentController.preview);

export default router;

import { Router } from 'express';
import pdfRoutes from './pdf.routes';
import healthRoutes from './health.routes';
import documentRoutes from './document.routes';
import chatRoutes from './chat.routes';

const router = Router();

// Mount routes
router.use('/health', healthRoutes);
router.use('/pdf', pdfRoutes);
router.use('/document', documentRoutes);
router.use('/chat', chatRoutes);

export default router;

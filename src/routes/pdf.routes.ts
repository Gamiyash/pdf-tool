import { Router } from 'express';
import { PdfController } from '../controllers/pdf.controller';

const router = Router();
const pdfController = new PdfController();

// PDF CRUD operations
router.get('/', pdfController.getAllPdfs);
router.get('/:id', pdfController.getPdfById);
router.post('/upload', pdfController.uploadPdf);
router.delete('/:id', pdfController.deletePdf);

// PDF manipulation operations
router.post('/merge', pdfController.mergePdfs);
router.post('/split', pdfController.splitPdf);
router.post('/compress', pdfController.compressPdf);

export default router;

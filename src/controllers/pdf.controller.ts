import { Request, Response, NextFunction } from 'express';
import { PdfService } from '../services/pdf.service';
import { ResponseUtil } from '../utils/response.util';
import { asyncHandler } from '../middleware/error.middleware';

/**
 * PDF Controller
 * Handles HTTP requests for PDF operations
 */
export class PdfController {
    private pdfService: PdfService;

    constructor() {
        this.pdfService = new PdfService();
    }

    /**
     * Get PDF information by ID
     * GET /api/pdf/:id
     */
    getPdfById = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
        const { id } = req.params;
        const pdf = await this.pdfService.getPdfInfo(id);
        return ResponseUtil.success(res, 'PDF retrieved successfully', pdf);
    });

    /**
     * Get all PDFs
     * GET /api/pdf
     */
    getAllPdfs = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
        const pdfs = await this.pdfService.getAllPdfs();
        return ResponseUtil.success(res, 'PDFs retrieved successfully', pdfs);
    });

    /**
     * Upload and process PDF
     * POST /api/pdf/upload
     */
    uploadPdf = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
        // TODO: Implement file upload with multer
        const result = await this.pdfService.processPdf(req.body);
        return ResponseUtil.created(res, 'PDF uploaded successfully', { message: result });
    });

    /**
     * Delete PDF
     * DELETE /api/pdf/:id
     */
    deletePdf = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
        const { id } = req.params;
        await this.pdfService.deletePdf(id);
        return ResponseUtil.success(res, 'PDF deleted successfully');
    });

    /**
     * Merge PDFs
     * POST /api/pdf/merge
     */
    mergePdfs = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
        // TODO: Implement PDF merge logic with pdf-lib
        return ResponseUtil.success(res, 'PDF merge endpoint - To be implemented');
    });

    /**
     * Split PDF
     * POST /api/pdf/split
     */
    splitPdf = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
        // TODO: Implement PDF split logic with pdf-lib
        return ResponseUtil.success(res, 'PDF split endpoint - To be implemented');
    });

    /**
     * Compress PDF
     * POST /api/pdf/compress
     */
    compressPdf = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
        // TODO: Implement PDF compression logic
        return ResponseUtil.success(res, 'PDF compress endpoint - To be implemented');
    });
}

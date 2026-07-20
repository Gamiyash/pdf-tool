import { PdfRepository, IPdfDocument } from '../repositories/pdf.repository';
import { loggerUtil } from '../utils/logger.util';
import { AppError } from '../middleware/error.middleware';

/**
 * PDF Service
 * Business logic layer for PDF operations
 */
export class PdfService {
    private pdfRepository: PdfRepository;

    constructor() {
        this.pdfRepository = new PdfRepository();
    }

    async getPdfInfo(id: string): Promise<IPdfDocument | null> {
        try {
            loggerUtil.info(`Fetching PDF info for ID: ${id}`);
            const pdf = await this.pdfRepository.findById(id);

            if (!pdf) {
                throw new AppError(404, 'PDF document not found');
            }

            return pdf;
        } catch (error) {
            loggerUtil.error('Error fetching PDF info', error as Error);
            throw error;
        }
    }

    async getAllPdfs(): Promise<IPdfDocument[]> {
        try {
            loggerUtil.info('Fetching all PDFs');
            return await this.pdfRepository.findAll();
        } catch (error) {
            loggerUtil.error('Error fetching all PDFs', error as Error);
            throw error;
        }
    }

    async processPdf(fileData: any): Promise<string> {
        try {
            loggerUtil.info('Processing PDF file');
            // TODO: Implement actual PDF processing logic
            return 'PDF processing will be implemented with pdf-lib and other libraries';
        } catch (error) {
            loggerUtil.error('Error processing PDF', error as Error);
            throw new AppError(500, 'Failed to process PDF');
        }
    }

    async deletePdf(id: string): Promise<boolean> {
        try {
            loggerUtil.info(`Deleting PDF with ID: ${id}`);
            const result = await this.pdfRepository.delete(id);

            if (!result) {
                throw new AppError(404, 'PDF document not found');
            }

            return result;
        } catch (error) {
            loggerUtil.error('Error deleting PDF', error as Error);
            throw error;
        }
    }
}

import { BaseRepository } from './base.repository';

export interface IPdfDocument {
    id: string;
    filename: string;
    size: number;
    uploadedAt: Date;
    processedAt?: Date;
    status: 'pending' | 'processing' | 'completed' | 'failed';
}

/**
 * PDF Repository
 * Handles data persistence for PDF documents
 * Currently a placeholder until database is integrated
 */
export class PdfRepository extends BaseRepository<IPdfDocument> {
    constructor() {
        super();
    }

    // Additional PDF-specific methods can be added here
    async findByStatus(status: IPdfDocument['status']): Promise<IPdfDocument[]> {
        // TODO: Implement when database is ready
        return [];
    }

    async updateStatus(id: string, status: IPdfDocument['status']): Promise<IPdfDocument | null> {
        // TODO: Implement when database is ready
        return null;
    }
}

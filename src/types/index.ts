// Common types and interfaces for the application

export interface ApiResponse<T = any> {
    success: boolean;
    message: string;
    data?: T;
    error?: string;
}

export interface PaginationParams {
    page: number;
    limit: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
    data: T[];
    pagination: {
        currentPage: number;
        totalPages: number;
        totalItems: number;
        itemsPerPage: number;
    };
}

export enum FileType {
    PDF = 'pdf',
    IMAGE = 'image',
    DOCUMENT = 'document',
}

export interface FileMetadata {
    filename: string;
    originalName: string;
    size: number;
    mimeType: string;
    path: string;
    uploadedAt: Date;
}

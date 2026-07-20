/**
 * Base Repository Pattern
 * This will be extended when database integration is added
 */

export interface IBaseRepository<T> {
    findById(id: string): Promise<T | null>;
    findAll(): Promise<T[]>;
    create(data: Partial<T>): Promise<T>;
    update(id: string, data: Partial<T>): Promise<T | null>;
    delete(id: string): Promise<boolean>;
}

export abstract class BaseRepository<T> implements IBaseRepository<T> {
    async findById(id: string): Promise<T | null> {
        throw new Error('Method not implemented - Database not configured');
    }

    async findAll(): Promise<T[]> {
        throw new Error('Method not implemented - Database not configured');
    }

    async create(data: Partial<T>): Promise<T> {
        throw new Error('Method not implemented - Database not configured');
    }

    async update(id: string, data: Partial<T>): Promise<T | null> {
        throw new Error('Method not implemented - Database not configured');
    }

    async delete(id: string): Promise<boolean> {
        throw new Error('Method not implemented - Database not configured');
    }
}

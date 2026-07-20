import { Response } from 'express';
import { ApiResponse } from '../types';

export class ResponseUtil {
    static success<T>(res: Response, message: string, data?: T, statusCode: number = 200): Response {
        const response: ApiResponse<T> = {
            success: true,
            message,
            data,
        };
        return res.status(statusCode).json(response);
    }

    static error(res: Response, message: string, statusCode: number = 500, error?: string): Response {
        const response: ApiResponse = {
            success: false,
            message,
            error,
        };
        return res.status(statusCode).json(response);
    }

    static created<T>(res: Response, message: string, data?: T): Response {
        return this.success(res, message, data, 201);
    }

    static noContent(res: Response): Response {
        return res.status(204).send();
    }
}

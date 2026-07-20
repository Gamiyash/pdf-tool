import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.config';
import { loggerUtil } from '../utils/logger.util';

export class AppError extends Error {
    constructor(
        public statusCode: number,
        public message: string,
        public isOperational: boolean = true
    ) {
        super(message);
        Object.setPrototypeOf(this, AppError.prototype);
        Error.captureStackTrace(this, this.constructor);
    }
}

export const errorHandler = (
    err: Error | AppError,
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    let statusCode = 500;
    let message = 'Internal Server Error';
    let isOperational = false;

    if (err instanceof AppError) {
        statusCode = err.statusCode;
        message = err.message;
        isOperational = err.isOperational;
    }

    // Log error details
    if (env.NODE_ENV === 'development') {
        loggerUtil.error('Error occurred', err, {
            statusCode,
            message,
            isOperational,
        });
    } else {
        loggerUtil.error(message, err);
    }

    res.status(statusCode).json({
        success: false,
        message,
        ...(env.NODE_ENV === 'development' && { stack: err.stack }),
    });
};

export const asyncHandler = (fn: Function) => {
    return (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

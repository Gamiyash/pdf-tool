import { logger } from '@config/logger.config';
import { Request } from 'express';

/**
 * Logger utility with convenient methods
 */
class Logger {
    /**
     * Log info level message
     */
    info(message: string, meta?: Record<string, any>): void {
        logger.info(message, meta);
    }

    /**
     * Log error level message
     */
    error(message: string, error?: Error | unknown, meta?: Record<string, any>): void {
        if (error instanceof Error) {
            logger.error(message, {
                error: {
                    message: error.message,
                    stack: error.stack,
                    name: error.name,
                },
                ...meta,
            });
        } else {
            logger.error(message, { error, ...meta });
        }
    }

    /**
     * Log warning level message
     */
    warn(message: string, meta?: Record<string, any>): void {
        logger.warn(message, meta);
    }

    /**
     * Log debug level message
     */
    debug(message: string, meta?: Record<string, any>): void {
        logger.debug(message, meta);
    }

    /**
     * Log HTTP request
     */
    logRequest(req: Request, responseTime?: number): void {
        const meta = {
            method: req.method,
            url: req.url,
            ip: req.ip,
            userAgent: req.get('user-agent'),
            ...(responseTime && { responseTime: `${responseTime}ms` }),
        };

        this.info(`${req.method} ${req.url}`, meta);
    }

    /**
     * Log database operation
     */
    logDatabase(operation: string, details?: Record<string, any>): void {
        this.debug(`Database: ${operation}`, details);
    }

    /**
     * Log Redis operation
     */
    logRedis(operation: string, details?: Record<string, any>): void {
        this.debug(`Redis: ${operation}`, details);
    }
}

export const loggerUtil = new Logger();
export default loggerUtil;

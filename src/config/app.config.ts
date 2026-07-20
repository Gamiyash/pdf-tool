import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import { env } from './env.config';
import { errorHandler } from '../middleware/error.middleware';
import { notFoundHandler } from '../middleware/notFound.middleware';
import routes from '../routes';
import { logger } from './logger.config';

export const configureApp = (app: Application): void => {
    // Security middleware
    app.use(helmet());

    // CORS configuration
    app.use(
        cors({
            origin: env.ALLOWED_ORIGINS,
            credentials: true,
        })
    );

    // Body parsing middleware
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Compression middleware
    app.use(compression());

    // Logging middleware - integrate Morgan with Winston
    const morganFormat = env.NODE_ENV === 'development' ? 'dev' : 'combined';
    app.use(
        morgan(morganFormat, {
            stream: {
                write: (message: string) => {
                    logger.info(message.trim());
                },
            },
        })
    );

    // API Routes
    app.use('/api', routes);

    // Health check endpoint
    app.get('/health', (_req, res) => {
        res.status(200).json({
            success: true,
            message: 'Server is running',
            timestamp: new Date().toISOString(),
        });
    });
    // 404 handler
    app.use(notFoundHandler);

    // Error handling middleware (must be last)
    app.use(errorHandler);
};

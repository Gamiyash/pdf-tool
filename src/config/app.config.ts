import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import passport from './passport';
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

    // Sessions & Passport Configuration
    app.use(session({
        secret: process.env.SESSION_SECRET || 'dev-secure-session-secret-999',
        resave: false,
        saveUninitialized: false,
        store: MongoStore.create({ mongoUrl: env.MONGODB_URI }),
        cookie: {
            secure: env.NODE_ENV === 'production',
            httpOnly: true,
            maxAge: 1000 * 60 * 60 * 24 // 1 day
        }
    }));
    app.use(passport.initialize());
    app.use(passport.session());

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

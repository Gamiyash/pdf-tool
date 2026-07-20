import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import { env } from './env.config';

// Define log format
const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
);

// Console format with colors for development
const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        let msg = `${timestamp} [${level}]: ${message}`;
        if (Object.keys(meta).length > 0) {
            msg += ` ${JSON.stringify(meta)}`;
        }
        return msg;
    })
);

// Create logs directory path
const logsDir = path.join(process.cwd(), 'logs');

// Define transports
const transports: winston.transport[] = [
    // Console transport
    new winston.transports.Console({
        format: env.NODE_ENV === 'production' ? logFormat : consoleFormat,
    }),

    // Daily rotate file for all logs
    new DailyRotateFile({
        filename: path.join(logsDir, 'application-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        maxSize: '20m',
        maxFiles: '14d',
        format: logFormat,
        level: 'info',
    }),

    // Daily rotate file for errors only
    new DailyRotateFile({
        filename: path.join(logsDir, 'error-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        maxSize: '20m',
        maxFiles: '30d',
        format: logFormat,
        level: 'error',
    }),
];

// Create logger instance
export const logger = winston.createLogger({
    level: env.LOG_LEVEL || 'info',
    format: logFormat,
    transports,
    exitOnError: false,
});

// Handle uncaught exceptions and rejections
logger.exceptions.handle(
    new winston.transports.File({
        filename: path.join(logsDir, 'exceptions.log'),
    })
);

logger.rejections.handle(
    new winston.transports.File({
        filename: path.join(logsDir, 'rejections.log'),
    })
);

export default logger;

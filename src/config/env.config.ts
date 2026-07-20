import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config();

interface EnvConfig {
    // Server
    PORT: number;
    NODE_ENV: string;

    // CORS
    ALLOWED_ORIGINS: string[];

    // File Upload
    MAX_FILE_SIZE: number;
    UPLOAD_DIR: string;

    // MongoDB
    MONGODB_URI: string;

    // Redis
    REDIS_HOST: string;
    REDIS_PORT: number;
    REDIS_PASSWORD?: string;

    // Logging
    LOG_LEVEL: string;

    // Gemini AI
    GEMINI_API_KEY: string;
}

const getEnvConfig = (): EnvConfig => {
    return {
        // Server
        PORT: parseInt(process.env.PORT || '3001', 10),
        NODE_ENV: process.env.NODE_ENV || 'development',

        // CORS
        ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],

        // File Upload
        MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE || '10485760', 10), // 10MB default
        UPLOAD_DIR: process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads'),

        // MongoDB
        MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/pdf-tools',

        // Redis
        REDIS_HOST: process.env.REDIS_HOST || 'localhost',
        REDIS_PORT: parseInt(process.env.REDIS_PORT || '6379', 10),
        REDIS_PASSWORD: process.env.REDIS_PASSWORD,

        // Logging
        LOG_LEVEL: process.env.LOG_LEVEL || 'info',

        // Gemini AI
        GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
    };
};

export const env = getEnvConfig();
export const envConfig = env; // Keep backward compatibility


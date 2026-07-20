import mongoose from 'mongoose';
import { env } from './env.config';
import { loggerUtil } from '@utils/logger.util';

/**
 * MongoDB connection options
 */
const options: mongoose.ConnectOptions = {
    maxPoolSize: 10,
    minPoolSize: 5,
    socketTimeoutMS: 45000,
    serverSelectionTimeoutMS: 5000,
    family: 4, // Use IPv4, skip trying IPv6
};

/**
 * Connect to MongoDB
 */
export const connectDatabase = async (): Promise<void> => {
    try {
        if (!env.MONGODB_URI) {
            throw new Error('MONGODB_URI is not defined in environment variables');
        }

        loggerUtil.info('Connecting to MongoDB...');

        await mongoose.connect(env.MONGODB_URI, options);

        loggerUtil.info('MongoDB connected successfully', {
            host: mongoose.connection.host,
            name: mongoose.connection.name,
        });
    } catch (error) {
        loggerUtil.error('MongoDB connection failed', error);
        process.exit(1);
    }
};

/**
 * Disconnect from MongoDB
 */
export const disconnectDatabase = async (): Promise<void> => {
    try {
        await mongoose.connection.close();
        loggerUtil.info('MongoDB disconnected successfully');
    } catch (error) {
        loggerUtil.error('Error disconnecting from MongoDB', error);
    }
};

// Connection event handlers
mongoose.connection.on('connected', () => {
    loggerUtil.logDatabase('Connected');
});

mongoose.connection.on('error', (error) => {
    loggerUtil.error('MongoDB connection error', error);
});

mongoose.connection.on('disconnected', () => {
    loggerUtil.logDatabase('Disconnected');
});

export default { connectDatabase, disconnectDatabase };


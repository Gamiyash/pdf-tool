import Redis from 'ioredis';
import { env } from './env.config';
import { loggerUtil } from '@utils/logger.util';

/**
 * Redis client instance
 */
let redisClient: Redis | null = null;

/**
 * Create and configure Redis client
 */
const createRedisClient = (): Redis => {
    const client = new Redis({
        host: env.REDIS_HOST,
        port: env.REDIS_PORT,
        password: env.REDIS_PASSWORD || undefined,
        retryStrategy: (times: number) => {
            const delay = Math.min(times * 50, 2000);
            return delay;
        },
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        lazyConnect: false,
    });

    // Event handlers
    client.on('connect', () => {
        loggerUtil.logRedis('Connecting...');
    });

    client.on('ready', () => {
        loggerUtil.info('Redis connected successfully', {
            host: env.REDIS_HOST,
            port: env.REDIS_PORT,
        });
    });

    client.on('error', (error) => {
        loggerUtil.error('Redis connection error', error);
    });

    client.on('close', () => {
        loggerUtil.logRedis('Connection closed');
    });

    client.on('reconnecting', () => {
        loggerUtil.logRedis('Reconnecting...');
    });

    return client;
};

/**
 * Get Redis client instance (singleton)
 */
export const getRedisClient = (): Redis => {
    if (!redisClient) {
        redisClient = createRedisClient();
    }
    return redisClient;
};

/**
 * Disconnect Redis client
 */
export const disconnectRedis = async (): Promise<void> => {
    if (redisClient) {
        try {
            await redisClient.quit();
            loggerUtil.info('Redis disconnected successfully');
            redisClient = null;
        } catch (error) {
            loggerUtil.error('Error disconnecting from Redis', error);
        }
    }
};

/**
 * Check Redis connection
 */
export const checkRedisConnection = async (): Promise<boolean> => {
    try {
        const client = getRedisClient();
        await client.ping();
        return true;
    } catch (error) {
        loggerUtil.error('Redis health check failed', error);
        return false;
    }
};

export default { getRedisClient, disconnectRedis, checkRedisConnection };


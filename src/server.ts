import createApp from './app';
import { env } from './config/env.config';
import { loggerUtil } from './utils/logger.util';
import { connectDatabase, disconnectDatabase } from './config/database.config';
// import { getRedisClient, disconnectRedis } from './config/redis.config';

const startServer = async () => {
    try {
        loggerUtil.info('Starting PDF Tools Backend Server...');
        await connectDatabase();

        // Connect to Redis
        // getRedisClient();
        // loggerUtil.info('Redis client initialized');

        const app = createApp();
        const port = env.PORT;

        const server = app.listen(port, () => {
            loggerUtil.info(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║           PDF Tools Backend Server Started! 🚀             ║
║                                                            ║
║  Environment: ${env.NODE_ENV.padEnd(44)}║
║  Port:        ${port.toString().padEnd(44)}║
║  URL:         http://localhost:${port}${' '.repeat(27)}║
║                                                            ║
║  API Endpoints:                                            ║
║  - Health:    http://localhost:${port}/health${' '.repeat(20)}║
║  - API:       http://localhost:${port}/api${' '.repeat(23)}║
║  - API Info:  http://localhost:${port}/api/health/info${' '.repeat(11)}║
║                                                            ║
║  Database Status:                                          ║
║  - MongoDB:   Connected ✓                                  ║
║  - Redis:     Connected ✓                                  ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
      `);
        });

        // Graceful shutdown
        const gracefulShutdown = async (signal: string) => {
            loggerUtil.info(`${signal} received. Shutting down gracefully...`);

            server.close(async () => {
                loggerUtil.info('HTTP server closed');

                // Close database connections
                await disconnectDatabase();
                // await disconnectRedis();

                loggerUtil.info('All connections closed successfully');
                process.exit(0);
            });

            // Force shutdown after 10 seconds
            setTimeout(() => {
                loggerUtil.error('Forced shutdown after timeout');
                process.exit(1);
            }, 10000);
        };

        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    } catch (error) {
        loggerUtil.error('Failed to start server', error as Error);
        process.exit(1);
    }
};

// Start the server
startServer();

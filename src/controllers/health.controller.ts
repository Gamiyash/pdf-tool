import { Request, Response } from 'express';
import { ResponseUtil } from '../utils/response.util';
import { asyncHandler } from '../middleware/error.middleware';

/**
 * Health Check Controller
 * Handles health check and status endpoints
 */
export class HealthController {
    /**
     * Get server health status
     * GET /api/health
     */
    getHealth = asyncHandler(async (req: Request, res: Response) => {
        const healthData = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            environment: process.env.NODE_ENV || 'development',
            memory: {
                used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
                unit: 'MB',
            },
        };

        return ResponseUtil.success(res, 'Server is healthy', healthData);
    });

    /**
     * Get API information
     * GET /api/info
     */
    getInfo = asyncHandler(async (req: Request, res: Response) => {
        const apiInfo = {
            name: 'PDF Tools API',
            version: '1.0.0',
            description: 'PDF manipulation and processing API',
            endpoints: {
                health: '/api/health',
                pdf: '/api/pdf',
            },
        };

        return ResponseUtil.success(res, 'API information retrieved', apiInfo);
    });
}

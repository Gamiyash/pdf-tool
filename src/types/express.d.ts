// Express type extensions

import { Request } from 'express';

declare global {
    namespace Express {
        interface Request {
            userId?: string;
            files?: any;
        }
    }
}

export { };

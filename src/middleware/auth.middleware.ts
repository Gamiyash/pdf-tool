import { Request, Response, NextFunction } from 'express';
import { AppError } from './error.middleware';

/**
 * Middleware that ensures the user is authenticated via Passport.js
 * If authenticated, maps the core DB ID to req.userId for downstream controllers.
 */
export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated() || !req.user) {
        return next(new AppError(401, 'Unauthorized access. Please log in first.'));
    }

    // Passport maps user as 'any' currently on interface, so we safely extract either id or _id
    const user = req.user as any;
    req.userId = user._id || user.id;

    if (!req.userId) {
        return next(new AppError(401, 'Session user ID is invalid. Please log in again.'));
    }

    next();
};

import { Router, Request, Response } from 'express';
import passport from 'passport';
import { env } from '../config/env.config';
import { body } from 'express-validator';
import { authController } from '../controllers/auth.controller';
import rateLimit from 'express-rate-limit';

const router = Router();

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    message: { error: 'Too many login attempts from this IP, please try again later in 15 minutes.' }
});

const sanitizeInputs = [
    body('email').isEmail().withMessage('Invalid email provided').normalizeEmail(),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters').trim().escape(),
    body('name').optional().trim().escape()
];

router.post('/register', sanitizeInputs, (req: Request, res: Response) => authController.register(req, res));
router.post('/login', loginLimiter, sanitizeInputs, passport.authenticate('local'), (req: Request, res: Response) => authController.login(req, res));
router.post('/logout', (req: Request, res: Response) => authController.logout(req, res));
router.get('/me', (req: Request, res: Response) => authController.getMe(req, res));

router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/google/callback', passport.authenticate('google', { failureRedirect: `${env.ALLOWED_ORIGINS[0]}/auth?error=true` }), (req: Request, res: Response) => {
    res.redirect(`${env.ALLOWED_ORIGINS[0]}/chat`);
});

export default router;

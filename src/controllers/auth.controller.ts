import { Request, Response } from 'express';
import { authService } from '../services/auth.service';
import { validationResult } from 'express-validator';

export class AuthController {

    async register(req: Request, res: Response): Promise<void> {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            res.status(400).json({ errors: errors.array() });
            return;
        }

        try {
            const { name, email, password } = req.body;
            const user = await authService.registerLocalUser(name, email, password);

            req.login(user, (err) => {
                if (err) {
                    res.status(500).json({ error: 'Failed to auto-login. Please login manually.' });
                    return;
                }
                res.status(201).json({ message: 'Registration successful', user: { id: (user as any).id || (user as any)._id, name: user.name, email: user.email } });
            });
        } catch (err: any) {
            res.status(400).json({ error: err.message });
        }
    }

    login(req: Request, res: Response): void {
        const user = req.user as any;
        res.status(200).json({ message: 'Login successful', user: { id: user.id || user._id, name: user.name, email: user.email } });
    }

    logout(req: Request, res: Response): void {
        req.logout((err) => {
            if (err) {
                res.status(500).json({ error: 'Failed to logout system' });
                return;
            }
            req.session.destroy(() => {
                res.clearCookie('connect.sid');
                res.status(200).json({ message: 'Logout successful' });
            });
        });
    }

    getMe(req: Request, res: Response): void {
        if (req.isAuthenticated()) {
            const user = req.user as any;
            res.status(200).json({ user: { id: user.id || user._id, name: user.name, email: user.email } });
        } else {
            res.status(401).json({ error: 'Not authenticated' });
        }
    }
}

export const authController = new AuthController();

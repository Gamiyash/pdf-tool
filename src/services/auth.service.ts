import bcrypt from 'bcrypt';
import { UserRepository } from '../repositories/user.repository';
import { IUser } from '../models/User';

export class AuthService {
    private userRepository: UserRepository;

    constructor() {
        this.userRepository = new UserRepository();
    }

    async hashPassword(password: string): Promise<string> {
        const salt = await bcrypt.genSalt(10);
        return bcrypt.hash(password, salt);
    }

    async verifyPassword(password: string, hash: string): Promise<boolean> {
        return bcrypt.compare(password, hash);
    }

    async registerLocalUser(name: string, email: string, password: string): Promise<IUser> {
        // 1. Check if user exists
        const existing = await this.userRepository.findByEmail(email);
        if (existing) {
            throw new Error('Email already registered');
        }

        // 2. Hash and store
        const passwordHash = await this.hashPassword(password);
        return this.userRepository.create({ name, email, passwordHash });
    }

    async authenticateLocalUser(email: string, password: string): Promise<IUser> {
        // 1. Check if user exists
        const user = await this.userRepository.findByEmail(email);
        if (!user) {
            throw new Error('Invalid email or password');
        }

        // 2. Prevent local login for Google-only users
        if (!user.passwordHash) {
            throw new Error('Account utilizes Google OAuth. Please login with Google.');
        }

        // 3. Verify
        const isValid = await this.verifyPassword(password, user.passwordHash);
        if (!isValid) {
            throw new Error('Invalid email or password');
        }

        return user;
    }
}

export const authService = new AuthService();

import User, { IUser } from '../models/User';

export class UserRepository {
    async findByEmail(email: string): Promise<IUser | null> {
        return User.findOne({ email });
    }

    async findByGoogleId(googleId: string): Promise<IUser | null> {
        return User.findOne({ googleId });
    }

    async findById(id: string): Promise<IUser | null> {
        return User.findById(id);
    }

    async create(data: Partial<IUser>): Promise<IUser> {
        const user = new User(data);
        return user.save();
    }

    async linkGoogle(id: string, googleId: string): Promise<IUser | null> {
        return User.findByIdAndUpdate(id, { googleId }, { new: true });
    }
}

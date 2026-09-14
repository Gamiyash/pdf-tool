import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
    name: string;
    email: string;
    passwordHash?: string;
    googleId?: string;
    createdAt: Date;
    updatedAt: Date;
}

const UserSchema: Schema = new Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String }, // optional, strictly undefined for google-only users
    googleId: { type: String, sparse: true, unique: true },
}, { timestamps: true });

export default mongoose.model<IUser>('User', UserSchema);

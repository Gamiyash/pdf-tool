import mongoose, { Schema, Document, Types } from 'mongoose';

// ============================================================
// Message — a single chat message in a conversation
// ============================================================

export type MessageRole = 'user' | 'assistant';
export type MessageIntent = 'create' | 'edit' | 'chatting';

export interface IMessageMetadata {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    tokensUsed?: number; // kept for backwards compatibility
    model?: string;
    responseTimeMs?: number;
}

export interface IMessage extends Document {
    conversationId: Types.ObjectId;
    role: MessageRole;
    content: string;
    summary?: string;            // Short version for history (max 500 chars), assistant only
    intent: MessageIntent | null;    // Only set on assistant messages
    metadata: IMessageMetadata;
    createdAt: Date;
}

const MessageSchema = new Schema<IMessage>(
    {
        conversationId: {
            type: Schema.Types.ObjectId,
            ref: 'Conversation',
            required: true,
            index: true,
        },
        role: {
            type: String,
            enum: ['user', 'assistant'],
            required: true,
        },
        content: {
            type: String,
            required: true,
        },
        summary: {
            type: String,
            maxlength: 600,
        },
        intent: {
            type: String,
            enum: ['create', 'edit', 'chatting', null],
            default: null,
        },
        metadata: {
            promptTokens: { type: Number },
            completionTokens: { type: Number },
            totalTokens: { type: Number },
            tokensUsed: { type: Number },
            model: { type: String },
            responseTimeMs: { type: Number },
        },
    },
    {
        timestamps: { createdAt: true, updatedAt: false },
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// Primary query pattern: get messages for a conversation ordered by time
MessageSchema.index({ conversationId: 1, createdAt: 1 });

const Message = mongoose.model<IMessage>('Message', MessageSchema);

export default Message;

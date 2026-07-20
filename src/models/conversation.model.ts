import mongoose, { Schema, Document } from 'mongoose';

// ============================================================
// Document Version — stores each generated document snapshot
// ============================================================

export interface IDocumentVersion {
    version: number;
    structure: Record<string, any>;  // Full DocumentStructure JSON
    prompt: string;                   // The prompt that generated it
    fileName: string;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    createdAt: Date;
}

const DocumentVersionSchema = new Schema<IDocumentVersion>(
    {
        version: { type: Number, required: true },
        structure: { type: Schema.Types.Mixed, required: true },
        prompt: { type: String, required: true },
        fileName: { type: String, required: true },
        promptTokens: { type: Number },
        completionTokens: { type: Number },
        totalTokens: { type: Number },
        createdAt: { type: Date, default: Date.now },
    },
    { _id: false }
);

// ============================================================
// Conversation — a chat session between a user and the AI
// ============================================================

export interface IConversation extends Document {
    userId: string;
    title: string;
    status: 'active' | 'archived';
    lastMessageAt: Date;
    messageCount: number;
    compactedMemory?: string;        // AI-generated dense summary of old history (≤3000 chars)
    compactedMessageCount: number;   // How many messages are captured in the compact (default 0)
    document: {
        currentVersion: number;
        versions: IDocumentVersion[];
    } | null;
    createdAt: Date;
    updatedAt: Date;
}

const ConversationSchema = new Schema<IConversation>(
    {
        userId: {
            type: String,
            required: true,
            index: true,
        },
        title: {
            type: String,
            required: true,
            default: 'New Conversation',
            maxlength: 200,
        },
        status: {
            type: String,
            enum: ['active', 'archived'],
            default: 'active',
        },
        lastMessageAt: {
            type: Date,
            default: Date.now,
        },
        messageCount: {
            type: Number,
            default: 0,
            min: 0,
        },
        compactedMemory: {
            type: String,
            default: null,
        },
        compactedMessageCount: {
            type: Number,
            default: 0,
            min: 0,
        },
        document: {
            type: {
                currentVersion: { type: Number, default: 0 },
                versions: { type: [DocumentVersionSchema], default: [] },
            },
            default: null,
        },
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// Compound index: fetch user's conversations sorted by recent activity
ConversationSchema.index({ userId: 1, updatedAt: -1 });

// Index for filtering by status
ConversationSchema.index({ userId: 1, status: 1 });

const Conversation = mongoose.model<IConversation>('Conversation', ConversationSchema);

export default Conversation;

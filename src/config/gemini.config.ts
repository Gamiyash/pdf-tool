import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { env } from './env.config';
import { loggerUtil } from '../utils/logger.util';

/**
 * Gemini AI client singleton
 */
let genAI: GoogleGenerativeAI | null = null;
let model: GenerativeModel | null = null;

/**
 * Get or create the Gemini AI client
 */
export const getGeminiModel = (): GenerativeModel => {
    if (!model) {
        if (!env.GEMINI_API_KEY) {
            throw new Error('GEMINI_API_KEY is not defined in environment variables');
        }

        genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
        const modelName = env.GEMINI_MODEL || 'gemini-2.5-flash';
        model = genAI.getGenerativeModel({
            model: modelName,
        });

        loggerUtil.info('Gemini AI client initialized', { model: modelName });
    }

    return model;
};

export default { getGeminiModel };

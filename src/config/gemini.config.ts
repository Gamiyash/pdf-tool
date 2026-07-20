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
        model = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
        });

        loggerUtil.info('Gemini AI client initialized', { model: 'gemini-2.5-flash' });
    }

    return model;
};

export default { getGeminiModel };

import fs from 'fs';
import path from 'path';
import { loggerUtil } from './logger.util';
import { AppError } from '../middleware/error.middleware';

/**
 * Supported document templates.
 * Each template maps to a skills .md file in src/skills/
 */
export type DocumentTemplate = 'generic' | 'academic';

/**
 * Template → skills file mapping
 */
const TEMPLATE_FILES: Record<DocumentTemplate, string> = {
    generic: 'doc_skills.md',
    academic: 'academic_skills.md',
};

const SKILLS_DIR = path.join(__dirname, '../skills');

/**
 * In-memory cache for loaded skills files.
 * Avoids re-reading from disk on every request.
 */
const skillsCache = new Map<string, string>();

/**
 * Load skills for a given template.
 * Returns cached version if already loaded; reads from disk on first call.
 */
export const loadSkills = (template: DocumentTemplate = 'generic'): string => {
    // Return cached if available
    if (skillsCache.has(template)) {
        return skillsCache.get(template)!;
    }

    const fileName = TEMPLATE_FILES[template];
    if (!fileName) {
        loggerUtil.warn(`Unknown template "${template}", falling back to generic`);
        return loadSkills('generic');
    }

    const filePath = path.join(SKILLS_DIR, fileName);

    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        skillsCache.set(template, content);
        loggerUtil.info('Skills file loaded', {
            template,
            file: fileName,
            length: content.length,
        });
        return content;
    } catch (error) {
        loggerUtil.error(`Failed to load skills file: ${fileName}`, error as Error);
        throw new AppError(500, `Skills file for template "${template}" not found.`);
    }
};

/**
 * Force reload a specific template's skills from disk.
 * Call this if you update a skills file at runtime.
 */
export const reloadSkills = (template?: DocumentTemplate): void => {
    if (template) {
        skillsCache.delete(template);
        loggerUtil.info(`Skills cache cleared for template: ${template}`);
    } else {
        skillsCache.clear();
        loggerUtil.info('All skills cache cleared');
    }
};

/**
 * Check if a string is a valid template name.
 */
export const isValidTemplate = (value: string): value is DocumentTemplate => {
    return value in TEMPLATE_FILES;
};

import { getGeminiModel } from '../config/gemini.config';
import { DocumentStructure, DocumentSection, EditDocumentResult } from '../types/document.types';
import { loggerUtil } from '../utils/logger.util';
import { AppError } from '../middleware/error.middleware';
import { loadSkills, DocumentTemplate } from '../utils/skills-loader.util';

/**
 * INSTRUCTION PROMPT — JSON Schema and output format ONLY.
 * All design rules, typography, colors, and visual element guidance
 * are in doc_skills.md (loaded at runtime as the knowledge base).
 */
const INSTRUCTION_PROMPT = `
=== YOUR ROLE ===
You are an expert document creation AI. You return ONLY valid JSON — no code, no markdown, no extra text.

=== OUTPUT JSON SCHEMA ===
{
  "title": "Document Title",
  "fileName": "document_name.docx",
  "theme": {
    "headingColor": "<CHOOSE based on document type — see Theme Palettes in knowledge base>",
    "subHeadingColor": "<dark accent, slightly lighter than headingColor>",
    "accentColor": "<light/pastel shade for table headers and highlights>",
    "textColor": "212121",
    "fontFamily": "<CHOOSE: Academic='Times New Roman', Business='Calibri', Technical='Arial'>"
  },
  "headerFooter": {
    "headerLeft": "Document Title",
    "headerRight": "v1.0 - Feb 2026",
    "footerLeft": "Confidential",
    "footerRight": "Page {page}"
  },
  "sections": [
    { "type": "heading", "level": 1, "content": "Section Title" },
    { "type": "paragraph", "textRuns": [
        { "text": "Bold text", "bold": true, "fontSize": 24, "color": "212121" },
        { "text": " and normal text.", "fontSize": 24, "color": "212121" }
    ]},
    { "type": "bullet_list", "items": ["Item 1", "Item 2"] },
    { "type": "numbered_list", "items": ["Step 1", "Step 2"] },
    { "type": "table", "rows": [
        { "cells": [{ "text": "Header", "bold": true }], "isHeader": true },
        { "cells": [{ "text": "Data" }] }
    ]},
    { "type": "table_of_contents", "tocTitle": "Contents" },
    { "type": "horizontal_rule" },
    { "type": "blockquote", "content": "Important quote" },
    { "type": "callout", "content": "Tip text", "backgroundColor": "E3F2FD" },
    { "type": "two_column", "sections": [
        { "type": "paragraph", "content": "Left" },
        { "type": "paragraph", "content": "Right" }
    ]},
    { "type": "references", "content": "References", "items": [
        "Smith, J. (2024). Title of Work. Journal Name, 45(2), 112-128.",
        "Brown, R. (2023). Another Title. Publisher Name."
    ]}
  ]
}

=== SECTION TYPES ===
- "heading" → level: 1|2|3, content: string
- "paragraph" → textRuns: [{text, bold?, italic?, color?, fontSize?}], alignment?: "left"|"center"|"right"|"justified"
- "bullet_list" → items: string[] (plain strings ONLY, NEVER objects)
- "numbered_list" → items: string[] (plain strings ONLY, NEVER objects)
- "table" → rows: [{cells: [{text, bold?}], isHeader?: true}]
- "table_of_contents" → tocTitle?: string
- "horizontal_rule" → (no properties)
- "blockquote" → content: string
- "two_column" → sections: DocumentSection[]
- "callout" → content: string, backgroundColor?: hex, borderColor?: hex
- "section_block" → content?: string, sections?: DocumentSection[], backgroundColor?: hex
- "references" → content?: "References" or "Bibliography", items: string[] (each item is one full citation)

=== CRITICAL OUTPUT RULES ===
1. Return ONLY raw JSON — no markdown fences, no explanatory text
2. All text PLAIN — no **, *, _ markdown formatting
3. Bold/italic → use textRuns with bold: true / italic: true
4. List items → plain strings ONLY, NEVER objects
5. fileName → lowercase_with_underscores.docx
6. Follow ALL rules from the knowledge base below
`;

export interface GeneratedDocumentResult {
    structure: DocumentStructure;
    usageMetadata?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}

export interface GeneratedEditResult {
    editResult: EditDocumentResult;
    usageMetadata?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}

/**
 * AI Service - handles communication with Gemini 2.5 Flash
 * Reads doc_skills.md as context so the AI has full document knowledge
 */
export class AiService {

    /**
     * Generate a document structure from a user prompt.
     *
     * PROMPT ORDER (optimized for LLM attention):
     * 1. Knowledge base (skills file) — FIRST for primacy effect
     * 2. JSON schema (INSTRUCTION_PROMPT)
     * 3. User request — LAST for recency effect
     */
    async generateDocumentStructure(
        prompt: string,
        documentType?: string,
        template: DocumentTemplate = 'generic'
    ): Promise<GeneratedDocumentResult> {
        try {
            const model = getGeminiModel();
            const skills = loadSkills(template);

            let userMessage = prompt;
            if (documentType) {
                userMessage = `Document Type: ${documentType}\n\nUser Request: ${prompt}`;
            }

            loggerUtil.info('Sending prompt to Gemini AI', {
                promptLength: userMessage.length,
                documentType: documentType || 'auto-detect',
                template,
                skillsLoaded: true,
            });

            const fullPrompt = `=== DOCUMENT GENERATION KNOWLEDGE BASE (${template.toUpperCase()} TEMPLATE) ===

${skills}

=== END KNOWLEDGE BASE ===

${INSTRUCTION_PROMPT}

=== USER REQUEST ===

${userMessage}

Generate the document following ALL rules from the knowledge base. Return ONLY valid JSON.`;

            loggerUtil.info(`Full Prompt Length: ${fullPrompt.length}`)

            // Retry up to 3 times with exponential backoff for transient 503/429 errors
            const MAX_RETRIES = 3;
            let result: any;

            for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                try {
                    result = await model.generateContent({
                        contents: [
                            {
                                role: 'user',
                                parts: [{ text: fullPrompt }],
                            },
                        ],
                        generationConfig: {
                            temperature: 0.9,
                            maxOutputTokens: 95536,
                            responseMimeType: 'application/json',
                        },
                    });
                    break; // success — exit retry loop
                } catch (err: any) {
                    const isRetryable = err?.message?.includes('503') || err?.message?.includes('429');
                    if (isRetryable && attempt < MAX_RETRIES) {
                        const delayMs = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s
                        loggerUtil.warn(`Gemini transient error on attempt ${attempt}/${MAX_RETRIES}, retrying in ${delayMs}ms`, {
                            error: err.message
                        });
                        await new Promise(resolve => setTimeout(resolve, delayMs));
                    } else {
                        throw err; // non-retryable or out of retries
                    }
                }
            }

            const response = result.response;
            const text = response.text();

            // Log finish reason and response info for debugging
            const candidate = response.candidates?.[0];
            loggerUtil.info('Raw AI response received', {
                responseLength: text.length,
                finishReason: candidate?.finishReason || 'unknown',
                first500Chars: text.substring(0, 500),
            });

            // Parse the JSON response
            const structure = this.parseAiResponse(text);

            loggerUtil.info('Document structure generated', {
                title: structure.title,
                sectionCount: structure.sections.length,
                fileName: structure.fileName,
                hasTheme: !!structure.theme,
            });

            const usage = response.usageMetadata;

            return {
                structure,
                usageMetadata: usage ? {
                    promptTokens: usage.promptTokenCount,
                    completionTokens: usage.candidatesTokenCount,
                    totalTokens: usage.totalTokenCount,
                } : undefined
            };

        } catch (error) {
            loggerUtil.error('AI document generation failed', error as Error);

            if (error instanceof AppError) {
                throw error;
            }

            // User-friendly message for Gemini overload
            const errMsg = (error as any)?.message || '';
            if (errMsg.includes('503') || errMsg.includes('high demand')) {
                throw new AppError(503, 'AI service is temporarily busy. Please try again in a moment.');
            }

            throw new AppError(500, 'Failed to generate document structure from AI');
        }
    }

    /**
     * Edit an existing document — returns only changed/new sections.
     *
     * Uses the short edit skill file to save tokens.
     * Returns EditDocumentResult (updatedSections + deletedIds).
     */
    async editDocumentStructure(
        prompt: string,
        template: 'generic' | 'academic' = 'generic'
    ): Promise<GeneratedEditResult> {
        try {
            const model = getGeminiModel();
            const editTemplate: DocumentTemplate = `${template}_edit`;
            const skills = loadSkills(editTemplate);

            loggerUtil.info('Sending edit prompt to Gemini AI', {
                promptLength: prompt.length,
                template: editTemplate,
            });

            const fullPrompt = `=== DOCUMENT EDIT KNOWLEDGE BASE (${template.toUpperCase()} TEMPLATE) ===

${skills}

=== END KNOWLEDGE BASE ===

=== EDIT TASK ===

${prompt}

Return ONLY valid JSON matching the edit format: { "updatedSections": [...], "deletedIds": [...] }`;

            const MAX_RETRIES = 3;
            let result: any;

            for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                try {
                    result = await model.generateContent({
                        contents: [
                            {
                                role: 'user',
                                parts: [{ text: fullPrompt }],
                            },
                        ],
                        generationConfig: {
                            temperature: 0.5,
                            maxOutputTokens: 65536,
                            responseMimeType: 'application/json',
                        },
                    });
                    break;
                } catch (err: any) {
                    const isRetryable = err?.message?.includes('503') || err?.message?.includes('429');
                    if (isRetryable && attempt < MAX_RETRIES) {
                        const delayMs = 1000 * Math.pow(2, attempt - 1);
                        loggerUtil.warn(`Gemini transient error on edit attempt ${attempt}/${MAX_RETRIES}, retrying in ${delayMs}ms`, {
                            error: err.message
                        });
                        await new Promise(resolve => setTimeout(resolve, delayMs));
                    } else {
                        throw err;
                    }
                }
            }

            const response = result.response;
            const text = response.text();

            loggerUtil.info('Raw AI edit response received', {
                responseLength: text.length,
                finishReason: response.candidates?.[0]?.finishReason || 'unknown',
            });
            // LOG FULL RAW TEXT for debugging (trim to 5000 chars to avoid log bloat)
            loggerUtil.info('RAW EDIT AI RESPONSE TEXT', {
                rawText: text.substring(0, 5000),
            });

            // Parse edit response
            let cleaned = text.trim();
            cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
            const parsed = JSON.parse(cleaned);

            const editResult: EditDocumentResult = {
                updatedSections: Array.isArray(parsed.updatedSections)
                    ? this.normalizeSections(parsed.updatedSections)
                    : [],
                deletedIds: Array.isArray(parsed.deletedIds) ? parsed.deletedIds : undefined,
            };

            loggerUtil.info('Edit result parsed', {
                updatedCount: editResult.updatedSections.length,
                deletedCount: editResult.deletedIds?.length || 0,
                deletedIds: editResult.deletedIds || [],
                updatedSections: editResult.updatedSections.map(s => ({
                    id: s.id || '(no id — new section)',
                    afterId: s.afterId || '(no afterId — append at end)',
                    type: s.type,
                    content: (s.content || '').substring(0, 80),
                })),
            });

            const usage = response.usageMetadata;

            return {
                editResult,
                usageMetadata: usage ? {
                    promptTokens: usage.promptTokenCount,
                    completionTokens: usage.candidatesTokenCount,
                    totalTokens: usage.totalTokenCount,
                } : undefined
            };

        } catch (error) {
            loggerUtil.error('AI document edit failed', error as Error);

            if (error instanceof AppError) throw error;

            const errMsg = (error as any)?.message || '';
            if (errMsg.includes('503') || errMsg.includes('high demand')) {
                throw new AppError(503, 'AI service is temporarily busy. Please try again in a moment.');
            }

            throw new AppError(500, 'Failed to edit document structure from AI');
        }
    }

    /**
     * Parse and validate the AI response into DocumentStructure
     * Handles various edge cases: code fences, arrays, BOM, nested objects
     */
    private parseAiResponse(text: string): DocumentStructure {
        try {
            let cleaned = text.trim();

            // Remove BOM and invisible characters
            cleaned = cleaned.replace(/^\uFEFF/, '');
            cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

            // Remove markdown code fences (```json ... ``` or ``` ... ```)
            cleaned = cleaned.replace(/^```(?: json) ?\s *\n ?/i, '');
            cleaned = cleaned.replace(/\n?```\s*$/i, '');
            cleaned = cleaned.trim();

            // If it doesn't start with { or [, try to extract JSON from mixed text
            if (!cleaned.startsWith('{') && !cleaned.startsWith('[')) {
                const jsonStart = cleaned.indexOf('{');
                if (jsonStart !== -1) {
                    // Find the matching closing brace
                    let depth = 0;
                    let jsonEnd = -1;
                    for (let i = jsonStart; i < cleaned.length; i++) {
                        if (cleaned[i] === '{') depth++;
                        if (cleaned[i] === '}') depth--;
                        if (depth === 0) {
                            jsonEnd = i;
                            break;
                        }
                    }
                    if (jsonEnd !== -1) {
                        cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
                    }
                }
            }

            let parsed: DocumentStructure;

            const rawParsed = JSON.parse(cleaned);

            // Handle if AI returned an array instead of object
            if (Array.isArray(rawParsed)) {
                if (rawParsed.length > 0 && rawParsed[0].title) {
                    parsed = rawParsed[0] as DocumentStructure;
                } else {
                    throw new Error('AI returned an array without valid document structure');
                }
            } else {
                parsed = rawParsed as DocumentStructure;
            }

            // Validate required fields
            if (!parsed.title || typeof parsed.title !== 'string') {
                throw new Error('Missing or invalid "title" in AI response');
            }

            if (!parsed.sections || !Array.isArray(parsed.sections) || parsed.sections.length === 0) {
                throw new Error('Missing or empty "sections" in AI response');
            }

            // Set default fileName if missing
            if (!parsed.fileName) {
                parsed.fileName = parsed.title
                    .toLowerCase()
                    .replace(/[^a-z0-9\s]/g, '')
                    .replace(/\s+/g, '_')
                    .substring(0, 50) + '.docx';
            }

            // Validate and filter sections
            const validTypes = ['heading', 'paragraph', 'bullet_list', 'numbered_list', 'table', 'table_of_contents', 'horizontal_rule', 'blockquote', 'two_column', 'callout', 'section_block', 'references'];

            parsed.sections = parsed.sections.filter(section => {
                if (!validTypes.includes(section.type)) {
                    loggerUtil.warn(`Removing unknown section type: ${section.type}`);
                    return false;
                }

                // STRICT RULE CHECK: Paragraphs must have textRuns
                if (section.type === 'paragraph') {
                    if (!section.textRuns || !Array.isArray(section.textRuns) || section.textRuns.length === 0) {
                        // Allow empty paragraphs ONLY if they have spacing (spacer paragraphs)
                        if (section.spacing) {
                            return true;
                        }
                        // Otherwise remove empty/invalid paragraphs
                        if (!section.content) {
                            return false;
                        }
                    }
                }

                return true;
            });

            if (parsed.sections.length === 0) {
                throw new Error('No valid sections after filtering');
            }

            // Deep normalize all section data to ensure type safety
            parsed.sections = this.normalizeSections(parsed.sections);

            return parsed;

        } catch (error) {
            if (error instanceof SyntaxError) {
                loggerUtil.error('JSON parse failed - raw response:', new Error('Invalid JSON'), {
                    rawTextStart: text.substring(0, 1000),
                    rawTextEnd: text.substring(Math.max(0, text.length - 200)),
                    totalLength: text.length,
                });
                throw new AppError(500, 'AI returned invalid JSON. Please try again.');
            }
            loggerUtil.error('Document structure validation failed', error as Error);
            throw new AppError(500, `Invalid document structure: ${(error as Error).message}`);
        }
    }

    /**
     * Deep normalize all sections to ensure type safety.
     * Converts objects to strings in items[], normalizes content/textRuns,
     * sanitizes table cells, and recurses into nested sections.
     */
    private normalizeSections(sections: DocumentSection[]): DocumentSection[] {
        return sections.map(section => {
            // Normalize list items → always plain strings
            if ((section.type === 'bullet_list' || section.type === 'numbered_list') && section.items) {
                section.items = section.items.map((item: any) => this.normalizeToString(item));
            }

            // Normalize content → always a string
            if (section.content !== undefined && typeof section.content !== 'string') {
                section.content = this.normalizeToString(section.content);
            }

            // Normalize textRuns → ensure each run has a valid string text
            if (section.textRuns && Array.isArray(section.textRuns)) {
                section.textRuns = section.textRuns
                    .map((run: any) => {
                        if (typeof run === 'string') {
                            return { text: run };
                        }
                        if (typeof run === 'object' && run !== null) {
                            if (typeof run.text !== 'string') {
                                run.text = this.normalizeToString(run.text);
                            }
                            return run;
                        }
                        return { text: this.normalizeToString(run) };
                    })
                    .filter((run: any) => run.text && run.text.trim());
            }

            // Normalize table rows → ensure cell text is always a string
            if (section.type === 'table' && section.rows) {
                section.rows = section.rows.map((row: any) => {
                    if (row.cells && Array.isArray(row.cells)) {
                        row.cells = row.cells.map((cell: any) => {
                            if (typeof cell === 'string') {
                                return { text: cell };
                            }
                            if (typeof cell === 'object' && cell !== null) {
                                if (typeof cell.text !== 'string') {
                                    cell.text = this.normalizeToString(cell.text);
                                }
                                return cell;
                            }
                            return { text: this.normalizeToString(cell) };
                        });
                    }
                    return row;
                });
            }

            // Recurse into nested sections (two_column, section_block)
            if (section.sections && Array.isArray(section.sections)) {
                section.sections = this.normalizeSections(section.sections);
            }

            return section;
        });
    }

    /**
     * Convert any value to a readable string — mirrors document.service.ts normalizeText
     */
    private normalizeToString(value: any): string {
        if (value == null) return '';
        if (typeof value === 'string') return value;
        if (typeof value === 'number' || typeof value === 'boolean') return String(value);
        if (Array.isArray(value)) return value.map(v => this.normalizeToString(v)).filter(Boolean).join(', ');
        if (typeof value === 'object') {
            for (const key of ['text', 'content', 'name', 'title', 'label', 'value', 'description']) {
                if (typeof value[key] === 'string' && value[key].trim()) return value[key];
            }
            return Object.values(value).map(v => this.normalizeToString(v)).filter(Boolean).join(' — ');
        }
        return '';
    }
}

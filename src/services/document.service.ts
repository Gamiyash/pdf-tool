import {
    Document,
    Packer,
    Paragraph,
    TextRun,
    Table,
    TableRow,
    TableCell,
    HeadingLevel,
    AlignmentType,
    LevelFormat,
    BorderStyle,
    WidthType,
    ShadingType,
    Header,
    Footer,
    PageNumber,
    Bookmark,
    InternalHyperlink,
    TabStopType,
    ISectionOptions,
    SectionType as WordSectionType,
} from 'docx';
import {
    DocumentStructure,
    DocumentSection,
    DocumentTheme,
    TextRunData,
    TableRowData,
} from '../types/document.types';
import { loggerUtil } from '../utils/logger.util';
import { AppError } from '../middleware/error.middleware';

/**
 * Centralized font sizes (in half-points, where 2 hp = 1 pt).
 * These are hardcoded to match our rules — NEVER trust AI values for sizes.
 * Source of truth: doc_skills.md PRIORITY 3: FONT & TYPOGRAPHY
 */
const FONT_SIZES = {
    h1: 36,             // 18pt
    h2: 32,             // 16pt
    h3: 28,             // 14pt
    body: 22,           // 11pt
    list: 22,           // 11pt
    table: 22,          // 11pt
    caption: 20,        // 10pt
    coverTitle: 44,     // 22pt
    coverSubtitle: 32,  // 16pt
    headerFooter: 18,   // 9pt
    tocTitle: 36,       // 18pt (same as H1)
    tocEntry: 22,       // 11pt (same as body)
} as const;

/**
 * Default theme - professional dark blue (used when AI doesn't specify one)
 */
const DEFAULT_THEME: DocumentTheme = {
    headingColor: '1A1A2E',
    subHeadingColor: '16213E',
    accentColor: 'D5E8F0',
    textColor: '333333',
    fontFamily: 'Arial',
};

/**
 * Strip markdown bold/italic formatting from text
 * Safety net in case AI still uses ** or * despite being told not to
 */
/**
 * Normalize ANY value into a clean, readable string.
 * Handles all possible AI output shapes:
 *  - string   → strip markdown, return as-is
 *  - object   → extract .text, .content, or join all string values
 *  - array    → recursively normalize each element and join
 *  - number/boolean → convert to string
 *  - null/undefined → empty string
 */
const normalizeText = (value: any): string => {
    if (value == null) return '';

    if (typeof value === 'string') {
        return value
            .replace(/\*\*(.+?)\*\*/g, '$1')
            .replace(/\_\_(.+?)\_\_/g, '$1')
            .replace(/\*(.+?)\*/g, '$1')
            .replace(/\_(.+?)\_/g, '$1');
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }

    if (Array.isArray(value)) {
        return value.map(normalizeText).filter(Boolean).join(', ');
    }

    if (typeof value === 'object') {
        // Priority order for common AI field names
        for (const key of ['text', 'content', 'name', 'title', 'label', 'value', 'description', 'summary']) {
            if (typeof value[key] === 'string' && value[key].trim()) return normalizeText(value[key]);
        }
        // Join all string values with a separator
        const parts = Object.values(value).map(normalizeText).filter(Boolean);
        return parts.join(' — ');
    }

    return '';
};

// Backward-compatible alias
const stripMarkdown = normalizeText;

/**
 * Document Service - Converts DocumentStructure JSON into DOCX buffer
 * Follows all critical rules from doc_skills.md
 * Supports dynamic theming based on AI response
 */
export class DocumentService {
    /** Per-build counter for numbered list references — reset on each buildDocx call */
    private numberedListCounter = 0;

    /**
     * Build a DOCX file from a DocumentStructure
     * Returns a Buffer ready to send as download
     */
    async buildDocx(structure: DocumentStructure): Promise<Buffer> {
        try {
            // Reset per-build counters
            this.numberedListCounter = 0;

            // Merge AI theme with defaults
            const theme: DocumentTheme = {
                ...DEFAULT_THEME,
                ...structure.theme,
            };

            loggerUtil.info('Building DOCX document', {
                title: structure.title,
                sectionCount: structure.sections.length,
                theme: theme,
            });

            // Flatten sections into Word-compatible sections (handling 2-column layouts)
            const wordSections = this.buildWordSections(structure.sections, theme, structure);

            const doc = new Document({
                // Style configuration - uses theme colors dynamically
                styles: {
                    default: {
                        document: {
                            run: {
                                font: theme.fontFamily || 'Arial',
                                size: FONT_SIZES.body,
                                color: theme.textColor || '333333',
                            },
                        },
                    },
                    paragraphStyles: [
                        {
                            id: 'Heading1',
                            name: 'Heading 1',
                            basedOn: 'Normal',
                            next: 'Normal',
                            quickFormat: true,
                            run: { size: FONT_SIZES.h1, bold: true, font: theme.fontFamily || 'Arial', color: theme.headingColor },
                            paragraph: { spacing: { before: 400, after: 200 }, outlineLevel: 0 },
                        },
                        {
                            id: 'Heading2',
                            name: 'Heading 2',
                            basedOn: 'Normal',
                            next: 'Normal',
                            quickFormat: true,
                            run: { size: FONT_SIZES.h2, bold: true, font: theme.fontFamily || 'Arial', color: theme.subHeadingColor },
                            paragraph: { spacing: { before: 300, after: 160 }, outlineLevel: 1 },
                        },
                        {
                            id: 'Heading3',
                            name: 'Heading 3',
                            basedOn: 'Normal',
                            next: 'Normal',
                            quickFormat: true,
                            run: { size: FONT_SIZES.h3, bold: true, font: theme.fontFamily || 'Arial', color: theme.subHeadingColor },
                            paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 2 },
                        },
                    ],
                },

                // Numbering configuration with themed bullets + unique per-list numbered definitions
                numbering: {
                    config: [
                        {
                            reference: 'bullets',
                            levels: [
                                {
                                    level: 0,
                                    format: LevelFormat.BULLET,
                                    text: '\u2022',
                                    alignment: AlignmentType.LEFT,
                                    style: {
                                        paragraph: {
                                            indent: { left: 720, hanging: 360 },
                                        },
                                        run: {
                                            color: theme.accentColor || '000000',
                                        }
                                    },
                                },
                                {
                                    level: 1,
                                    format: LevelFormat.BULLET,
                                    text: '\u25E6',
                                    alignment: AlignmentType.LEFT,
                                    style: {
                                        paragraph: {
                                            indent: { left: 1440, hanging: 360 },
                                        },
                                        run: {
                                            color: theme.accentColor || '000000',
                                        }
                                    },
                                },
                            ],
                        },
                        // Generate a unique numbering definition per numbered_list
                        // so each list's counter resets to 1 independently
                        ...this.generateNumberedListConfigs(structure.sections, theme),
                    ],
                },

                sections: wordSections,
            });

            const buffer = await Packer.toBuffer(doc);

            loggerUtil.info('DOCX document built successfully', {
                bufferSize: buffer.length,
                fileName: structure.fileName,
            });

            return buffer as Buffer;

        } catch (error) {
            loggerUtil.error('Failed to build DOCX document', error as Error);
            throw new AppError(500, 'Failed to build DOCX document');
        }
    }

    /**
     * Splits sections into grouped Word-compatible sections
     * Handles transitions between single-column and multi-column layouts
     */
    private buildWordSections(sections: DocumentSection[], theme: DocumentTheme, structure: DocumentStructure): ISectionOptions[] {
        const wordSections: ISectionOptions[] = [];
        let currentOneColBuffer: DocumentSection[] = [];

        // Pre-scan all headings (recursive scanning needed? No, usually headings are top level or we flatten)
        // For simplicity, we scan top-level for now. 
        // Note: nesting 2-col inside 1-col implies structure changes.
        // We need bookmark generation BEFORE splitting.
        const headingInfos = this.scanHeadings(sections);

        const flushOneColBuffer = () => {
            if (currentOneColBuffer.length > 0) {
                wordSections.push(this.createSectionOption(
                    this.buildSectionChildren(currentOneColBuffer, theme, headingInfos),
                    1,
                    structure
                ));
                currentOneColBuffer = [];
            }
        };

        for (const section of sections) {
            if (section.type === 'two_column' && section.sections) {
                flushOneColBuffer();

                // Create 2-column section
                // Recursively build children
                const colChildren = this.buildSectionChildren(section.sections, theme, headingInfos);
                wordSections.push(this.createSectionOption(
                    colChildren,
                    2,
                    structure,
                    section.columnGap || 720
                ));
            } else {
                currentOneColBuffer.push(section);
            }
        }
        flushOneColBuffer();

        return wordSections;
    }

    /**
     * Create a Word Section configuration
     */
    private createSectionOption(children: (Paragraph | Table)[], colCount: number, structure: DocumentStructure, colSpace?: number): ISectionOptions {
        const hasHeaderCenter = !!structure.headerFooter?.headerCenter;
        const hasFooterCenter = !!structure.headerFooter?.footerCenter;

        return {
            properties: {
                type: WordSectionType.CONTINUOUS,
                column: {
                    count: colCount,
                    space: colSpace,
                },
                page: {
                    size: {
                        width: structure.pageSize?.width || 12240,
                        height: structure.pageSize?.height || 15840,
                    },
                    margin: {
                        top: structure.margins?.top || 1440,
                        right: structure.margins?.right || 1440,
                        bottom: structure.margins?.bottom || 1440,
                        left: structure.margins?.left || 1440,
                    },
                },
            },
            headers: {
                default: new Header({
                    children: [
                        new Table({
                            width: { size: 100, type: WidthType.PERCENTAGE },
                            borders: {
                                bottom: { style: BorderStyle.SINGLE, size: 6, color: structure.theme?.accentColor || 'CCCCCC' },
                                top: { style: BorderStyle.NONE },
                                left: { style: BorderStyle.NONE },
                                right: { style: BorderStyle.NONE },
                                insideVertical: { style: BorderStyle.NONE },
                                insideHorizontal: { style: BorderStyle.NONE },
                            },
                            rows: [
                                new TableRow({
                                    children: [
                                        // Left cell
                                        new TableCell({
                                            width: { size: hasHeaderCenter ? 33 : 50, type: WidthType.PERCENTAGE },
                                            borders: { bottom: { style: BorderStyle.NONE }, top: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
                                            children: [
                                                new Paragraph({
                                                    alignment: AlignmentType.LEFT,
                                                    children: [
                                                        new TextRun({
                                                            text: structure.headerFooter?.headerLeft || structure.title,
                                                            font: structure.theme?.fontFamily || 'Arial',
                                                            size: FONT_SIZES.caption,
                                                            bold: true,
                                                            color: structure.theme?.headingColor || '333333',
                                                        }),
                                                    ],
                                                }),
                                            ],
                                        }),
                                        // Center cell (only when headerCenter is provided)
                                        ...(hasHeaderCenter ? [new TableCell({
                                            width: { size: 34, type: WidthType.PERCENTAGE },
                                            borders: { bottom: { style: BorderStyle.NONE }, top: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
                                            children: [
                                                new Paragraph({
                                                    alignment: AlignmentType.CENTER,
                                                    children: [
                                                        new TextRun({
                                                            text: structure.headerFooter!.headerCenter!,
                                                            font: structure.theme?.fontFamily || 'Arial',
                                                            size: FONT_SIZES.headerFooter,
                                                            color: structure.theme?.headingColor || '333333',
                                                        }),
                                                    ],
                                                }),
                                            ],
                                        })] : []),
                                        // Right cell
                                        new TableCell({
                                            width: { size: hasHeaderCenter ? 33 : 50, type: WidthType.PERCENTAGE },
                                            borders: { bottom: { style: BorderStyle.NONE }, top: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
                                            children: [
                                                new Paragraph({
                                                    alignment: AlignmentType.RIGHT,
                                                    children: [
                                                        new TextRun({
                                                            text: structure.headerFooter?.headerRight || 'v1.0',
                                                            font: structure.theme?.fontFamily || 'Arial',
                                                            size: FONT_SIZES.headerFooter,
                                                            color: '999999',
                                                        }),
                                                    ],
                                                }),
                                            ],
                                        }),
                                    ],
                                }),
                            ],
                        }),
                        new Paragraph({ spacing: { after: 240 } }),
                    ],
                }),
            },
            footers: {
                default: new Footer({
                    children: [
                        new Paragraph({ spacing: { before: 240 } }),
                        new Table({
                            width: { size: 100, type: WidthType.PERCENTAGE },
                            borders: {
                                top: { style: BorderStyle.SINGLE, size: 6, color: structure.theme?.accentColor || 'CCCCCC' },
                                bottom: { style: BorderStyle.NONE },
                                left: { style: BorderStyle.NONE },
                                right: { style: BorderStyle.NONE },
                                insideVertical: { style: BorderStyle.NONE },
                                insideHorizontal: { style: BorderStyle.NONE },
                            },
                            rows: [
                                new TableRow({
                                    children: [
                                        // Left cell
                                        new TableCell({
                                            width: { size: hasFooterCenter ? 33 : 50, type: WidthType.PERCENTAGE },
                                            borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
                                            children: [
                                                new Paragraph({
                                                    alignment: AlignmentType.LEFT,
                                                    children: [
                                                        new TextRun({
                                                            text: structure.headerFooter?.footerLeft || 'Confidential',
                                                            font: structure.theme?.fontFamily || 'Arial',
                                                            size: FONT_SIZES.headerFooter,
                                                            color: '999999',
                                                        }),
                                                    ],
                                                }),
                                            ],
                                        }),
                                        // Center cell (only when footerCenter is provided)
                                        ...(hasFooterCenter ? [new TableCell({
                                            width: { size: 34, type: WidthType.PERCENTAGE },
                                            borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
                                            children: [
                                                new Paragraph({
                                                    alignment: AlignmentType.CENTER,
                                                    children: [
                                                        new TextRun({
                                                            text: structure.headerFooter!.footerCenter!,
                                                            font: structure.theme?.fontFamily || 'Arial',
                                                            size: FONT_SIZES.headerFooter,
                                                            color: '999999',
                                                        }),
                                                    ],
                                                }),
                                            ],
                                        })] : []),
                                        // Right cell (page number)
                                        new TableCell({
                                            width: { size: hasFooterCenter ? 33 : 50, type: WidthType.PERCENTAGE },
                                            borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
                                            children: [
                                                new Paragraph({
                                                    alignment: AlignmentType.RIGHT,
                                                    children: [
                                                        new TextRun({
                                                            text: structure.headerFooter?.footerRight ? structure.headerFooter.footerRight.replace('{page}', '') : 'Page ',
                                                            font: structure.theme?.fontFamily || 'Arial',
                                                            size: FONT_SIZES.headerFooter,
                                                            color: '999999',
                                                        }),
                                                        new TextRun({
                                                            children: [PageNumber.CURRENT],
                                                            font: structure.theme?.fontFamily || 'Arial',
                                                            size: FONT_SIZES.headerFooter,
                                                            color: '999999',
                                                        }),
                                                    ],
                                                }),
                                            ],
                                        }),
                                    ],
                                }),
                            ],
                        }),
                    ],
                }),
            },
            children,
        };
    }

    /**
     * Scan headings for bookmarks (flat scan for now - works for 90% of cases)
     */
    private scanHeadings(sections: DocumentSection[]): { id: string; text: string; level: number }[] {
        const headingInfos: { id: string; text: string; level: number }[] = [];
        let headingCounter = 0;

        const scan = (list: DocumentSection[]) => {
            for (const s of list) {
                if (s.type === 'heading' && s.content) {
                    headingInfos.push({
                        id: `heading_${headingCounter++}`,
                        text: stripMarkdown(s.content),
                        level: s.level || 1,
                    });
                }
                if (s.sections) {
                    scan(s.sections);
                }
            }
        };

        scan(sections);
        return headingInfos;
    }

    /**
     * Convert section objects into docx Paragraph/Table elements
     */
    private buildSectionChildren(
        sections: DocumentSection[],
        theme: DocumentTheme,
        headingInfos: { id: string; text: string; level: number }[]
    ): (Paragraph | Table)[] {
        const children: (Paragraph | Table)[] = [];

        // We need to match current section to its bookmark ID. 
        // This is tricky with recursive scan.
        // Simplified approach: find matching heading info by text and level? 
        // Or re-scan index?
        // For now, let's just find by text matching (safer).

        const getBookmarkId = (text: string): string | undefined => {
            const clean = stripMarkdown(text);
            const found = headingInfos.find(h => h.text === clean);
            return found?.id;
        };

        for (const section of sections) {
            try {
                switch (section.type) {
                    case 'heading': {
                        const bookmarkId = getBookmarkId(section.content || '');
                        children.push(this.buildHeading(section, theme, bookmarkId));
                        break;
                    }

                    case 'paragraph':
                        children.push(this.buildParagraph(section, theme));
                        break;

                    case 'bullet_list':
                        children.push(...this.buildBulletList(section, theme));
                        break;

                    case 'numbered_list':
                        children.push(...this.buildNumberedList(section, theme));
                        break;

                    case 'table':
                        children.push(this.buildTable(section, theme));
                        break;

                    case 'table_of_contents':
                        children.push(...this.buildTableOfContents(section, theme, headingInfos));
                        break;

                    case 'horizontal_rule':
                        children.push(this.buildHorizontalRule());
                        break;

                    case 'blockquote':
                        children.push(this.buildBlockquote(section, theme));
                        break;

                    case 'callout':
                        children.push(new Paragraph({ spacing: { before: 240 }, children: [] }));
                        children.push(this.buildCallout(section, theme));
                        children.push(new Paragraph({ spacing: { after: 240 }, children: [] }));
                        break;

                    case 'section_block':
                        children.push(this.buildSectionBlock(section, theme, headingInfos));
                        break;

                    case 'references':
                        children.push(...this.buildReferences(section, theme));
                        break;

                    case 'two_column':
                        // If we encounter a nested two_column inside a children build (e.g. inside a block),
                        // we can't easily switch page sections. 
                        // For now, just render children linearly or log warning.
                        // Ideally two_column should be top-level.
                        if (section.sections) {
                            children.push(...this.buildSectionChildren(section.sections, theme, headingInfos));
                        }
                        break;

                    default:
                        loggerUtil.warn(`Unknown section type: ${section.type}, treating as paragraph`);
                        if (section.content) {
                            children.push(new Paragraph({
                                spacing: { after: 200 },
                                children: [new TextRun({
                                    text: section.content,
                                    font: theme.fontFamily || 'Arial',
                                    size: FONT_SIZES.body,
                                    color: theme.textColor || '333333',
                                })],
                            }));
                        }
                        break;
                }
            } catch (sectionError) {
                loggerUtil.error(`Error building section of type ${section.type}`, sectionError as Error);
            }
        }

        return children;
    }

    /**
     * Build a heading paragraph with optional bookmark for TOC linking.
     * ALWAYS applies explicit run formatting (size, color, bold) so headings
     * look correct even inside table cells where Word styles may not apply.
     */
    private buildHeading(section: DocumentSection, theme: DocumentTheme, bookmarkId?: string): Paragraph {
        const headingMap: Record<number, typeof HeadingLevel[keyof typeof HeadingLevel]> = {
            1: HeadingLevel.HEADING_1,
            2: HeadingLevel.HEADING_2,
            3: HeadingLevel.HEADING_3,
        };

        const level = section.level || 1;
        const headingText = stripMarkdown(section.content || '');

        // Explicit heading formatting per level — uses centralized FONT_SIZES
        const headingStyles: Record<number, { size: number; color: string; spacingBefore: number; spacingAfter: number }> = {
            1: { size: FONT_SIZES.h1, color: theme.headingColor || '1A1A2E', spacingBefore: 400, spacingAfter: 200 },
            2: { size: FONT_SIZES.h2, color: theme.subHeadingColor || '16213E', spacingBefore: 300, spacingAfter: 160 },
            3: { size: FONT_SIZES.h3, color: theme.subHeadingColor || '16213E', spacingBefore: 240, spacingAfter: 120 },
        };
        const style = headingStyles[level] || headingStyles[1];

        const runProps = {
            text: headingText,
            font: theme.fontFamily || 'Arial',
            size: style.size,
            bold: true as const,
            color: style.color,
        };

        // If we have a bookmark ID, wrap the heading text in a Bookmark
        // so the TOC can link to this exact location
        const children = bookmarkId
            ? [
                new Bookmark({
                    id: bookmarkId,
                    children: [new TextRun(runProps)],
                }),
            ]
            : [new TextRun(runProps)];

        return new Paragraph({
            heading: headingMap[level] || HeadingLevel.HEADING_1,
            spacing: { before: style.spacingBefore, after: style.spacingAfter },
            pageBreakBefore: section.pageBreakBefore || false,
            alignment: this.getAlignment(section.alignment),
            children,
        });
    }

    /**
     * Build a paragraph (plain text or rich text with textRuns)
     */
    private buildParagraph(section: DocumentSection, theme: DocumentTheme): Paragraph {
        let textChildren: TextRun[];

        if (section.textRuns && section.textRuns.length > 0) {
            textChildren = section.textRuns.map((run: TextRunData) =>
                new TextRun({
                    text: run.text,
                    bold: run.bold || false,
                    italics: run.italic || false,
                    underline: run.underline ? {} : undefined,
                    size: run.fontSize || FONT_SIZES.body,
                    font: run.font || theme.fontFamily || 'Arial',
                    color: run.color || theme.textColor || '333333',
                })
            );
        } else {
            textChildren = [
                new TextRun({
                    text: stripMarkdown(section.content || ''),
                    font: theme.fontFamily || 'Arial',
                    size: FONT_SIZES.body,
                    color: theme.textColor || '333333',
                }),
            ];
        }

        return new Paragraph({
            spacing: {
                before: section.spacing?.before,
                after: section.spacing?.after ?? 200,
                line: 360
            },
            alignment: this.getAlignment(section.alignment),
            pageBreakBefore: section.pageBreakBefore || false,
            children: textChildren,
        });
    }

    /**
     * Build bullet list items (using LevelFormat.BULLET - NEVER unicode bullets)
     */
    private buildBulletList(section: DocumentSection, theme: DocumentTheme): Paragraph[] {
        const items = section.items || [];
        const paragraphs: Paragraph[] = [];

        if (items.length > 0) {
            for (const item of items) {
                paragraphs.push(
                    new Paragraph({
                        numbering: { reference: 'bullets', level: 0 },
                        spacing: { after: 80 },
                        children: [
                            new TextRun({
                                text: stripMarkdown(item),
                                font: theme.fontFamily || 'Arial',
                                size: FONT_SIZES.list,
                                color: theme.textColor || '333333',
                            }),
                        ],
                    })
                );
            }

            paragraphs.push(new Paragraph({ spacing: { after: 200 }, children: [] }));
        }

        return paragraphs;
    }

    /**
     * Build numbered list items
     */
    private buildNumberedList(section: DocumentSection, theme: DocumentTheme): Paragraph[] {
        const items = section.items || [];
        const paragraphs: Paragraph[] = [];

        if (items.length > 0) {
            // Each list uses its own unique reference so numbering always starts at 1
            const ref = `numbered-${this.numberedListCounter++}`;

            for (const item of items) {
                paragraphs.push(
                    new Paragraph({
                        numbering: { reference: ref, level: 0 },
                        spacing: { after: 80 },
                        children: [
                            new TextRun({
                                text: stripMarkdown(item),
                                font: theme.fontFamily || 'Arial',
                                size: FONT_SIZES.list,
                                color: theme.textColor || '333333',
                            }),
                        ],
                    })
                );
            }

            paragraphs.push(new Paragraph({ spacing: { after: 200 }, children: [] }));
        }

        return paragraphs;
    }

    /**
     * Recursively count all numbered_list sections and generate
     * a unique numbering config for each one.
     * This ensures every numbered list in the document has its own
     * Word-level numbering definition and resets to 1.
     */
    private generateNumberedListConfigs(
        sections: DocumentSection[],
        theme: DocumentTheme
    ): { reference: string; levels: any[] }[] {
        const count = this.countNumberedLists(sections);
        const configs: { reference: string; levels: any[] }[] = [];

        for (let i = 0; i < count; i++) {
            configs.push({
                reference: `numbered-${i}`,
                levels: [
                    {
                        level: 0,
                        format: LevelFormat.DECIMAL,
                        text: '%1.',
                        alignment: AlignmentType.LEFT,
                        style: {
                            paragraph: {
                                indent: { left: 720, hanging: 360 },
                            },
                            run: {
                                color: theme.headingColor || '000000',
                                bold: true,
                            }
                        },
                    },
                    {
                        level: 1,
                        format: LevelFormat.LOWER_LETTER,
                        text: '%2)',
                        alignment: AlignmentType.LEFT,
                        style: {
                            paragraph: {
                                indent: { left: 1440, hanging: 360 },
                            },
                        },
                    },
                ],
            });
        }

        return configs;
    }

    /**
     * Recursively count all numbered_list sections in the document tree
     */
    private countNumberedLists(sections: DocumentSection[]): number {
        let count = 0;
        for (const section of sections) {
            if (section.type === 'numbered_list') count++;
            if (section.sections) count += this.countNumberedLists(section.sections);
        }
        return count;
    }

    /**
     * Build a professional References / Bibliography section.
     *
     * Layout:
     * - Page break before (references always start on a new page)
     * - Centered, bold heading with accent bottom border
     * - Each reference entry rendered as-is with 0.5-inch hanging indent
     * - Clean spacing between entries
     */
    private buildReferences(section: DocumentSection, theme: DocumentTheme): Paragraph[] {
        const paragraphs: Paragraph[] = [];
        const items = section.items || [];
        const title = section.content || 'References';

        // 1. References heading — centered, bold, accent bottom border
        paragraphs.push(
            new Paragraph({
                pageBreakBefore: true,
                alignment: AlignmentType.CENTER,
                spacing: { after: 300 },
                border: {
                    bottom: {
                        color: theme.accentColor || 'D5E8F0',
                        space: 8,
                        style: BorderStyle.SINGLE,
                        size: 12,
                    },
                },
                children: [
                    new TextRun({
                        text: title,
                        font: theme.fontFamily || 'Arial',
                        size: FONT_SIZES.h1,
                        bold: true,
                        color: theme.headingColor || '1A1A2E',
                    }),
                ],
            })
        );

        // 2. Spacer after heading
        paragraphs.push(new Paragraph({ spacing: { after: 200 }, children: [] }));

        // 3. Each reference entry — rendered as-is, no numbering, no URL manipulation
        //    Hanging indent (0.5 inch = 720 DXA) matches standard academic formatting
        for (const item of items) {
            const refText = typeof item === 'string' ? item.trim() : String(item).trim();

            if (!refText) continue;

            paragraphs.push(
                new Paragraph({
                    spacing: { after: 160 },
                    indent: {
                        left: 720,      // 0.5 inch — continuation lines indented
                        hanging: 720,   // Hanging indent — first line pulled back to margin
                    },
                    children: [
                        new TextRun({
                            text: refText,
                            font: theme.fontFamily || 'Arial',
                            size: FONT_SIZES.body,
                            color: theme.textColor || '333333',
                        }),
                    ],
                })
            );
        }

        // 4. Bottom spacer
        paragraphs.push(new Paragraph({ spacing: { after: 400 }, children: [] }));

        return paragraphs;
    }

    /**
     * Build a table with proper dual widths and styling
     * Uses theme accentColor for header shading when cell doesn't specify its own
     */
    private buildTable(section: DocumentSection, theme: DocumentTheme): Table {
        const rows = section.rows || [];
        if (rows.length === 0) {
            return new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                rows: [
                    new TableRow({
                        children: [
                            new TableCell({
                                children: [new Paragraph({ children: [new TextRun('Empty table')] })],
                            }),
                        ],
                    }),
                ],
            });
        }

        // Calculate column count and widths
        const columnCount = Math.max(...rows.map((r: TableRowData) => r.cells.length));
        const contentWidth = 9360; // US Letter with 1" margins
        const defaultColumnWidth = Math.floor(contentWidth / columnCount);
        const columnWidths = section.columnWidths ||
            Array(columnCount).fill(defaultColumnWidth);

        const totalWidth = columnWidths.reduce((sum: number, w: number) => sum + w, 0);

        const border = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
        const borders = { top: border, bottom: border, left: border, right: border };

        const tableRows = rows.map((row: TableRowData) => {
            const cells = row.cells.map((cell, cellIndex) => {
                const cellWidth = columnWidths[cellIndex] || defaultColumnWidth;

                // Use cell's shading if specified, otherwise use theme accent for headers
                let shading;
                // Helper to ensure valid hex string
                const ensureHex = (color: string | undefined): string => {
                    if (typeof color === 'string' && /^[0-9A-Fa-f]{6}$/.test(color)) {
                        return color;
                    }
                    return 'auto'; // Fallback if invalid
                };

                if (cell.shading) {
                    shading = { fill: ensureHex(cell.shading), type: ShadingType.CLEAR, color: 'auto' };
                } else if (row.isHeader) {
                    shading = { fill: ensureHex(theme.accentColor), type: ShadingType.CLEAR, color: 'auto' };
                }

                return new TableCell({
                    borders,
                    width: { size: cellWidth, type: WidthType.DXA },
                    margins: { top: 80, bottom: 80, left: 120, right: 120 },
                    shading,
                    children: [
                        new Paragraph({
                            children: [
                                new TextRun({
                                    text: stripMarkdown(cell.text || ''),
                                    bold: cell.bold || row.isHeader || false,
                                    font: theme.fontFamily || 'Arial',
                                    size: FONT_SIZES.table,
                                    color: row.isHeader ? theme.headingColor : (theme.textColor || '333333'),
                                }),
                            ],
                        }),
                    ],
                });
            });

            // Pad with empty cells if this row has fewer cells
            while (cells.length < columnCount) {
                cells.push(
                    new TableCell({
                        borders,
                        width: { size: defaultColumnWidth, type: WidthType.DXA },
                        margins: { top: 80, bottom: 80, left: 120, right: 120 },
                        children: [new Paragraph({ children: [] })],
                    })
                );
            }

            return new TableRow({ children: cells });
        });

        return new Table({
            width: { size: totalWidth, type: WidthType.DXA },
            columnWidths,
            rows: tableRows,
        });
    }

    /**
     * Convert alignment string to docx AlignmentType
     */
    private getAlignment(alignment?: string): typeof AlignmentType[keyof typeof AlignmentType] | undefined {
        if (!alignment) return undefined;
        const map: Record<string, typeof AlignmentType[keyof typeof AlignmentType]> = {
            left: AlignmentType.LEFT,
            center: AlignmentType.CENTER,
            right: AlignmentType.RIGHT,
            justified: AlignmentType.JUSTIFIED,
        };
        return map[alignment.toLowerCase()] || undefined;
    }

    /**
     * Build a professionally styled Table of Contents with full-width layout
     * - Title with bottom accent border for visual separation
     * - Each entry: left-aligned title text → dot leaders → right margin
     * - Clickable InternalHyperlink entries pointing to bookmarked headings
     * - Proper indentation by heading level (H1=0, H2=indented, H3=double indented)
     * - TOC always gets its own page (page break forced at end)
     */
    private buildTableOfContents(
        section: DocumentSection,
        theme: DocumentTheme,
        headingInfos: { id: string; text: string; level: number }[]
    ): Paragraph[] {
        const tocTitle = section.tocTitle || section.content || 'Table of Contents';
        const elements: Paragraph[] = [];
        const linkColor = theme.headingColor || '0563C1';

        // ─── TOC Title with bottom accent border ───
        elements.push(
            new Paragraph({
                pageBreakBefore: section.pageBreakBefore || false,
                spacing: { before: 600, after: 80 },
                border: {
                    bottom: {
                        style: BorderStyle.SINGLE,
                        size: 8,
                        color: theme.accentColor || 'D5E8F0',
                        space: 6,
                    },
                },
                children: [
                    new TextRun({
                        text: tocTitle,
                        font: theme.fontFamily || 'Arial',
                        size: FONT_SIZES.tocTitle,
                        bold: true,
                        color: theme.headingColor || '1A1A2E',
                    }),
                ],
            })
        );

        // Small gap after title border
        elements.push(new Paragraph({ spacing: { after: 200 }, children: [] }));

        // ─── TOC Entries ───
        // Right tab stop position = page width minus margins in DXA
        // US Letter = 12240 DXA, 1" margins = 1440 each side → content width = 9360
        const rightTabPosition = 9360;

        for (const heading of headingInfos) {
            // Skip self-reference
            if (heading.text.toLowerCase().includes('table of contents')) {
                continue;
            }

            // Indentation: 0 for H1, 360 for H2, 720 for H3
            const indentLeft = (heading.level - 1) * 360;
            const adjustedTabPos = rightTabPosition - indentLeft;

            // TOC entry size: same for all levels (body size)
            const fontSize = FONT_SIZES.tocEntry;

            elements.push(
                new Paragraph({
                    spacing: { after: 80, line: 320 },
                    indent: { left: indentLeft },
                    tabStops: [
                        {
                            type: TabStopType.RIGHT,
                            position: adjustedTabPos,
                            leader: 'dot',
                        },
                    ],
                    children: [
                        new InternalHyperlink({
                            anchor: heading.id,
                            children: [
                                // Entry text
                                new TextRun({
                                    text: heading.text,
                                    font: theme.fontFamily || 'Arial',
                                    size: fontSize,
                                    color: linkColor,
                                    bold: heading.level === 1,
                                }),
                                // Tab character → triggers dot leader fill to right margin
                                new TextRun({
                                    text: '\t',
                                    font: theme.fontFamily || 'Arial',
                                    size: fontSize,
                                }),
                            ],
                        }),
                    ],
                })
            );
        }

        return elements;
    }

    /**
     * Build a horizontal rule (visual separator)
     * Uses a paragraph with only a bottom border
     */
    private buildHorizontalRule(): Paragraph {
        return new Paragraph({
            spacing: { before: 200, after: 200 },
            border: {
                bottom: {
                    style: BorderStyle.SINGLE,
                    size: 6,
                    color: 'CCCCCC',
                    space: 1,
                },
            },
            children: [],
        });
    }

    /**
     * Build a blockquote - indented text with a left accent border
     */
    private buildBlockquote(section: DocumentSection, theme: DocumentTheme): Paragraph {
        return new Paragraph({
            spacing: { after: 200, line: 360 },
            indent: { left: 720 },
            border: {
                left: {
                    style: BorderStyle.SINGLE,
                    size: 12,
                    color: theme.accentColor || 'CCCCCC',
                    space: 8,
                },
            },
            children: [
                new TextRun({
                    text: stripMarkdown(section.content || ''),
                    italics: true,
                    font: theme.fontFamily || 'Arial',
                    size: FONT_SIZES.body,
                    color: theme.textColor || '666666',
                }),
            ],
        });
    }

    /**
     * Build a callout box - colored background with border
     */
    private buildCallout(section: DocumentSection, theme: DocumentTheme): Table {
        const bgColor = section.backgroundColor || theme.accentColor || 'F0F8FF';
        const borderColor = section.borderColor || theme.headingColor || '000000';

        return new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
                new TableRow({
                    children: [
                        new TableCell({
                            shading: { fill: bgColor, type: ShadingType.CLEAR, color: 'auto' },
                            borders: {
                                top: { style: BorderStyle.SINGLE, size: 4, color: borderColor },
                                bottom: { style: BorderStyle.SINGLE, size: 4, color: borderColor },
                                left: { style: BorderStyle.SINGLE, size: 4, color: borderColor },
                                right: { style: BorderStyle.SINGLE, size: 4, color: borderColor },
                            },
                            margins: { top: 120, bottom: 120, left: 120, right: 120 },
                            children: [
                                new Paragraph({
                                    children: [
                                        new TextRun({
                                            text: stripMarkdown(section.content || ''),
                                            font: theme.fontFamily || 'Arial',
                                            size: FONT_SIZES.body,
                                            color: theme.textColor,
                                        })
                                    ]
                                })
                            ]
                        })
                    ]
                })
            ]
        });
    }

    /**
     * Build a generic section block - transparent container.
     * NO visible borders by default — only shows borders when AI explicitly requests them.
     * If AI wrongly uses section_block as a wrapper, this renders as invisible.
     */
    private buildSectionBlock(
        section: DocumentSection,
        theme: DocumentTheme,
        headingInfos: { id: string; text: string; level: number }[]
    ): Table {
        const bgColor = section.backgroundColor || 'FFFFFF';
        // Only show borders if AI explicitly set a borderColor
        const hasBorder = !!section.borderColor;
        const borderColor = section.borderColor || 'FFFFFF';
        const borderStyle = hasBorder ? BorderStyle.SINGLE : BorderStyle.NONE;
        const borderSize = hasBorder ? 2 : 0;

        // Render nested content
        let children: (Paragraph | Table)[] = [];
        if (section.sections) {
            children = this.buildSectionChildren(section.sections, theme, headingInfos);
        } else if (section.content) {
            children = [
                new Paragraph({
                    children: [new TextRun({ text: stripMarkdown(section.content), font: theme.fontFamily || 'Arial', size: FONT_SIZES.body, color: theme.textColor || '212121' })]
                })
            ];
        }

        return new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
                new TableRow({
                    children: [
                        new TableCell({
                            shading: { fill: bgColor, type: ShadingType.CLEAR, color: 'auto' },
                            borders: {
                                top: { style: borderStyle, size: borderSize, color: borderColor },
                                bottom: { style: borderStyle, size: borderSize, color: borderColor },
                                left: { style: borderStyle, size: borderSize, color: borderColor },
                                right: { style: borderStyle, size: borderSize, color: borderColor },
                            },
                            margins: hasBorder ? { top: 180, bottom: 180, left: 180, right: 180 } : { top: 0, bottom: 0, left: 0, right: 0 },
                            children: children,
                        })
                    ]
                })
            ]
        });
    }
}


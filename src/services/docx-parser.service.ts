import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import { DocumentSection, DocumentStructure } from '../types/document.types';
import { loggerUtil } from '../utils/logger.util';

type DomElement = any;

export interface OrphanBlock {
    /** The text content of the orphan paragraphs */
    lines: string[];
    /** UUID of the section immediately BEFORE this orphan in the document, or null if at the very top */
    beforeSectionId: string | null;
    /** UUID of the section immediately AFTER this orphan in the document, or null if at the very bottom */
    afterSectionId: string | null;
}

/**
 * Result of parsing a DOCX buffer.
 * Contains extracted section-level and document-level changes.
 */
export interface ParsedDocxResult {
    /** Map of section UUID → partial section data extracted from XML */
    sections: Map<string, Partial<DocumentSection>>;
    /** Ordered list of section UUIDs as they appear in the document (for detecting reorders) */
    sectionOrder: string[];
    /** Any new orphan text found OUTSIDE our bookmarks (user added new content outside any section) */
    orphanContent: string[];
    /** Structured orphan blocks with before/after neighbor section IDs for positional insertion */
    orphanBlocks: OrphanBlock[];
    /** Document-level fields if changed by user */
    documentLevel: {
        margins?: DocumentStructure['margins'];
        pageSize?: DocumentStructure['pageSize'];
        headerLeft?: string;
        headerLeftRuns?: any[];
        headerCenter?: string;
        headerCenterRuns?: any[];
        headerRight?: string;
        headerRightRuns?: any[];
        footerLeft?: string;
        footerLeftRuns?: any[];
        footerCenter?: string;
        footerCenterRuns?: any[];
        footerRight?: string;
        footerRightRuns?: any[];
    };
}

/**
 * Helper to determine if an XML attribute string represents a truthy formatting value.
 */
const isTruthyAttr = (val: string | null | undefined): boolean => {
    if (val === null || val === undefined) return false;
    return val !== '0' && val !== 'false' && val !== 'off' && val !== 'none';
};

/**
 * Extract text runs from a <w:p> Element, preserving inline formatting.
 */
const extractRunsFromElement = (p: DomElement): { text: string; bold?: boolean; italic?: boolean; underline?: boolean; color?: string; font?: string; fontSize?: number }[] => {
    const runs: { text: string; bold?: boolean; italic?: boolean; underline?: boolean; color?: string; font?: string; fontSize?: number }[] = [];
    const rNodes = p.getElementsByTagName('w:r');

    for (let i = 0; i < rNodes.length; i++) {
        const r = rNodes.item(i) as DomElement;
        if (!r) continue;

        const tNodes = r.getElementsByTagName('w:t');
        let text = '';
        for (let j = 0; j < tNodes.length; j++) {
            text += tNodes.item(j)?.textContent ?? '';
        }
        if (!text) continue;

        const rPr = r.getElementsByTagName('w:rPr')[0] as DomElement | undefined;
        let bold: boolean | undefined = undefined;
        let italic: boolean | undefined = undefined;
        let underline: boolean | undefined = undefined;
        let color: string | undefined = undefined;
        let font: string | undefined = undefined;
        let fontSize: number | undefined = undefined;

        if (rPr) {
            const b = rPr.getElementsByTagName('w:b')[0] as DomElement | undefined;
            if (b) bold = isTruthyAttr(b.getAttribute('w:val') ?? '1');

            const it = rPr.getElementsByTagName('w:i')[0] as DomElement | undefined;
            if (it) italic = isTruthyAttr(it.getAttribute('w:val') ?? '1');

            const u = rPr.getElementsByTagName('w:u')[0] as DomElement | undefined;
            if (u) underline = isTruthyAttr(u.getAttribute('w:val') ?? 'single');

            const c = rPr.getElementsByTagName('w:color')[0] as DomElement | undefined;
            if (c) color = c.getAttribute('w:val') || undefined;

            const f = rPr.getElementsByTagName('w:rFonts')[0] as DomElement | undefined;
            if (f) font = f.getAttribute('w:ascii') || f.getAttribute('w:hAnsi') || undefined;

            const sz = rPr.getElementsByTagName('w:sz')[0] as DomElement | undefined;
            if (sz) {
                const parsed = parseInt(sz.getAttribute('w:val') || '0', 10);
                if (parsed > 0) fontSize = parsed;
            }
        }

        runs.push({
            text,
            bold: bold || undefined,
            italic: italic || undefined,
            underline: underline || undefined,
            color,
            font,
            fontSize,
        });
    }

    return runs;
};

/**
 * Check if a paragraph has pageBreakBefore or a page break run.
 */
const hasPageBreak = (p: DomElement): boolean => {
    const pPr = p.getElementsByTagName('w:pPr')[0] as DomElement | undefined;
    if (pPr) {
        const pb = pPr.getElementsByTagName('w:pageBreakBefore')[0] as DomElement | undefined;
        if (pb && isTruthyAttr(pb.getAttribute('w:val') ?? '1')) return true;
    }
    const brs = p.getElementsByTagName('w:br');
    for (let i = 0; i < brs.length; i++) {
        const br = brs.item(i) as DomElement;
        if (br && br.getAttribute('w:type') === 'page') return true;
    }
    return false;
};

interface DocumentBlock {
    type: 'p' | 'tbl';
    node: DomElement;
    secId: string | null;
}

/**
 * Recursively unwrap blocks from a container element (such as w:body or w:sdtContent),
 * preserving exact top-to-bottom document order and propagating sec_ tags from <w:sdtPr>.
 */
const getBodyBlocks = (node: DomElement, inheritedSecId: string | null = null): DocumentBlock[] => {
    const blocks: DocumentBlock[] = [];
    if (!node || !node.childNodes) return blocks;

    for (let i = 0; i < node.childNodes.length; i++) {
        const child = node.childNodes.item(i) as DomElement;
        if (!child || child.nodeType !== 1) continue;

        const name = child.nodeName;

        if (name === 'w:sdt') {
            let sdtSecId: string | null = null;
            const tags = child.getElementsByTagName('w:tag');
            for (let t = 0; t < tags.length; t++) {
                const val = tags.item(t)?.getAttribute('w:val');
                if (val && val.startsWith('sec_')) {
                    sdtSecId = val.replace('sec_', '');
                    break;
                }
            }
            if (!sdtSecId) {
                const aliases = child.getElementsByTagName('w:alias');
                for (let a = 0; a < aliases.length; a++) {
                    const val = aliases.item(a)?.getAttribute('w:val');
                    if (val && val.startsWith('sec_')) {
                        sdtSecId = val.replace('sec_', '');
                        break;
                    }
                }
            }

            const contentNode = child.getElementsByTagName('w:sdtContent')[0] as DomElement | undefined;
            if (contentNode) {
                blocks.push(...getBodyBlocks(contentNode, sdtSecId || inheritedSecId));
            }
        } else if (name === 'w:p') {
            let pSecId = inheritedSecId;
            const bms = child.getElementsByTagName('w:bookmarkStart');
            for (let b = 0; b < bms.length; b++) {
                const bmName = bms.item(b)?.getAttribute('w:name');
                if (bmName && bmName.startsWith('sec_')) {
                    pSecId = bmName.replace('sec_', '');
                    break;
                }
            }
            blocks.push({ type: 'p', node: child, secId: pSecId });
        } else if (name === 'w:tbl') {
            let tblSecId = inheritedSecId;
            const bms = child.getElementsByTagName('w:bookmarkStart');
            for (let b = 0; b < bms.length; b++) {
                const bmName = bms.item(b)?.getAttribute('w:name');
                if (bmName && bmName.startsWith('sec_')) {
                    tblSecId = bmName.replace('sec_', '');
                    break;
                }
            }
            blocks.push({ type: 'tbl', node: child, secId: tblSecId });
        }
    }

    return blocks;
};

/**
 * Extract text and runs from header/footer XML files.
 */
const extractHeaderFooterBlocks = async (zip: JSZip, path: string): Promise<{ text: string; runs?: any[] }[]> => {
    try {
        const xmlStr = await zip.file(path)?.async('string');
        if (!xmlStr) return [];

        const dom = new DOMParser().parseFromString(xmlStr, 'text/xml');
        const root = dom.documentElement;
        if (!root) return [];

        let targetContainers: DomElement[] = [];

        // Check for table layout
        const tbl = root.getElementsByTagName('w:tbl')[0] as DomElement | undefined;
        if (tbl) {
            const tr = tbl.getElementsByTagName('w:tr')[0] as DomElement | undefined;
            if (tr) {
                const tcs = tr.getElementsByTagName('w:tc');
                for (let i = 0; i < tcs.length; i++) {
                    const tc = tcs.item(i) as DomElement;
                    if (tc) targetContainers.push(tc);
                }
            }
        } else {
            const ps = root.getElementsByTagName('w:p');
            for (let i = 0; i < ps.length; i++) {
                const p = ps.item(i) as DomElement;
                if (p) targetContainers.push(p);
            }
        }

        return targetContainers.map(container => {
            const pElements = container.nodeName === 'w:p' ? [container] : Array.from(container.getElementsByTagName('w:p'));
            const allRuns = pElements.flatMap((p: any) => extractRunsFromElement(p));
            const text = allRuns.map(r => r.text).join('\n');
            const hasFormatting = allRuns.some(r => r.bold || r.italic || r.underline || r.color || r.font !== undefined || r.fontSize !== undefined);
            const runs = (allRuns.length > 1 || hasFormatting) ? allRuns : undefined;
            return { text, runs };
        });
    } catch {
        return [];
    }
};

/**
 * Main entry point: parse a DOCX buffer and extract all user-editable content
 * in exact sequential document order using a single W3C DOM traversal.
 */
export const extractSectionsFromDocx = async (buffer: Buffer): Promise<ParsedDocxResult> => {
    const result: ParsedDocxResult = {
        sections: new Map(),
        sectionOrder: [],
        orphanContent: [],
        orphanBlocks: [],
        documentLevel: {},
    };

    // ── Step 1: Unzip ──────────────────────────────────────────────────────────
    const zip = await JSZip.loadAsync(buffer);

    // ── Step 2: Parse document.xml with DOMParser ──────────────────────────────
    const docXml = await zip.file('word/document.xml')?.async('string');
    if (!docXml) throw new Error('Invalid DOCX: word/document.xml not found');

    const dom = new DOMParser().parseFromString(docXml, 'text/xml');
    const body = dom.getElementsByTagName('w:body')[0] as DomElement | undefined;
    if (!body) throw new Error('Invalid DOCX: w:body not found in document.xml');

    // ── Step 3: Extract page margins and page size from w:sectPr ───────────────
    const sectPr = body.getElementsByTagName('w:sectPr')[0] as DomElement | undefined;
    if (sectPr) {
        const pgMar = sectPr.getElementsByTagName('w:pgMar')[0] as DomElement | undefined;
        if (pgMar) {
            result.documentLevel.margins = {
                top: parseInt(pgMar.getAttribute('w:top') ?? '1440', 10),
                bottom: parseInt(pgMar.getAttribute('w:bottom') ?? '1440', 10),
                left: parseInt(pgMar.getAttribute('w:left') ?? '1440', 10),
                right: parseInt(pgMar.getAttribute('w:right') ?? '1440', 10),
            };
        }
        const pgSz = sectPr.getElementsByTagName('w:pgSz')[0] as DomElement | undefined;
        if (pgSz) {
            result.documentLevel.pageSize = {
                width: parseInt(pgSz.getAttribute('w:w') ?? '12240', 10),
                height: parseInt(pgSz.getAttribute('w:h') ?? '15840', 10),
            };
        }
    }

    // ── Step 4: Extract blocks in exact top-to-bottom document order ───────────
    const blocks = getBodyBlocks(body);

    let currentId: string | null = null;
    const currentParas: DomElement[] = [];
    let currentRows: string[][] = [];
    let currentHasPageBreak = false;

    // Orphan tracking
    let orphanParas: string[] = [];
    let orphanBeforeId: string | null = null;

    const flushOrphan = (afterId: string | null) => {
        const nonEmpty = orphanParas.filter(t => t.trim());
        if (nonEmpty.length > 0) {
            loggerUtil.info('[PARSER] Flushing orphan block', {
                lineCount: nonEmpty.length,
                beforeSectionId: orphanBeforeId,
                afterSectionId: afterId,
                preview: nonEmpty.map(t => t.substring(0, 80)),
            });
            result.orphanBlocks.push({
                lines: orphanParas,
                beforeSectionId: orphanBeforeId,
                afterSectionId: afterId,
            });
            result.orphanContent.push(...nonEmpty);
        }
        orphanParas = [];
    };

    const flushSection = () => {
        if (!currentId) return;

        const existing = result.sections.get(currentId) ?? {};
        const update: Partial<DocumentSection> = { ...existing };

        if (currentHasPageBreak) {
            update.pageBreakBefore = true;
        }

        if (currentParas.length > 0) {
            const runs = currentParas.flatMap(p => extractRunsFromElement(p));
            update.content = currentParas.map(p => {
                const r = extractRunsFromElement(p);
                return r.map(x => x.text).join('');
            }).join('\n');

            const hasFormatting = runs.some(r => r.bold || r.italic || r.underline || r.color || r.font !== undefined || r.fontSize !== undefined);
            update.textRuns = (runs.length > 1 || hasFormatting) ? runs : undefined;
            update.parasRuns = currentParas.map(p => extractRunsFromElement(p));
        }

        if (currentRows.length > 0) {
            update.rows = currentRows.map(row => ({
                isHeader: false,
                cells: row.map(cellText => ({ text: cellText }))
            }));
            if (!update.content) {
                update.content = currentRows.flatMap(r => r).join('\n');
            }
        }

        loggerUtil.info('[PARSER] Flushing section', {
            sectionId: currentId,
            paraCount: currentParas.length,
            rowCount: currentRows.length,
            contentPreview: (update.content || '').substring(0, 120),
            hasTextRuns: !!update.textRuns,
            hasPageBreak: currentHasPageBreak,
        });

        result.sections.set(currentId, update);
    };

    for (const block of blocks) {
        if (block.secId && block.secId !== currentId) {
            loggerUtil.info('[PARSER] Bookmark section switch', {
                fromSectionId: currentId,
                toSectionId: block.secId,
                nodeType: block.type,
            });

            flushOrphan(block.secId);
            orphanBeforeId = block.secId;

            flushSection();
            currentParas.length = 0;
            currentRows = [];
            currentId = block.secId;
            currentHasPageBreak = false;
            if (!result.sectionOrder.includes(block.secId)) {
                result.sectionOrder.push(block.secId);
            }
        }

        if (block.type === 'p') {
            const p = block.node;
            if (hasPageBreak(p)) {
                currentHasPageBreak = true;
            }

            const runs = extractRunsFromElement(p);

            if (!block.secId) {
                // This paragraph is completely outside any section tag -> genuine new content added by user
                if (currentId) {
                    flushSection();
                    currentParas.length = 0;
                    currentRows = [];
                    currentId = null;
                    currentHasPageBreak = false;
                }
                if (runs.length > 0) {
                    orphanParas.push(runs.map(r => r.text).join(''));
                }
                continue;
            }

            if (currentId) {
                if (runs.length > 0) {
                    currentParas.push(p);
                }
            } else {
                if (runs.length > 0) {
                    orphanParas.push(runs.map(r => r.text).join(''));
                }
            }
        } else if (block.type === 'tbl') {
            const tbl = block.node;
            if (currentId) {
                const trNodes = tbl.getElementsByTagName('w:tr');
                for (let r = 0; r < trNodes.length; r++) {
                    const tr = trNodes.item(r) as Element;
                    if (!tr) continue;

                    const rowText: string[] = [];
                    const tcNodes = tr.getElementsByTagName('w:tc');

                    for (let c = 0; c < tcNodes.length; c++) {
                        const tc = tcNodes.item(c) as Element;
                        if (!tc) continue;

                        const cellParas = tc.getElementsByTagName('w:p');
                        const cellLines: string[] = [];
                        for (let pIdx = 0; pIdx < cellParas.length; pIdx++) {
                            const cp = cellParas.item(pIdx) as Element;
                            if (!cp) continue;
                            const runs = extractRunsFromElement(cp);
                            const text = runs.map(x => x.text).join('');
                            if (text) cellLines.push(text);
                        }
                        rowText.push(cellLines.join('\n'));
                    }
                    currentRows.push(rowText);
                }
            }
        }
    }

    // Flush any trailing orphan paragraphs after the last section
    flushOrphan(null);
    flushSection(); // Flush last section

    // ── Diagnostic Summary ────────────────────────────────────────────────────
    loggerUtil.info('[PARSER] === PARSE COMPLETE SUMMARY ===', {
        totalSectionsFound: result.sections.size,
        sectionIds: [...result.sections.keys()],
        sectionOrder: result.sectionOrder,
        orphanBlockCount: result.orphanBlocks.length,
        orphanContentLines: result.orphanContent.length,
        sectionDetails: [...result.sections.entries()].map(([id, s]) => ({
            id,
            contentPreview: ((s as any).content || '').substring(0, 100),
            hasRows: !!((s as any).rows),
            hasTextRuns: !!((s as any).textRuns),
        })),
    });

    // ── Step 5: Extract header/footer text ─────────────────────────────────────
    const headerBlocks = await extractHeaderFooterBlocks(zip, 'word/header1.xml');
    if (headerBlocks.length > 0) {
        result.documentLevel.headerLeft = headerBlocks[0]?.text?.trim();
        result.documentLevel.headerLeftRuns = headerBlocks[0]?.runs;
        if (headerBlocks.length === 2) {
            result.documentLevel.headerCenter = undefined;
            result.documentLevel.headerCenterRuns = undefined;
            result.documentLevel.headerRight = headerBlocks[1]?.text?.trim();
            result.documentLevel.headerRightRuns = headerBlocks[1]?.runs;
        } else if (headerBlocks.length >= 3) {
            result.documentLevel.headerCenter = headerBlocks[1]?.text?.trim();
            result.documentLevel.headerCenterRuns = headerBlocks[1]?.runs;
            result.documentLevel.headerRight = headerBlocks[2]?.text?.trim();
            result.documentLevel.headerRightRuns = headerBlocks[2]?.runs;
        }
    }

    const footerBlocks = await extractHeaderFooterBlocks(zip, 'word/footer1.xml');
    if (footerBlocks.length > 0) {
        result.documentLevel.footerLeft = footerBlocks[0]?.text?.trim();
        result.documentLevel.footerLeftRuns = footerBlocks[0]?.runs;
        if (footerBlocks.length === 2) {
            result.documentLevel.footerCenter = undefined;
            result.documentLevel.footerCenterRuns = undefined;
            result.documentLevel.footerRight = footerBlocks[1]?.text?.trim();
            result.documentLevel.footerRightRuns = footerBlocks[1]?.runs;
        } else if (footerBlocks.length >= 3) {
            result.documentLevel.footerCenter = footerBlocks[1]?.text?.trim();
            result.documentLevel.footerCenterRuns = footerBlocks[1]?.runs;
            result.documentLevel.footerRight = footerBlocks[2]?.text?.trim();
            result.documentLevel.footerRightRuns = footerBlocks[2]?.runs;
        }
    }

    loggerUtil.info('DOCX parsed successfully', {
        sectionsFound: result.sections.size,
        sectionOrder: result.sectionOrder.length,
        orphanContent: result.orphanContent.length,
        hasMargins: !!result.documentLevel.margins,
    });

    return result;
};

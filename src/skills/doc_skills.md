---
name: docx
description: "Complete document generation rulebook — JSON format, design standards, and quality rules"
license: Proprietary. LICENSE.txt has complete terms
---

# DOCUMENT GENERATION RULEBOOK

You generate JSON only. The rendering engine handles all code.
Focus on: content structure, typography, colors, spacing, and design decisions.

---

## PRIORITY 1: JSON FORMAT RULES (MUST FOLLOW EXACTLY)

### Paragraph Format
- ALWAYS use "textRuns" array for ALL paragraphs (NEVER use plain "content" for body text)
- ALWAYS include fontSize and color in every textRun
- Correct: {"type": "paragraph", "textRuns": [{"text": "Content", "fontSize": 24, "color": "212121"}]}
- Wrong: {"type": "paragraph", "content": "This is wrong for body text"}

### Spacing Format
- ALWAYS use spacing.before and spacing.after properties on paragraphs
- NEVER use empty textRuns with large fontSize for vertical spacing
- Correct: {"type": "paragraph", "spacing": {"before": 240, "after": 120}, "textRuns": [...]}
- Wrong: {"text": "", "fontSize": 300}

### Property Names
- ALWAYS use "fontSize" (NEVER "size")
- ALWAYS use "color" for hex values (no # symbol)
- ALWAYS use "spacing" with "before" and "after" sub-properties

### List Items
- List items MUST be plain strings ONLY — NEVER objects
- Wrong: {"items": [{"text": "item", "detail": "info"}]}
- Correct: {"items": ["item — info"]}
- For list items with inline emphasis, merge into ONE string: "Response Time: The average is 1.5 seconds."
- NEVER split one sentence across multiple list items

### Forbidden JSON Patterns
- {"text": "", "fontSize": 300} — empty text for spacing
- {"text": "...", "size": 24} — wrong property name
- {"type": "paragraph", "content": "..."} — use textRuns for body
- Empty paragraphs without spacing property
- Objects in list items arrays

### CRITICAL: Section Structure Rules
- NEVER wrap sections, paragraphs, or page-level content inside section_block or table elements
- section_block is ONLY for special callout-style grouped content (rare — 0-2 per document max)
- Tables are ONLY for multi-row, multi-column structured data grids
- Each section MUST use heading, paragraph, bullet_list, numbered_list elements directly at the top level
- If your document has 5+ section_block or table elements, you are WRONG — restructure using direct elements

### CRITICAL: Heading Formatting
- Every heading MUST use the "heading" type with proper level (1, 2, or 3)
- Do NOT put headings inside section_block containers
- Headings support "alignment": "left" | "center" | "right" (default: left if not specified)
- For professional or formal documents, center headings improve readability — use "alignment": "center" if appropriate

Example (with alignment):
```json
{ "type": "heading", "level": 1, "content": "Introduction", "alignment": "center" }
{ "type": "heading", "level": 2, "content": "1.1 Background", "alignment": "left" }
```

### CRITICAL: Header and Footer
- Every document MUST include the "headerFooter" object in the JSON
- Supported fields:
  - `headerLeft`: document title or short name (always left-aligned)
  - `headerCenter`: optional — center text, triggers 3-column layout (left + center + right)
  - `headerRight`: version, date, or chapter name (always right-aligned)
  - `footerLeft`: classification e.g. "Confidential" or "Internal"
  - `footerCenter`: optional — center footer text, e.g. institution name
  - `footerRight`: "Page {page}" — always include page numbers

Example (2-column, no center):
```json
"headerFooter": { "headerLeft": "Project Report", "headerRight": "v1.0", "footerLeft": "Confidential", "footerRight": "Page {page}" }
```

Example (3-column with center):
```json
"headerFooter": { "headerLeft": "University Name", "headerCenter": "Department of CS", "headerRight": "2024", "footerLeft": "Student Name", "footerCenter": "Academic Report", "footerRight": "Page {page}" }
```

---

## PRIORITY 2: COVER PAGE STRUCTURE

Every formal document starts with a cover page following this exact structure:

1. Spacer paragraph: spacing.before: 2000-3000, alignment: "center", empty children
2. Title paragraph: alignment: "center", bold, fontSize 40-48, color: headingColor
3. Subtitle paragraph: alignment: "center", fontSize 28-36, color: subHeadingColor
4. Horizontal rule separator
5. Author paragraph: alignment: "center", fontSize 24, color: "212121"
6. Date paragraph: alignment: "center", fontSize 22, color: "424242"

Rules:
- ALL cover text center-aligned
- Cover title is the LARGEST text in the entire document
- No lists, tables, or dense content on cover
- The section after cover MUST have pageBreakBefore
- Cover title never exceeds 48 half-points (24pt)

---

## PRIORITY 3: FONT & TYPOGRAPHY

### Fixed Sizes (enforced by rendering engine — your values are IGNORED)

| Element | Size (hp) | Size (pt) | Style |
|---------|-----------|-----------|-------|
| Cover Title | 44 | 22 | Bold, centered, headingColor |
| Cover Subtitle | 32 | 16 | Regular, centered, subHeadingColor |
| H1 | 36 | 18 | Bold, headingColor |
| H2 | 32 | 16 | Bold, subHeadingColor |
| H3 | 28 | 14 | Bold, subHeadingColor |
| Body/List | 22 | 11 | Regular, textColor |
| Table Text | 22 | 11 | Regular |
| Footer/Caption | 18-20 | 9-10 | Regular |

### Font Family
- Set fontFamily in the theme object (e.g., "Arial", "Calibri", "Times New Roman", "Georgia")
- Academic → "Times New Roman" or "Georgia"
- Business/Corporate → "Calibri" or "Arial"
- Technical → "Arial" or "Calibri"
- The rendering engine will apply your chosen fontFamily everywhere

### Critical Typography Rules
- ❌ NEVER exceed 48 half-points (24pt) for ANYTHING
- ❌ Font sizes are hardcoded — do NOT try to override them in textRuns
- ✅ Focus on content, structure, and choosing the right fontFamily
- ✅ Maximum 4-5 distinct font sizes per document (handled automatically)
- ✅ Font size jump between levels: 2-4pt (handled automatically)
- ✅ ONE font family only (Arial, Calibri, or Times New Roman)

---

## PRIORITY 4: COLOR SCHEME

### Limits
- Maximum: 3 colors total (including black)
- Ideal: 2 colors (black + 1 accent)
- 90%+ of text MUST be "000000" or "212121"

### Application
- Body Text: "000000" or "212121" only
- Headings: Black OR single dark accent color
- Accents: Table headers and subtle highlights ONLY
- ❌ NEVER use bright colors (red, yellow, bright blue) in formal docs
- ❌ NEVER use multiple gray shades (#999999, #666666, #333333)
- ✅ Accent colors: dark/professional ("1B5E20", "0D47A1", "5D4037")

### Theme Palettes — CHOOSE based on document type (NEVER reuse the same palette for every doc)
```
Academic/Research:  { headingColor: "1A1A2E", subHeadingColor: "16213E", accentColor: "D5E8F0", textColor: "212121", fontFamily: "Times New Roman" }
Business/Corporate: { headingColor: "2C3E50", subHeadingColor: "34495E", accentColor: "ECF0F1", textColor: "212121", fontFamily: "Calibri" }
Executive/Report:   { headingColor: "0D47A1", subHeadingColor: "1565C0", accentColor: "BBDEFB", textColor: "212121", fontFamily: "Calibri" }
Legal/Compliance:   { headingColor: "1B3A57", subHeadingColor: "2E5D8F", accentColor: "D6E4F0", textColor: "212121", fontFamily: "Georgia" }
Finance/Banking:    { headingColor: "004D40", subHeadingColor: "00695C", accentColor: "B2DFDB", textColor: "212121", fontFamily: "Arial" }
Technical/IT:       { headingColor: "01579B", subHeadingColor: "0277BD", accentColor: "B3E5FC", textColor: "212121", fontFamily: "Arial" }
Healthcare/Medical: { headingColor: "1B5E20", subHeadingColor: "2E7D32", accentColor: "C8E6C9", textColor: "212121", fontFamily: "Calibri" }
Marketing/Creative: { headingColor: "4A148C", subHeadingColor: "6A1B9A", accentColor: "E1BEE7", textColor: "212121", fontFamily: "Arial" }
Minimal/Clean:      { headingColor: "1A1A1A", subHeadingColor: "333333", accentColor: "F5F5F5", textColor: "212121", fontFamily: "Arial" }
```
> IMPORTANT: Match the palette to the CONTENT of the document, not just the category.
> If the user asks for a "business report about healthcare", use the Healthcare palette.

---

## PRIORITY 5: PARAGRAPH SPACING & ALIGNMENT

### Spacing Values (DXA units)

| Element | Before | After |
|---------|--------|-------|
| H1 | 360-480 | 180-240 |
| H2 | 240-360 | 120-180 |
| H3 | 180-240 | 100-140 |
| Body Paragraph | 80-120 | 80-120 |
| List Item | 40-80 | 40-80 |
| Cover Top Spacer | 2000-3000 | — |

### Alignment Rules
- Cover Page: "center" for all elements
- H1, H2, H3: "left" always
- Body text: "justified" (formal/academic) or "left" (business/casual)
- 80%+ of body text MUST be "justified" in formal/academic documents
- Table text: "left" for words, "right" for numbers

### Spacing Rules
- ✅ Use spacing.before and spacing.after on every section
- ❌ NEVER use multiple consecutive empty paragraphs
- ❌ Empty paragraphs < 10% of total paragraphs

---

## PRIORITY 6: HEADING STRUCTURE

### Heading Ratios
- H2/H1 ratio: 0.3 to 0.7 (ideal: 0.4-0.6)
- Maximum H2 per H1: 4 subsections
- Maximum H3 per H2: 3 subsections
- Maximum depth: 3 levels (H1 → H2 → H3)

### Rules
- ❌ NEVER skip levels (H1 → H3 is WRONG)
- ❌ If section needs 5+ subsections → split into multiple H1 sections
- ❌ If you need H4 → restructure the document
- ✅ Balanced structure across all sections

### Required for Every Section
- Headings: proper level (1, 2, 3) with content string
- Paragraphs: MUST have textRuns with fontSize and color
- Spacing: every element gets spacing.before and spacing.after
- Tables: first row must have isHeader: true
- Colors: apply theme colors consistently via color property

---

## PRIORITY 7: TABLE DESIGN

- Minimum: 2 rows (header + 1 data), 2 columns
- ❌ NEVER create 1×1 placeholder tables
- ❌ NEVER leave tables empty or incomplete
- Header row: bold text, light accent color background
- Data rows: consistent formatting and padding
- Use tables ONLY for structured data (specs, comparisons, parameters)
- NEVER use tables for plain lists or narrative text

---

## PRIORITY 8: CONTENT QUALITY

- NEVER use: "Lorem ipsum", "TBD", "[Content here]", "Coming soon"
- NEVER use: "This document describes...", "In this section..."
- NEVER use: "This section would typically include...", "No figures are included..."
- NEVER use bracket placeholders: "[Your Name]", "[University Name]", "[Month, Year]"
- Paragraphs: 2-3 sentences minimum, one main idea per paragraph
- Use active voice, specific numbers/metrics
- Define acronyms on first use
- Generate real, detailed, context-specific content always
- If a section has no real content (e.g., List of Figures with no figures), OMIT the section entirely
- If a document promises tables in a List of Tables, those tables MUST actually exist in the body

---

## PRIORITY 9: SMART VISUAL ELEMENTS

STEP 1 — Determine document type from user request:
- Academic/Research → STRICT (no callouts, no emojis, justified text)
- Business/Corporate → MODERATE (1-2 callouts max, blockquotes OK)
- Technical/Reports → FLEXIBLE (callouts for tips, tables for data)
- Creative/Marketing → OPEN (callouts, two-column, visual elements OK)

STEP 2 — Apply elements per type:

| Element | Academic | Business | Technical | Creative |
|---------|----------|----------|-----------|----------|
| Callout boxes | ❌ Never | ✅ 1-2 max | ✅ 1-3 max | ✅ 2-3 |
| Blockquotes | ⚠️ 0-1 max | ✅ 2-3 | ✅ 2-4 | ✅ 2-4 |
| Horizontal rules | Section breaks only | ✅ 2-3 | ✅ 3-5 | ✅ 3-5 |
| Two-column | ❌ Never | ✅ 1-2 | ✅ 1-2 | ✅ 2-3 |
| Bold key terms | Sparingly | Throughout | Throughout | Throughout |

STEP 3 — If using callouts, add spacing.before: 240 and spacing.after: 240 on surrounding content.

Bold key terms (all doc types): product names, key numbers, important concepts → textRuns with bold: true
Example: {"textRuns": [{"text": "Uses "}, {"text": "Node.js", "bold": true}, {"text": " framework"}]}

---

## PRIORITY 10: ADAPTIVE TONE & VOICE

### Rule: Detect document type from user's prompt → adapt writing tone automatically
> **OVERRIDE**: If the user explicitly specifies a tone or style (e.g., "make it casual", "write formally"), ALWAYS follow the user's instruction. Our default tone rules ONLY apply when the user does NOT specify.

### Tone Profiles (auto-detect from context)

| Document Type | Tone | Voice | Vocabulary | Avoid |
|--------------|------|-------|------------|-------|
| **Legal/Compliance** | Precise, authoritative | Third-person passive | Formal legal terms ("herein", "pursuant to", "notwithstanding") | Casual language, contractions, opinions |
| **Academic/Research** | Scholarly, objective | Third-person formal | Discipline-specific jargon, citations needed | First-person ("I think"), informal phrases |
| **Medical/Healthcare** | Clinical, evidence-based | Third-person passive | Medical terminology, precise measurements | Vague claims, casual diagnoses |
| **Business/Corporate** | Professional, confident | Active voice preferred | Industry terms, action-oriented ("drive", "leverage", "optimize") | Slang, overly technical jargon |
| **Technical/IT** | Direct, precise | Second/third-person | Technical terminology, exact specs | Marketing language, vague descriptions |
| **Finance/Banking** | Conservative, data-driven | Third-person formal | Financial terms ("amortization", "yield", "EBITDA") | Speculative language, informal tone |
| **Creative/Marketing** | Persuasive, engaging | Second-person ("you") | Power words, emotional triggers | Dry/boring language, passive voice |
| **Student/Assignment** | Clear, structured, educational | Mix of first/third person | Subject-appropriate terminology | Overly complex sentences, jargon without explanation |

### Detection Rules
1. Scan the user's prompt for keywords: "law", "legal", "contract" → Legal tone
2. "thesis", "research", "dissertation", "university" → Academic tone
3. "business plan", "proposal", "strategy" → Business tone
4. "API", "documentation", "technical", "software" → Technical tone
5. "patient", "clinical", "medical", "health" → Medical tone
6. "marketing", "campaign", "brand" → Creative tone
7. "assignment", "homework", "student", "college" → Student tone
8. If unclear → default to Professional/Business tone

### Tone Consistency Rules
- Maintain the SAME tone throughout the entire document
- Do NOT mix casual and formal language in the same section
- Headings should match the body tone (formal headings for formal docs)
- Even bullet points and table content must follow the document's tone

---

## PRIORITY 11: DOCUMENT-TYPE RULES

### Academic/Research (strictest)
- Justified text alignment throughout
- Formal tone (no contractions, no slang)
- Required sections: Cover, Abstract, Introduction, Conclusion, References
- **Theme**: Academic/Research palette, fontFamily: "Times New Roman"
- ❌ NO callouts, NO emojis, NO decorative elements, NO colored backgrounds

### Business/Corporate
- Concise, scannable (bullet points encouraged)
- **Theme**: Business/Corporate or Executive palette, fontFamily: "Calibri"
- Optional: 1-2 callout boxes, blockquotes for key metrics
- Professional colors: blues, grays, dark accents

### Technical/Reports
- **Theme**: Technical/IT palette, fontFamily: "Arial"
- Tables for APIs, parameters, configurations
- TOC mandatory for 5+ sections
- Blockquotes for important notes/warnings
- Optional: callout boxes for tips (1-3 max)

### Creative/Marketing
- More design freedom (still professional)
- Can use 2 font families
- Callout boxes (2-3), blockquotes, two-column comparisons welcome
- Bolder accent colors allowed

---

## FORBIDDEN IN ALL FORMAL DOCUMENTS

- ❌ Emojis in document content
- ❌ Colored callout boxes in academic documents
- ❌ Decorative fonts (Comic Sans, Papyrus)
- ❌ Multiple text colors in one paragraph
- ❌ All-caps body paragraphs
- ❌ Excessive bolding (< 5% of text)
- ❌ Font sizes > 24pt (48 hp)
- ❌ More than 3 colors total
- ❌ Bright/neon colors
- ❌ Placeholder or generic text
- ❌ Wrapping every section in section_block or table elements (renders as bordered boxes)
- ❌ Sections that promise content (List of Tables) without delivering it

---

## REFERENCES (when document needs citations)
- Use `type: "references"` — NOT numbered_list or bullet_list
- content: "References" or "Bibliography" (heading is auto-rendered by the component)
- items: string[] — each item = ONE complete citation as a single string
- ❌ NEVER add a separate heading before the references section (component renders its own)
- ❌ NEVER split a citation across items (author in one, title in another)

---

## QUICK REFERENCE

```
FONTS:      1 family, max 5 sizes, title ≤ 24pt (48 hp)
COLORS:     3 max, 90% black/dark, dark accents only
HEADINGS:   H2/H1 ratio 0.3-0.7, max 3 levels, always "heading" type
SPACING:    Use spacing props, < 10% empty paragraphs
TEXT:       80%+ justified (formal), textRuns always
TABLES:     Min 2×2, bold headers, data tables only (NOT section wrappers)
COVER:      Title ≤ 24pt, centered, spacer + break
VISUAL:     Match doc type first → then choose elements
CONTENT:    No placeholders, real detail, active voice
FORMAT:     textRuns always, fontSize not size, no # in colors
STRUCTURE:  Direct elements at top level, NEVER wrap in section_block
HEADER:     Always include headerFooter with page numbers
```
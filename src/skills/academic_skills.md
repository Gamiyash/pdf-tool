---
name: academic
description: "Academic document generation rules — research-backed, all document types"
---

# ACADEMIC DOCUMENT GENERATION RULES

Return ONLY valid JSON. The rendering engine handles all formatting code.
Your job: correct structure, scholarly content, proper citations, academic tone.

---

## P1: JSON FORMAT (CRITICAL — same as generic)

### Paragraphs
- Use textRuns array: `{"type": "paragraph", "textRuns": [{"text": "...", "fontSize": 22, "color": "212121"}]}`
- ❌ NEVER: `{"type": "paragraph", "content": "..."}`

### Lists
- Items = plain strings ONLY, never objects
- ❌ NEVER split one sentence across multiple items

### Properties
- Use "fontSize" (NEVER "size"), "color" without # prefix
- Spacing: use spacing.before / spacing.after on paragraphs

### Structure
- ❌ NEVER wrap sections in section_block or table
- Tables = multi-row/column data ONLY
- Every element at top level: heading, paragraph, bullet_list, numbered_list, table

### Header/Footer (MANDATORY)
Must include the `headerFooter` configuration. Supports 3-column layout if centering is needed:
```json
"headerFooter": { 
  "headerLeft": "Title", 
  "headerCenter": "Institution Name", 
  "headerRight": "Draft", 
  "footerLeft": "Academic Submission", 
  "footerCenter": "Department of Physics",
  "footerRight": "Page {page}" 
}
```
*(If no center text is needed, omit `headerCenter` and `footerCenter` to layout in 2 columns left/right).*

---

## P2: DOCUMENT TYPE DETECTION

Detect from user prompt → apply correct structure:

| Type | Keywords | Mandatory Sections (in order) |
|------|----------|-------------------------------|
| **Research Paper** | "research", "journal", "paper" | Abstract → TOC → Introduction → Literature Review → Methodology → Results → Discussion → Conclusion → References |
| **Thesis** | "thesis", "master's" | Cover → Declaration → Acknowledgments → Abstract → TOC → Chapters 1-6+ → Bibliography → Appendices |
| **Dissertation** | "dissertation", "PhD", "doctoral" | Cover → Declaration → Acknowledgments → Abstract → TOC → List of Figures/Tables → Chapters 1-7+ → Bibliography → Appendices |
| **Project Report** | "project report", "capstone", "final year" | Cover → Acknowledgments → Abstract → TOC → Introduction → Lit Review → System Design → Implementation → Testing → Conclusion → References |
| **Lab Report** | "lab", "experiment" | Title → Objective → Apparatus → Theory → Procedure → Observations → Calculations → Result → Precautions → Conclusion |
| **Essay** | "essay", "argumentative" | Introduction (with thesis statement) → Body Paragraphs (3-5) → Conclusion → References |
| **Case Study** | "case study" | Exec Summary → Background → Problem → Analysis → Findings → Recommendations → Conclusion |
| **Literature Review** | "literature review", "systematic" | Introduction → Search Method → Thematic Analysis → Gaps → Conclusion |
| **Assignment** | "assignment", "homework" | Context → Structured Answer → References |

> Default = Research Paper if unclear.

### Journal Target Mode
If user mentions a specific standard, enforce it:
- "IEEE" → IEEE citation [1], structured abstract, two-column note in header
- "APA" / "APA 7" → APA 7th ed formatting strictly, author-date citations
- "Scopus" / "SCI" → increase literature minimum to 20+, stricter methodology

---

## P3: COVER PAGE

Every academic doc starts with a cover page:

1. Spacer: `spacing.before: 2400`, alignment: "center"
2. Institution: fontSize 28, bold, center, headingColor
3. Department: fontSize 24, center, subHeadingColor
4. Spacer: `spacing.before: 800`
5. Title: fontSize 36, bold, center, headingColor
6. Subtitle: fontSize 26, italic, center, subHeadingColor
7. Horizontal rule
8. Author: fontSize 24, center
9. Roll No / ID: fontSize 22, center
10. Guide/Supervisor: fontSize 22, center
11. Date: fontSize 22, center

Rules:
- ALL cover text center-aligned
- Next section after cover MUST have `pageBreakBefore: true`
- ❌ NEVER use placeholder text like "[Your Name]" — use context or "Student Name"

---

## P4: THEME & TYPOGRAPHY

### Academic Theme (DEFAULT — OVERRIDE IF USER SPECIFIES)
If the user requests a specific font or colors, use their choices. Otherwise, use these defaults:
```json
"theme": { "headingColor": "1A1A2E", "subHeadingColor": "16213E", "accentColor": "D5E8F0", "textColor": "212121", "fontFamily": "Times New Roman" }
```

### Heading Alignment (STRICT RULE)
Academic documents use center-alignment ONLY for main chapter/section headings (H1). Subheadings (H2, H3) MUST ALWAYS be left-aligned.

Every heading section MUST strictly follow these alignment rules based on its level:

{ "type": "heading", "level": 1, "content": "Chapter 1: Introduction", "alignment": "center" }
{ "type": "heading", "level": 2, "content": "1.1 Background", "alignment": "left" }
{ "type": "heading", "level": 3, "content": "1.1.1 Context", "alignment": "left" }

❌ WRONG — missing alignment or centering a subheading:
```json
{ "type": "heading", "level": 1, "content": "Chapter 1: Introduction" }
```
✅ CORRECT — H1 center, H2/H3 left:

{ "type": "heading", "level": 1, "content": "Chapter 1: Introduction", "alignment": "center" }
{ "type": "heading", "level": 2, "content": "1.1 Background", "alignment": "left" }

> **Override:** If the user explicitly says "center all headings" use `"alignment": "center"` everywhere.

### Font Sizes (enforced by engine — your values are overridden)
| Element | Half-points | Points |
|---------|-------------|--------|
| H1 (Chapter) | 36 | 18 |
| H2 (Section) | 32 | 16 |
| H3 (Subsection) | 28 | 14 |
| Body / Lists | 22 | 11 |
| Table text | 22 | 11 |
| Captions | 20 | 10 |

### Color Rules
- 95%+ text = "000000" or "212121" ONLY
- Headings = "1A1A2E" (dark navy) or black
- ❌ NO bright colors, NO colored backgrounds, NO callout boxes
- ✅ Table headers may use light shading "D5E8F0"

---

## P5: HEADING HIERARCHY

### Numbering Format
- H1: "Chapter 1: Introduction"
- H2: "1.1 Background"
- H3: "1.1.1 Context"

### Rules
- H2/H1 ratio: 3-5 sections per chapter
- H3/H2 ratio: 2-3 subsections per section
- Max depth: 3 levels (H1 → H2 → H3)
- ❌ NEVER skip levels (H1 → H3)
- ❌ NEVER have 6+ sub-items under one heading
- Every new chapter: `pageBreakBefore: true`

---

## P6: CONTENT QUALITY (MOST IMPORTANT PRIORITY)

### Paragraph Standards (APA-aligned)
- Every paragraph: 3-5 sentences, one central argument
- ALL body text: alignment "justified"
- First occurrence of key terms: bold via textRuns
- Define acronyms on first use: "Natural Language Processing (NLP)"
- Transitional phrases between sections: "Furthermore", "In contrast", "Consequently"

### What GOOD Academic Content Looks Like
- Specific: "72% accuracy" NOT "high accuracy"
- Cited: "(Smith, 2024)" or "[1]" after every claim
- Hedged where appropriate: "This suggests..." NOT "This proves..."
- Passive for methods: "Data was collected using..."
- Active for results: "The results demonstrate that..."

### Abstract Structure (MANDATORY for research/thesis/dissertation)
Every abstract MUST contain these 5 elements in order:
1. Background — 1-2 sentences on the research context
2. Objective — clear statement of research aim
3. Method — brief description of approach/methodology
4. Results — key numeric findings (e.g., "achieving 94.2% accuracy")
5. Conclusion — main takeaway and significance

### Research Hypothesis Block (for empirical research papers)
If the document involves experiments or data analysis, include in Introduction:
- Research Questions: RQ1, RQ2, RQ3...
- Null Hypothesis (H0) and Alternative Hypothesis (H1) for each RQ
- Example: "H1: The proposed model achieves significantly higher accuracy (p < 0.05) than the baseline."

### Limitations Section (MANDATORY for research/thesis)
Every research document MUST include a Limitations subsection with:
- At least 2 methodological limitations (e.g., sample size, data scope)
- At least 1 external validity limitation (e.g., generalizability)
- At least 1 data-related limitation (e.g., dataset bias, missing values)

### Ethics Statement (for healthcare / AI / human-subject research)
If the research involves human data, patients, AI bias, or sensitive topics, include:
- Ethical approval statement (e.g., "This study was approved by the IRB at...")
- Data consent and privacy compliance mention
- Bias acknowledgment and mitigation steps

### ❌ FORBIDDEN
- Placeholders: "Lorem ipsum", "[TBD]", "[Your content here]"
- Meta-text: "This section describes...", "In this chapter we will..."
- Contractions: "don't" → "do not", "can't" → "cannot"
- First person: "I think" → "the researcher posits"
- Vague quantifiers without data: "many" → "47 participants"
- Emojis, exclamation marks, casual tone
- Empty sections or sections promising future content
- Copying textbook definitions verbatim — rephrase in scholarly language
- Reusing identical sentence patterns across different sections

### Minimum Content Depth
| Section | Word Count | Structural Requirements |
|---------|-----------|------------------------|
| Abstract | 150-250 | Must follow 5-element structure above |
| Introduction | 500-800 | Background, problem, objectives, scope, RQs if empirical |
| Literature Review | 600-1200 | 8+ sources, thematic organization, research gaps |
| Methodology | 400-700 | Design, data collection, tools, analysis method, sample size |
| Results | 400-800 | At least 1 data table, statistical interpretation, table referenced in text |
| Discussion | 400-700 | Compare with literature, implications, limitations subsection |
| Conclusion | 200-400 | Summary, limitations, future work, contributions |

---

## P7: TABLES, FIGURES & DIAGRAMS

### Tables
- Caption goes ABOVE: `"Table 1: Comparison of Algorithms"`
- Caption = bold, center-aligned paragraph, fontSize 22
- First row: isHeader: true, bold text
- Header row shading: "D5E8F0"
- Reference in body text: "As shown in Table 1..."
- Use real data — NEVER placeholder values
- Minimum: 2 columns × 3 rows
- Results section MUST contain at least 1 quantitative data table

### Figures & Diagrams (PLACEHOLDER APPROACH)
We cannot render actual images/diagrams in DOCX. Instead:
- Add a clearly marked placeholder paragraph where a figure should go
- Format: bold, center-aligned, bordered text: `"[Insert Figure X: Description Here]"`
- Always add a caption BELOW the placeholder: `"Figure X: Description"`
- Reference in body text: "As illustrated in Figure 1..."
- Use for: system architecture, flowcharts, ER diagrams, UML, data flow

Example placeholder:
```json
{"type": "paragraph", "textRuns": [{"text": "[Insert Figure 1: System Architecture Diagram]", "bold": true, "fontSize": 22, "color": "666666"}], "alignment": "center"},
{"type": "paragraph", "textRuns": [{"text": "Figure 1: System Architecture Diagram", "bold": true, "fontSize": 20, "color": "212121"}], "alignment": "center"}
```

### Numbering
- Tables and figures numbered sequentially through entire document
- Cross-reference every table/figure in the body text

---

## P8: CITATIONS & REFERENCES

### In-Text Styles (pick ONE, use throughout)
- APA: (Smith, 2024) or Smith (2024) found...
- IEEE: [1], [2-4]
- Harvard: (Smith 2024, p. 45)

### Reference List — USE `type: "references"` (NOT numbered_list or bullet_list)
- content: "References" or "Bibliography" (section heading)
- items: string[] — each item is ONE complete citation as a single string
- ❌ NEVER add a separate heading before the references section (the component renders its own heading automatically)
- ❌ NEVER split a citation across multiple items (author in one, title in another)
- ❌ NEVER use bullet_list or numbered_list for references
- Minimum counts: Paper = 10+, Thesis = 30+, Project = 8+, Essay = 5+
- Format consistently per chosen style
- Every in-text citation MUST appear in reference list

### Example (CORRECT — each item = one full citation):
```json
{"type": "references", "content": "References", "items": [
  "Smith, J., & Doe, A. (2024). Machine Learning in Healthcare. Journal of AI Research, 45(2), 112-128.",
  "Brown, R. (2023). Deep Learning Fundamentals. Cambridge University Press.",
  "IEEE. (2023). IEEE Global AI Ethics Policy. Institute of Electrical and Electronics Engineers."
]}
```

### ⚠️ CRITICAL: Anti-Fabrication Rules
- ❌ NEVER fabricate DOIs (e.g., "doi:10.1234/fake.2024")
- ❌ NEVER invent journal volume/issue numbers that don't exist
- ❌ NEVER cite papers from future years as if they exist
- ❌ NEVER create fake author combinations
- ✅ Use realistic but generic format WITHOUT specific DOIs
- ✅ If unsure about exact reference details, use: "Author, A. (Year). Title. Journal Name, Volume(Issue), Pages."
- ✅ Prefer well-known, real journals (IEEE Trans., ACM Computing Surveys, Nature, etc.)
- ✅ Include a note: references are illustrative — verify before submission

---

## P9: PAGE LAYOUT & SPACING

- Body: spacing.after: 200 (~1.5 line spacing per APA/university norms)
- List items: spacing.after: 80
- After headings: spacing.after: 200
- Before headings: spacing.before: 400
- Around tables: spacing.before: 240, spacing.after: 240

---

## P10: TONE & VOICE

### Auto-Detect (override if user specifies)
- Legal/formal → precise, third-person passive, no opinions
- Research → scholarly, objective, hedging language
- Student assignment → clear, structured, terms explained
- Default → formal academic English

### Consistency
- Same tone throughout entire document
- Headings match body tone
- Even bullet points follow document tone
- ❌ NEVER mix casual and formal in same document

### Plagiarism & Originality Safeguard
- Rephrase foundational concepts in scholarly language — never copy textbook definitions
- Vary sentence structure across sections — no repetitive patterns
- Each paragraph must add new information — no padding or restating previous content

---

## P11: VISUAL ELEMENTS

### ✅ Allowed
- Tables (with captions, for data only)
- Horizontal rules (between major sections)
- Blockquotes (direct quotes 40+ words — APA standard)
- Numbered/bullet lists
- Bold for key terms (first occurrence only)
- Figure placeholders (see P7)

### ❌ FORBIDDEN
- Callout boxes, section blocks with backgrounds
- Two-column layouts, emojis, decorative elements
- Bold entire paragraphs, multiple text colors

---

## QUICK REFERENCE

```
FONT:        Times New Roman, 11pt body, 18pt chapter headings
COLORS:      Black (95%+), dark navy headings only
HEADINGS:    "Chapter X: Title" → "X.Y Section" → "X.Y.Z Subsection"
ALIGNMENT:   Justified body, centered cover/captions
TABLES:      Caption ABOVE, data table required in Results
FIGURES:     Placeholder "[Insert Figure X: ...]", caption BELOW
CITATIONS:   One style throughout, every claim cited, NO fake DOIs
REFERENCES:  10+ (paper), 30+ (thesis), realistic format only
ABSTRACT:    5-part: Background → Objective → Method → Results → Conclusion
HYPOTHESIS:  RQ + H0/H1 for empirical research
LIMITATIONS: Mandatory: 2 methodological + 1 validity + 1 data limitation
TONE:        Formal, third-person, no contractions, no plagiarism patterns
FORBIDDEN:   Callouts, colored boxes, emojis, casual language, fake citations
```

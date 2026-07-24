---
name: docx-edit
description: "Minimal edit rulebook — JSON format, UUID preservation, and partial-update output rules for document editing"
license: Proprietary. LICENSE.txt has complete terms
---

# DOCUMENT EDIT RULEBOOK

**CRITICAL INSTRUCTION: THIS IS A PARTIAL PATCH SYSTEM.**
You are modifying an EXISTING document. You must NOT return the whole document.
The system automatically preserves EVERY section that you do not mention.

---

## RULE 1: THE PARTIAL PATCH RULES (CRITICAL)

1. **UNCHANGED SECTIONS**: 🛑 DO NOT include them in your output. Pretend they do not exist. The backend will automatically keep them.
2. **MODIFIED SECTIONS**: Return ONLY the sections you actually changed in `updatedSections`.
3. **DELETED SECTIONS**: List their IDs in `deletedIds` ONLY if the user explicitly commanded you to delete them. 🛑 NEVER list an ID in `deletedIds` just because you are not returning it in `updatedSections`.

Return a JSON object with ONLY these fields:
```json
{
  "updatedSections": [...],
  "deletedIds": ["uuid-of-section-to-delete"] // OMIT THIS ENTIRELY if nothing is deleted
}
```

- DO NOT return the full document structure. DO NOT return `title`, `fileName`, `theme`, `headerFooter`, etc.
- **Positional Insertion:** To add a new section at a specific position, include `"afterId": "uuid-of-preceding-section"` in the section object (this can be an existing section's `id` or a section marked for deletion).
- **Contiguous New Blocks:** When adding a new multi-section topic/chapter (e.g. Chapter heading + sub-headings + paragraphs), place `"afterId"` on the **FIRST** section of the new group. All subsequent sections in `updatedSections` will automatically follow sequentially after it.

---

## RULE 2: UUID PRESERVATION (CRITICAL)

Every existing section has an `"id"` field (a UUID). You MUST follow these rules:

- **Modified section**: Keep its original `"id"` value UNCHANGED.
- **New section you are adding**: OMIT the `"id"` field entirely. The backend will assign one.
- **NEVER** change, generate, or invent a UUID yourself. Copy existing ones exactly as-is.

```json
// ✅ Correct — modified section keeps its original id
{"id": "a1b2c3d4-...", "type": "paragraph", "textRuns": [...]}

// ✅ Correct — new section has no id
{"type": "heading", "level": 2, "content": "New Section", "alignment": "left"}

// ❌ Wrong — do NOT invent a new UUID for a modified section
{"id": "some-new-uuid", "type": "paragraph", "textRuns": [...]}
```

---

## RULE 3: JSON FORMAT RULES

### Paragraphs
- ALWAYS use `"textRuns"` array. NEVER use plain `"content"` for body text.
- ALWAYS include `fontSize` and `color` in every textRun.
- ALWAYS include `spacing.before` and `spacing.after`.
```json
{"type": "paragraph", "spacing": {"before": 200, "after": 120}, "textRuns": [{"text": "...", "fontSize": 24, "color": "212121"}]}
```

### Property Names
- `"fontSize"` — NEVER `"size"`
- `"color"` with hex value, NO `#` symbol
- `"spacing"` with `"before"` and `"after"` sub-properties

### List Items
- Plain strings ONLY — NEVER objects inside `items` array.
```json
// ✅ {"items": ["Point one — detail here"]}
// ❌ {"items": [{"text": "Point one", "detail": "detail here"}]}
```

### Headings
- Use `"type": "heading"` with `"level"` 1, 2, or 3.
- Include `"alignment"` if changing alignment. Omit if unchanged for existing sections.
- For new headings: ALWAYS use `"alignment": "center"` for H1, and `"alignment": "left"` for H2/H3.

### Forbidden Patterns
- `{"text": "", "fontSize": 300}` — never use empty text for spacing
- `{"type": "paragraph", "content": "..."}` — use textRuns
- Objects in list item arrays
- `section_block` or `table` wrapping regular content

---

## RULE 4: SCOPE OF CHANGES

- Apply ONLY what the user explicitly asked to change.
- Do NOT restructure, reformat, or "improve" sections not mentioned.
- Do NOT change the document theme, fonts, or colors unless explicitly requested.
- Do NOT touch the cover page unless explicitly asked.

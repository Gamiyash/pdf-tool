---
name: academic-docx-edit
description: "Minimal academic edit rulebook — JSON format, UUID preservation, academic constraints, and partial-update output rules"
license: Proprietary. LICENSE.txt has complete terms
---

# ACADEMIC DOCUMENT EDIT RULEBOOK

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

// ✅ Correct — new subsection (H2/H3) must be left aligned
{"type": "heading", "level": 2, "content": "2.1 New Subsection", "alignment": "left"}

// ❌ Wrong — do NOT invent a new UUID for a modified section
{"id": "some-new-uuid", "type": "paragraph", "textRuns": [...]}
```

---

## RULE 3: ACADEMIC CONSTRAINTS (ALWAYS ENFORCED)

These rules apply even during edits unless the user explicitly overrides them:

- **Headings MUST use `"alignment": "center"` ONLY for H1**. Subheadings (H2, H3) MUST be `"alignment": "left"`.
- **Font**: Preserve `Times New Roman` unless user explicitly changes it.
- **Tone**: Maintain formal academic language in all modified paragraphs.
- **Citations**: If editing a section with references, maintain citation format consistency.
- **Abstract/Limitations**: These sections must remain as structured paragraphs, not bullet lists.

---

## RULE 4: JSON FORMAT RULES

### Paragraphs
- ALWAYS use `"textRuns"` array. NEVER use plain `"content"` for body text.
- ALWAYS include `fontSize` and `color` in every textRun.
- ALWAYS include `spacing.before` and `spacing.after`.
```json
{"type": "paragraph", "spacing": {"before": 240, "after": 160}, "textRuns": [{"text": "...", "fontSize": 24, "color": "212121"}]}
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
- ALWAYS include `"alignment": "center"` for level 1 headings.
- ALWAYS include `"alignment": "left"` for level 2 and 3 subheadings.

### Forbidden Patterns
- `{"text": "", "fontSize": 300}` — never use empty text for spacing
- `{"type": "paragraph", "content": "..."}` — use textRuns
- Objects in list item arrays
- `section_block` or `table` wrapping regular content

---

## RULE 5: SCOPE OF CHANGES

- Apply ONLY what the user explicitly asked to change.
- Do NOT restructure, reformat, or "improve" sections not mentioned.
- Do NOT alter theme colors, font family, or page layout unless explicitly requested.
- Do NOT touch the cover page, abstract, or references unless explicitly asked.
- Academic integrity: Do NOT add, invent, or paraphrase citations that were not in the original document.

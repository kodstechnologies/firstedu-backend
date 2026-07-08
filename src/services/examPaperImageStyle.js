/**
 * Visual style for AI-generated exam figures — match real question papers
 * (JEE Main, NEET, CBSE), not child-friendly or decorative illustrations.
 */

export const EXAM_PAPER_IMAGE_DEFAULT_STYLE =
    "Indian competitive exam question paper figure: black-and-white or minimal 2-color schematic line diagram on plain white background, thin precise technical lines, NCERT/JEE textbook diagram style, accurate proportions, no decoration";

export const EXAM_PAPER_IMAGE_PROMPT_RULES =
    "Exam question paper figure style only: schematic line diagram on white background, thin black lines, technical textbook drawing like JEE Main or CBSE papers. Not cartoon, not 3D, not child-friendly, not clipart, not decorative art.";

export const EXAM_PAPER_IMAGE_GENERATION_BLOCK = `
**EXAM PAPER FIGURE STYLE (mandatory — match real question papers):**
- The figure must look exactly like diagrams in Indian competitive exam papers (JEE Main, NEET, CBSE board) — schematic line drawings on white background, NOT children's book art, NOT 3D renders, NOT colorful clipart.
- Use thin precise black lines; minimal shading; optional light grey fill only where needed for clarity (e.g. bar charts, shaded regions).
- **Relativeness rule:** Every size, count, angle, height, position, and proportion in the image MUST match what questionText and imageSpec.description state. If the stem says "taller bar", "larger slice", "angle 60°", "exactly 4 red circles", or "letter B on the smallest region" — the figure must depict that relationship precisely.
- imageSpec.description must spell out relative relationships (which is larger, how many objects, which angle value, left vs right, above vs below) so the image AI can draw them correctly.
- imageSpec.imagePrompt must repeat those relative spatial facts in plain language before style notes.
- questionText carries the names/meanings; the image shows only markers (letters A–D, numbers, angles) — never full words on the figure.`;

export const EXAM_PAPER_IMAGE_QUESTION_RULES = `
12. imageSpec.style must describe exam-paper schematic style (e.g. "JEE Main style line diagram, black lines on white, accurate proportions") — NOT child-friendly, vibrant, or decorative.
13. imageSpec.description and imageSpec.imagePrompt must encode relative relationships from the question (counts, sizes, positions, angles) so the drawn figure matches the stem exactly.
14. questionText and imageSpec must stay consistent: every comparative word in the stem (taller, more, smaller, left of, marked with, angle, count) must be visually true in the figure.`;

/** Appended to Imagen prompts when not already present. */
export const EXAM_PAPER_IMAGEN_SUFFIX =
    `${EXAM_PAPER_IMAGE_PROMPT_RULES} Accurate relative sizes, counts, positions, and angles as described. Plain white background. No watermarks.`;

export const enrichPromptForExamPaperStyle = (prompt) => {
    const p = String(prompt || "").trim();
    if (!p) return p;
    if (
        /exam\s+paper|question\s+paper|schematic|textbook\s+diagram|JEE\s+Main\s+style|NCERT|black.?and.?white|thin\s+(black\s+)?lines/i.test(
            p
        )
    ) {
        return p;
    }
    return `${p} ${EXAM_PAPER_IMAGEN_SUFFIX}`;
};

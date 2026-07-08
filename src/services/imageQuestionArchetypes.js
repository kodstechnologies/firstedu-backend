/** Image-question archetypes for mixed AI generation (Imagen-safe). */

import { EXAM_PAPER_IMAGE_DEFAULT_STYLE } from "./examPaperImageStyle.js";

export const IMAGE_QUESTION_ARCHETYPE_IDS = [
    "labeled_diagram",
    "chart_reading",
    "counting",
    "pattern_sequence",
    "geometry",
    "visual_comparison",
    "spatial_reasoning",
    "odd_one_out",
];

/** @type {Record<string, { id: string, label: string, usesLetterMarkers: boolean, allowNumbersOnImage: boolean, noTextOnImage: boolean, instructions: string, example: object }>} */
export const IMAGE_QUESTION_ARCHETYPES = {
    labeled_diagram: {
        id: "labeled_diagram",
        label: "Labeled diagram",
        usesLetterMarkers: true,
        allowNumbersOnImage: false,
        noTextOnImage: true,
        instructions: `**Archetype: labeled_diagram**
- Draw a schematic diagram (map, anatomy, plant, machine) exactly like a competitive exam question paper — thin black lines on white, accurate proportions.
- Mark parts with single capital letters A, B, C, D on the image.
- imageSpec.labels maps each letter to what it points at (for the question author only — NOT drawn as words on the image).
- imageSpec.description must state relative positions/sizes of parts (e.g. "roots at bottom, stem above roots, leaves on stem").
- questionText asks which part matches a description or which letter marks a given part.
- options[] are full names (e.g. "Roots", "Stem", "Leaves") — never bare letters.`,
        example: {
            questionText:
                "Refer to the plant diagram. Which part is marked with letter B?",
            options: ["Roots", "Stem", "Leaves", "Flower"],
            correctAnswer: "B",
            imageSpec: {
                archetype: "labeled_diagram",
                type: "diagram",
                description:
                    "Exam-paper plant schematic: roots at bottom, stem above roots (taller than roots), leaves on upper stem, flower at top",
                style: EXAM_PAPER_IMAGE_DEFAULT_STYLE,
                labels: {
                    A: "roots",
                    B: "stem",
                    C: "leaves",
                    D: "flower",
                },
                imagePrompt:
                    "JEE Main style black-and-white plant line diagram on white background: roots at bottom, stem above roots, leaves on stem, flower at top. Place ONLY bold capital letters A on roots, B on stem, C on leaves, D on flower. Thin precise lines, accurate relative positions. No words anywhere.",
            },
        },
    },
    chart_reading: {
        id: "chart_reading",
        label: "Chart / graph reading",
        usesLetterMarkers: true,
        allowNumbersOnImage: false,
        noTextOnImage: true,
        instructions: `**Archetype: chart_reading**
- Draw a pie chart, bar chart, or pictograph like a real exam paper — schematic bars/slices with accurate relative heights/areas.
- Mark slices/bars/groups with letters A–D (no category names on the image).
- imageSpec.labels maps letters to categories and their relative size (e.g. "bananas (tallest bar)").
- imageSpec.description must state which bar/slice is tallest, shortest, or largest share.
- questionText asks which category a letter represents, or which letter marks the largest/smallest slice.
- options[] are category names — never bare letters.`,
        example: {
            questionText:
                "Refer to the bar chart. Which category is represented by the tallest bar marked B?",
            options: ["Apples", "Bananas", "Oranges", "Grapes"],
            correctAnswer: "B",
            imageSpec: {
                archetype: "chart_reading",
                type: "bar_chart",
                description:
                    "Four bars of different heights: A shortest, B tallest, C medium, D second tallest",
                style: EXAM_PAPER_IMAGE_DEFAULT_STYLE,
                labels: {
                    A: "apples (shortest bar)",
                    B: "bananas (tallest bar)",
                    C: "oranges (medium bar)",
                    D: "grapes (second tallest bar)",
                },
                imagePrompt:
                    "Exam question paper bar chart on white background: four black-outline bars with B clearly tallest, A shortest, C medium height, D second tallest. Place ONLY letters A, B, C, D below each bar. Thin lines, accurate relative heights. No words, numbers, or titles.",
            },
        },
    },
    counting: {
        id: "counting",
        label: "Counting",
        usesLetterMarkers: false,
        allowNumbersOnImage: false,
        noTextOnImage: true,
        instructions: `**Archetype: counting**
- Draw a schematic scene with an exact count of distinct objects — exam-paper line style, not cartoon art.
- NO text, numbers, or letters on the image — the student counts visually.
- imageSpec.description must state the exact count and relative placement (e.g. "exactly 4 red triangles among blue circles").
- questionText asks "How many … are shown in the figure?"
- options[] are numeric strings or number words (e.g. "3", "4", "5", "6") — one correct count plus plausible distractors.
- imageSpec.labels should be empty {}.`,
        example: {
            questionText:
                "Refer to the figure. How many red triangles are shown?",
            options: ["3", "4", "5", "6"],
            correctAnswer: "B",
            imageSpec: {
                archetype: "counting",
                type: "counting_scene",
                description:
                    "Exactly 4 red triangles scattered among several blue circles on white background",
                style: EXAM_PAPER_IMAGE_DEFAULT_STYLE,
                labels: {},
                imagePrompt:
                    "Exam paper schematic on white background showing exactly 4 red triangles and several blue circles. Thin black outlines, accurate count of 4 triangles. No text, no numbers, no letters.",
            },
        },
    },
    pattern_sequence: {
        id: "pattern_sequence",
        label: "Pattern / sequence",
        usesLetterMarkers: false,
        allowNumbersOnImage: false,
        noTextOnImage: true,
        instructions: `**Archetype: pattern_sequence**
- Draw a visual sequence of shapes (e.g. circle, square, circle, square, ?) in exam-paper schematic style.
- NO words on the image; "?" is allowed as a single character for the missing term.
- imageSpec.description must state the repeating pattern and which slot is empty.
- questionText asks what comes next in the pattern.
- options[] are shape/color descriptions (e.g. "Red circle", "Blue square") — never bare letters.`,
        example: {
            questionText:
                "Refer to the pattern below. What shape comes next in the sequence?",
            options: ["Red circle", "Blue square", "Green triangle", "Yellow star"],
            correctAnswer: "A",
            imageSpec: {
                archetype: "pattern_sequence",
                type: "pattern",
                description:
                    "Alternating red circle and blue square in five slots; fifth slot empty with ?",
                style: EXAM_PAPER_IMAGE_DEFAULT_STYLE,
                labels: {},
                imagePrompt:
                    "Horizontal sequence of five equal slots on white background: red circle, blue square, red circle, blue square, empty slot with a large question mark. Thin black outlines, exam paper schematic style. No other text or labels.",
            },
        },
    },
    geometry: {
        id: "geometry",
        label: "Geometry",
        usesLetterMarkers: true,
        allowNumbersOnImage: true,
        noTextOnImage: true,
        instructions: `**Archetype: geometry**
- Draw a geometry figure (angles, triangles, symmetry, perimeter) exactly like JEE/CBSE papers — thin lines, correct proportions.
- Digits (e.g. 45, 90) and single letters (A, B, C) ARE allowed on the image. No words or sentences.
- imageSpec.description must state angle values, side lengths, and which angle/side is unknown.
- questionText asks about angle size, side length, symmetry, or which shape property is shown.
- options[] are measurements or geometric terms (e.g. "90°", "Isosceles", "4 cm") — never bare A–D.`,
        example: {
            questionText:
                "In the triangle shown, what is the measure of the angle marked x?",
            options: ["45°", "60°", "90°", "120°"],
            correctAnswer: "C",
            imageSpec: {
                archetype: "geometry",
                type: "geometry",
                description:
                    "Right triangle with two 45° angles and right angle marked x at the corner",
                style: EXAM_PAPER_IMAGE_DEFAULT_STYLE,
                labels: { x: "unknown angle at corner" },
                imagePrompt:
                    "JEE Main style right triangle on white background with two angles labeled 45 and 45 in digits, right angle marked with letter x. Thin black lines, accurate 45-45-90 proportions. No words, only numbers and single letter x.",
            },
        },
    },
    visual_comparison: {
        id: "visual_comparison",
        label: "Visual comparison",
        usesLetterMarkers: false,
        allowNumbersOnImage: false,
        noTextOnImage: true,
        instructions: `**Archetype: visual_comparison**
- Draw two or more groups/sides to compare (more objects, taller stack, longer bar) in exam-paper schematic style.
- NO text or numbers on the image.
- imageSpec.description must state exact counts or relative sizes for each group (e.g. "left: 3 stars, right: 5 stars — right has more").
- questionText asks which group has more, which is taller/longer, or which side is heavier.
- options[] describe the comparison outcome in words.`,
        example: {
            questionText:
                "Refer to the figure. Which group has more stars?",
            options: [
                "Left group",
                "Right group",
                "Both groups are equal",
                "Cannot be determined",
            ],
            correctAnswer: "B",
            imageSpec: {
                archetype: "visual_comparison",
                type: "comparison",
                description:
                    "Left group: exactly 3 stars; right group: exactly 5 stars (right has more)",
                style: EXAM_PAPER_IMAGE_DEFAULT_STYLE,
                labels: {},
                imagePrompt:
                    "Exam paper schematic on white background: two groups separated by a vertical line — left group exactly 3 stars, right group exactly 5 stars. Thin black outlines, accurate counts. No text or numbers on the image.",
            },
        },
    },
    spatial_reasoning: {
        id: "spatial_reasoning",
        label: "Spatial / rotation",
        usesLetterMarkers: false,
        allowNumbersOnImage: false,
        noTextOnImage: true,
        instructions: `**Archetype: spatial_reasoning**
- Draw a shape plus transformations (rotation, mirror, flip) OR a folded paper / cube net puzzle — exam-paper schematic line style.
- NO words on the image; use distinct shapes only.
- imageSpec.description must state the original orientation and what transformation is asked.
- questionText asks which option shows the correct rotation, mirror image, or unfolded result.
- options[] describe orientations (e.g. "Rotated 90° clockwise", "Mirror image") — never bare letters.`,
        example: {
            questionText:
                "The L-shaped block is rotated. Which option shows the correct 90° clockwise rotation?",
            options: [
                "Rotated 90° clockwise",
                "Rotated 90° counter-clockwise",
                "Mirror image",
                "Same as original",
            ],
            correctAnswer: "A",
            imageSpec: {
                archetype: "spatial_reasoning",
                type: "spatial",
                description:
                    "Blue L-shaped block oriented like an upside-down L before rotation",
                style: EXAM_PAPER_IMAGE_DEFAULT_STYLE,
                labels: {},
                imagePrompt:
                    "Exam paper schematic L-shaped block in blue on white background, oriented like an upside-down L. Thin black outline, clean 2D technical drawing. No text or letters.",
            },
        },
    },
    odd_one_out: {
        id: "odd_one_out",
        label: "Odd one out",
        usesLetterMarkers: false,
        allowNumbersOnImage: false,
        noTextOnImage: true,
        instructions: `**Archetype: odd_one_out**
- Draw a grid or row of 4–6 similar items where one differs (color, shape, size, orientation) — exam-paper schematic style.
- NO text on the image.
- imageSpec.description must state which item differs and its position (e.g. "bottom-right circle among three squares").
- questionText asks which item does not belong or is different.
- options[] describe positions or items (e.g. "Top-left", "Bottom-right", "The green circle") — never bare A–D unless combined with description.`,
        example: {
            questionText:
                "Refer to the figure. Which shape is different from the others?",
            options: [
                "Top-left square",
                "Top-right square",
                "Bottom-left square",
                "Bottom-right circle",
            ],
            correctAnswer: "D",
            imageSpec: {
                archetype: "odd_one_out",
                type: "classification",
                description:
                    "2x2 grid: three red squares (top-left, top-right, bottom-left) and one blue circle (bottom-right)",
                style: EXAM_PAPER_IMAGE_DEFAULT_STYLE,
                labels: {},
                imagePrompt:
                    "Exam paper 2x2 grid on white background: three red squares in top-left, top-right, bottom-left; one blue circle in bottom-right. Thin black outlines, schematic style. No text or letters.",
            },
        },
    },
};

export const getImageQuestionArchetype = (id) =>
    IMAGE_QUESTION_ARCHETYPES[id] || null;

/**
 * Pick archetype for mixed generation — prefer types not yet used in this section.
 * @param {{ preferred?: string, usedTypes?: string[] }} opts
 */
export const pickImageQuestionArchetype = ({ preferred = "mixed", usedTypes = [] } = {}) => {
    if (
        preferred &&
        preferred !== "mixed" &&
        IMAGE_QUESTION_ARCHETYPE_IDS.includes(preferred)
    ) {
        return preferred;
    }

    const used = new Set(
        (usedTypes || []).filter((id) => IMAGE_QUESTION_ARCHETYPE_IDS.includes(id))
    );
    const unused = IMAGE_QUESTION_ARCHETYPE_IDS.filter((id) => !used.has(id));
    const pool = unused.length ? unused : IMAGE_QUESTION_ARCHETYPE_IDS;
    return pool[Math.floor(Math.random() * pool.length)];
};

export const getImagePromptRulesForArchetype = (archetypeId) => {
    const config = getImageQuestionArchetype(archetypeId);
    if (!config) {
        return {
            letterClause: null,
            noTextRule:
                "STRICT: No words, titles, captions, or sentences on the image.",
        };
    }

    if (config.usesLetterMarkers) {
        return {
            letterClause: true,
            noTextRule:
                "STRICT: No words on the image. Only single capital letters A, B, C, D as markers where needed.",
        };
    }
    if (config.allowNumbersOnImage) {
        return {
            letterClause: false,
            noTextRule:
                "STRICT: No words or sentences on the image. Digits and single letters for angles/lengths are allowed.",
        };
    }
    if (config.noTextOnImage) {
        return {
            letterClause: false,
            noTextRule:
                "STRICT: No words, numbers, or letters on the image (a single ? for missing pattern terms is OK).",
        };
    }
    return { letterClause: false, noTextRule: null };
};

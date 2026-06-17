import { GoogleGenAI } from "@google/genai";
import { ApiError } from "../utils/ApiError.js";

// Initialize Gemini 2.5 Flash
const genAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

/**
 * Build a structured prompt for AI question generation
 */
const buildPrompt = ({ topic, subject, classLevel, difficulty, numberOfQuestions }) => {
    return `You are an expert educator creating multiple-choice questions for competitive exams.

Generate exactly ${numberOfQuestions} high-quality MCQ questions with the following specifications:

**Topic:** ${topic}
**Subject:** ${subject}
**Class/Level:** ${classLevel}
**Difficulty:** ${difficulty}

**CRITICAL INSTRUCTIONS:**
1. Return ONLY a valid JSON array, no markdown, no code blocks, no extra text
2. Each question must have exactly 4 options (A, B, C, D)
3. Each question must have exactly ONE correct answer
4. Include a clear explanation for the correct answer
5. Questions should be appropriate for ${classLevel} level
6. Difficulty should match "${difficulty}" level

**Required JSON Format:**
[
  {
    "questionText": "The complete question text here",
    "optionA": "First option text",
    "optionB": "Second option text",
    "optionC": "Third option text",
    "optionD": "Fourth option text",
    "answer": "A",
    "explanation": "Detailed explanation of why this is correct"
  }
]

**IMPORTANT:** 
- The "answer" field must be ONLY the letter: "A", "B", "C", or "D"
- Do NOT include markdown code blocks like \`\`\`json
- Return ONLY the JSON array, nothing else
- Ensure all questions are unique and relevant to the topic`;
};

/**
 * Clean AI response by removing markdown code blocks and extra whitespace
 */
const cleanAIResponse = (responseText) => {
    let cleaned = responseText.trim();

    // Remove markdown code blocks
    cleaned = cleaned.replace(/```json\s*/gi, '');
    cleaned = cleaned.replace(/```\s*/g, '');

    // Remove any leading/trailing whitespace
    cleaned = cleaned.trim();

    return cleaned;
};

const GEMINI_QB_MAX_ATTEMPTS = 3;
const GEMINI_RETRY_DELAY_MS = 2000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Extract the outermost JSON array (handles extra text before/after). */
const extractJsonArraySubstring = (text) => {
    const cleaned = cleanAIResponse(text);
    const start = cleaned.indexOf("[");
    if (start === -1) return cleaned;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < cleaned.length; i++) {
        const ch = cleaned[i];
        if (inString) {
            if (escaped) escaped = false;
            else if (ch === "\\") escaped = true;
            else if (ch === '"') inString = false;
            continue;
        }
        if (ch === '"') inString = true;
        else if (ch === "[") depth++;
        else if (ch === "]") {
            depth--;
            if (depth === 0) return cleaned.slice(start, i + 1);
        }
    }

    return cleaned.slice(start);
};

/** Fix common Gemini JSON mistakes (trailing commas, junk after array). */
const repairJsonArrayString = (str) => {
    let s = String(str || "").trim();
    s = s.replace(/,\s*([\]}])/g, "$1");
    const lastBracket = s.lastIndexOf("]");
    if (lastBracket !== -1 && lastBracket < s.length - 1) {
        s = s.slice(0, lastBracket + 1);
    }
    return s;
};

const parseJsonArrayFromAI = (rawText) => {
    const candidates = [
        () => cleanAIResponse(rawText),
        () => extractJsonArraySubstring(rawText),
        () => repairJsonArrayString(cleanAIResponse(rawText)),
        () => repairJsonArrayString(extractJsonArraySubstring(rawText)),
    ];

    let lastError;
    for (const build of candidates) {
        try {
            const parsed = JSON.parse(build());
            if (Array.isArray(parsed)) return parsed;
            lastError = new Error("Response is not a JSON array");
        } catch (e) {
            lastError = e;
        }
    }

    throw new ApiError(
        500,
        `Failed to parse AI response: ${lastError?.message || "Invalid JSON"}. Please try again.`
    );
};

const isRateLimitGeminiError = (error) => {
    const msg = String(error?.message || error || "").toLowerCase();
    return msg.includes("rate limit") || msg.includes("quota");
};

const isTransientGeminiError = (error) => {
    const msg = String(error?.message || error || "").toLowerCase();
    return (
        msg.includes("503") ||
        msg.includes("unavailable") ||
        msg.includes("high demand") ||
        msg.includes("overloaded") ||
        msg.includes("resource exhausted")
    );
};

const isGeminiSafetyBlockError = (error) => {
    const msg = String(error?.message || error || "").toLowerCase();
    return (
        msg.includes("safety") ||
        msg.includes("blocked") ||
        msg.includes("block_reason") ||
        msg.includes("content filter") ||
        msg.includes("harm category") ||
        msg.includes("recitation") ||
        msg.includes("prohibited content") ||
        msg.includes("candidate was blocked")
    );
};

const toGeminiQuestionBankError = (error) => {
    if (isGeminiSafetyBlockError(error)) {
        return new ApiError(
            400,
            "AI could not generate questions for this topic due to content restrictions. Try rephrasing the topic or bank name."
        );
    }

    if (error instanceof ApiError) {
        if (isRateLimitGeminiError(error)) {
            return new ApiError(
                429,
                "AI service rate limit exceeded. Please try again later."
            );
        }
        if (isTransientGeminiError(error)) {
            return new ApiError(
                503,
                "Gemini is busy right now. Please wait a moment and try again."
            );
        }
        return error;
    }

    const msg = String(error?.message || error);
    if (msg.includes("API key")) {
        return new ApiError(500, "Invalid or missing Gemini API key");
    }
    if (isRateLimitGeminiError(error)) {
        return new ApiError(
            429,
            "AI service rate limit exceeded. Please try again later."
        );
    }
    if (isTransientGeminiError(error)) {
        return new ApiError(
            503,
            "Gemini is busy right now. Please wait a moment and try again."
        );
    }
    if (msg.includes("Failed to parse AI response")) {
        return new ApiError(500, msg);
    }
    return new ApiError(500, `AI question generation failed: ${msg}`);
};

const isRetryableQuestionBankError = (error) => {
    if (isGeminiSafetyBlockError(error)) return false;
    if (isTransientGeminiError(error) || isRateLimitGeminiError(error)) {
        return true;
    }

    const msg = String(error?.message || "");
    if (msg.includes("Failed to parse AI response")) return true;
    if (msg.includes("AI returned empty response")) return true;
    if (msg.includes("AI returned") && msg.includes("were requested")) return true;
    if (/Expected \d+ .* questions, got/.test(msg)) return true;
    if (/Question \d+:/.test(msg)) return true;
    if (msg.includes("missing fields")) return true;
    if (msg.includes("invalid answer")) return true;
    if (msg.includes("multiple-choice needs")) return true;
    if (msg.includes("cannot have all four")) return true;
    if (msg.includes("options must be answer text")) return true;
    if (msg.includes("Response is not an array")) return true;
    if (msg.includes("Response is not a JSON array")) return true;
    if (msg.includes("connected needs")) return true;
    if (msg.includes("connected passage")) return true;
    if (/Passage \d+:/.test(msg)) return true;
    return false;
};

const validateSimpleMcqQuestions = (questions) => {
    if (!Array.isArray(questions)) {
        throw new Error("Response is not an array");
    }

    return questions.map((q, index) => {
        const requiredFields = [
            "questionText",
            "optionA",
            "optionB",
            "optionC",
            "optionD",
            "answer",
            "explanation",
        ];
        const missingFields = requiredFields.filter((field) => !q[field]);

        if (missingFields.length > 0) {
            throw new Error(
                `Question ${index + 1} is missing fields: ${missingFields.join(", ")}`
            );
        }

        const validAnswers = ["A", "B", "C", "D"];
        if (!validAnswers.includes(q.answer.toUpperCase())) {
            throw new Error(
                `Question ${index + 1} has invalid answer: ${q.answer}. Must be A, B, C, or D`
            );
        }

        return {
            questionText: q.questionText.trim(),
            optionA: q.optionA.trim(),
            optionB: q.optionB.trim(),
            optionC: q.optionC.trim(),
            optionD: q.optionD.trim(),
            answer: q.answer.toUpperCase(),
            explanation: q.explanation.trim(),
        };
    });
};

/**
 * Parse and validate the AI-generated questions (legacy string input)
 */
const parseAndValidateQuestions = (jsonString) => {
    try {
        const questions = JSON.parse(jsonString);
        return validateSimpleMcqQuestions(questions);
    } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError(500, `Failed to parse AI response: ${error.message}`);
    }
};

const callGeminiWithRetries = async (generateOnce) => {
    let lastError;
    for (let attempt = 1; attempt <= GEMINI_QB_MAX_ATTEMPTS; attempt++) {
        try {
            return await generateOnce();
        } catch (error) {
            lastError = error;
            if (
                attempt < GEMINI_QB_MAX_ATTEMPTS &&
                isRetryableQuestionBankError(error)
            ) {
                await sleep(GEMINI_RETRY_DELAY_MS * attempt);
                continue;
            }
            throw toGeminiQuestionBankError(error);
        }
    }
    throw toGeminiQuestionBankError(lastError);
};

/**
 * Generate questions using Gemini AI
 */
const QUESTION_BANK_TYPES = {
    single: "single",
    multiple: "multiple",
    true_false: "true_false",
    connected: "connected",
};

/** Strip leading A)/A./(A) style labels — UI adds letters separately */
const stripOptionLetterPrefix = (text) => {
    let s = String(text ?? "").trim();
    s = s.replace(/^\(?\s*([A-Da-d]|[1-4])\s*\)?\s*[\.\):\-]\s*/u, "");
    return s.trim();
};

/** Remove markdown/backticks from AI text fields */
const stripMarkdownNoise = (text) => {
    return String(text ?? "")
        .replace(/`/g, "")
        .replace(/\*\*/g, "")
        .replace(/\s+/g, " ")
        .trim();
};

const formatExcludeBlock = (excludeQuestionTexts = []) => {
    const MAX_ITEM = 480;
    const list = (excludeQuestionTexts || [])
        .map((t) => String(t).trim())
        .filter((t) => t.length >= 3)
        .map((t) =>
            t.length > MAX_ITEM ? `${t.slice(0, MAX_ITEM - 1)}…` : t
        )
        .slice(0, 100);
    if (!list.length) return "";
    const numbered = list
        .map((t, i) => `${i + 1}. ${t.replace(/\n/g, " ")}`)
        .join("\n");
    return `

**ALREADY SHOWN TO THE USER (do NOT repeat or paraphrase):**
The user has already seen these ${list.length} question(s) in a previous batch. You MUST generate completely different questions — new concepts, different wording, different numerical values if applicable.

${numbered}

`;
};

const buildQuestionBankPrompt = ({
    topic,
    bankName,
    difficulty,
    singleCount,
    multipleCount,
    trueFalseCount,
    passageCount = 0,
    passageSingleCount = 0,
    passageMultipleCount = 0,
    passageTrueFalseCount = 0,
    connectedCount = 0,
    excludeQuestionTexts = [],
}) => {
    const resolvedPassageCount = passageCount || connectedCount || 0;
    const passageSubPerPassage =
        passageSingleCount + passageMultipleCount + passageTrueFalseCount;
    const passageSubTotal = resolvedPassageCount * passageSubPerPassage;
    const standaloneTotal = singleCount + multipleCount + trueFalseCount;
    const total = standaloneTotal + resolvedPassageCount;
    const excludeBlock = formatExcludeBlock(excludeQuestionTexts);
    return `You are an expert educator creating exam questions for an Indian competitive-education platform.

Generate exactly ${total} top-level items for a question bank with these specifications:

**Question bank name:** ${bankName}
**Topic / syllabus focus:** ${topic}
**Difficulty:** ${difficulty}

**Standalone questions (NOT based on any reading passage):**
- Single correct (one answer): ${singleCount}
- Multiple correct (two or more answers): ${multipleCount}
- True/False: ${trueFalseCount}

**Reading passages (passage-based questions only):**
- Number of separate reading passages: ${resolvedPassageCount}
- EACH passage must include exactly this mix of sub-questions (every passage gets the same types and counts — do NOT split types across passages):
  - Single answer (per passage): ${passageSingleCount}
  - Multiple correct (per passage): ${passageMultipleCount}
  - True/False (per passage): ${passageTrueFalseCount}
- Total passage sub-questions across all passages: ${passageSubTotal} (${resolvedPassageCount} passage(s) × ${passageSubPerPassage} question(s) each)
${excludeBlock}
**CRITICAL INSTRUCTIONS:**
1. Return ONLY a valid JSON array — no markdown, no code fences, no extra text.
2. Each standalone item must include: questionType, questionText, options, correctAnswer, explanation.
3. questionType must be exactly one of: "single", "multiple", "true_false", "connected".
4. For "single": exactly 4 options; correctAnswer is one letter "A", "B", "C", or "D".
5. For "multiple": exactly 4 options; correctAnswer is an array of letters, e.g. ["A","C"] (at least 2 correct).
6. For "true_false": options must be ["True", "False"]; correctAnswer is "True" or "False".
7. For "connected" (reading passage): include title (short label), passage (reading paragraph, 80–250 words), and subQuestions array with exactly ${passageSubPerPassage} sub-question(s) per passage (${passageSingleCount} single, ${passageMultipleCount} multiple, ${passageTrueFalseCount} true_false in EACH passage). Sub-questions must use only types single, multiple, or true_false. Each sub-question must be answerable ONLY from its passage. Do NOT repeat standalone questions as passage sub-questions. Do NOT put all singles in passage 1 and all true/false in passage 2 — every passage must follow the per-passage mix above.
8. Every standalone question and every passage sub-question MUST have a clear explanation (minimum one sentence).
9. Items must be unique within this response AND must not duplicate or closely paraphrase any question listed under "ALREADY SHOWN TO THE USER" above.
10. Questions must be accurate and appropriate for ${difficulty} difficulty.
11. Use Indian curriculum context where relevant (CBSE, JEE, NEET, etc.) when the topic fits.

**FORMATTING RULES (mandatory):**
12. questionText, passage, title, and explanation: plain text only — NO backticks, NO markdown.
13. options[] values are ANSWER TEXT ONLY — do NOT prefix with "A)", "B.", "(C)", or similar.
14. For "multiple": questionText MUST include "Select all that apply". At least ONE option must be incorrect.
15. For "true_false": options must be exactly ["True", "False"].

**Required JSON format (example structure only):**
[
  {
    "questionType": "single",
    "questionText": "What is 2 + 2?",
    "options": ["3", "4", "5", "6"],
    "correctAnswer": "B",
    "explanation": "2 + 2 equals 4, which is option B."
  },
  {
    "questionType": "connected",
    "title": "Reading: Photosynthesis",
    "passage": "Plants convert light energy into chemical energy through photosynthesis. Chlorophyll in leaves absorbs sunlight...",
    "subQuestions": [
      {
        "questionType": "single",
        "questionText": "According to the passage, where does photosynthesis primarily occur?",
        "options": ["Roots", "Leaves", "Stem", "Flowers"],
        "correctAnswer": "B",
        "explanation": "The passage states chlorophyll in leaves absorbs sunlight."
      },
      {
        "questionType": "true_false",
        "questionText": "Photosynthesis converts chemical energy into light energy.",
        "options": ["True", "False"],
        "correctAnswer": "False",
        "explanation": "The passage says light energy is converted into chemical energy, not the reverse."
      }
    ]
  }
]

Generate exactly ${singleCount} standalone single, ${multipleCount} standalone multiple, ${trueFalseCount} standalone true_false, and ${resolvedPassageCount} connected passage item(s). Each passage must have exactly ${passageSingleCount} single, ${passageMultipleCount} multiple, and ${passageTrueFalseCount} true_false sub-questions (${passageSubTotal} passage sub-questions in total). Return ONLY the JSON array.`;
};

const letterToIndex = (letter) => {
    const upper = String(letter || "").trim().toUpperCase();
    if (["A", "B", "C", "D"].includes(upper)) return upper.charCodeAt(0) - 65;
    return 0;
};

const normalizeOptionsArray = (options, questionType) => {
    if (questionType === QUESTION_BANK_TYPES.true_false) {
        const a = stripOptionLetterPrefix(options?.[0] || "True");
        const b = stripOptionLetterPrefix(options?.[1] || "False");
        return [a || "True", b || "False", "", ""];
    }
    const list = Array.isArray(options)
        ? options.map((o) => stripOptionLetterPrefix(stripMarkdownNoise(o)))
        : [];
    while (list.length < 4) list.push("");
    return list.slice(0, 4);
};

const parseQuestionBankAIItem = (q, index, labelPrefix = null) => {
    const label = labelPrefix || `Question ${index + 1}`;
    const questionType = QUESTION_BANK_TYPES[q.questionType]
        ? q.questionType
        : "single";

    if (!q.questionText || !String(q.questionText).trim()) {
        throw new Error(`${label}: questionText is required`);
    }
    if (!q.explanation || !String(q.explanation).trim()) {
        throw new Error(`${label}: explanation is required`);
    }

    const questionText = stripMarkdownNoise(q.questionText);
    const explanation = stripMarkdownNoise(q.explanation);

    const options = normalizeOptionsArray(q.options, questionType);
    let correctIndex = 0;
    let multipleCorrectIndexes = [];

    if (questionType === "multiple") {
        const letters = Array.isArray(q.correctAnswer)
            ? q.correctAnswer
            : String(q.correctAnswer || "")
                  .split(/[,;]/)
                  .map((x) => x.trim())
                  .filter(Boolean);
        multipleCorrectIndexes = [
            ...new Set(letters.map(letterToIndex).filter((i) => i >= 0 && i <= 3)),
        ];
        if (multipleCorrectIndexes.length < 2) {
            throw new Error(
                `${label}: multiple-choice needs at least 2 correct answers`
            );
        }
        if (multipleCorrectIndexes.length >= 4) {
            throw new Error(
                `${label}: multiple-choice cannot have all four options correct`
            );
        }
        correctIndex = multipleCorrectIndexes[0];
    } else if (questionType === "true_false") {
        const ans = String(q.correctAnswer ?? "").trim().toLowerCase();
        correctIndex =
            ans === "true" || ans === "t" || ans === "1" || options[0].toLowerCase() === ans
                ? 0
                : 1;
        multipleCorrectIndexes = [];
    } else {
        const letter = Array.isArray(q.correctAnswer)
            ? q.correctAnswer[0]
            : q.correctAnswer;
        correctIndex = letterToIndex(letter);
        multipleCorrectIndexes = [];
    }

    let finalQuestionText = questionText;
    if (
        questionType === "multiple" &&
        !/select all that apply/i.test(finalQuestionText)
    ) {
        finalQuestionText = finalQuestionText.replace(/\?+\s*$/, "").trim();
        finalQuestionText = `${finalQuestionText}? Select all that apply.`;
    }

    if (questionType === "single" || questionType === "multiple") {
        const placeholderOnly = options.every((o) => /^[A-D]$/i.test(String(o).trim()));
        if (placeholderOnly) {
            throw new Error(
                `${label}: options must be answer text, not bare letters A–D`
            );
        }
    }

    return {
        questionType,
        questionText: finalQuestionText,
        options,
        correctIndex,
        multipleCorrectIndexes,
        explanation,
    };
};

const parseConnectedAIItem = (q, index) => {
    const label = `Question ${index + 1}`;
    const passage = stripMarkdownNoise(
        q.passage || q.paragraph || q.readingText || ""
    );
    if (!passage) {
        throw new Error(`${label}: connected passage is required`);
    }

    const title = stripMarkdownNoise(
        q.title || q.questionText || `Reading set ${index + 1}`
    );
    const subs = q.subQuestions || q.connectedQuestions || [];
    if (!Array.isArray(subs) || subs.length < 1) {
        throw new Error(`${label}: connected needs at least 1 sub-question`);
    }
    if (subs.length > 5) {
        throw new Error(`${label}: connected cannot have more than 5 sub-questions`);
    }

    const subQuestions = subs.map((sub, si) =>
        parseQuestionBankAIItem(sub, index, `${label}, sub-question ${si + 1}`)
    );

    return {
        questionType: "connected",
        title,
        passage,
        subQuestions,
    };
};

const parseQuestionBankAIResponse = (rawText, expectedCounts) => {
    const questions = parseJsonArrayFromAI(rawText);

    const expectedTotal =
        expectedCounts.singleCount +
        expectedCounts.multipleCount +
        expectedCounts.trueFalseCount +
        (expectedCounts.passageCount || expectedCounts.connectedCount || 0);

    if (questions.length !== expectedTotal) {
        throw new ApiError(
            500,
            `AI returned ${questions.length} questions but ${expectedTotal} were requested`
        );
    }

    const typeCounts = { single: 0, multiple: 0, true_false: 0, connected: 0 };
    const passageSubCounts = { single: 0, multiple: 0, true_false: 0 };
    const connectedItems = [];
    const parsed = questions.map((q, i) => {
        if (q.questionType === "connected") {
            const item = parseConnectedAIItem(q, i);
            typeCounts.connected += 1;
            connectedItems.push(item);
            for (const sub of item.subQuestions || []) {
                const st = sub.questionType || "single";
                if (passageSubCounts[st] !== undefined) {
                    passageSubCounts[st] += 1;
                }
            }
            return item;
        }
        const item = parseQuestionBankAIItem(q, i);
        typeCounts[item.questionType] += 1;
        return item;
    });

    if (typeCounts.single !== expectedCounts.singleCount) {
        throw new ApiError(
            500,
            `Expected ${expectedCounts.singleCount} single questions, got ${typeCounts.single}`
        );
    }
    if (typeCounts.multiple !== expectedCounts.multipleCount) {
        throw new ApiError(
            500,
            `Expected ${expectedCounts.multipleCount} multiple questions, got ${typeCounts.multiple}`
        );
    }
    if (typeCounts.true_false !== expectedCounts.trueFalseCount) {
        throw new ApiError(
            500,
            `Expected ${expectedCounts.trueFalseCount} true/false questions, got ${typeCounts.true_false}`
        );
    }
    if (typeCounts.connected !== (expectedCounts.passageCount || expectedCounts.connectedCount || 0)) {
        throw new ApiError(
            500,
            `Expected ${expectedCounts.passageCount || expectedCounts.connectedCount || 0} passage sets, got ${typeCounts.connected}`
        );
    }

    const passageCount =
        expectedCounts.passageCount || expectedCounts.connectedCount || 0;
    const expectedPassageSubsPerPassage = {
        single: expectedCounts.passageSingleCount || 0,
        multiple: expectedCounts.passageMultipleCount || 0,
        true_false: expectedCounts.passageTrueFalseCount || 0,
    };
    const expectedPassageSubsTotal = {
        single: expectedPassageSubsPerPassage.single * passageCount,
        multiple: expectedPassageSubsPerPassage.multiple * passageCount,
        true_false: expectedPassageSubsPerPassage.true_false * passageCount,
    };
    const hasPassageSubExpectation =
        expectedPassageSubsPerPassage.single +
            expectedPassageSubsPerPassage.multiple +
            expectedPassageSubsPerPassage.true_false >
        0;
    if (hasPassageSubExpectation) {
        for (let pi = 0; pi < connectedItems.length; pi++) {
            const item = connectedItems[pi];
            const perItem = { single: 0, multiple: 0, true_false: 0 };
            for (const sub of item.subQuestions || []) {
                const st = sub.questionType || "single";
                if (perItem[st] !== undefined) perItem[st] += 1;
            }
            if (perItem.single !== expectedPassageSubsPerPassage.single) {
                throw new ApiError(
                    500,
                    `Passage ${pi + 1}: expected ${expectedPassageSubsPerPassage.single} single sub-question(s), got ${perItem.single}`
                );
            }
            if (perItem.multiple !== expectedPassageSubsPerPassage.multiple) {
                throw new ApiError(
                    500,
                    `Passage ${pi + 1}: expected ${expectedPassageSubsPerPassage.multiple} multiple sub-question(s), got ${perItem.multiple}`
                );
            }
            if (perItem.true_false !== expectedPassageSubsPerPassage.true_false) {
                throw new ApiError(
                    500,
                    `Passage ${pi + 1}: expected ${expectedPassageSubsPerPassage.true_false} true/false sub-question(s), got ${perItem.true_false}`
                );
            }
        }
        if (passageSubCounts.single !== expectedPassageSubsTotal.single) {
            throw new ApiError(
                500,
                `Expected ${expectedPassageSubsTotal.single} single passage sub-questions in total, got ${passageSubCounts.single}`
            );
        }
        if (passageSubCounts.multiple !== expectedPassageSubsTotal.multiple) {
            throw new ApiError(
                500,
                `Expected ${expectedPassageSubsTotal.multiple} multiple passage sub-questions in total, got ${passageSubCounts.multiple}`
            );
        }
        if (passageSubCounts.true_false !== expectedPassageSubsTotal.true_false) {
            throw new ApiError(
                500,
                `Expected ${expectedPassageSubsTotal.true_false} true/false passage sub-questions in total, got ${passageSubCounts.true_false}`
            );
        }
    }

    return parsed;
};

/**
 * Generate question-bank suggestions (single, multiple, true/false) via Gemini.
 */
export const generateQuestionBankSuggestions = async (params) => {
    const {
        topic,
        bankName,
        difficulty,
        singleCount = 0,
        multipleCount = 0,
        trueFalseCount = 0,
        connectedCount = 0,
        passageCount = connectedCount || 0,
        passageSingleCount = 0,
        passageMultipleCount = 0,
        passageTrueFalseCount = 0,
        excludeQuestionTexts = [],
    } = params;

    if (!process.env.GEMINI_API_KEY) {
        throw new ApiError(500, "Gemini API key is not configured (GEMINI_API_KEY)");
    }

    const resolvedPassageCount = passageCount || connectedCount || 0;
    const expectedCounts = {
        singleCount,
        multipleCount,
        trueFalseCount,
        connectedCount: resolvedPassageCount,
        passageCount: resolvedPassageCount,
        passageSingleCount,
        passageMultipleCount,
        passageTrueFalseCount,
    };
    const prompt = buildQuestionBankPrompt({
        topic,
        bankName,
        difficulty,
        singleCount,
        multipleCount,
        trueFalseCount,
        passageCount: resolvedPassageCount,
        passageSingleCount,
        passageMultipleCount,
        passageTrueFalseCount,
        connectedCount: resolvedPassageCount,
        excludeQuestionTexts,
    });

    return callGeminiWithRetries(async () => {
        const result = await genAI.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: {
                responseMimeType: "application/json",
            },
        });

        const text = result.text || "";
        if (!text) {
            throw new ApiError(500, "AI returned empty response");
        }

        return parseQuestionBankAIResponse(text, expectedCounts);
    });
};

export const generateQuestionsWithAI = async (params) => {
    const { topic, subject, classLevel, difficulty, numberOfQuestions } = params;

    const prompt = buildPrompt({
        topic,
        subject,
        classLevel,
        difficulty,
        numberOfQuestions,
    });

    return callGeminiWithRetries(async () => {
        const result = await genAI.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: {
                responseMimeType: "application/json",
            },
        });

        const text = result.text || "";
        if (!text) {
            throw new ApiError(500, "AI returned empty response");
        }

        const parsed = parseJsonArrayFromAI(text);
        const questions = validateSimpleMcqQuestions(parsed);

        return questions.map((q) => ({
            ...q,
            topic,
            subject,
            classLevel,
            difficulty,
        }));
    });
};


export default {
    generateQuestionsWithAI,
    generateQuestionBankSuggestions,
};

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
    const list = (excludeQuestionTexts || [])
        .map((t) => String(t).trim())
        .filter((t) => t.length >= 3)
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
    excludeQuestionTexts = [],
}) => {
    const total = singleCount + multipleCount + trueFalseCount;
    const excludeBlock = formatExcludeBlock(excludeQuestionTexts);
    return `You are an expert educator creating exam questions for an Indian competitive-education platform.

Generate exactly ${total} questions for a question bank with these specifications:

**Question bank name:** ${bankName}
**Topic / syllabus focus:** ${topic}
**Difficulty:** ${difficulty}

**Required counts (generate exactly these numbers):**
- Single correct (one answer): ${singleCount}
- Multiple correct (two or more answers): ${multipleCount}
- True/False: ${trueFalseCount}
${excludeBlock}
**CRITICAL INSTRUCTIONS:**
1. Return ONLY a valid JSON array — no markdown, no code fences, no extra text.
2. Each object must include: questionType, questionText, options, correctAnswer, explanation.
3. questionType must be exactly one of: "single", "multiple", "true_false".
4. For "single": exactly 4 options; correctAnswer is one letter "A", "B", "C", or "D".
5. For "multiple": exactly 4 options; correctAnswer is an array of letters, e.g. ["A","C"] (at least 2 correct).
6. For "true_false": options must be ["True", "False"]; correctAnswer is "True" or "False".
7. Every question MUST have a clear, detailed explanation (minimum one sentence).
8. Questions must be unique within this response AND must not duplicate or closely paraphrase any question listed under "ALREADY SHOWN TO THE USER" above.
9. Questions must be accurate and appropriate for ${difficulty} difficulty.
10. Use Indian curriculum context where relevant (CBSE, JEE, NEET, etc.) when the topic fits.

**FORMATTING RULES (mandatory):**
11. questionText and explanation: plain text only — NO backticks, NO markdown, NO "Option A" phrasing in the stem.
12. options[] values are ANSWER TEXT ONLY — do NOT prefix with "A)", "B.", "(C)", or similar. The app labels options A–D automatically.
13. For "single": each option must be ONE clear answer (a number, expression, or short phrase). Do NOT use ordered pairs like "(1, 3/2)" unless the question explicitly asks for a pair; prefer "1 and 3/2" or ask for one specific root.
14. For "multiple": the questionText MUST include "Select all that apply" (or equivalent). At least ONE option must be incorrect. Never make all four options correct. Avoid "all of the above" / "none of the above".
15. For "multiple": design 2 or 3 correct options and 1 or 2 plausible wrong distractors (common mistakes).
16. For "true_false": options must be exactly ["True", "False"] with no extra wording.

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
    "questionType": "multiple",
    "questionText": "Which of the following are prime numbers? Select all that apply.",
    "options": ["4", "5", "9", "11"],
    "correctAnswer": ["B", "D"],
    "explanation": "5 and 11 are prime; 4 and 9 are composite."
  },
  {
    "questionType": "true_false",
    "questionText": "The sum of angles in a triangle is 180 degrees.",
    "options": ["True", "False"],
    "correctAnswer": "True",
    "explanation": "Euclidean geometry states triangle angle sum is 180°."
  }
]

Generate exactly ${singleCount} single, ${multipleCount} multiple, and ${trueFalseCount} true_false questions. Return ONLY the JSON array.`;
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

const parseQuestionBankAIItem = (q, index) => {
    const questionType = QUESTION_BANK_TYPES[q.questionType]
        ? q.questionType
        : "single";

    if (!q.questionText || !String(q.questionText).trim()) {
        throw new Error(`Question ${index + 1}: questionText is required`);
    }
    if (!q.explanation || !String(q.explanation).trim()) {
        throw new Error(`Question ${index + 1}: explanation is required`);
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
                `Question ${index + 1}: multiple-choice needs at least 2 correct answers`
            );
        }
        if (multipleCorrectIndexes.length >= 4) {
            throw new Error(
                `Question ${index + 1}: multiple-choice cannot have all four options correct`
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
                `Question ${index + 1}: options must be answer text, not bare letters A–D`
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

const parseQuestionBankAIResponse = (rawText, expectedCounts) => {
    const questions = parseJsonArrayFromAI(rawText);

    const expectedTotal =
        expectedCounts.singleCount +
        expectedCounts.multipleCount +
        expectedCounts.trueFalseCount;

    if (questions.length !== expectedTotal) {
        throw new ApiError(
            500,
            `AI returned ${questions.length} questions but ${expectedTotal} were requested`
        );
    }

    const typeCounts = { single: 0, multiple: 0, true_false: 0 };
    const parsed = questions.map((q, i) => {
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
        excludeQuestionTexts = [],
    } = params;

    if (!process.env.GEMINI_API_KEY) {
        throw new ApiError(500, "Gemini API key is not configured (GEMINI_API_KEY)");
    }

    const expectedCounts = { singleCount, multipleCount, trueFalseCount };
    const prompt = buildQuestionBankPrompt({
        topic,
        bankName,
        difficulty,
        singleCount,
        multipleCount,
        trueFalseCount,
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

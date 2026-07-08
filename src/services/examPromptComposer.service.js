/**
 * Meta-prompt composer: uses the saved CLAT setter reference to ask an LLM
 * to write a similar generation prompt for any target exam, then that prompt
 * is used for question generation (prompt-first pipeline).
 */

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { pipelineTrace, pipelineTraceSection } from "../utils/aiApiCallLogger.js";
import { detectExamProfile, detectCatSection } from "./examDifficultyCalibration.js";
import { getExamLabel } from "./examPromptContext.service.js";
import {
    buildJsonOutputBlock,
    passageWordRangeFor,
} from "./examPromptFirst.service.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REFERENCE_PATH = join(
    __dirname,
    "..",
    "..",
    "prompts",
    "clat-setter-reference.txt"
);

export const isPromptComposeEnabled = () => {
    const flag = process.env.AI_QB_PROMPT_COMPOSE;
    if (flag === "0" || flag === "false") return false;
    return true;
};

let cachedReference = null;

export const loadSetterReferencePrompt = () => {
    if (cachedReference) return cachedReference;
    cachedReference = readFileSync(REFERENCE_PATH, "utf8").trim();
    return cachedReference;
};

const cleanComposedPrompt = (raw = "") => {
    let text = String(raw || "").trim();
    text = text.replace(/^```(?:markdown|text)?\s*/i, "").replace(/```\s*$/i, "");
    const lower = text.toLowerCase();
    for (const marker of ["here is the", "below is the", "generated prompt:"]) {
        const idx = lower.indexOf(marker);
        if (idx >= 0 && idx < 80) {
            const lineEnd = text.indexOf("\n", idx);
            if (lineEnd > 0) text = text.slice(lineEnd + 1).trim();
        }
    }
    return text.trim();
};

export const buildPromptComposerMetaPrompt = ({
    referenceText,
    topic = "",
    bankName = "",
    sectionName = "",
    categoryPaths = [],
    subject = "",
    difficulty = "medium",
    singleCount = 0,
    multipleCount = 0,
    trueFalseCount = 0,
    passageCount = 0,
    passageSingleCount = 0,
    passageMultipleCount = 0,
    passageTrueFalseCount = 0,
} = {}) => {
    const examProfile = detectExamProfile({
        topic,
        bankName,
        subject,
        sectionName,
        categoryPaths,
    });
    const catSection = detectCatSection({
        topic,
        bankName,
        sectionName,
        categoryPaths,
    });
    const examLabel = getExamLabel(examProfile, catSection);
    const passageWordRange = passageWordRangeFor(examProfile, catSection);
    const passageSubPerPassage =
        passageSingleCount + passageMultipleCount + passageTrueFalseCount;
    const selectableTotal =
        singleCount +
        multipleCount +
        trueFalseCount +
        passageCount * passageSubPerPassage;

    const formatHint =
        passageCount > 0
            ? `This batch uses ${passageCount} reading passage(s), each with ${passageSubPerPassage} sub-question(s) (${passageSingleCount} single, ${passageMultipleCount} multiple, ${passageTrueFalseCount} true/false per passage). Target ~${passageWordRange} words per passage where applicable.`
            : `This batch uses ${singleCount} standalone single, ${multipleCount} multiple, ${trueFalseCount} true/false items (no reading passages).`;
    const normalizedDifficulty = String(difficulty || "medium").toLowerCase();
    const hardMetaGates =
        normalizedDifficulty === "hard"
            ? `
8. For HARD difficulty, include explicit gates in the composed prompt:
   - >=70% multi-step items (not one-step formula plug-ins),
   - >=40% integrated-concept items,
   - <=10% purely recall/definition/qualitative-only items.
9. Add a final "SELF-CHECK BEFORE OUTPUT" block that forces:
   - options are pairwise distinct,
   - explanation-derived value matches the marked option exactly,
   - no duplicate/near-duplicate options,
   - if any item fails, rewrite that item before output.
`
            : "";

    return `You are an expert exam-paper **prompt engineer**.

Below is a **gold-standard reference prompt** used to generate high-quality CLAT UG mock papers. Study its structure, tone, quality gates, difficulty gradient, and authoring discipline.

=== REFERENCE PROMPT (CLAT — do not copy verbatim; adapt structure and rigor) ===
${referenceText}
=== END REFERENCE ===

**Your task:** Write a **complete question-generation prompt** in the **same style and rigor** as the reference, but adapted for:

- **Exam:** ${examLabel}
- **Topic / bank:** ${topic || bankName}
- **Section:** ${sectionName || "(default)"}
- **Difficulty profile:** ${difficulty}
- The *exact* counts for this generation call (single/multiple/true-false/passage/sub-questions) will be provided ONLY in the JSON appendix that is appended after your prompt.
- Therefore, in your composed prompt, do NOT hardcode any totals (do not say “Total questions: X” / “Target selectable: X” / “Passages: Y” with concrete numbers). Refer to the counts as “see JSON appendix”.

**Requirements for your composed prompt:**
1. Keep sections analogous to the reference: ROLE, TASK, BLUEPRINT (with real numbers), sourcing/rules, DIFFICULTY CALIBRATION (gradient — not flat max hard), QUESTION CONSTRUCTION RULES.
2. Adapt rules to ${examLabel} authentically (e.g. CLAT = principle-in-passage; JEE = solve-then-write numerics; CAT VARC = inference RC; UPSC = analytical elimination).
3. Instruct the generator to write questions **first**, not reverse-engineer from a pre-chosen answer.
4. Require verification of distractors and unambiguous single correct options.
5. **Do NOT** generate any actual questions in your response.
6. **Do NOT** include JSON or API output instructions — a fixed JSON appendix will be added after your prompt.
7. Output **only** the prompt text (no markdown fences, no meta-commentary like "Here is the prompt").${hardMetaGates}`;
};

export const appendJsonOutputToComposedPrompt = (composedBody, params) => {
    const body = String(composedBody || "").trim();
    return `${body}

COUNT OVERRIDE FOR THIS CALL:
- Ignore any totals mentioned earlier in the prompt.
- Produce EXACTLY the counts given in the JSON appendix immediately below.
${buildJsonOutputAppendix(params)}`;
};

const buildJsonOutputAppendix = (params) => {
    const examProfile = detectExamProfile({
        topic: params.topic,
        bankName: params.bankName,
        subject: params.subject,
        sectionName: params.sectionName,
        categoryPaths: params.categoryPaths,
    });
    const catSection = detectCatSection({
        topic: params.topic,
        bankName: params.bankName,
        sectionName: params.sectionName,
        categoryPaths: params.categoryPaths,
    });
    const passageWordRange = passageWordRangeFor(examProfile, catSection);

    const excludeBlock =
        (params.excludeQuestionTexts || []).length > 0
            ? `

**ALREADY SHOWN — do not duplicate or closely paraphrase:**
${params.excludeQuestionTexts
    .slice(0, 40)
    .map((t, i) => `${i + 1}. ${String(t).slice(0, 200)}`)
    .join("\n")}`
            : "";

    return (
        buildJsonOutputBlock({
            singleCount: params.singleCount,
            multipleCount: params.multipleCount,
            trueFalseCount: params.trueFalseCount,
            passageCount: params.passageCount,
            passageSingleCount: params.passageSingleCount,
            passageMultipleCount: params.passageMultipleCount,
            passageTrueFalseCount: params.passageTrueFalseCount,
            passageWordRange,
            requestedDifficulty: params.difficulty || "medium",
            examProfile,
        }) + excludeBlock
    );
};

const saveComposedPromptArtifact = (prompt, { promptBasedGenRun } = {}) =>
    promptBasedGenRun?.save("composed-prompt-full.txt", prompt) || null;

/**
 * Step 1: Ask LLM to compose an exam-setter prompt similar to CLAT reference.
 * Step 2: Append deterministic JSON output block for the API parser.
 */
export const resolveComposedGenerationPrompt = async (
    params,
    { callLlmText, workflowLogKey, promptBasedGenRun } = {}
) => {
    if (!isPromptComposeEnabled()) {
        const { buildPromptFirstQuestionBankPrompt } = await import(
            "./examPromptFirst.service.js"
        );
        const prompt = buildPromptFirstQuestionBankPrompt(params);
        promptBasedGenRun?.save("static-fallback-prompt.txt", prompt);
        return {
            prompt,
            composedBody: null,
            source: "static_fallback",
        };
    }

    if (typeof callLlmText !== "function") {
        throw new Error("resolveComposedGenerationPrompt requires callLlmText");
    }

    const referenceText = loadSetterReferencePrompt();
    const metaPrompt = buildPromptComposerMetaPrompt({
        referenceText,
        ...params,
    });

    pipelineTrace("PROMPT_COMPOSE_START", {
        examProfile: detectExamProfile({
            topic: params.topic,
            bankName: params.bankName,
            sectionName: params.sectionName,
            categoryPaths: params.categoryPaths,
        }),
        metaPromptLength: metaPrompt.length,
    });

    promptBasedGenRun?.save("compose-meta-prompt.txt", metaPrompt);

    const composeTemperature = Math.min(
        1,
        Math.max(0.1, Number(process.env.AI_QB_PROMPT_COMPOSE_TEMPERATURE ?? 0.2))
    );

    const composedRaw = await callLlmText(metaPrompt, {
        temperature: composeTemperature,
    });
    promptBasedGenRun?.save("compose-response.txt", composedRaw);

    const composedBody = cleanComposedPrompt(composedRaw);
    promptBasedGenRun?.save("composed-prompt-body.txt", composedBody);

    const fullPrompt = `${composedBody}\n${buildJsonOutputAppendix(params)}`;

    const savedPath = saveComposedPromptArtifact(fullPrompt, { promptBasedGenRun });

    pipelineTrace("PROMPT_COMPOSE_DONE", {
        composedLength: composedBody.length,
        fullPromptLength: fullPrompt.length,
        savedPath: savedPath || undefined,
    });
    pipelineTraceSection(
        "composed prompt preview",
        [composedBody.slice(0, 1200) + (composedBody.length > 1200 ? "\n…" : "")]
    );

    return {
        prompt: fullPrompt,
        source: "ai_composed",
        composedBody,
        savedPath,
    };
};

/**
 * Repair solve-first skeletons that fail mandate / difficulty audit / MCQ build —
 * fix in place via LLM instead of dropping.
 */

import { parseJsonObjectFromAIText } from "../utils/aiJsonRepair.js";
import { pipelineTrace } from "../utils/aiApiCallLogger.js";
import {
    buildSkeletonGenerationComplianceBlock,
    validateHardSkeletonMandate,
} from "./hardQuestionMandate.service.js";
import { buildSolveFirstSkeletonCorrectnessBlock } from "./examPromptContext.service.js";

const SKELETON_REPAIR_MAX = Math.max(
    1,
    Number(process.env.AI_QB_SKELETON_REPAIR_MAX || 8)
);

export const buildSkeletonRepairPrompt = ({
    skeleton,
    assignedConceptSlot = "",
    examProfile = "jee_main",
    examCalibrated = true,
    mandateIssues = [],
    difficultyReason = "",
    difficultyScore = null,
    buildError = "",
} = {}) => {
    const issues = [
        ...mandateIssues,
        difficultyReason
            ? `Difficulty audit (${difficultyScore ?? "?"}): ${difficultyReason}`
            : "",
        buildError ? `Build error: ${buildError}` : "",
    ].filter(Boolean);

    return `You are **repairing** one exam MCQ skeleton that failed automated quality gates. **Fix the draft** — deepen for veteran examinees; do not replace with an easier template.

**Assigned conceptSlot:** ${assignedConceptSlot || skeleton.conceptSlot || "unknown"}
**Exam profile:** ${examProfile}

${buildSkeletonGenerationComplianceBlock({ examProfile, examCalibrated })}
${buildSolveFirstSkeletonCorrectnessBlock({ examCalibrated })}

**Defects to fix (address every line):**
${issues.map((x, i) => `${i + 1}. ${x}`).join("\n")}

**Failed skeleton (repair — keep same conceptSlot and syllabus focus):**
${JSON.stringify(skeleton, null, 2)}

**Repair rules:**
1. Keep \`conceptSlot\` = "${assignedConceptSlot || skeleton.conceptSlot || ""}".
2. Deepen stem (≥200 chars, ≥3 numeric givens, ≥2 fused concepts) and add ≥5 substantive \`solveSteps\`.
3. Re-solve from stem; \`finalAnswer.display\` must match the last solveStep exactly.
4. Return ONE fixed skeleton object only.

Return ONLY valid JSON:
{
  "skeleton": {
    "conceptSlot": "...",
    "stem": "...",
    "finalAnswer": { "type": "numeric", "value": 0, "display": "0", "unit": "m/s" },
    "solveSteps": ["...", "..."],
    "distractorValues": ["...", "...", "..."]
  }
}`;
};

export const parseRepairedSkeleton = (rawText) => {
    const parsed = parseJsonObjectFromAIText(rawText);
    const sk = parsed?.skeleton || parsed;
    if (!sk?.stem || !sk?.finalAnswer) return null;
    return sk;
};

/**
 * @returns {Promise<object|null>} repaired skeleton or null
 */
export const repairSkeleton = async (
    skeleton,
    {
        assignedConceptSlot = "",
        assignedTier = "hard",
        examProfile = "jee_main",
        examCalibrated = true,
        mandateIssues = [],
        difficultyReason = "",
        difficultyScore = null,
        buildError = "",
    },
    { callLlm }
) => {
    if (!skeleton || typeof callLlm !== "function") return null;

    const prompt = buildSkeletonRepairPrompt({
        skeleton,
        assignedConceptSlot,
        examProfile,
        examCalibrated,
        mandateIssues,
        difficultyReason,
        difficultyScore,
        buildError,
    });

    try {
        const raw = await callLlm(prompt);
        const fixed = parseRepairedSkeleton(raw);
        if (!fixed) return null;

        const mandate = validateHardSkeletonMandate(fixed, assignedTier, {
            examCalibrated: examCalibrated || assignedTier === "hard",
        });
        if (!mandate.ok) {
            pipelineTrace("SKELETON_REPAIR_STILL_FAILS_MANDATE", {
                conceptSlot: fixed.conceptSlot,
                issues: mandate.issues.slice(0, 3).join("; "),
            });
            // Still return — caller may build; second pass optional
        }
        return fixed;
    } catch (err) {
        pipelineTrace("SKELETON_REPAIR_FAILED", {
            error: err?.message || String(err),
            conceptSlot: skeleton.conceptSlot,
        });
        return null;
    }
};

/** Repair skeletons rejected by difficulty self-audit; returns additional skeletons to merge. */
export const repairSkeletonAuditRejections = async (
    rejections = [],
    {
        examProfile = "jee_main",
        examCalibrated = true,
        assignedTier = "hard",
        conceptSlots = [],
    } = {},
    { callLlm }
) => {
    const repaired = [];
    const limit = Math.min(rejections.length, SKELETON_REPAIR_MAX);

    for (const rej of rejections.slice(0, limit)) {
        const sk = rej.skeleton;
        if (!sk) continue;

        const slot =
            conceptSlots[rej.skeletonIndex] ||
            conceptSlots[rej.index - 1] ||
            sk.conceptSlot ||
            "";

        pipelineTrace("SKELETON_DIFFICULTY_REPAIR", {
            index: rej.index ?? rej.skeletonIndex + 1,
            score: rej.difficultyScore,
            conceptSlot: slot,
        });

        const fixed = await repairSkeleton(
            sk,
            {
                assignedConceptSlot: slot,
                assignedTier,
                examProfile,
                examCalibrated,
                difficultyReason: rej.reason || "Too easy for veteran hard tier",
                difficultyScore: rej.difficultyScore,
            },
            { callLlm }
        );

        if (fixed) {
            repaired.push({
                skeleton: fixed,
                skeletonIndex: rej.skeletonIndex ?? rej.index - 1,
            });
        }
    }

    return repaired;
};

export const buildVeteranQuestionDifficultyRepairPrompt = ({
    question,
    difficultyReason = "",
    difficultyScore = null,
    topic = "",
    bankName = "",
    examProfile = "jee_main",
} = {}) => {
    const payload = {
        questionType: question.questionType || "single",
        questionText: question.questionText,
        options: question.options,
        correctIndex: question.correctIndex,
        correctAnswer: question.correctAnswer,
        explanation: question.explanation,
        difficulty: question.difficulty || "hard",
    };

    return `You are **repairing** one veteran-tier ${examProfile} MCQ that scored too low on difficulty (${difficultyScore ?? "?"}).
**Reason:** ${difficultyReason || "Too easy for coaching veterans"}

**Topic:** ${topic || bankName}

Deepen the problem — linked concepts, longer stem, harder reasoning. Keep the same syllabus micro-topic.

**Failed question (fix — do not simplify):**
${JSON.stringify(payload, null, 2)}

Return ONLY valid JSON — one object with questionType, questionText, options (4 strings), correctIndex, explanation.
Explanation must match the marked option exactly.`;
};

/** Repair full MCQs rejected by finalize difficulty self-audit. */
export const repairDifficultyRejectedQuestions = async (
    rejections = [],
    { topic, bankName, examProfile = "jee_main" } = {},
    { callLlm, parseQuestion }
) => {
    const repaired = [];
    const limit = Math.min(rejections.length, SKELETON_REPAIR_MAX);

    for (const rej of rejections.slice(0, limit)) {
        const q = rej.question;
        if (!q) continue;

        pipelineTrace("DIFFICULTY_QUESTION_REPAIR", {
            questionNumber: rej.questionNumber,
            score: rej.difficultyScore,
        });

        try {
            const prompt = buildVeteranQuestionDifficultyRepairPrompt({
                question: q,
                difficultyReason: rej.reason,
                difficultyScore: rej.difficultyScore,
                topic,
                bankName,
                examProfile,
            });
            const raw = await callLlm(prompt);
            const parsed =
                typeof parseQuestion === "function"
                    ? parseQuestion(raw, rej.questionNumber - 1)
                    : parseJsonObjectFromAIText(raw);
            if (parsed?.questionText && Array.isArray(parsed.options)) {
                repaired.push(parsed);
            }
        } catch (err) {
            pipelineTrace("DIFFICULTY_QUESTION_REPAIR_FAILED", {
                questionNumber: rej.questionNumber,
                error: err?.message || String(err),
            });
        }
    }

    return repaired;
};

export default {
    buildSkeletonRepairPrompt,
    parseRepairedSkeleton,
    repairSkeleton,
    repairSkeletonAuditRejections,
    buildVeteranQuestionDifficultyRepairPrompt,
    repairDifficultyRejectedQuestions,
    SKELETON_REPAIR_MAX,
};

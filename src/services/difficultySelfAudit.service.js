/**
 * LLM difficulty self-audit gate — rejects questions scoring below threshold
 * before finalize (4th LLM call in solve-first pipeline).
 */

import { parseJsonObjectFromAIText } from "../utils/aiJsonRepair.js";
import { pipelineTrace } from "../utils/aiApiCallLogger.js";
import { getExamLabel } from "./examPromptContext.service.js";
import { isVeteranDifficultyEnabled } from "./hardQuestionMandate.service.js";

export const DIFFICULTY_SELF_AUDIT_MIN_SCORE = Number(
    process.env.AI_QB_DIFFICULTY_SELF_AUDIT_MIN ||
        (isVeteranDifficultyEnabled() ? 85 : 75)
);

/** Skeletons are rougher than built MCQs — use a lower bar; finalize uses DIFFICULTY_SELF_AUDIT_MIN_SCORE. */
export const SKELETON_DIFFICULTY_SELF_AUDIT_MIN_SCORE = Number(
    process.env.AI_QB_SKELETON_DIFFICULTY_SELF_AUDIT_MIN ||
        (isVeteranDifficultyEnabled() ? 78 : 70)
);

/** When skeleton audit would reject most of a batch, only drop obvious drills below this floor. */
const SKELETON_SELF_AUDIT_RELAXED_FLOOR = Number(
    process.env.AI_QB_SKELETON_SELF_AUDIT_RELAXED_FLOOR || 72
);

const SKELETON_SELF_AUDIT_RELAX_THRESHOLD = Number(
    process.env.AI_QB_SKELETON_SELF_AUDIT_RELAX_THRESHOLD || 0.5
);

export const isDifficultySelfAuditEnabled = () => {
    const flag = process.env.AI_QB_DIFFICULTY_SELF_AUDIT;
    if (flag === "0" || flag === "false") return false;
    return true;
};

const truncate = (text, max = 320) => {
    const s = String(text || "").trim();
    return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
};

const formatQuestionForAudit = (q, index) => {
    const lines = [`#${index + 1}`];
    lines.push(`Stem: ${truncate(q.questionText, 500)}`);
    const steps = q._solveSteps || q.solveSteps;
    if (Array.isArray(steps) && steps.length) {
        lines.push(`Solve steps (${steps.length}):`);
        steps.slice(0, 5).forEach((step, i) => {
            lines.push(`  ${i + 1}. ${truncate(step, 280)}`);
        });
    } else if (q.explanation) {
        lines.push(`Explanation: ${truncate(q.explanation, 600)}`);
    }
    if (q._conceptSlot || q.conceptSlot) {
        lines.push(`Archetype: ${q._conceptSlot || q.conceptSlot}`);
    }
    return lines.join("\n");
};

export const buildDifficultySelfAuditPrompt = ({
    topic = "",
    bankName = "",
    difficulty = "hard",
    examProfile = "jee_main",
    questions = [],
} = {}) => {
    const examLabel = getExamLabel(examProfile);
    const blocks = questions.map((q, i) => formatQuestionForAudit(q, i)).join("\n\n");

    const veteran = isVeteranDifficultyEnabled();
    const veteranRubric = veteran
        ? `
**Veteran examinee bar (repeaters / droppers who solved 1000+ mocks):**
- **90+** — veteran needs 4+ careful minutes; hidden constraint; ≥2 concepts fused; ≥4 linked solve steps; non-obvious distractors
- **80–89** — respectable but one step is formula-heavy or missing a hidden link
- **65–79** — coaching-fresh student could solve; veteran finishes in 2–3 min — **too easy for hard tier**
- **Below 65** — NCERT drill / new-aspirant template / single-formula plug-in — **reject**`
        : `
**Scoring (0–100 per question):**
- **80+** — multi-concept dependency, hidden constraints, indirect inference; ≥3 linked solve steps; no single-formula plug-in
- **60–79** — adequate but one formula-heavy step, thin reasoning, or missing hidden constraint
- **Below 60** — chapter-test / NCERT drill / single-step template`;

    return `You are a ${examLabel} difficulty auditor. Score each question's **exam-native difficulty** for tier **${difficulty}**.

**Topic:** ${topic || bankName}
${veteranRubric}

**Reasoning depth (weight heavily):**
- Hidden constraints or implicit assumptions in the stem
- Two+ syllabus concepts that must be linked (not sequential plug-ins)
- Indirect inference — answer not readable from one formula substitution
- If a coaching veteran would dismiss it as "standard homework" → score ≤60

Penalize: meta draft text ("adjusting", "re-evaluating"), formula-only stems, duplicate template logic.

**Questions:**
${blocks}

Return ONLY valid JSON:
{
  "scores": [
    { "questionNumber": 1, "difficultyScore": 72, "reason": "one-line reason" }
  ]
}`;
};

export const parseDifficultySelfAuditResponse = (rawText, expectedCount = 1) => {
    const parsed = parseJsonObjectFromAIText(rawText);
    const rows = Array.isArray(parsed?.scores) ? parsed.scores : [];
    const byNumber = new Map();
    for (const row of rows) {
        const n = Number(row.questionNumber);
        const score = Number(row.difficultyScore);
        if (!Number.isFinite(n) || n < 1) continue;
        if (!Number.isFinite(score)) continue;
        byNumber.set(n, {
            questionNumber: n,
            difficultyScore: Math.max(0, Math.min(100, Math.round(score))),
            reason: String(row.reason || "").trim(),
        });
    }
    const scores = [];
    for (let i = 1; i <= expectedCount; i++) {
        scores.push(
            byNumber.get(i) || {
                questionNumber: i,
                difficultyScore: 100,
                reason: "not scored",
            }
        );
    }
    return scores;
};

/**
 * Drop questions below minScore. Returns kept list aligned to input order.
 */
export const applyDifficultySelfAuditGate = async (
    questions = [],
    {
        topic = "",
        bankName = "",
        difficulty = "hard",
        examProfile = "jee_main",
        minScore = DIFFICULTY_SELF_AUDIT_MIN_SCORE,
    },
    { callLlm } = {}
) => {
    const singles = (questions || []).filter(
        (q) =>
            String(q?.questionType || "single").toLowerCase() === "single" &&
            String(q?.questionText || "").trim()
    );
    if (!singles.length || !isDifficultySelfAuditEnabled() || typeof callLlm !== "function") {
        return { questions, rejected: [], rejectedCount: 0, scores: [] };
    }

    try {
        const prompt = buildDifficultySelfAuditPrompt({
            topic,
            bankName,
            difficulty,
            examProfile,
            questions: singles,
        });
        const rawText = await callLlm(prompt);
        const scores = parseDifficultySelfAuditResponse(rawText, singles.length);
        const rejectedNumbers = new Set(
            scores
                .filter((s) => s.difficultyScore < minScore)
                .map((s) => s.questionNumber)
        );
        const rejected = [];
        const keptSingles = [];
        singles.forEach((q, i) => {
            const num = i + 1;
            const row = scores[i];
            if (rejectedNumbers.has(num)) {
                rejected.push({
                    questionNumber: num,
                    question: q,
                    difficultyScore: row?.difficultyScore,
                    reason: row?.reason,
                    stem: truncate(q.questionText, 120),
                });
            } else {
                keptSingles.push(q);
            }
        });

        const nonSingles = (questions || []).filter(
            (q) => String(q?.questionType || "single").toLowerCase() !== "single"
        );
        pipelineTrace("DIFFICULTY_SELF_AUDIT", {
            inputCount: singles.length,
            rejectedCount: rejected.length,
            minScore,
            rejected: rejected.slice(0, 8).map((r) => `Q${r.questionNumber}:${r.difficultyScore}`),
        });

        return {
            questions: [...keptSingles, ...nonSingles],
            rejected,
            rejectedCount: rejected.length,
            scores,
        };
    } catch (err) {
        pipelineTrace("DIFFICULTY_SELF_AUDIT_FAILED", {
            error: err?.message || String(err),
        });
        return { questions, rejected: [], rejectedCount: 0, scores: [] };
    }
};

/**
 * Audit skeleton solveSteps before MCQ build — rejects weak skeletons early.
 */
export const applySkeletonDifficultySelfAuditGate = async (
    skeletons = [],
    ctx = {},
    { callLlm } = {}
) => {
    const list = Array.isArray(skeletons) ? skeletons : [];
    if (!list.length || !isDifficultySelfAuditEnabled() || typeof callLlm !== "function") {
        return {
            skeletons: list,
            keptIndices: list.map((_, i) => i),
            rejected: [],
            rejectedCount: 0,
            scores: [],
        };
    }

    const asAuditItems = list.map((sk) => ({
        questionText: String(sk.stem || sk.questionStem || sk.questionText || "").trim(),
        _solveSteps: sk.solveSteps || sk._solveSteps || [],
        _conceptSlot: sk.conceptSlot,
    }));

    const result = await applyDifficultySelfAuditGate(asAuditItems, ctx, { callLlm });
    const minScore = ctx.minScore ?? SKELETON_DIFFICULTY_SELF_AUDIT_MIN_SCORE;
    let effectiveMin = minScore;
    const scoredCount = result.scores.filter((s) => s.reason !== "not scored").length;
    const wouldReject = result.scores.filter(
        (s, i) => i < asAuditItems.length && s.difficultyScore < minScore
    ).length;
    const rejectRatio =
        asAuditItems.length > 0 ? wouldReject / asAuditItems.length : 0;
    if (
        asAuditItems.length >= 3 &&
        rejectRatio >= SKELETON_SELF_AUDIT_RELAX_THRESHOLD
    ) {
        effectiveMin = Math.min(minScore, SKELETON_SELF_AUDIT_RELAXED_FLOOR);
        pipelineTrace("SKELETON_SELF_AUDIT_RELAXED", {
            inputCount: asAuditItems.length,
            wouldReject,
            rejectRatio: Math.round(rejectRatio * 100),
            minScore,
            effectiveMin,
            scoredCount,
        });
    }

    const kept = [];
    const keptIndices = [];
    const rejected = [];
    let auditIdx = 0;
    for (let i = 0; i < list.length; i++) {
        const sk = list[i];
        const hasStem = String(sk.stem || sk.questionStem || sk.questionText || "").trim();
        if (!hasStem) continue;
        const row = result.scores[auditIdx];
        auditIdx += 1;
        if (row && row.difficultyScore < effectiveMin) {
            rejected.push({
                index: i + 1,
                skeletonIndex: i,
                skeleton: sk,
                conceptSlot: sk.conceptSlot,
                difficultyScore: row.difficultyScore,
                reason: row.reason,
            });
        } else {
            kept.push(sk);
            keptIndices.push(i);
        }
    }

    if (rejected.length) {
        pipelineTrace("SKELETON_DIFFICULTY_SELF_AUDIT", {
            inputCount: list.length,
            kept: kept.length,
            rejected: rejected.length,
        });
    }

    return {
        skeletons: kept,
        keptIndices,
        rejected,
        rejectedCount: rejected.length,
        scores: result.scores,
    };
};

export default {
    DIFFICULTY_SELF_AUDIT_MIN_SCORE,
    SKELETON_DIFFICULTY_SELF_AUDIT_MIN_SCORE,
    isDifficultySelfAuditEnabled,
    buildDifficultySelfAuditPrompt,
    parseDifficultySelfAuditResponse,
    applyDifficultySelfAuditGate,
    applySkeletonDifficultySelfAuditGate,
};

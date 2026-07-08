/**
 * Background validation for deferred question-bank generation:
 * finalize → topic/correctness audit → mark bad questions → suggest replacements.
 */

import { pipelineTrace } from "../utils/aiApiCallLogger.js";
import { getPipelineEvents } from "../utils/pipelineEventStore.js";
import {
    finalizeQuestionBankSuggestions,
    validateQuestionTopicRelevance,
    generateQuestionBankSuggestions,
} from "./aiQuestion.service.js";
import { extractRegenerationTargetNumbers } from "./regenerationTargeting.service.js";
import {
    createValidationJob,
    updateValidationJob,
    getValidationJob,
} from "./questionBankValidationJobStore.js";

const collectQuestionStem = (q) => {
    if (!q) return "";
    if (q.questionType === "connected") {
        const parts = [];
        if (q.passage?.trim()) parts.push(q.passage.trim());
        for (const sub of q.subQuestions || []) {
            if (sub.questionText?.trim()) parts.push(sub.questionText.trim());
        }
        return parts.join(" ");
    }
    return String(q.questionText || "").trim();
};

const normalizeStem = (text = "") =>
    String(text || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");

const collectStemsFromQuestions = (questions = []) => {
    const stems = new Set();
    for (const q of questions) {
        const stem = normalizeStem(collectQuestionStem(q));
        if (stem) stems.add(stem);
    }
    return stems;
};

const collectIssueLists = (validation = {}) => [
    ...(validation.confirmedIssues || []),
    ...(validation.correctnessIssues || []),
    ...(validation.outliers || []),
    ...Object.values(validation.issuesByDimension || {}).flat(),
];

const buildQuestionMarks = (rawQuestions = [], finalizedQuestions = [], validation = {}) => {
    const finalizedStems = collectStemsFromQuestions(finalizedQuestions);
    const marks = rawQuestions.map((q, questionIndex) => ({
        questionIndex,
        status: "valid",
        issues: [],
    }));

    rawQuestions.forEach((q, questionIndex) => {
        const stem = normalizeStem(collectQuestionStem(q));
        if (stem && !finalizedStems.has(stem)) {
            marks[questionIndex] = {
                questionIndex,
                status: "rejected",
                issues: [
                    {
                        source: "finalize",
                        issue: "Failed internal quality gates during background validation",
                    },
                ],
            };
        }
    });

    for (const item of collectIssueLists(validation)) {
        const qn = Number(item.questionNumber ?? item.sampleNumber);
        if (!Number.isFinite(qn) || qn < 1) continue;
        const questionIndex = qn - 1;
        if (!marks[questionIndex]) continue;
        const current = marks[questionIndex];
        const nextStatus =
            current.status === "rejected" ? "rejected" : "flagged";
        marks[questionIndex] = {
            ...current,
            status: nextStatus,
            issues: [
                ...current.issues,
                {
                    source: "validation",
                    category: item.category || "",
                    confidence: item.confidence || "confirmed",
                    issue: String(item.issue || item.summary || "").trim(),
                },
            ],
        };
    }

    return marks;
};

const buildReplacementSuggestions = (validation, replacementQuestions = []) => {
    const flawed = [...extractRegenerationTargetNumbers(validation)].sort(
        (a, b) => a - b
    );
    return flawed
        .map((questionNumber, index) => ({
            replacesQuestionIndex: questionNumber - 1,
            replacesQuestionNumber: questionNumber,
            question: replacementQuestions[index] || null,
        }))
        .filter((entry) => entry.question);
};

export const runBackgroundQuestionBankValidation = async (jobId, ctx = {}) => {
    const {
        rawQuestions = [],
        topic,
        bankName,
        difficulty,
        generationProvider = "gemini",
        evaluationProvider = "openai",
        categoryPaths = [],
        sectionName = "",
        subject = "",
        competitiveExamPlan = null,
        examReferenceBlock = "",
        difficultyResolution = null,
        maxSelectableSlots = 0,
        singleCount = 0,
        multipleCount = 0,
        trueFalseCount = 0,
        passageCount = 0,
        passageSingleCount = 0,
        passageMultipleCount = 0,
        passageTrueFalseCount = 0,
        excludeQuestionTexts = [],
    } = ctx;

    updateValidationJob(jobId, { status: "running", phase: "finalize" });
    pipelineTrace("BACKGROUND_VALIDATION_START", {
        jobId,
        questionCount: rawQuestions.length,
    });

    const finalized = await finalizeQuestionBankSuggestions({
        questions: rawQuestions,
        topic,
        bankName,
        difficulty,
        generationProvider,
        excludeQuestionTexts,
        categoryPaths,
        sectionName,
        subject,
        examReferenceBlock,
        competitiveExamPlan,
        generateIntent: "initial",
        maxSelectableSlots,
        allowTopUp: false,
        difficultyResolution,
    });
    const finalizedQuestions = finalized.questions || [];

    updateValidationJob(jobId, { status: "running", phase: "validation" });
    const validation = await validateQuestionTopicRelevance({
        topic,
        bankName,
        subject,
        sectionName,
        difficulty,
        questions: finalizedQuestions,
        alreadyEvaluated: false,
        evaluationProvider,
        competitiveExamPlan,
        categoryPaths,
        singleCount,
        multipleCount,
        trueFalseCount,
        passageCount,
        passageSingleCount,
        passageMultipleCount,
        passageTrueFalseCount,
    });

    const questionMarks = buildQuestionMarks(
        rawQuestions,
        finalizedQuestions,
        validation
    );
    const flawed = extractRegenerationTargetNumbers(validation);

    let replacementSuggestions = [];
    let replacementError = null;
    if (flawed.size > 0) {
        updateValidationJob(jobId, {
            status: "running",
            phase: "replacements",
        });
        pipelineTrace("BACKGROUND_VALIDATION_REGEN", {
            jobId,
            flawedCount: flawed.size,
        });

        try {
            const regenResult = await generateQuestionBankSuggestions({
                topic,
                bankName,
                difficulty,
                singleCount: flawed.size,
                multipleCount: 0,
                trueFalseCount: 0,
                passageCount: 0,
                excludeQuestionTexts: [
                    ...excludeQuestionTexts,
                    ...finalizedQuestions
                        .map((q) => collectQuestionStem(q))
                        .filter(Boolean),
                ],
                categoryPaths,
                sectionName,
                subject,
                topicRelevanceFeedback: validation,
                generateIntent: "evaluation_regen",
                topicRelevanceEvaluated: true,
                topicRelevanceRegenerated: false,
                hasGeneratedQuestions: true,
                competitiveExamPlan,
                generationProvider,
                maxSelectableSlots,
                deferValidation: false,
            });

            replacementSuggestions = buildReplacementSuggestions(
                validation,
                regenResult.questions || []
            );
        } catch (regenErr) {
            replacementError = regenErr?.message || String(regenErr);
            pipelineTrace("BACKGROUND_VALIDATION_REGEN_FAILED", {
                jobId,
                error: replacementError,
            });
        }
    }

    const result = {
        questionMarks,
        finalizeSummary: finalized.stats || {},
        validation,
        replacementSuggestions,
        replacementError,
        finalizedQuestionCount: finalizedQuestions.length,
    };

    pipelineTrace("BACKGROUND_VALIDATION_DONE", {
        jobId,
        markedCount: questionMarks.filter((m) => m.status !== "valid").length,
        replacementCount: replacementSuggestions.length,
    });

    return result;
};

export const startQuestionBankBackgroundValidation = (jobId, ctx = {}) => {
    createValidationJob(jobId, {
        status: "pending",
        phase: "queued",
        topic: ctx.topic || "",
        bankName: ctx.bankName || "",
        workflowLogKey: ctx.workflowLogKey || "",
        questionCount: Array.isArray(ctx.rawQuestions)
            ? ctx.rawQuestions.length
            : 0,
    });

    setImmediate(() => {
        runBackgroundQuestionBankValidation(jobId, ctx)
            .then((result) => {
                updateValidationJob(jobId, {
                    status: "completed",
                    phase: "done",
                    result,
                });
            })
            .catch((error) => {
                pipelineTrace("BACKGROUND_VALIDATION_FAILED", {
                    jobId,
                    error: error?.message || String(error),
                });
                updateValidationJob(jobId, {
                    status: "failed",
                    phase: "error",
                    error: error?.message || String(error),
                });
            });
    });

    return {
        jobId,
        status: "pending",
    };
};

export const getQuestionBankBackgroundValidationStatus = (jobId) => {
    const job = getValidationJob(jobId);
    if (!job) return null;

    const workflowLogKey = String(job.workflowLogKey || "").trim();
    const pipeline =
        workflowLogKey && getPipelineEvents(workflowLogKey, 0);

    return {
        jobId: job.jobId,
        status: job.status,
        phase: job.phase,
        topic: job.topic,
        bankName: job.bankName,
        questionCount: job.questionCount,
        workflowLogKey: workflowLogKey || null,
        pipelineEvents: pipeline?.events || [],
        pipelineEventTotal: pipeline?.total || 0,
        error: job.error || null,
        result: job.result || null,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
    };
};

export default {
    startQuestionBankBackgroundValidation,
    getQuestionBankBackgroundValidationStatus,
    runBackgroundQuestionBankValidation,
};

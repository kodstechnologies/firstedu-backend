import { appendPartialQuestions } from "./pipelineEventStore.js";
import { getActiveWorkflowLogKey, pipelineTrace } from "./aiApiCallLogger.js";
import { sanitizeBankQuestionForPipeline } from "../services/questionSolveFirst.service.js";

/**
 * Push sanitized questions to the live pipeline store so the frontend can show
 * them before the full generation HTTP response completes.
 */
export const publishPartialQuestions = (questions = [], meta = {}) => {
    const workflowLogKey = getActiveWorkflowLogKey();
    if (!workflowLogKey || !Array.isArray(questions) || !questions.length) {
        return [];
    }

    const sanitized = questions
        .map((q, index) => {
            const clean = sanitizeBankQuestionForPipeline(q);
            if (!clean) return null;
            return {
                ...clean,
                _validationStatus: "pending",
                _questionIndex:
                    meta.baseIndex != null ? meta.baseIndex + index : index,
            };
        })
        .filter(Boolean);

    if (!sanitized.length) return [];

    const added = appendPartialQuestions(workflowLogKey, sanitized, meta);
    pipelineTrace("PARTIAL_QUESTIONS_READY", {
        count: sanitized.length,
        total: added.length ? added[added.length - 1].index + 1 : 0,
        phase: meta.phase || "build",
    });
    return sanitized;
};

export default { publishPartialQuestions };

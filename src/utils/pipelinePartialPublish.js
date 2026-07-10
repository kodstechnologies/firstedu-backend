import { appendPartialQuestions } from "./pipelineEventStore.js";
import {
    getActiveWorkflowLogKey,
    getPipelineMaxSelectableSlots,
    pipelineTrace,
} from "./aiApiCallLogger.js";
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

    const maxSlots =
        Number(meta.maxSlots) > 0
            ? Math.floor(Number(meta.maxSlots))
            : getPipelineMaxSelectableSlots();
    if (meta.suppressPartials) {
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

    const added = appendPartialQuestions(workflowLogKey, sanitized, {
        ...meta,
        maxSlots,
    });
    pipelineTrace("PARTIAL_QUESTIONS_READY", {
        count: sanitized.length,
        total: added.length ? added[added.length - 1].index + 1 : 0,
        phase: meta.phase || "build",
        cappedAt: maxSlots > 0 ? maxSlots : undefined,
    });
    return sanitized;
};

export default { publishPartialQuestions };

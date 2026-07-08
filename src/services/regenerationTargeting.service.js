/**
 * Targeted evaluation_regen — replace only failed questions, not the full bank.
 */

const ISSUE_CATEGORY = {
    DIFFICULTY: "difficulty",
    CORRECTNESS: "correctness",
    STYLE: "style",
};

const isConfirmedIssue = (item) =>
    String(item?.confidence || "confirmed").toLowerCase() !== "suspected";

/** Question numbers flagged by evaluate — used to size regen batches. */
export const extractFlawedQuestionNumbers = (feedback = null) => {
    if (!feedback || typeof feedback !== "object") return new Set();

    const numbers = new Set();

    const addFromList = (list = []) => {
        for (const item of list) {
            if (!isConfirmedIssue(item)) continue;
            const qn = Number(item.questionNumber ?? item.sampleNumber);
            if (Number.isFinite(qn) && qn >= 1) numbers.add(qn);
        }
    };

    addFromList(feedback.confirmedIssues);
    addFromList(feedback.correctnessIssues);

    const byDim = feedback.issuesByDimension || {};
    for (const key of Object.keys(byDim)) {
        addFromList(byDim[key]);
    }

    if (Array.isArray(feedback.flawedQuestionNumbers)) {
        for (const n of feedback.flawedQuestionNumbers) {
            const qn = Number(n);
            if (Number.isFinite(qn) && qn >= 1) numbers.add(qn);
        }
    }

    for (const outlier of feedback.outliers || []) {
        const qn = Number(outlier.sampleNumber ?? outlier.questionNumber);
        if (Number.isFinite(qn) && qn >= 1) numbers.add(qn);
    }

    return numbers;
};

/** Prefer difficulty/correctness/style failures for targeted regen. */
export const extractRegenerationTargetNumbers = (feedback = null) => {
    const all = extractFlawedQuestionNumbers(feedback);
    if (!all.size) return all;

    const targeted = new Set();
    const lists = [
        ...(feedback?.issuesByDimension?.difficultyMatch || []),
        ...(feedback?.issuesByDimension?.correctness || []),
        ...(feedback?.issuesByDimension?.style || []),
        ...(feedback?.issuesByDimension?.explanationQuality || []),
        ...(feedback?.correctnessIssues || []),
        ...(feedback?.confirmedIssues || []),
    ];

    for (const item of lists) {
        if (!isConfirmedIssue(item)) continue;
        const cat = String(item.category || "").toLowerCase();
        const qn = Number(item.questionNumber ?? item.sampleNumber);
        if (!Number.isFinite(qn)) continue;
        if (
            cat === ISSUE_CATEGORY.DIFFICULTY ||
            cat === ISSUE_CATEGORY.CORRECTNESS ||
            cat === ISSUE_CATEGORY.STYLE ||
            /difficult|correct|explanation|meta|plug-in|too easy|mismatch/i.test(
                String(item.issue || "")
            )
        ) {
            targeted.add(qn);
        }
    }

    return targeted.size ? targeted : all;
};

const countSelectable = ({
    singleCount = 0,
    multipleCount = 0,
    trueFalseCount = 0,
    passageCount = 0,
    passageSingleCount = 0,
    passageMultipleCount = 0,
    passageTrueFalseCount = 0,
} = {}) => {
    const passageSub =
        passageSingleCount + passageMultipleCount + passageTrueFalseCount;
    return (
        singleCount +
        multipleCount +
        trueFalseCount +
        passageCount * passageSub
    );
};

/**
 * For evaluation_regen: generate only failed-question replacements (not full bank).
 * Replaces the old upscale-to-full-slots behavior.
 */
export const resolveTargetedRegenerationCounts = ({
    generateIntent = "initial",
    topicRelevanceFeedback = null,
    maxSelectableSlots = 0,
    singleCount = 0,
    multipleCount = 0,
    trueFalseCount = 0,
    passageCount = 0,
    passageSingleCount = 0,
    passageMultipleCount = 0,
    passageTrueFalseCount = 0,
} = {}) => {
    const base = {
        singleCount,
        multipleCount,
        trueFalseCount,
        passageCount,
        passageSingleCount,
        passageMultipleCount,
        passageTrueFalseCount,
    };

    if (generateIntent !== "evaluation_regen") return base;

    const requested = countSelectable(base);
    const slotCap = Math.max(1, Number(maxSelectableSlots) || requested || 1);
    const flawed = extractRegenerationTargetNumbers(topicRelevanceFeedback);
    const failedCount = flawed.size;

    if (failedCount > 0 && requested > 0 && requested <= failedCount) {
        return base;
    }

    const replacementCount = Math.min(
        slotCap,
        Math.max(1, failedCount || Math.ceil(slotCap * 0.25))
    );

    if (passageCount > 0) {
        return {
            ...base,
            singleCount: 0,
            multipleCount: 0,
            trueFalseCount: 0,
            passageCount: Math.min(passageCount, replacementCount),
        };
    }

    if (multipleCount > 0 && !singleCount) {
        return {
            ...base,
            singleCount: 0,
            multipleCount: Math.min(multipleCount, replacementCount),
            trueFalseCount: 0,
            passageCount: 0,
        };
    }

    return {
        singleCount: replacementCount,
        multipleCount: 0,
        trueFalseCount: 0,
        passageCount: 0,
        passageSingleCount: 0,
        passageMultipleCount: 0,
        passageTrueFalseCount: 0,
    };
};

export default {
    extractFlawedQuestionNumbers,
    extractRegenerationTargetNumbers,
    resolveTargetedRegenerationCounts,
};

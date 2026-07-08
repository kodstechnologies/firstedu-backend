/**
 * Exam-native generation difficulty — when topic/category indicates a real entrance
 * paper, ignore UI Easy/Medium/Hard and calibrate to that exam's shift-paper standard.
 */

import { detectExamProfile } from "./examDifficultyCalibration.js";
import { resolveExamContextForGeneration } from "./competitiveExamPlan.service.js";
import { getExamLabel } from "./examPromptContext.service.js";
import { normalizeBankDifficulty } from "./difficultyMix.service.js";
import { GENERATE_INTENTS } from "./topicRelevanceValidation.service.js";

/** Minimum bank profile when exam paper context is detected. */
export const EXAM_NATIVE_BANK_DIFFICULTY = {
    jee_main: "hard",
    jee_advanced: "hard",
    neet: "hard",
    cat: "hard",
    competitive: "hard",
    board: null,
};

const buildHaystack = ({
    topic = "",
    bankName = "",
    sectionName = "",
    categoryPaths = [],
} = {}) =>
    `${topic} ${bankName} ${sectionName} ${(categoryPaths || []).join(" ")}`.toLowerCase();

/**
 * True when generation should follow exam paper difficulty (not UI / generic).
 */
export const isExamPaperGenerationContext = ({
    topic = "",
    bankName = "",
    sectionName = "",
    categoryPaths = [],
    competitiveExamPlan = null,
    examProfile = null,
} = {}) => {
    if (competitiveExamPlan?.examProfile) {
        const p = String(competitiveExamPlan.examProfile).toLowerCase();
        if (p && p !== "competitive") return true;
        if (competitiveExamPlan.isFullPaper || competitiveExamPlan.subjects?.length) {
            return true;
        }
    }

    const profile =
        examProfile ||
        detectExamProfile({
            bankName,
            topic,
            sectionName,
            categoryPaths,
        });

    if (["jee_main", "jee_advanced", "neet", "cat"].includes(profile)) {
        return true;
    }

    const hay = buildHaystack({ topic, bankName, sectionName, categoryPaths });

    if (
        /\bcompetitive\s*[>›]|\bjee\s*(?:main|mains|advanced|adv)\b|\bneet\b|\baipmt\b|\bcat\b|\biit\b|\bnta\b|\bupsc\b|\bcsat\b|\bentrance\s*exam\b/i.test(
            hay
        )
    ) {
        return true;
    }

    if (profile === "board") {
        return /\bcbse\b|\bicse\b|\bboard\b|\bclass\s*(?:9|10|11|12)\b/i.test(hay);
    }

    return false;
};

const rationaleFor = (examProfile, examLabel, userDifficulty, bankDifficulty) =>
    `${examLabel} paper detected — all questions generated at **veteran-level hard** (exam-native peak / toughest shift caliber). ` +
    `UI setting "${userDifficulty}" is not used for initial generation.`;

/**
 * Resolve authoritative difficulty for question generation.
 * @returns {{
 *   generationDifficulty: string,
 *   userDifficulty: string,
 *   examCalibrated: boolean,
 *   examProfile: string,
 *   examCtx: object,
 *   source: 'exam_native' | 'user',
 *   rationale: string,
 * }}
 */
export const resolveGenerationDifficulty = ({
    topic = "",
    bankName = "",
    sectionName = "",
    categoryPaths = [],
    subject = "",
    userDifficulty = "medium",
    competitiveExamPlan = null,
    generateIntent = GENERATE_INTENTS.INITIAL,
} = {}) => {
    const user = normalizeBankDifficulty(userDifficulty);
    const examCtx = resolveExamContextForGeneration({
        competitiveExamPlan,
        bankName,
        topic,
        subject,
        sectionName,
        categoryPaths,
    });
    const examProfile = examCtx.examProfile || "competitive";
    const examLabel = getExamLabel(examProfile, examCtx.catSection);

    const base = {
        userDifficulty: user,
        examProfile,
        examCtx,
    };

    if (
        generateIntent === GENERATE_INTENTS.EVALUATION_REGEN ||
        !isExamPaperGenerationContext({
            topic,
            bankName,
            sectionName,
            categoryPaths,
            competitiveExamPlan,
            examProfile,
        })
    ) {
        return {
            ...base,
            generationDifficulty: user,
            examCalibrated: false,
            source: "user",
            rationale: `Using UI difficulty "${user}" (non-exam or regeneration context).`,
        };
    }

    const nativeBank =
        EXAM_NATIVE_BANK_DIFFICULTY[examProfile] ||
        EXAM_NATIVE_BANK_DIFFICULTY.competitive;
    const generationDifficulty = nativeBank || user;

    return {
        ...base,
        generationDifficulty,
        examCalibrated: true,
        source: "exam_native",
        rationale: rationaleFor(
            examProfile,
            examLabel,
            user,
            generationDifficulty
        ),
    };
};

/** Prompt block: exam difficulty overrides UI. */
export const buildExamNativeDifficultyAuthorityBlock = ({
    difficultyResolution,
} = {}) => {
    if (!difficultyResolution?.examCalibrated) return "";

    const {
        generationDifficulty,
        examProfile,
        rationale,
        userDifficulty,
    } = difficultyResolution;
    const examLabel = getExamLabel(
        examProfile,
        difficultyResolution.examCtx?.catSection
    );

    return `
**AUTHORITATIVE EXAM DIFFICULTY (mandatory — overrides UI "${userDifficulty}"):**
- **Exam:** ${examLabel}
- **Every question:** hard — real ${examLabel} shift-paper / peak-mock caliber
- ${rationale}

**Exam difficulty rules:**
1. **All slots are hard** — no easy or medium tiers in this batch.
2. Multi-step stems (4+ reasoning steps) and linked concepts are the default.
3. **Zero** one-formula plug-ins, NCERT in-chapter exercises, or homework-style items.
4. If a draft feels like it belongs in a school test, **rewrite harder** before output.`;
};

export default {
    EXAM_NATIVE_BANK_DIFFICULTY,
    isExamPaperGenerationContext,
    resolveGenerationDifficulty,
    buildExamNativeDifficultyAuthorityBlock,
};

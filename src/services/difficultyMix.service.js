/**
 * Bank-level difficulty (frontend Easy/Medium/Hard) sets the **overall paper profile**.
 *
 * For entrance-exam topics (exam-native), every slot is **hard** — no easy/medium/hard mix.
 * Non-exam banks still use per-tier ratios below.
 */

export const normalizeBankDifficulty = (d) =>
    String(d || "medium").trim().toLowerCase();

/** Per-question tier from AI output or slot assignment. */
export const normalizeQuestionTier = (tier) => {
    const s = String(tier || "").trim().toLowerCase();
    if (s === "easy" || s === "medium" || s === "hard") return s;
    return null;
};

/** All slots hard — used for exam-native generation and hard bank profile. */
export const ALL_HARD_TIER_MIX = { easy: 0, medium: 0, hard: 10 };

/** @type {Record<string, { easy: number, medium: number, hard: number }>} */
export const BANK_DIFFICULTY_MIX_RATIOS = {
    easy: { easy: 5, medium: 3, hard: 2 },
    medium: { easy: 3, medium: 4, hard: 3 },
    hard: ALL_HARD_TIER_MIX,
};

export const isAllHardMix = (mix) =>
    mix &&
    Number(mix.easy) === 0 &&
    Number(mix.medium) === 0 &&
    Number(mix.hard) > 0;

const ratioSum = (ratios) => ratios.easy + ratios.medium + ratios.hard;

/**
 * Allocate easy/medium/hard question counts for a batch of size `batchSize`.
 * @returns {{ easy: number, medium: number, hard: number, bankDifficulty: string, ratioLabel: string }}
 */
export const allocateDifficultyMix = (
    batchSize,
    bankDifficulty = "medium",
    { examProfile = "competitive", examCalibrated = false } = {}
) => {
    const bank = normalizeBankDifficulty(bankDifficulty);
    const ratios = examCalibrated
        ? ALL_HARD_TIER_MIX
        : bank === "hard"
          ? ALL_HARD_TIER_MIX
          : BANK_DIFFICULTY_MIX_RATIOS[bank] || BANK_DIFFICULTY_MIX_RATIOS.medium;
    const n = Math.max(1, Math.round(Number(batchSize) || 1));
    const sum = ratioSum(ratios);

    let easy = Math.round((n * ratios.easy) / sum);
    let medium = Math.round((n * ratios.medium) / sum);
    let hard = n - easy - medium;

    if (hard < 0) {
        const deficit = -hard;
        hard = 0;
        if (medium >= deficit) medium -= deficit;
        else {
            const rem = deficit - medium;
            medium = 0;
            easy = Math.max(0, easy - rem);
        }
        hard = n - easy - medium;
    }

    while (easy + medium + hard > n) {
        if (easy > 0) easy -= 1;
        else if (medium > 0) medium -= 1;
        else break;
    }
    while (easy + medium + hard < n) {
        hard += 1;
    }

    return {
        easy,
        medium,
        hard,
        bankDifficulty: bank,
        ratioLabel: `${ratios.easy}:${ratios.medium}:${ratios.hard}`,
    };
};

/** Spread tiers through the batch — interleave order follows bank profile. */
export const buildDifficultyTierSlots = (
    batchSize,
    bankDifficulty = "medium",
    mixOptions = {}
) => {
    const mix = allocateDifficultyMix(batchSize, bankDifficulty, mixOptions);
    const bank = normalizeBankDifficulty(bankDifficulty);
    const pools = {
        hard: Array(mix.hard).fill("hard"),
        medium: Array(mix.medium).fill("medium"),
        easy: Array(mix.easy).fill("easy"),
    };
    const tierOrder =
        bank === "easy"
            ? ["easy", "medium", "hard"]
            : bank === "hard"
              ? ["hard", "medium", "easy"]
              : ["medium", "hard", "easy"];
    const slots = [];
    const total = mix.easy + mix.medium + mix.hard;
    while (slots.length < total) {
        for (const key of tierOrder) {
            if (pools[key].length && slots.length < total) {
                slots.push(pools[key].shift());
            }
        }
    }
    return slots;
};

/**
 * Absolute exam calibration per difficultyTier.
 *
 * **UPSCALED TIER MAP (platform label → exam band to author):**
 * - easy-tier   → exam **medium** band (shift-paper majority / old "medium")
 * - medium-tier → exam **hard** band (late-section / old "hard")
 * - hard-tier   → **extra hard** (beyond typical late-section; peak mock)
 */
const getTierExamCalibration = (tier, examProfile) => {
    const profile = String(examProfile || "competitive").toLowerCase();
    const isJee = profile === "jee_main" || profile === "jee_advanced";
    const isAdvanced = profile === "jee_advanced";

    if (tier === "easy") {
        if (isAdvanced) {
            return {
                anchor:
                    "Calibrate easy-tier to **Advanced medium band** (typical Paper 1/2 mid-section — upscaled).",
                target: "4–5 steps OR 2–3 linked concepts · ~4–5 min",
                required: [
                    "Insight or constraint that blocks direct formula use",
                    "Non-routine linking across Advanced topics",
                ],
                tooEasy:
                    "Accessible Advanced / Main-speed plug-in, <3 min → below upscaled easy — add depth",
                tooHard:
                    "Deep fusion, 6+ min, late-paper only → **medium-tier** (upscaled hard band) — scope down",
                banned: [
                    "JEE Main template drill",
                    "one-step numerical",
                    "NCERT-style recall",
                ],
            };
        }
        if (isJee) {
            return {
                anchor:
                    "Calibrate easy-tier to **Main medium band** — shift-paper mid-section majority (upscaled; NOT early Section A).",
                target: "3+ steps OR 2 linked topics · ~2.5–3.5 min",
                required: [
                    "Multi-step or two-topic linkage",
                    "Trap distractors from partial / wrong-branch work",
                    "2–4 sentence setup with conditions",
                ],
                tooEasy:
                    "Early Section A / 2-step application / <2 min → **below upscaled easy** — add step or second concept",
                tooHard:
                    "Late Slot-2, 4+ linked ideas, 4+ min → **medium-tier** — narrow the ask",
                banned: [
                    "chapter-test one-step",
                    "NCERT in-chapter drill",
                    "homework worksheet",
                ],
            };
        }
        return {
            anchor: "Calibrate easy-tier to **exam medium band** (upscaled — typical competitive majority).",
            target: "3 steps · 2 concepts · ~2.5–3 min",
            required: ["Multi-step reasoning", "Exam-style traps"],
            tooEasy: "2-step application → below upscaled easy",
            tooHard: "Heavy multi-concept late-section → medium-tier",
            banned: ["tutorial ease", "naked recall"],
        };
    }

    if (tier === "medium") {
        if (isAdvanced) {
            return {
                anchor:
                    "Calibrate medium-tier to **Advanced hard band** — late-paper / Slot-2 insight (upscaled).",
                target: "5+ steps or deep insight · multi-concept fusion · ~5–7 min",
                required: [
                    "Non-obvious intermediate or case analysis",
                    "Would fail if it could sit unchanged in a Main paper",
                ],
                tooEasy:
                    "Advanced mid-paper routine, <4 min → **upscaled easy** — add insight",
                tooHard:
                    "Olympiad-only edge, 8+ min without exam MCQ tone → **hard-tier** — keep IIT MCQ form",
                banned: ["JEE Main formula drill", "single-template solve"],
            };
        }
        if (isJee) {
            return {
                anchor:
                    "Calibrate medium-tier to **Main hard band** — late-section / tough-shift (upscaled).",
                target: "4+ steps · linked concepts · ~3.5–5 min",
                required: [
                    "Multi-condition stem",
                    "Planning before calculation — not one memorized template",
                    "Late-slot cognitive load",
                ],
                tooEasy:
                    "Mid-section 3-step only → **upscaled easy** — add constraints or linked ideas",
                tooHard:
                    "Peak olympiad-style without MCQ feasibility → **hard-tier**",
                banned: [
                    "one standard formula in <2 min",
                    "coaching chapter exercise",
                ],
            };
        }
        return {
            anchor: "Calibrate medium-tier to **exam hard band** (upscaled — late-section caliber).",
            target: "4+ steps · linked ideas · ~4 min",
            required: ["Multi-condition setup", "Non-routine traps"],
            tooEasy: "3-step mid-section → upscaled easy",
            tooHard: "Peak beyond paper → hard-tier",
            banned: ["single-formula plug-in"],
        };
    }

    if (isAdvanced) {
        return {
            anchor:
                "Calibrate hard-tier to **extra hard Advanced** — Paper 2 peak / toughest IIT MCQ (beyond typical late-section).",
            target: "6+ steps · deep fusion · parameter/case analysis · ~7–10 min",
            required: [
                "Non-routine insight — multiple Advanced ideas interlocked",
                "Cannot be reduced to Main or mid-Advanced template",
                "Hardest defensible Advanced MCQ (not olympiad proof)",
            ],
            tooEasy:
                "Typical Advanced late-section only → **upscaled medium** — add fusion or case depth",
            tooHard: "n/a — this is the ceiling; stay MCQ-solvable",
            banned: [
                "Main-level item with hard label",
                "memorised single-template",
                "unbounded proof-style",
            ],
        };
    }
    if (isJee) {
        return {
            anchor:
                "Calibrate hard-tier to **extra hard Main** — toughest shift / Advanced-leaning peak (beyond typical late-section).",
            target: "5+ steps · multi-concept fusion · case/parameter tracking · ~5–7 min",
            required: [
                "Would stump most Main candidates — still fair MCQ",
                "Linked PCM or deep single-subject synthesis",
                "Non-obvious planning before any calculation",
            ],
            tooEasy:
                "Standard late-section hard only → **upscaled medium** — add fusion or constraints",
            tooHard: "n/a — peak mock MCQ; must have one definite answer in four options",
            banned: [
                "repeat of medium-tier with harder numbers only",
                "homework challenge without exam tone",
            ],
        };
    }
    return {
        anchor: "Calibrate hard-tier to **extra hard** — beyond typical late-section for this exam.",
        target: "5+ steps · peak cognitive load · ~5+ min",
        required: ["Multi-concept fusion", "Non-routine insight"],
        tooEasy: "Late-section hard only → upscaled medium",
        tooHard: "n/a — peak MCQ",
        banned: ["formula drill"],
    };
};

const formatTierCalibration = (tier, examProfile) => {
    const c = getTierExamCalibration(tier, examProfile);
    return [
        c.anchor,
        `Target: ${c.target}.`,
        `REQUIRED: ${c.required.join("; ")}.`,
        `Too easy for ${tier}-tier → ${c.tooEasy}`,
        `Too hard for ${tier}-tier → ${c.tooHard}`,
        `BANNED: ${c.banned.join("; ")}.`,
    ].join(" ");
};

const tierCalibrationSnippet = (tier, examProfile) =>
    formatTierCalibration(tier, examProfile);

/** Return at most `maxSlots` questions when bank cap is set (0 = no cap). */
export const capQuestionsToMaxSlots = (questions = [], maxSlots = 0) => {
    if (!Array.isArray(questions)) return [];
    const cap = Number(maxSlots);
    if (!Number.isFinite(cap) || cap < 1) return questions;
    return questions.slice(0, Math.floor(cap));
};

/** Count selectable question slots (standalones + passage sub-questions). */
export const countSelectableSlots = ({
    singleCount = 0,
    multipleCount = 0,
    trueFalseCount = 0,
    passageCount = 0,
    passageSingleCount = 0,
    passageMultipleCount = 0,
    passageTrueFalseCount = 0,
} = {}) => {
    const passageSub =
        (passageSingleCount || 0) +
        (passageMultipleCount || 0) +
        (passageTrueFalseCount || 0);
    return (
        (singleCount || 0) +
        (multipleCount || 0) +
        (trueFalseCount || 0) +
        (passageCount || 0) * passageSub
    );
};

/** What bank Easy/Medium/Hard means for the overall paper (not school difficulty). */
export const buildBankDifficultyProfileBlock = ({
    bankDifficulty = "medium",
    examProfile = "competitive",
} = {}) => {
    const bank = normalizeBankDifficulty(bankDifficulty);
    const examLabel =
        examProfile === "jee_advanced"
            ? "JEE Advanced"
            : examProfile === "jee_main"
              ? "JEE Main"
              : examProfile === "neet"
                ? "NEET UG"
                : examProfile === "cat"
                  ? "CAT"
                  : "competitive entrance";

    const profiles = {
        easy:
            examProfile === "jee_advanced"
                ? `**Bank "easy"** = Advanced mock with **upscaled easy-tier = old Advanced medium** (4–5 steps, linked concepts). No Main-level items.`
                : examProfile === "jee_main"
                  ? `**Bank "easy"** = **upscaled** — easy-tier slots = **Main mid-section** (3+ steps, 2 topics). NOT early Section A / NCERT ease.`
                  : `**Bank "easy"** = upscaled — easy-tier = old exam-medium band; still competitive, not school.`,
        medium:
            examProfile === "jee_advanced"
                ? `**Bank "medium"** = **upscaled** — medium-tier = **Advanced late-section / old hard** (5–7 min, insight).`
                : examProfile === "jee_main"
                  ? `**Bank "medium"** = **upscaled** — medium-tier = **Main late-section / tough shift** (4+ steps, linked ideas).`
                  : `**Bank "medium"** = upscaled — medium-tier = old exam-hard band.`,
        hard:
            examProfile === "jee_advanced"
                ? `**Bank "hard"** = **extra hard** mock — hard-tier = Paper 2 peak / toughest IIT MCQ (beyond typical late-section).`
                : examProfile === "jee_main"
                  ? `**Bank "hard"** = **extra hard** — hard-tier = peak shift + Advanced-leaning synthesis (~5–7 min).`
                  : `**Bank "hard"** = extra hard — beyond typical late-section; fusion + insight dominant.`,
    };

    return `
**BANK DIFFICULTY PROFILE — "${bank}" (${examLabel}) — UPSCALED TIERS:**
Platform labels map to harder exam bands: **easy-tier = exam medium · medium-tier = exam hard · hard-tier = extra hard**.
${profiles[bank] || profiles.medium}

Each slot must hit its **upscaled** band (see PER-TIER EXAM CALIBRATION).`;
};

/** Compact per-tier band reference for prompts and evaluation. */
export const buildPerTierExamCalibrationBlock = ({
    examProfile = "competitive",
    hardOnly = false,
} = {}) => {
    const examLabel =
        examProfile === "jee_advanced"
            ? "JEE Advanced"
            : examProfile === "jee_main"
              ? "JEE Main"
              : String(examProfile || "competitive").replace(/_/g, " ");

    if (hardOnly) {
        return `
**EXAM CALIBRATION (${examLabel}) — every question is HARD:**
${formatTierCalibration("hard", examProfile)}

**Gate:** No Section A / NCERT drill / one-formula plug-ins. Every item must meet peak shift-paper caliber.`;
    }

    return `
**PER-TIER EXAM CALIBRATION (${examLabel}) — UPSCALED: easy=exam medium · medium=exam hard · hard=extra hard:**

**easy-tier** (authors at **medium** band) — ${formatTierCalibration("easy", examProfile)}

**medium-tier** (authors at **hard** band) — ${formatTierCalibration("medium", examProfile)}

**hard-tier** (authors at **extra hard** band) — ${formatTierCalibration("hard", examProfile)}

**Tier gate:** Match the **upscaled** band for each slot — easy-tier must NOT feel like old exam-easy / Section A; hard-tier must exceed typical late-section.`;
};

/** Numbered per-slot tier assignment — one tier per question/sub-question. */
export const buildAssignedTierSlotsBlock = ({
    tierSlots = [],
    examProfile = "competitive",
    slotOffset = 0,
} = {}) => {
    if (!tierSlots.length) return "";

    const allHard = tierSlots.every((t) => normalizeQuestionTier(t) === "hard");
    if (allHard) {
        const start = slotOffset + 1;
        const end = slotOffset + tierSlots.length;
        return `
**ASSIGNED difficultyTier PER SLOT (mandatory):**
Slots ${start}–${end}: every question is **hard** — ${tierCalibrationSnippet("hard", examProfile)}

Set \`"difficultyTier": "hard"\` on every item. Do not author easy or medium items.`;
    }

    const lines = tierSlots
        .map((tier, i) => {
            const n = slotOffset + i + 1;
            return `${n}. **[${tier}-tier]** — author to the **${tier}-tier** definition in DIFFICULTY MIX / tier calibration above`;
        })
        .join("\n");

    return `
**ASSIGNED difficultyTier PER SLOT (mandatory — JSON difficultyTier must match slot number):**
${lines}

**Per-slot rule:** Question *i* must match its **upscaled** band (easy=exam medium · medium=exam hard · hard=extra hard). Use the "Too easy" / "Too hard" notes above — not school drill, not old exam-easy on an easy slot.

Author question *i* at exactly the tier shown for slot *i*. Do not downgrade tier to simplify authoring.`;
};

export { tierCalibrationSnippet, getTierExamCalibration, formatTierCalibration };

/**
 * Single-tier scoring rubric for LLM difficulty audit — mirrors getTierExamCalibration.
 */
export const buildTierDifficultyScoringRubric = (
    tier = "medium",
    examProfile = "competitive"
) => {
    const t = normalizeQuestionTier(tier) || "medium";
    const c = getTierExamCalibration(t, examProfile);
    return `**${t}-tier scoring**
- **80–100 (meets tier):** ${c.target}; REQUIRED: ${c.required.join("; ")}
- **65–79 (borderline):** Close but missing one REQUIRED element; not a BANNED pattern
- **Below 65 (too easy for ${t}-tier):** ${c.tooEasy}
- **Below 50 (reject):** BANNED — ${c.banned.join("; ")}
- **Above-tier depth:** If harder than ${t}-tier (${c.tooHard}) but still meets ${t} REQUIRED → score 80+; do not penalize`;
};

/**
 * Shared tier definitions + per-tier scoring — used in generation prompts and validation/audit.
 */
export const buildDifficultyAuditRubricsBlock = ({
    examProfile = "competitive",
    tiers = ["easy", "medium", "hard"],
    hardOnly = false,
} = {}) => {
    const unique = [
        ...new Set(
            (tiers || [])
                .map((t) => normalizeQuestionTier(t))
                .filter(Boolean)
        ),
    ];
    const ordered = ["easy", "medium", "hard"].filter((t) => unique.includes(t));
    const useHardOnly =
        hardOnly || (ordered.length === 1 && ordered[0] === "hard");

    const definitionsBlock = buildPerTierExamCalibrationBlock({
        examProfile,
        hardOnly: useHardOnly,
    });

    const scoringTiers = useHardOnly ? ["hard"] : ordered.length ? ordered : ["easy", "medium", "hard"];
    const scoringBlock = scoringTiers
        .map((t) => buildTierDifficultyScoringRubric(t, examProfile))
        .join("\n\n");

    return `${definitionsBlock}

**VALIDATION SCORING — same tier bands as generation (score each item against its assigned difficultyTier):**
${scoringBlock}

**Scoring rules (generation and audit must agree):**
- Score against the item's **assigned difficultyTier**, not subjective "feels hard"
- Lengthy single-formula calculation ≠ hard-tier unless it meets that tier's REQUIRED bars
- Multi-concept analytical fusion with hidden constraints = hard-tier even if the stem is compact
- easy-tier = exam medium band · medium-tier = exam hard band · hard-tier = extra hard (upscaled map)`;
};

/**
 * Prompt block: bank difficulty → per-question tier mix (mandatory).
 */
export const buildDifficultyMixGenerationBlock = ({
    bankDifficulty = "medium",
    batchSize = 10,
    examProfile = "competitive",
    examCalibrated = false,
} = {}) => {
    const bank = normalizeBankDifficulty(bankDifficulty);
    const mix = allocateDifficultyMix(batchSize, bankDifficulty, {
        examProfile,
        examCalibrated,
    });
    const examLabel =
        examProfile === "jee_advanced"
            ? "JEE Advanced"
            : examProfile === "jee_main"
              ? "JEE Main"
              : String(examProfile || "competitive").replace(/_/g, " ");

    const tierCriteriaBlock = buildDifficultyAuditRubricsBlock({
        examProfile,
        tiers: isAllHardMix(mix) ? ["hard"] : ["easy", "medium", "hard"],
        hardOnly: isAllHardMix(mix),
    });

    if (isAllHardMix(mix)) {
        return `
**DIFFICULTY — ${examCalibrated ? `exam-native (${examLabel})` : `bank profile "${bank}"`}: ALL HARD**
This batch has **${batchSize}** question slot(s). **Every** slot is **hard** — real ${examLabel} shift-paper / peak-mock caliber. There are no easy or medium slots.

**Requirements for every question:**
- ${tierCalibrationSnippet("hard", examProfile)}
- Multi-condition stems, linked concepts, or non-obvious planning — not naked formula drills.
- No NCERT in-chapter exercises, Section A one-liners, or homework worksheets.

**JSON requirement:** Every standalone item and passage sub-question MUST include \`"difficultyTier": "hard"\`.

${tierCriteriaBlock}`;
    }

    const easyPct = Math.round((mix.easy / Math.max(1, batchSize)) * 100);
    const mediumPct = Math.round((mix.medium / Math.max(1, batchSize)) * 100);
    const hardPct = Math.round((mix.hard / Math.max(1, batchSize)) * 100);

    return `
**DIFFICULTY MIX — bank profile "${bank}" (ratio ${mix.ratioLabel} easy:medium:hard per 10 ≈ ${easyPct}% easy · ${mediumPct}% medium · ${hardPct}% hard):**
This batch has **${batchSize}** question slot(s). Author **exactly** this tier distribution:
- **${mix.easy}** question(s) at **easy-tier** — must meet easy-tier criteria below (NOT school easy / old exam Section A)
- **${mix.medium}** question(s) at **medium-tier** — must meet medium-tier criteria below
- **${mix.hard}** question(s) at **hard-tier** — must meet hard-tier criteria below

**JSON requirement:** Every standalone item and every passage sub-question MUST include:
\`"difficultyTier": "easy" | "medium" | "hard"\`
matching the assigned slot.

${tierCriteriaBlock}

**Authoring rule:** Match each slot to the tier definitions above — validation uses the **same** criteria.`;
};

/** Assign difficulty labels to parsed questions when AI omitted difficultyTier. */
export const assignDifficultyTiersToQuestions = (
    questions = [],
    bankDifficulty = "medium",
    mixOptions = {}
) => {
    const flatCount = (questions || []).reduce((acc, q) => {
        if (q.questionType === "connected" && Array.isArray(q.subQuestions)) {
            return acc + q.subQuestions.length;
        }
        return acc + 1;
    }, 0);

    const slots = buildDifficultyTierSlots(flatCount, bankDifficulty, mixOptions);
    let slotIndex = 0;

    const nextTier = () => slots[slotIndex++] || "medium";

    return (questions || []).map((q) => {
        if (q.questionType === "connected" && Array.isArray(q.subQuestions)) {
            const subQuestions = q.subQuestions.map((sub) => ({
                ...sub,
                difficulty: nextTier(),
            }));
            return { ...q, subQuestions };
        }
        return { ...q, difficulty: nextTier() };
    });
};

export const normalizeDifficultyMixForPlan = (bankDifficulty = "medium", slotTarget = 10) =>
    allocateDifficultyMix(slotTarget, bankDifficulty);

/**
 * Solve-first question generation: LLM produces verified skeletons;
 * code builds options and locks the answer key.
 */

import { parseJsonArrayFromAIText, parseJsonObjectFromAIText, salvageParseJsonArrayObjects } from "../utils/aiJsonRepair.js";
import { pipelineTrace } from "../utils/aiApiCallLogger.js";
import { publishPartialQuestions } from "../utils/pipelinePartialPublish.js";
import {
    buildCorrectnessFirstGenerationBlock,
    buildExamSolveThenWriteBlock,
    buildGenerationCorrectnessMandatesBlock,
    buildSolveFirstSkeletonCorrectnessBlock,
    buildExplanationOptionLockBlock,
    buildAutomatedAuditorDefectsBlock,
    buildPreOutputCorrectnessChecklist,
    buildChemistryNumericalAuthoringBlock,
    buildPhysicsNumericalAuthoringBlock,
    buildJeeAuthenticityGenerationBlock,
    buildVeteranExamineeCaliberBlock,
} from "./examPromptContext.service.js";
import { buildDifficultyCalibrationBlock } from "./examDifficultyCalibration.js";
import {
    independentlyVerifyQuestion,
    verifySkeletonAnswer,
    parseNumber,
    formatValueForOption,
    buildOptionsAroundExpected,
} from "./questionNumericVerify.service.js";
import { detectExamProfile } from "./examDifficultyCalibration.js";
import { isJeeFullPaperTopic } from "./examPromptContext.service.js";
import { buildExamSpecificRules } from "./examPromptFirst.service.js";
import { resolveSubjectForGeneration } from "./subjectDetection.js";
import {
    buildDifficultyMixGenerationBlock,
    buildDifficultyTierSlots,
    buildBankDifficultyProfileBlock,
    buildAssignedTierSlotsBlock,
} from "./difficultyMix.service.js";
import { buildExamNativeDifficultyAuthorityBlock } from "./examGenerationDifficulty.service.js";
import {
    buildRegenerationEscalationBlock,
    buildRegenerationQualityGatesBlock,
    GENERATE_INTENTS,
    inferSolveStepsFromExplanation,
} from "./topicRelevanceValidation.service.js";
import {
    getHybridizationForFormula,
    hybridizationMatches,
    POLAR_MOLECULES,
    ZERO_DIPOLE_MOLECULES,
} from "./chemistryFacts.service.js";
import {
    buildBatchArchetypeGuidanceBlock,
    buildJeeHardStemAuthoringBlock,
    buildJeeMainHardAntiTemplateBlock,
    buildSubjectArchetypeSelectionBlock,
    buildBankArchetypeExcludeBlock,
    allocateRankedConceptSlots,
} from "./conceptArchetypeGuidance.service.js";
import {
    buildHardQuestionMandateBlock,
    buildSkeletonGenerationComplianceBlock,
    buildVeteranExamNativeGenerationBlock,
    validateHardSkeletonMandate,
    isVeteranDifficultyEnabled,
    isExamNativeVeteranGeneration,
    isMandateRepairEnabled,
    getHardMandateFloors,
    isStemProfile,
} from "./hardQuestionMandate.service.js";
import {
    isBatchStemNearDuplicate,
    registerBatchStem,
    assertGenerationCorrectness,
} from "./correctnessPreAudit.service.js";
import {
    repairSkeleton,
    repairSkeletonAuditRejections,
} from "./skeletonRepair.service.js";
import { stripMetaCommentary } from "../utils/stripMetaCommentary.js";

export { stripMetaCommentary };

export const SOLVE_FIRST_MAX_ATTEMPTS = Math.min(
    8,
    Math.max(
        1,
            Number(
                process.env.AI_QB_SOLVE_FIRST_MAX_ATTEMPTS ??
                    (isMandateRepairEnabled() ? 3 : 4)
            )
    )
);

/** Caps per-skeleton repair LLM calls within a single skeletonsToQuestions() pass — bounds worst-case tail latency on a bad batch instead of one call per failure. */
const MAX_SKELETON_REPAIR_CALLS_PER_BATCH = Math.max(
    1,
    Number(process.env.AI_QB_MAX_SKELETON_REPAIR_CALLS ?? 4)
);

export const isSolveFirstEnabled = () => {
    const flag = process.env.AI_QB_SOLVE_FIRST;
    if (flag === "0" || flag === "false") return false;
    return true;
};

/** One archetype per slot; peak-difficulty pool for hard banks; slotOffset avoids chunk repeats. */
export const allocateConceptSlots = (
    count,
    {
        examProfile = "competitive",
        subjectId = "",
        slotOffset = 0,
        subjects = null,
        preferPeak = false,
        bankDifficulty = "medium",
        examCalibrated = false,
        excludeArchetypes = [],
    } = {}
) =>
    allocateRankedConceptSlots(count, {
        examProfile,
        subjectId,
        slotOffset,
        subjects,
        preferPeak: preferPeak || examCalibrated,
        bankDifficulty,
        excludeArchetypes,
        maxPerArchetype:
            isVeteranDifficultyEnabled() && examCalibrated ? 1 : 2,
    });

export const shouldUseSolveFirstGeneration = ({
    singleCount = 0,
    multipleCount = 0,
    trueFalseCount = 0,
    passageCount = 0,
    generateIntent = "initial",
    competitiveExamPlan = null,
    topic = "",
    bankName = "",
    categoryPaths = [],
    sectionName = "",
    subject = "",
} = {}) => {
    if (!isSolveFirstEnabled()) return false;
    const standalones = singleCount + multipleCount + trueFalseCount;
    if (passageCount > 0) return false;
    if (multipleCount > 0 || trueFalseCount > 0) return false;
    if (!standalones) return false;

    if (competitiveExamPlan?.isFullPaper) return false;
    if (
        Array.isArray(competitiveExamPlan?.subjects) &&
        competitiveExamPlan.subjects.length > 1
    ) {
        return false;
    }

    const fullPaperCtx = { topic, bankName, categoryPaths, sectionName };
    if (isJeeFullPaperTopic(fullPaperCtx)) return false;

    const profile = String(competitiveExamPlan?.examProfile || "").toLowerCase();
    if (
        (profile === "jee_main" || profile === "jee_advanced") &&
        isJeeFullPaperTopic(fullPaperCtx)
    ) {
        return false;
    }

    // Standalone (non-passage) requests always go through solve-first now —
    // exam-domain rigor (STEM concept clusters vs. generic reasoning-depth
    // checks) is decided downstream by validateHardQuestionMandate via
    // isStemProfile(), not here.
    return true;
};

export const buildSolveFirstSkeletonPrompt = ({
    topic,
    bankName,
    difficulty,
    count,
    conceptSlots = [],
    difficultyTierSlots = [],
    excludeQuestionTexts = [],
    excludeArchetypes = [],
    categoryPaths = [],
    sectionName = "",
    subject = "",
    examProfile = "competitive",
    examReferenceBlock = "",
    difficultyResolution = null,
    slotOffset = 0,
    slotPlans = null,
    archetypeSteeringSource = "catalog",
    generateIntent = GENERATE_INTENTS.INITIAL,
    topicRelevanceFeedback = null,
    maxSelectableSlots = 0,
    referenceCalibrationBlock = "",
}) => {
    const referencePaperGroundingBlock = referenceCalibrationBlock
        ? `\n**REFERENCE PAPER — DIFFICULTY FLOOR TO EXCEED:** an actual past paper for this exam was analyzed; observed difficulty pattern: ${referenceCalibrationBlock}\nThis is a FLOOR, not a target — every question you write must be strictly MORE difficult than that observed pattern (deeper concept fusion, tighter time pressure, less telegraphed setups). Do not merely replicate the reference paper's level, and do not use it to constrain which topics/slots you write about — the concept slots above are independently planned.\n`
        : "";
    const mixOpts = difficultyResolution?.examCalibrated
        ? { examProfile, examCalibrated: true }
        : {};
    const examNativeVeteran = isExamNativeVeteranGeneration(difficultyResolution);
    const examNativeBlock = buildExamNativeDifficultyAuthorityBlock({
        difficultyResolution,
    });
    const slotLines = conceptSlots
        .slice(0, count)
        .map((s, i) => {
            const tier = difficultyTierSlots[i] || "hard";
            const plan = slotPlans?.[i];
            const label = plan?.label ? ` — ${plan.label}` : "";
            return difficultyResolution?.examCalibrated
                ? `${i + 1}. [hard] ${s}${label}`
                : `${i + 1}. [${tier}-tier] ${s}${label}`;
        })
        .join("\n");

    const excludeBlock =
        excludeQuestionTexts.length > 0
            ? `\n**Excluded stems (do not repeat topic OR structural template):**\n${excludeQuestionTexts
                  .slice(0, 30)
                  .map((t, i) => `${i + 1}. ${String(t).slice(0, 200)}`)
                  .join("\n")}
Each new skeleton must use a **different problem structure** from every excluded stem — not the same setup with different numbers.\n`
            : "";

    const isEvaluationRegen =
        generateIntent === GENERATE_INTENTS.EVALUATION_REGEN &&
        topicRelevanceFeedback;

    const chemBlock =
        examProfile === "jee_main" ||
        examProfile === "jee_advanced" ||
        examProfile === "neet" ||
        String(subject || "").toLowerCase().includes("chem")
            ? buildChemistryNumericalAuthoringBlock({ examProfile })
            : "";

    const physicsBlock =
        examProfile === "jee_main" ||
        examProfile === "jee_advanced" ||
        examProfile === "neet" ||
        String(subject || "").toLowerCase().includes("phys")
            ? buildPhysicsNumericalAuthoringBlock({ examProfile })
            : "";

    const isNonStemDomain = !isStemProfile(examProfile, subject);

    const nonStemAnswerTypeBlock = isNonStemDomain
        ? `\n**NON-NUMERIC ANSWER TYPE:** If this subject has no numeric solve, set \`finalAnswer.type = "text"\`, \`finalAnswer.display\` = the correct statement/option text (not a number), and \`distractorValues\` = exactly 3 plausible but wrong statements on the same point of law/fact/reasoning (not vague filler — a well-prepared candidate should have to actually eliminate them). If the stem IS quantitative (e.g. CAT Quantitative Ability), keep \`finalAnswer.type = "numeric"\` as usual.\n`
        : "";

    // Standalone (non-passage) generation only reaches here, so the passage-
    // oriented CLAT/CAT VARC/DILR guidance in buildExamSpecificRules mostly
    // falls through to its generic branches for these profiles — still
    // useful for register/difficulty framing on the standalone items that
    // DO reach solve-first (e.g. CLAT Legal Reasoning principle-application,
    // CAT QA, UPSC Prelims standalone facts).
    const nonStemExamRulesBlock = isNonStemDomain
        ? buildExamSpecificRules({ examProfile, sectionName, passageCount: 0 })
        : "";

    const isJeeStem =
        examProfile === "jee_main" || examProfile === "jee_advanced";
    const jeeHardBlock = isJeeStem
        ? buildJeeHardStemAuthoringBlock(examProfile)
        : "";

    const aiSteered =
        archetypeSteeringSource === "ai" ||
        archetypeSteeringSource === "ai_partial";
    const archetypeBatchBlock = buildBatchArchetypeGuidanceBlock({
        conceptSlots: conceptSlots.slice(0, count),
        slotPlans: slotPlans?.slice(0, count) || null,
        difficultyTierSlots: difficultyTierSlots.slice(0, count),
        examProfile,
        slotOffset,
        aiSteered,
    });

    const preferPeak =
        !aiSteered &&
        (difficultyResolution?.examCalibrated ||
            String(difficulty || "").toLowerCase() === "hard");
    const archetypeSelectionBlock = preferPeak
        ? buildSubjectArchetypeSelectionBlock({
              conceptSlots: conceptSlots.slice(0, count),
              subjectId: subject || bankName || topic,
              examProfile,
              preferPeak,
          })
        : aiSteered
          ? `
**AI ARCHETYPE STEERING:** Slots and blueprints for this batch were planned for "${topic || bankName}" — use the assigned slot id in each skeleton's \`conceptSlot\` field. Do not swap to an easier archetype.`
          : "";

    const jeeHardAntiTemplate = isJeeStem
        ? buildJeeMainHardAntiTemplateBlock(examProfile)
        : "";

    const jeeAuthenticityBlock = isJeeStem
        ? buildJeeAuthenticityGenerationBlock({
              examProfile,
              difficulty,
              batchSize: count,
              sectionName,
          })
        : "";

    const difficultyCalibrationBlock = buildDifficultyCalibrationBlock({
              bankName,
              topic,
              subject,
              difficulty,
              batchSize: count,
              categoryPaths,
              sectionName,
          });

    const effectiveTier = difficultyResolution?.examCalibrated
        ? "hard"
        : difficulty;
    const hardMandateBlock = buildHardQuestionMandateBlock({
        examProfile,
        tier: effectiveTier,
        examCalibrated: difficultyResolution?.examCalibrated || false,
    });
    const skeletonComplianceBlock = examNativeVeteran
        ? ""
        : buildSkeletonGenerationComplianceBlock({
              examProfile,
              examCalibrated: difficultyResolution?.examCalibrated || false,
          });
    const veteranExamNativeBlock = examNativeVeteran
        ? buildVeteranExamNativeGenerationBlock({
              examProfile,
              batchSize: count,
          })
        : "";
    const mandateFloors = getHardMandateFloors({
        examCalibrated: difficultyResolution?.examCalibrated || false,
    });
    const veteranCaliberBlock = examNativeVeteran
        ? ""
        : buildVeteranExamineeCaliberBlock({ examProfile });

    const bankArchetypeExcludeBlock = buildBankArchetypeExcludeBlock(
        excludeArchetypes
    );

    const regenEscalationBlock = isEvaluationRegen
        ? buildRegenerationEscalationBlock({
              topic,
              bankName,
              sectionName,
              categoryPaths,
              examProfile,
              topicRelevanceFeedback,
              maxSelectableSlots,
          })
        : "";
    const regenQualityGatesBlock = isEvaluationRegen
        ? buildRegenerationQualityGatesBlock({
              topic,
              bankName,
              examProfile,
              topicRelevanceFeedback,
              maxSelectableSlots,
              generateIntent: GENERATE_INTENTS.EVALUATION_REGEN,
          })
        : "";

    return `${regenEscalationBlock}${regenQualityGatesBlock}${veteranExamNativeBlock}You are authoring ${count} exam MCQ **skeletons** (step 1 of 2). Do NOT write options or correctAnswer letters yet.

**Topic:** ${topic || bankName}
**Bank difficulty profile:** ${difficulty}${difficultyResolution?.examCalibrated ? " (exam-native — all hard, veteran caliber)" : " (per-question tier mix — NOT uniform)"}
${
    examNativeVeteran
        ? ""
        : `${buildDifficultyMixGenerationBlock({
              bankDifficulty: difficulty,
              batchSize: count,
              examProfile,
              examCalibrated: difficultyResolution?.examCalibrated || false,
          })}
${examNativeBlock}
${buildBankDifficultyProfileBlock({ bankDifficulty: difficulty, examProfile })}
${buildAssignedTierSlotsBlock({
    tierSlots: difficultyTierSlots.slice(0, count),
    examProfile,
})}`
}
**Exam profile:** ${examProfile}
${examReferenceBlock}
${referencePaperGroundingBlock}
${jeeAuthenticityBlock}
${difficultyCalibrationBlock}
${jeeHardBlock}
${jeeHardAntiTemplate}
${examNativeVeteran ? "" : `${hardMandateBlock}\n${skeletonComplianceBlock}\n${veteranCaliberBlock}`}
${archetypeSelectionBlock}
${archetypeBatchBlock}

${buildCorrectnessFirstGenerationBlock({ examProfile })}
${buildGenerationCorrectnessMandatesBlock({ examProfile })}
${buildAutomatedAuditorDefectsBlock({ examProfile })}
${buildSolveFirstSkeletonCorrectnessBlock({
    examCalibrated: difficultyResolution?.examCalibrated || false,
})}
${buildExplanationOptionLockBlock({ examProfile })}
${chemBlock}
${physicsBlock}
${nonStemExamRulesBlock}
${nonStemAnswerTypeBlock}
${buildExamSolveThenWriteBlock()}

**MANDATORY concept slots (one distinct problem per slot — no duplicates; ${aiSteered ? "AI-planned" : "catalog"} archetypes assigned):**
${slotLines || `Generate ${count} distinct problems.`}
Each slot name is a **hard archetype from this subject** — write its peak blueprint, not the easy textbook version of the topic.

${excludeBlock}
${bankArchetypeExcludeBlock}

**TASK:** For each slot, read its blueprint above, solve completely, then output skeletons only.

**Rules (every skeleton):**
1. Match the slot's **${examProfile === "jee_main" || examProfile === "jee_advanced" ? "shift-paper hard" : "entrance hard"}** blueprint — multi-condition stem, linked concepts, realistic givens.
2. **finalAnswer** = exact solved result (numeric with unit, hybridization string, molecule formula, or — for non-numeric subjects — \`type: "text"\` with the correct statement as \`display\`).
3. **solveSteps** = **≥${mandateFloors.minSolutionLines}** substantive sentences for hard tier (minimum **${mandateFloors.minSolveSteps}** steps); each step advances the solve; the **last sentence must state the same value as \`finalAnswer.display\`** (full derivation — these become the explanation).
4. **distractorValues** = exactly 3 plausible wrong values (same unit/type as finalAnswer); pH distractors 0–14 only.
5. For hybridization: finalAnswer.display like "sp³d²" (Unicode superscripts OK).
6. For zero-dipole items: finalAnswer.type = "molecule", display = formula like "CO2".
7. Verify arithmetic before output — re-solve from stem givens; wrong finalAnswer or solveSteps≠finalAnswer breaks the question.
8. No duplicate logic across skeletons (different numbers, setups, and micro-topics).
9. Stems: ${
        mandateFloors.veteran
            ? `**≥4 sentences, ≥200 characters**, **≥3 distinct numeric givens** with units, constraint linking two concepts before the ask`
            : `**3–4 sentences**, ≥2 numerical givens with units, constraint or linking phrase before the ask`
    }.
10. **Hard-tier depth (mandatory):** **≥${mandateFloors.minConcepts} concepts** in stem vocabulary, **≥${mandateFloors.minSolveSteps} solveSteps**, **≥${mandateFloors.minSolutionLines} derivation lines**, **no direct substitution** — see SKELETON COMPLIANCE above.
11. **Option craft:** never use a bare number from the stem as an option (if stem gives f = 20 cm, no option "20 cm").
12. **No meta commentary** in solveSteps — never write "re-evaluating", "correcting", or "wait"; solve once cleanly.
13. **Batch diversity:** every skeleton must use a **different micro-topic and problem structure** — no two pulley-incline, lens-contact, or de Broglie-ratio clones in the same batch.
14. **Per-slot concept fusion:** read the assigned \`conceptSlot\` blueprint — the stem must explicitly weave **both** fused ideas from that archetype (e.g. viscosity + terminal velocity + thermal; wavefront + refractive gradient; photoelectric + momentum recoil).

${buildPreOutputCorrectnessChecklist({ examProfile })}

Return ONLY valid JSON:
{
  "skeletons": [
    {
      "conceptSlot": "buffer_henderson_hasselbalch",
      "stem": "Full question stem with all given data and units",
      "finalAnswer": {
        "type": "numeric",
        "value": 5.04,
        "display": "5.04",
        "unit": ""
      },
      "solveSteps": ["Step 1 with full reasoning …", "Step 2 …", "Step 3 …", "Step 4 …", "Step 5 concluding with the same value as finalAnswer.display …"],
      "distractorValues": ["4.74", "5.34", "5.74"]
    }
  ]
}

Output exactly ${count} skeleton(s) in the array.`;
};

export const parseSolveFirstSkeletons = (rawText) => {
    let parsed = null;
    try {
        parsed = parseJsonObjectFromAIText(rawText);
    } catch {
        parsed = null;
    }

    let list = parsed?.skeletons || parsed?.items || parsed?.questions;
    if (!Array.isArray(list)) {
        try {
            list = parseJsonArrayFromAIText(rawText);
        } catch {
            list = null;
        }
    }

    if (!Array.isArray(list) || !list.length) {
        const skIdx = String(rawText || "").indexOf('"skeletons"');
        const salvageSource = skIdx >= 0 ? rawText.slice(skIdx) : rawText;
        const salvaged = salvageParseJsonArrayObjects(salvageSource);
        if (salvaged.length) list = salvaged;
    }

    return (list || []).filter((s) => s?.stem && s?.finalAnswer);
};

/** Distractors must not repeat bare givens from the stem (e.g. stem "f = 20 cm" → no option "20 cm"). */
const optionEmbeddedInStem = (stem, optText) => {
    const opt = String(optText || "").trim();
    if (!opt || !stem) return false;
    const stemText = String(stem);
    if (stemText.includes(opt)) return true;
    const m = opt.match(/^(-?\d+(?:\.\d+)?)\s*(.*)$/);
    if (!m) return false;
    const [, num, unit] = m;
    const unitPat = unit.trim()
        ? new RegExp(`\\b${num.replace(".", "\\.")}\\s*${unit.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i")
        : new RegExp(`\\b${num.replace(".", "\\.")}\\b`);
    return unitPat.test(stemText);
};

const sanitizeStemEmbeddedOptions = (stem, options, correctIndex) => {
    const list = [...(options || [])];
    const correct = list[correctIndex];
    const correctNum = parseNumber(correct);
    let bump = 0;
    for (let i = 0; i < list.length; i++) {
        if (i === correctIndex) continue;
        if (!optionEmbeddedInStem(stem, list[i])) continue;
        bump += 1;
        if (Number.isFinite(correctNum)) {
            const factor = 1 + bump * 0.12 * (i > correctIndex ? 1 : -1);
            list[i] = formatValueForOption(
                correctNum * factor,
                String(correct).replace(/^-?\d+(?:\.\d+)?/, "").trim()
            );
        }
    }
    return list;
};

const shuffleWithSeed = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
};

const isPhStem = (stem = "") =>
    /\bph\b|\bpka\b|\bbuffer\b|\bhenderson/i.test(String(stem || ""));

const optionContainsNumeric = (optText, value) => {
    const target = parseNumber(value);
    const fromOpt = parseNumber(optText);
    if (!Number.isFinite(target) || !Number.isFinite(fromOpt)) {
        return String(optText || "").includes(String(value || "").trim());
    }
    return (
        Math.abs(fromOpt - target) <= Math.max(0.05, Math.abs(target) * 0.02) ||
        String(optText).includes(String(value))
    );
};

const findOptionIndexForNumericValue = (opts, value) => {
    const target = parseNumber(value);
    if (!Number.isFinite(target)) return -1;
    return (opts || []).findIndex((o) => {
        const n = parseNumber(o);
        if (!Number.isFinite(n)) return false;
        return (
            Math.abs(n - target) <= Math.max(0.05, Math.abs(target) * 0.02) ||
            (target !== 0 && Math.abs(n - target) / Math.abs(target) <= 0.02)
        );
    });
};

/** After independent verify adjusts the answer, align solveSteps so explanation matches marked option. */
const syncSolveStepsToMarkedAnswer = (solveSteps, markedOptionText) => {
    const marked = String(markedOptionText || "").trim();
    if (!marked || !Array.isArray(solveSteps) || !solveSteps.length) {
        return solveSteps;
    }
    const steps = solveSteps.map((s) => String(s || "").trim()).filter(Boolean);
    const last = steps.length - 1;
    const cleaned = String(steps[last])
        .replace(/\s*Therefore,?\s*the\s+(?:correct\s+)?(?:answer|result)\s+is\s+[^.]+[.]?$/i, "")
        .trim();
    steps[last] = cleaned
        ? `${cleaned} Therefore, the correct answer is ${marked}.`
        : `Therefore, the correct answer is ${marked}.`;
    return steps;
};

/** Explanation: numbered solve steps + closing with the marked option. */
const lockExplanationToMarkedOption = (solveSteps, markedOptionText) => {
    const marked = String(markedOptionText || "").trim();
    const steps = (solveSteps || []).map(String).map(stripMetaCommentary).filter(Boolean);
    const body =
        steps.length > 1
            ? steps.map((s, i) => `Step ${i + 1}: ${s}`).join(" ")
            : steps.join(" ").trim();
    if (!marked) {
        return body.slice(0, 1400) || "See calculation above.";
    }
    const closing = body
        ? `${body} Therefore, the correct answer is ${marked}.`
        : `Therefore, the correct answer is ${marked}.`;
    return closing.slice(0, 1400);
};

const sanitizePhOptions = (options, correctIndex) => {
    const list = [...(options || [])];
    const correct = parseNumber(list[correctIndex]);
    const correctPh = Number.isFinite(correct) && correct >= 0 && correct <= 14;

    for (let i = 0; i < list.length; i++) {
        const bare = String(list[i] || "").trim().match(/^(\d+(?:\.\d+)?)\s*$/);
        if (!bare) continue;
        const val = Number(bare[1]);
        if (!Number.isFinite(val) || (val >= 0 && val <= 14)) continue;
        if (i === correctIndex && correctPh) continue;
        const replacement = correctPh
            ? Math.max(0, Math.min(14, correct + (i - correctIndex) * 0.4))
            : 7 + i * 0.3;
        list[i] = replacement.toFixed(2);
    }
    return list;
};

/**
 * Parse a numeric value from a string, handling ×10^n superscript notation
 * (e.g. "1.70×10⁵") in addition to whatever parseNumber already handles.
 */
const parseNumericWithSuperscript = (str) => {
    const s = String(str || "").trim();
    const sciMatch = s.match(/^(-?\d+(?:\.\d+)?)\s*[×x\*]\s*10([⁰¹²³⁴⁵⁶⁷⁸⁹⁻\-\d]+)/i);
    if (sciMatch) {
        const base = parseFloat(sciMatch[1]);
        const expStr = sciMatch[2];
        const expMap = { '⁰':'0','¹':'1','²':'2','³':'3','⁴':'4','⁵':'5',
                         '⁶':'6','⁷':'7','⁸':'8','⁹':'9','⁻':'-' };
        const exponent = parseInt(
            expStr.split('').map(c => expMap[c] ?? c).join(''),
            10
        );
        const result = base * Math.pow(10, exponent);
        if (Number.isFinite(result)) return result;
    }
    return parseNumber(s);
};

/**
 * Extract final-result candidates from a solve-step string array.
 *
 * Two tiers:
 *
 *   HIGH-PRIORITY — conclusion keywords: "therefore/thus/hence/the answer is …"
 *   These are the strongest signal that a value is the final answer, regardless
 *   of what variable name precedes it. Domain-agnostic.
 *
 *   LOW-PRIORITY (fallback) — the last "= VALUE" assignment in the last step.
 *   Used only when no conclusion keyword is present. We take the LAST step's
 *   last numeric assignment, not every intermediate "a = 9.8" across all steps,
 *   to avoid treating setup constants as final answers.
 *
 * Returns { highPri: [{value, display}], lastEq: {value, display} | null }.
 */
const extractSolveStepResults = (solveSteps) => {
    const NUM_TOKEN_SRC = '(-?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?(?:\\s*[×x\\*]\\s*10[⁰¹²³⁴⁵⁶⁷⁸⁹⁻\\-\\d]+)?)';

    // High-priority: conclusion keywords anywhere across all steps
    const allText = solveSteps.map(s => String(s || "")).join(" ");
    const conclusionRe = new RegExp(
        `\\b(?:therefore|thus|hence|the\\s+(?:correct\\s+)?(?:answer|result|value)\\s+is|gives?|yields?|equals?)\\s*(?:is|are|=)?\\s*${NUM_TOKEN_SRC}`,
        'gi'
    );
    const highPri = [];
    for (const m of allText.matchAll(conclusionRe)) {
        const v = parseNumericWithSuperscript(m[1]);
        if (Number.isFinite(v)) highPri.push({ value: v, display: m[1].trim() });
    }

    // Low-priority fallback: last "= VALUE" in the last step only
    const lastStepText = String(solveSteps[solveSteps.length - 1] || "");
    const eqRe = new RegExp(`=${NUM_TOKEN_SRC}`, 'g');
    let lastEq = null;
    for (const m of lastStepText.matchAll(eqRe)) {
        const v = parseNumericWithSuperscript(m[1]);
        if (Number.isFinite(v)) lastEq = { value: v, display: m[1].trim() };
    }

    return { highPri, lastEq };
};

/**
 * Returns true if `computed` is close enough (within 2 % or 0.05 absolute)
 * to any of the provided numeric option values.
 */
const computedMatchesAnyOption = (computed, optionNumerics) => {
    const tol = Math.max(0.05, Math.abs(computed) * 0.02);
    return optionNumerics.some(n => Number.isFinite(n) && Math.abs(n - computed) <= tol);
};

const assertSolveStepsConsistency = ({ _solveSteps, options, correctIndex }) => {
    if (!Array.isArray(_solveSteps) || !_solveSteps.length) return;

    const marked = options[correctIndex];
    const markedNumeric = parseNumber(marked);
    if (!Number.isFinite(markedNumeric)) return;

    const optionNumerics = options.map(o => parseNumber(o));
    const { highPri, lastEq } = extractSolveStepResults(_solveSteps);

    // Pick best candidate: conclusion keywords beat last-step fallback
    const candidate = highPri.length ? highPri[highPri.length - 1] : lastEq;
    if (!candidate) return;

    const tol = Math.max(0.05, Math.abs(candidate.value) * 0.02);
    const markedMatchesCandidate = Math.abs(markedNumeric - candidate.value) <= tol;

    // --- Failure A: candidate matches a DIFFERENT option (wrong key) ---
    if (!markedMatchesCandidate) {
        const matchesOther = options.some((opt, idx) => {
            if (idx === correctIndex) return false;
            const n = parseNumber(opt);
            return Number.isFinite(n) && Math.abs(n - candidate.value) <= tol;
        });
        if (matchesOther) {
            throw new Error(
                `Solve steps compute ${candidate.display} but marked answer is ${marked} — wrong option marked`
            );
        }
    }

    // --- Failure B: candidate (high-priority only) differs from marked by > 15%
    //     and doesn't match any option — calculation doesn't support the key ---
    if (!markedMatchesCandidate && highPri.length &&
        !computedMatchesAnyOption(candidate.value, optionNumerics)) {
        const relDiff = markedNumeric !== 0
            ? Math.abs(candidate.value - markedNumeric) / Math.abs(markedNumeric)
            : Math.abs(candidate.value);
        if (relDiff > 0.15 && Math.abs(candidate.value - markedNumeric) > 1) {
            throw new Error(
                `Solve steps compute ${candidate.display} but marked answer is ${marked} — calculation does not match any option`
            );
        }
    }

    // --- Failure C: explicit "therefore/thus/hence NUMBER" != marked ---
    const allText = _solveSteps.map(s => String(s || "")).join(" ");
    const NUM_TOKEN_SRC = '(-?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?(?:\\s*[×x\\*]\\s*10[⁰¹²³⁴⁵⁶⁷⁸⁹⁻\\-\\d]+)?)';
    const conclusionRe = new RegExp(
        `\\b(?:therefore|thus|hence)\\s*(?:the\\s+(?:correct\\s+)?(?:answer|result|value)\\s+is\\s+)?${NUM_TOKEN_SRC}`,
        'gi'
    );
    for (const m of allText.matchAll(conclusionRe)) {
        const asserted = parseNumericWithSuperscript(m[1]);
        if (!Number.isFinite(asserted)) continue;
        const assertTol = Math.max(0.05, Math.abs(asserted) * 0.02);
        if (Math.abs(asserted - markedNumeric) > assertTol &&
            computedMatchesAnyOption(asserted, optionNumerics)) {
            throw new Error(
                `Solve steps assert "${m[1].trim()}" via conclusion keyword but marked answer is ${marked}`
            );
        }
    }
};

const assertBuiltMcqConsistency = ({ questionText, options, correctIndex, explanation, _solveSteps }) => {
    const marked = options[correctIndex];
    if (!marked) throw new Error("Missing marked option");

    const normOpts = options
        .map((o) => String(o || "").trim().toLowerCase())
        .filter(Boolean);
    if (normOpts.length >= 2 && new Set(normOpts).size !== normOpts.length) {
        throw new Error("Two or more options are identical");
    }

    if (isPhStem(questionText)) {
        for (let i = 0; i < options.length; i++) {
            const bare = String(options[i] || "").trim().match(/^(\d+(?:\.\d+)?)\s*$/);
            if (!bare) continue;
            const val = Number(bare[1]);
            if (Number.isFinite(val) && (val < 0 || val > 14)) {
                throw new Error(`Invalid pH option: ${options[i]}`);
            }
        }
    }

    // NEW: Deep validation of solve steps before explanation text checks
    assertSolveStepsConsistency({ _solveSteps, options, correctIndex });

    const tail = String(explanation || "").slice(-220);
    const bodyBeforeTherefore = String(explanation || "").split(/\bTherefore\b/i)[0] || "";
    const deriveMatches = [
        ...bodyBeforeTherefore.matchAll(/=\s*(-?\d+(?:\.\d+)?)\s*(?:W|J|N|m\/s(?:²)?|eV|mm|cm)?/gi),
    ];
    if (deriveMatches.length) {
        const lastDeriv = deriveMatches[deriveMatches.length - 1][1];
        const inMarked = optionContainsNumeric(marked, lastDeriv);
        const inAny = options.some((o) => optionContainsNumeric(o, lastDeriv));
        if (inAny && !inMarked) {
            throw new Error(
                `Explanation derives ${lastDeriv} but marked option is ${marked}`
            );
        }
    }

    const nums = [...tail.matchAll(/(?:=|is|are|gives?|yields?|equals?)\s*(-?\d+(?:\.\d+)?)/gi)];
    if (nums.length) {
        const lastVal = nums[nums.length - 1][1];
        const inMarked = optionContainsNumeric(marked, lastVal);
        const inAny = options.some((o) => optionContainsNumeric(o, lastVal));
        if (!inAny) {
            throw new Error(
                `Explanation derives ${lastVal} but that value is not among options`
            );
        }
        if (!inMarked) {
            throw new Error(
                `Explanation concludes ${lastVal} but marked option is ${marked}`
            );
        }
    }

    const body = String(explanation || "");
    const bodyAsserts = [
        ...body.matchAll(
            /\b(?:molarity|molality|pH|time)\b\s*=\s*(-?\d+(?:\.\d+)?)/gi
        ),
    ];
    for (const m of bodyAsserts) {
        const val = m[1];
        if (!optionContainsNumeric(marked, val) && !options.some((o) => optionContainsNumeric(o, val))) {
            throw new Error(
                `Explanation asserts ${val} but that value is not among options`
            );
        }
    }
};

const buildHybridizationDistractors = (correct) => {
    const pool = ["sp", "sp²", "sp³", "sp³d", "sp³d²", "sp³d³"];
    const out = [correct];
    for (const p of pool) {
        if (!hybridizationMatches(p, correct) && out.length < 4) out.push(p);
    }
    while (out.length < 4) out.push(`sp³d${out.length}`);
    return shuffleWithSeed(out.slice(0, 4));
};

const buildMoleculeDistractors = (correct) => {
    const polar = [...POLAR_MOLECULES].map((f) =>
        f === "H2O" ? "H2O" : f === "NH3" ? "NH3" : f
    );
    const zeros = [...ZERO_DIPOLE_MOLECULES].filter((f) => f !== correct.toUpperCase().replace(/\s/g, ""));
    const distractors = [];
    for (const p of polar) {
        if (distractors.length >= 3) break;
        if (p !== correct.toUpperCase()) distractors.push(p);
    }
    while (distractors.length < 3 && zeros.length) {
        distractors.push(zeros.shift());
    }
    const options = shuffleWithSeed([correct, ...distractors.slice(0, 3)]);
    return options;
};

const buildNumericDistractors = (display, distractorValues = [], unit = "") => {
    const correct = String(display || "").trim();
    const raw = distractorValues.map(String).filter((d) => d && d !== correct);
    const unique = [...new Set(raw)];
    while (unique.length < 3) {
        const n = parseNumber(correct);
        if (Number.isFinite(n)) {
            const offsets = [0.85, 1.15, 1.5];
            unique.push(formatValueForOption(n * offsets[unique.length], unit));
        } else {
            unique.push(`${correct} (alt ${unique.length + 1})`);
        }
    }
    return shuffleWithSeed([correct, ...unique.slice(0, 3)]);
};

/** Non-numeric (non-STEM) answers — the model's own distractorValues are the
 * wrong options directly; there's no arithmetic offset to synthesize for a
 * legal/GK statement, so unlike buildNumericDistractors this never invents
 * filler options. Throws if fewer than 3 usable distractors survive, which
 * routes the skeleton to the existing repair queue like any other build failure. */
const buildTextDistractors = (display, distractorValues = []) => {
    const correct = String(display || "").trim();
    const unique = [
        ...new Set(
            distractorValues
                .map((d) => String(d || "").trim())
                .filter((d) => d && d.toLowerCase() !== correct.toLowerCase())
        ),
    ];
    if (unique.length < 3) {
        throw new Error(
            `text answer needs 3 distinct distractorValues (found ${unique.length})`
        );
    }
    return shuffleWithSeed([correct, ...unique.slice(0, 3)]);
};

export const buildMcqFromSkeleton = (
    skeleton,
    index = 0,
    assignedTier = "medium",
    assignedConceptSlot = ""
) => {
    const stem = String(skeleton.stem || "").trim();
    const tier = String(assignedTier || skeleton.difficultyTier || "medium").toLowerCase();
    const solveSteps = (skeleton.solveSteps || [])
        .map(String)
        .map(stripMetaCommentary)
        .filter(Boolean);
    let fa = { ...(skeleton.finalAnswer || {}) };

    const preCheck = independentlyVerifyQuestion({
        questionText: stem,
        options: [
            String(fa.display ?? fa.value ?? ""),
            ...(skeleton.distractorValues || []).map(String),
        ].filter(Boolean).slice(0, 4),
        correctIndex: 0,
    });
    if (preCheck.expected?.display) {
        fa = {
            ...fa,
            display: preCheck.expected.display,
            value: preCheck.expected.value,
            unit: preCheck.expected.unit || fa.unit,
            type: preCheck.expected.type || fa.type,
        };
    }

    const type = String(fa.type || "numeric").toLowerCase();
    const display = String(fa.display ?? fa.value ?? "").trim();
    const unit = String(fa.unit || "").trim();
    const distractorValues = skeleton.distractorValues || [];

    // Anchored to actual hybridization notation (sp, sp², sp³d² …) — a loose
    // /sp/ substring test also matches ordinary English words ("response",
    // "special", "disproportionation"), which corrupted non-STEM text
    // answers into chemistry notation. type !== "text" keeps explicit text
    // answers out of this branch even if their display happens to match.
    const looksLikeHybridizationNotation =
        type !== "text" && /^sp[¹²³⁰-⁹\d]{0,3}(?:d[¹²³⁰-⁹\d]{0,2})?$/i.test(display);

    let options;
    if (type === "hybridization" || looksLikeHybridizationNotation) {
        const mol = stem.match(/\b([A-Z][A-Za-z₀-₉\d]{1,8})\b/)?.[1];
        const verified = mol ? getHybridizationForFormula(mol) : null;
        const correct = verified || display;
        options = buildHybridizationDistractors(correct);
    } else if (type === "molecule") {
        options = buildMoleculeDistractors(display);
    } else if (type === "text") {
        options = buildTextDistractors(display, distractorValues);
    } else {
        const formatted =
            display || formatValueForOption(parseNumber(fa.value), unit);
        options = buildNumericDistractors(formatted, distractorValues, unit);
    }

    let correctIndex = options.findIndex((o) => {
        if (type === "hybridization") return hybridizationMatches(o, display);
        if (type === "molecule") {
            return (
                String(o).replace(/\s/g, "").toUpperCase() ===
                display.replace(/\s/g, "").toUpperCase()
            );
        }
        if (type === "text") {
            return String(o).trim().toLowerCase() === display.toLowerCase();
        }
        const on = parseNumber(o);
        const dn = parseNumber(display);
        if (Number.isFinite(on) && Number.isFinite(dn)) {
            return Math.abs(on - dn) <= Math.max(0.05, Math.abs(dn) * 0.02);
        }
        return String(o).trim() === display;
    });

    if (correctIndex < 0) {
        throw new Error(`Skeleton ${index + 1}: correct answer not among built options`);
    }

    const builtForVerify = {
        questionText: stem,
        options,
        correctIndex,
    };
    const postVerify = independentlyVerifyQuestion(builtForVerify);
    if (
        postVerify.verified === false &&
        Number.isFinite(postVerify.matchedOptionIndex) &&
        postVerify.matchedOptionIndex >= 0
    ) {
        correctIndex = postVerify.matchedOptionIndex;
    } else if (postVerify.verified === false && postVerify.expected?.value != null) {
        options = buildOptionsAroundExpected(postVerify.expected, options);
        correctIndex = findOptionIndexForNumericValue(
            options,
            postVerify.expected.value
        );
        if (correctIndex < 0) correctIndex = 0;
        fa = {
            ...fa,
            display: postVerify.expected.display,
            value: postVerify.expected.value,
            unit: postVerify.expected.unit || fa.unit,
        };
    } else if (postVerify.verified === false) {
        throw new Error(
            postVerify.issue ||
                `Skeleton ${index + 1}: independent verification failed`
        );
    }

    if (isPhStem(stem)) {
        options = sanitizePhOptions(options, correctIndex);
    }
    options = sanitizeStemEmbeddedOptions(stem, options, correctIndex);

    const markedOption = options[correctIndex];
    const alignedSteps = syncSolveStepsToMarkedAnswer(solveSteps, markedOption);
    const explanation = lockExplanationToMarkedOption(
        alignedSteps,
        markedOption
    );

    const built = {
        questionType: "single",
        questionText: stem,
        options,
        correctIndex,
        multipleCorrectIndexes: [],
        explanation,
        difficulty: tier,
        _solveSteps: alignedSteps,
        _conceptSlot:
            String(assignedConceptSlot || skeleton.conceptSlot || "").trim() ||
            undefined,
        _questionKind: skeleton.questionKind || undefined,
    };

    assertBuiltMcqConsistency(built);
    assertGenerationCorrectness(built, index + 1);

    return built;
};

export const sanitizeQuestionStemEmbeddedOptions = (q) => {
    if (!q?.questionText || !Array.isArray(q.options) || !q.options.length) {
        return q;
    }
    const markedIdx = Number.isFinite(q.correctIndex)
        ? q.correctIndex
        : String(q.correctAnswer || "").match(/^([A-D])/i)?.[1]
          ? String(q.correctAnswer).match(/^([A-D])/i)[1].toUpperCase().charCodeAt(0) - 65
          : 0;
    const options = sanitizeStemEmbeddedOptions(
        q.questionText,
        q.options,
        markedIdx
    );
    return { ...q, options };
};

export const skeletonsToQuestions = async (
    skeletons,
    tierSlots = [],
    conceptSlots = [],
    batchOpts = {},
    repairDeps = null
) => {
    const {
        batchSeenStems = [],
        examCalibrated = false,
        publishPartials = true,
    } = batchOpts;
    const veteran = isVeteranDifficultyEnabled() && examCalibrated;
    const callRepairLlm = repairDeps?.callLlm;
    const examProfile = repairDeps?.examProfile || "jee_main";
    const subject = repairDeps?.subject || "";
    const kindBySlot = repairDeps?.kindBySlot || {};
    const kindForSlot = (slot) =>
        kindBySlot[String(slot || "").trim()] || "calculative";
    const repairOnFail =
        repairDeps?.repairOnFail !== false && isMandateRepairEnabled();
    const questions = [];
    const repairQueue = [];

    const publishReady = (items, phase) => {
        if (!publishPartials || !items.length) return;
        publishPartialQuestions(items, { phase });
    };

    const buildAndPush = (skeleton, index, assignedTier, assignedSlot) => {
        const built = buildMcqFromSkeleton(
            skeleton,
            index,
            assignedTier,
            assignedSlot
        );
        questions.push(built);
        if (veteran) {
            registerBatchStem(built.questionText, batchSeenStems);
        }
        return built;
    };

    for (let i = 0; i < skeletons.length; i++) {
        const sk = skeletons[i];
        const assignedTier = tierSlots[i] || sk.difficultyTier || "medium";
        const assignedSlot = String(conceptSlots[i] || sk.conceptSlot || "").trim();
        // Tag the skeleton with its planned kind so the hard gate and the built MCQ
        // both know whether numeric-depth checks apply (calculative) or not (theory).
        if (!sk.questionKind) sk.questionKind = kindForSlot(assignedSlot);
        const stemPreview = String(sk.stem || "").trim();

        if (
            veteran &&
            isBatchStemNearDuplicate(stemPreview, batchSeenStems, { veteran: true })
        ) {
            repairQueue.push({
                sk,
                i,
                assignedTier,
                assignedSlot,
                mandateIssues: [
                    "Near-duplicate stem in batch — rewrite with a different problem structure and setup.",
                ],
            });
            continue;
        }
        if (
            assignedSlot &&
            sk.conceptSlot &&
            String(sk.conceptSlot).trim() !== assignedSlot
        ) {
            repairQueue.push({
                sk: { ...sk, conceptSlot: assignedSlot },
                i,
                assignedTier,
                assignedSlot,
                mandateIssues: [
                    `conceptSlot must be "${assignedSlot}" (was "${sk.conceptSlot}").`,
                ],
            });
            continue;
        }
        const verification = verifySkeletonAnswer(sk);
        if (!verification.ok) {
            repairQueue.push({
                sk,
                i,
                assignedTier,
                assignedSlot,
                buildError: verification.reason,
            });
            continue;
        }
        const mandate = validateHardSkeletonMandate(sk, assignedTier, {
            examCalibrated: examCalibrated || assignedTier === "hard",
            examProfile,
            subject,
        });
        if (!mandate.ok) {
            repairQueue.push({
                sk,
                i,
                assignedTier,
                assignedSlot,
                mandateIssues: mandate.issues,
            });
            continue;
        }
        try {
            buildAndPush(sk, i, assignedTier, assignedSlot);
        } catch (err) {
            repairQueue.push({
                sk,
                i,
                assignedTier,
                assignedSlot,
                buildError: err.message,
            });
        }
    }

    if (questions.length) {
        publishReady(questions, "initial_pass");
    }

    if (repairQueue.length && repairOnFail && typeof callRepairLlm === "function") {
        // Unbounded repair (one LLM call per failed skeleton) can blow up
        // worst-case latency on a bad batch. Cap it per attempt — anything
        // beyond the cap is deferred (traced, not silently dropped) so the
        // caller's own retry loop regenerates the deficit instead of paying
        // for a long tail of repair calls in a single attempt.
        const itemsToRepair = repairQueue.slice(0, MAX_SKELETON_REPAIR_CALLS_PER_BATCH);
        const deferredItems = repairQueue.slice(MAX_SKELETON_REPAIR_CALLS_PER_BATCH);
        pipelineTrace("SKELETON_REPAIR_BATCH", {
            count: itemsToRepair.length,
            deferred: deferredItems.length,
        });
        for (const item of deferredItems) {
            pipelineTrace("SKELETON_REPAIR_CAPPED", {
                index: item.i + 1,
                conceptSlot: item.assignedSlot,
                reason: (item.mandateIssues || [item.buildError])
                    .filter(Boolean)
                    .join("; "),
            });
        }
        for (const item of itemsToRepair) {
            const fixed = await repairSkeleton(
                item.sk,
                {
                    assignedConceptSlot: item.assignedSlot,
                    assignedTier: item.assignedTier,
                    examProfile,
                    examCalibrated,
                    mandateIssues: item.mandateIssues || [],
                    buildError: item.buildError || "",
                },
                { callLlm: callRepairLlm }
            );
            if (!fixed) {
                pipelineTrace("SKELETON_REPAIR_GAVE_UP", {
                    index: item.i + 1,
                    conceptSlot: item.assignedSlot,
                });
                continue;
            }
            try {
                const built = buildAndPush(
                    fixed,
                    item.i,
                    item.assignedTier,
                    item.assignedSlot
                );
                publishReady([built], "repair");
                pipelineTrace("SKELETON_REPAIR_OK", {
                    index: item.i + 1,
                    conceptSlot: item.assignedSlot,
                });
            } catch (err) {
                pipelineTrace("SKELETON_REPAIR_BUILD_FAILED", {
                    index: item.i + 1,
                    error: err.message,
                });
            }
        }
    } else if (repairQueue.length) {
        for (const item of repairQueue) {
            pipelineTrace("SKELETON_REJECTED", {
                index: item.i + 1,
                conceptSlot: item.assignedSlot,
                reason: (item.mandateIssues || [item.buildError])
                    .filter(Boolean)
                    .join("; "),
            });
        }
    }

    return questions;
};

export const getSolveFirstExamProfile = (params) =>
    detectExamProfile({
        bankName: params.bankName,
        topic: params.topic,
        subject: params.subject,
        sectionName: params.sectionName,
        categoryPaths: params.categoryPaths,
    });

export const getSolveFirstSubjectId = (params) => {
    const resolved = resolveSubjectForGeneration({
        generateIntent: params.generateIntent || "initial",
        topicRelevanceFeedback: params.topicRelevanceFeedback,
        topic: params.topic,
        bankName: params.bankName,
        sectionName: params.sectionName,
        categoryPaths: params.categoryPaths,
        subject: params.subject,
    });
    return resolved.id || "";
};

/** Rebuild explanation from solve steps and assert option consistency. */
export const sanitizeMcqForPipeline = (q) => {
    if (!q?.questionText || !Array.isArray(q.options) || !q.options.length) {
        return q;
    }
    const correctIndex = Number.isFinite(q.correctIndex)
        ? q.correctIndex
        : 0;
    let solveSteps = Array.isArray(q._solveSteps)
        ? [...q._solveSteps]
        : Array.isArray(q.solveSteps)
          ? [...q.solveSteps]
          : [];
    if (!solveSteps.length && q.explanation) {
        solveSteps = inferSolveStepsFromExplanation(q.explanation);
    }
    solveSteps = solveSteps.map(stripMetaCommentary).filter(Boolean);
    const marked = q.options[correctIndex];
    const explanation = lockExplanationToMarkedOption(solveSteps, marked);
    const cleanedExplanation = stripMetaCommentary(explanation);
    const built = {
        ...q,
        correctIndex,
        explanation: cleanedExplanation,
        _solveSteps: solveSteps,
    };
    assertBuiltMcqConsistency(built);
    assertGenerationCorrectness(built, 1);
    return built;
};

/** Sanitize singles and connected sub-questions; drops items that fail consistency. */
export const sanitizeBankQuestionForPipeline = (q) => {
    if (!q) return null;
    const type = String(q.questionType || "single").toLowerCase();
    if (type === "connected") {
        const subQuestions = (q.subQuestions || [])
            .map((sub) => {
                try {
                    return sanitizeMcqForPipeline({
                        ...sub,
                        questionType: sub.questionType || "single",
                    });
                } catch {
                    return null;
                }
            })
            .filter(Boolean);
        if (!subQuestions.length) return null;
        return { ...q, subQuestions };
    }
    if (type === "single" || type === "multiple" || type === "true_false") {
        if (type !== "single") return q;
        try {
            return sanitizeMcqForPipeline(q);
        } catch (err) {
            pipelineTrace("SANITIZE_MCQ_DROPPED", {
                error: err?.message || String(err),
                stem: String(q.questionText || "").slice(0, 120),
            });
            return null;
        }
    }
    return q;
};

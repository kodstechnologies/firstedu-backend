/**
 * AI-driven concept-slot steering — plans diverse hard archetypes + per-slot blueprints
 * for each generation batch. Falls back to the static catalog when disabled or on failure.
 */

/**
 * Known-deleted / out-of-scope topics per subject+exam, seeded into the planning
 * prompt so the model doesn't rely solely on its own (possibly stale) syllabus
 * knowledge. Keyed by subjectId; applies to JEE-style engineering entrances.
 */
const SYLLABUS_EXCLUSION_SEED = {
    physics: [
        "Carnot engine / Carnot cycle efficiency (deleted from rationalized NCERT)",
        "Radioactivity — decay law, half-life, activity (deleted from rationalized NCERT)",
        "Doppler effect in sound/waves (deleted from rationalized NCERT)",
        "Earth's magnetism — dip, declination, neutral points (deleted from rationalized NCERT)",
        "Special relativity — time dilation, length contraction, relativistic momentum (outside JEE syllabus)",
        "Advanced ordinary differential equations as a solving method (college-level, outside JEE syllabus)",
        "Infinite 2D resistor/capacitor networks (college-level, outside JEE syllabus)",
    ],
};

const getSyllabusExclusionSeed = (subjectId = "") =>
    SYLLABUS_EXCLUSION_SEED[String(subjectId).toLowerCase().trim()] || [];

import { parseJsonObjectFromAIText } from "../utils/aiJsonRepair.js";
import {
    allocateRankedConceptSlots,
    getArchetypeBlueprint,
    enrichBlueprintWithConceptFusion,
    getSubjectLabelForArchetypes,
} from "./conceptArchetypeGuidance.service.js";
import { pipelineTrace } from "../utils/aiApiCallLogger.js";
import { isVeteranDifficultyEnabled } from "./hardQuestionMandate.service.js";
import {
    buildVeteranExamineeCaliberBlock,
    getExamLabel,
} from "./examPromptContext.service.js";

/** Default ON — set AI_QB_ARCHETYPE_STEERING=0 to use static catalog only. */
export const isAiArchetypeSteeringEnabled = () => {
    const flag = process.env.AI_QB_ARCHETYPE_STEERING;
    if (flag === "0" || flag === "false") return false;
    return true;
};

const slugify = (text = "") =>
    String(text || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "")
        .slice(0, 64);

const normalizeBlueprint = (raw = {}) => ({
    pattern: String(raw.pattern || raw.problemPattern || "").trim(),
    required: String(raw.required || raw.requirements || "").trim(),
    banned: String(raw.banned || raw.forbidden || "").trim(),
    stemHint: String(raw.stemHint || raw.exampleStem || "").trim(),
});

const normalizeSlotPlan = (raw = {}, index = 0) => {
    const label = String(raw.label || raw.title || raw.topic || "").trim();
    const conceptSlot =
        String(raw.conceptSlot || raw.id || "").trim() ||
        slugify(label) ||
        `ai_slot_${index + 1}`;
    const blueprint = enrichBlueprintWithConceptFusion(
        conceptSlot,
        normalizeBlueprint(raw)
    );
    return {
        conceptSlot,
        label: label || conceptSlot.replace(/_/g, " "),
        blueprint,
    };
};

export const buildArchetypePlanningPrompt = ({
    topic = "",
    bankName = "",
    subject = "",
    subjectId = "",
    examProfile = "competitive",
    catSection = null,
    bankDifficulty = "hard",
    count = 10,
    excludeArchetypes = [],
    excludeQuestionTexts = [],
    examCalibrated = false,
    topicRelevanceFeedback = null,
    generateIntent = "initial",
    planningFeedback = "",
    adminExcludeTopics = [],
} = {}) => {
    const n = Math.max(1, count);
    const subjectLabel = getSubjectLabelForArchetypes(subjectId || subject);
    const examLabel = getExamLabel(examProfile, catSection);
    const tierNote = examCalibrated
        ? "ALL slots are **exam-native hard** (peak exam caliber for this profile)."
        : `Bank difficulty profile: **${bankDifficulty}** — calibrate each slot to hard entrance depth.`;

    const excludeArchetypeBlock = excludeArchetypes.length
        ? `\n**Already used in this question bank (do NOT repeat these problem types or near-clones):**\n${[
              ...new Set(excludeArchetypes.map(String).filter(Boolean)),
          ]
              .slice(0, 40)
              .map((a) => `- ${a}`)
              .join("\n")}\n`
        : "";

    const excludeStemBlock = excludeQuestionTexts.length
        ? `\n**Excluded stems / structures (different setup, not same logic with new numbers):**\n${excludeQuestionTexts
              .slice(0, 20)
              .map((t, i) => `${i + 1}. ${String(t).slice(0, 180)}`)
              .join("\n")}\n`
        : "";

    const regenBlock =
        generateIntent === "evaluation_regen" && topicRelevanceFeedback
            ? `\n**EVALUATION REGENERATION — fix these gaps from prior audit:**\n${String(
                  topicRelevanceFeedback.regenerationInstructions ||
                      topicRelevanceFeedback.summary ||
                      ""
              ).slice(0, 1500)}\nDifficulty match was ${topicRelevanceFeedback.difficultyMatchScore ?? topicRelevanceFeedback?.dimensionScores?.difficultyMatch ?? "low"} — plan slots that score 80+ on shift-paper depth.\n`
            : "";

    const exclusionSeed = getSyllabusExclusionSeed(subjectId || subject);
    const adminExcluded = [
        ...new Set((adminExcludeTopics || []).map(String).map((t) => t.trim()).filter(Boolean)),
    ].slice(0, 40);
    const seededExclusions = [...exclusionSeed, ...adminExcluded];
    const syllabusExclusionBlock = seededExclusions.length
        ? `\n**Known excluded topics (never plan a slot on these):**\n${seededExclusions
              .map((t) => `- ${t}`)
              .join("\n")}\n`
        : "";

    // Admin re-planning: the reviewer looked at the last topic plan and asked
    // for changes (include X, drop Y, more of Z). This overrides the model's
    // own topic choices where it conflicts.
    const planningFeedbackBlock = String(planningFeedback || "").trim()
        ? `\n**REVIEWER FEEDBACK — re-plan the topic list to honor this (highest priority):**\n${String(
              planningFeedback
          )
              .trim()
              .slice(0, 1500)}\nApply it exactly: add any topics the reviewer asked for, drop any they rejected (also add rejected ones to \`excludedTopics\`), and keep the rest of the plan fresh — do not simply repeat the previous slots.\n`
        : "";

    return `You are a senior ${examLabel} ${subjectLabel} paper setter. Plan **${n} distinct hard question archetypes** for the next generation batch.

**Topic / syllabus context:** ${topic || bankName}
**Subject: ${subjectLabel}** — every slot must be pure ${subjectLabel} content. Do NOT invent a slot from a different subject (e.g. no Physics archetype/conceptFusion in a Chemistry plan, no Chemistry in a Maths plan) even though this is a combined exam — the bank being planned is ${subjectLabel}-only.
**Exam:** ${examLabel}
${tierNote}
${buildVeteranExamineeCaliberBlock({ examProfile })}

Your output steers a downstream question writer. Plan **hard, exam-native items** spread across the **full syllabus** for this topic — not one chapter only.

**Step 0 — determine syllabus scope first:**
Before planning any slot, work out what is actually in-scope for the **current ${examLabel} syllabus** on this topic (rationalized NCERT / current exam pattern). List any topic you are deliberately leaving out — recently deleted chapters, or topics that read as this subject but are outside this exam's syllabus (e.g. college-level material) — in \`excludedTopics\`. Then plan every slot ONLY from what remains in scope. If you are unsure whether a topic was deleted, treat it as excluded rather than risk an out-of-syllabus question.
${syllabusExclusionBlock}${planningFeedbackBlock}
${excludeArchetypeBlock}${excludeStemBlock}${regenBlock}

**Planning rules:**
1. **${n} unique slots** — different micro-topic, setup, and solving chain; no near-duplicate templates.
2. **Hard-first + full coverage:** ~70% slots = peak-difficulty / multi-step; ~30% = other syllabus bands so **all major topic areas** get at least one slot when batch size allows.
3. **Syllabus breadth** — spread across major ${subjectLabel} areas appropriate to the topic and exam (do not cluster on one unit), and only within the in-scope topics from Step 0.
4. **Hard-tier depth per slot:** ≥2 linked concepts (state fusion explicitly in \`conceptFusion\`), ≥3 solve steps, no single-formula plug-in.
5. **conceptFusion** = the two syllabus ideas fused (e.g. "rotation + friction", "ratio + percentage traps").
6. **conceptSlot** = short snake_case id you invent (e.g. \`rolling_threshold_mu\`, \`rc_inference_tone\`).
7. **pattern** = what problem shape to write (1–2 sentences).
8. **required** = mandatory stem/solve constraints — must name both fused concepts (1–2 sentences).
9. **banned** = easy templates to reject (1 sentence).
10. **stemHint** = one example stem shape — writer must create a NEW problem, not copy verbatim.

Return ONLY valid JSON:
{
  "excludedTopics": ["Carnot engine — deleted from rationalized NCERT", "Special relativity — outside JEE syllabus"],
  "slots": [
    {
      "conceptSlot": "rolling_threshold_mu",
      "conceptFusion": "rolling motion + friction threshold",
      "label": "Rolling threshold on rough incline",
      "pattern": "Solid body rolling without slipping on incline — find μ threshold or acceleration with torque + friction.",
      "required": "Link rotation and translation; friction appears in both force and torque equations.",
      "banned": "Bare τ = Iα with all values listed; single energy conservation line only.",
      "stemHint": "A solid sphere on a rough incline of angle θ — find minimum μ for pure rolling."
    }
  ]
}`;
};

export const parseArchetypePlanResponse = (rawText, expectedCount = 1) => {
    const parsed = parseJsonObjectFromAIText(rawText);
    const rows = Array.isArray(parsed?.slots)
        ? parsed.slots
        : Array.isArray(parsed)
          ? parsed
          : [];
    const excludedTopics = Array.isArray(parsed?.excludedTopics)
        ? parsed.excludedTopics.map(String).filter(Boolean).slice(0, 30)
        : [];
    const plans = rows
        .map((row, i) => normalizeSlotPlan(row, i))
        .filter((p) => p.blueprint.pattern || p.blueprint.required);
    const seen = new Set();
    const unique = [];
    for (const plan of plans) {
        const key = plan.conceptSlot.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(plan);
    }
    const result = unique.slice(0, Math.max(1, expectedCount));
    result.excludedTopics = excludedTopics;
    return result;
};

const buildFallbackSteering = ({
    count,
    examProfile,
    subjectId,
    slotOffset,
    subjects,
    bankDifficulty,
    preferPeak,
    excludeArchetypes,
    examCalibrated = false,
}) => {
    const conceptSlots = allocateRankedConceptSlots(count, {
        examProfile,
        subjectId,
        slotOffset,
        subjects,
        preferPeak,
        bankDifficulty,
        excludeArchetypes,
        maxPerArchetype:
            isVeteranDifficultyEnabled() && examCalibrated ? 1 : 2,
    });
    const slotPlans = conceptSlots.map((conceptSlot) => {
        const bp = getArchetypeBlueprint(conceptSlot);
        return {
            conceptSlot,
            label: conceptSlot.replace(/_/g, " "),
            blueprint: bp
                ? {
                      pattern: bp.pattern,
                      required: bp.required,
                      banned: bp.banned,
                      stemHint: bp.stemHint || "",
                  }
                : {
                      pattern: "Multi-condition entrance numerical with linked concepts.",
                      required:
                          "≥2 concepts, ≥3 solve steps, constraint before the ask.",
                      banned: "Single-formula plug-in or chapter-test template.",
                      stemHint: "",
                  },
        };
    });
    return {
        conceptSlots,
        slotPlans,
        source: "catalog",
    };
};

/**
 * Resolve concept slots + blueprints for a batch — AI-first, catalog fallback.
 * @param {{ callLlm: (prompt: string) => Promise<string> }} deps
 */
export const resolveConceptArchetypeSteering = async (
    {
        count = 10,
        topic = "",
        bankName = "",
        subject = "",
        subjectId = "",
        examProfile = "competitive",
        catSection = null,
        bankDifficulty = "hard",
        examCalibrated = false,
        excludeArchetypes = [],
        excludeQuestionTexts = [],
        slotOffset = 0,
        subjects = null,
        preferPeak = false,
        topicRelevanceFeedback = null,
        generateIntent = "initial",
        planningFeedback = "",
        adminExcludeTopics = [],
    },
    { callLlm } = {}
) => {
    const n = Math.max(1, count);
    const fallback = () =>
        buildFallbackSteering({
            count: n,
            examProfile,
            subjectId,
            slotOffset,
            subjects,
            bankDifficulty,
            preferPeak,
            excludeArchetypes,
            examCalibrated,
        });

    if (!isAiArchetypeSteeringEnabled() || typeof callLlm !== "function") {
        const result = fallback();
        pipelineTrace("ARCHETYPE_STEERING", {
            source: result.source,
            slotCount: result.conceptSlots.length,
        });
        return result;
    }

    try {
        const prompt = buildArchetypePlanningPrompt({
            topic,
            bankName,
            subject,
            subjectId,
            examProfile,
            catSection,
            bankDifficulty,
            count: n,
            excludeArchetypes,
            excludeQuestionTexts,
            examCalibrated,
            topicRelevanceFeedback,
            generateIntent,
            planningFeedback,
            adminExcludeTopics,
        });
        const rawText = await callLlm(prompt);
        let slotPlans = parseArchetypePlanResponse(rawText, n);
        const excludedTopics = slotPlans.excludedTopics || [];

        if (slotPlans.length < n) {
            const need = n - slotPlans.length;
            const filler = buildFallbackSteering({
                count: need,
                examProfile,
                subjectId,
                slotOffset: slotOffset + slotPlans.length,
                subjects,
                bankDifficulty,
                preferPeak,
                excludeArchetypes: [
                    ...excludeArchetypes,
                    ...slotPlans.map((p) => p.conceptSlot),
                ],
            });
            slotPlans = [...slotPlans, ...filler.slotPlans];
        }

        const conceptSlots = slotPlans.slice(0, n).map((p) => p.conceptSlot);
        pipelineTrace("ARCHETYPE_STEERING", {
            source: "ai",
            slotCount: conceptSlots.length,
            slots: conceptSlots.slice(0, 12),
            excludedTopics,
        });
        return {
            conceptSlots,
            slotPlans: slotPlans.slice(0, n),
            excludedTopics,
            source: "ai",
        };
    } catch (err) {
        pipelineTrace("ARCHETYPE_STEERING_FALLBACK", {
            error: err?.message || String(err),
        });
        const result = fallback();
        return { ...result, source: "catalog_fallback" };
    }
};

export default {
    isAiArchetypeSteeringEnabled,
    buildArchetypePlanningPrompt,
    parseArchetypePlanResponse,
    resolveConceptArchetypeSteering,
};

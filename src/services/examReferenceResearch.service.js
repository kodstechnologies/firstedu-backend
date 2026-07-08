/**
 * Web-grounded exam reference research — runs before AI question generation
 * so difficulty/style matches real papers (CAT, JEE, NEET, etc.).
 */

import { GoogleGenAI } from "@google/genai";
import { detectExamProfile, detectCatSection } from "./examDifficultyCalibration.js";
import { resolveGeminiTextModel } from "./geminiTextModels.js";

const genAI = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
});

const CACHE_TTL_MS = Number(process.env.EXAM_REFERENCE_CACHE_TTL_MS || 60 * 60 * 1000);
const RESEARCH_ENABLED = process.env.EXAM_REFERENCE_RESEARCH_ENABLED !== "0";
const RESEARCH_MODEL =
    process.env.EXAM_REFERENCE_MODEL?.trim() || "gemini-2.5-flash";

/** @type {Map<string, { block: string; createdAt: number }>} */
const referenceCache = new Map();

export { detectCatSection };

const slugKey = (parts) =>
    parts
        .map((p) =>
            String(p || "")
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .slice(0, 60)
        )
        .filter(Boolean)
        .join("::");

const EXAM_LABELS = {
    cat: "CAT (Common Admission Test — IIM MBA entrance)",
    jee_main: "JEE Main (NTA engineering entrance)",
    jee_advanced: "JEE Advanced (IIT entrance)",
    neet: "NEET UG (medical entrance)",
    board: "CBSE/ICSE board exam",
    competitive: "Indian competitive entrance exam",
};

const CAT_SECTION_LABELS = {
    cat_varc: "VARC (Verbal Ability & Reading Comprehension)",
    cat_dilr: "DILR (Data Interpretation & Logical Reasoning)",
    cat_qa: "QA (Quantitative Ability / Aptitude)",
    cat_general: "full CAT paper mix",
};

const STATIC_FALLBACK_BRIEFS = {
    cat_varc: `**CAT VARC reference (fallback):**
- **Dominant types (real CAT):** Reading Comprehension (~16 Q), Para Jumbles, Odd Sentence Out, Para Summary — NOT grammar/vocabulary/GMAT drills.
- RC: 450–750 word passages; 4 questions each; inference, tone, implicit meaning — options are close paraphrases.
- Para Jumbles: 4–5 shuffled sentences; pick correct order from four permutations.
- Odd Sentence Out: five sentences; four cohere — find the misfit.
- Para Summary: short paragraph; choose best central-idea option.
- **Avoid:** grammar correction, vocabulary/synonym MCQs, critical-reasoning definition items, Wren & Martin style, school comprehension.`,
    cat_qa: `**CAT QA reference (fallback):**
- Arithmetic-heavy (percentages, ratios, TSD, profit-loss, logs) with clever setup — NOT JEE calculus depth.
- Algebra/geometry appear but with logical traps and elegant shortcuts expected.
- ~2–3 minute solve per question; stems are compact but require insight, not long computation.
- Avoid: multi-page derivations, JEE Advanced numerics, or textbook end-of-chapter drills.`,
    cat_dilr: `**CAT DILR reference (fallback):**
- Questions come in linked sets (tables, charts, scheduling puzzles, games) — 4–6 questions per set.
- Requires structured reasoning across constraints; partial information and case analysis.
- Avoid: standalone single-step arithmetic unrelated to a data set.`,
    cat_general: `**CAT reference (fallback):**
- National MBA entrance — VARC uses long RC passages; QA is aptitude not engineering math; DILR uses linked data sets.
- Overall difficulty is high; school-level or coaching chapter tests are too easy.`,
    jee_main: `**JEE Main reference (fallback):**
- Shift-paper MCQs: multi-step, multi-topic, tight numeric distractors — not chapter-test templates.
- Infer subject scope from topic and category path.
- **Full paper / mock topics:** mixed **Physics + Chemistry + Mathematics** in roughly equal shares — never all one subject.
- **Physics-only banks:** state units in stem and options; do not confuse f, v, u, power (D), harmonic number, orbital radius vs height.
- Authoring: solve fully; marked option must equal computed answer with matching unit and quantity type.`,
    jee_advanced: `**JEE Advanced reference (fallback):**
- Multi-concept integration, insight problems — harder than Main; scope from topic/category path.`,
    neet: `**NEET reference (fallback):**
- NTA NEET UG shift-paper MCQ style; syllabus from topic/category path (typically NCERT-rooted).
- Application stems, plausible distractors — infer subject from path; solve-then-write each item.`,
    board: `**Board exam reference (fallback):**
- Official sample-paper tone; application and case-based at medium/hard.
- **Physics:** include units in stem and every numeric option; distinguish focal length, image distance, and object distance; keep eV/J/nm scales consistent.`,
    competitive: `**Competitive exam reference (fallback):**
- National entrance standard — multi-step, linked concepts, exam-style distractors; not homework level.`,
};

const buildResearchPrompt = ({
    examProfile,
    catSection,
    bankName,
    topic,
    sectionName,
    categoryPaths,
    subject,
    difficulty,
}) => {
    const examLabel = EXAM_LABELS[examProfile] || EXAM_LABELS.competitive;
    const catLabel = catSection ? CAT_SECTION_LABELS[catSection] || "" : "";
    const categoryNote =
        categoryPaths?.length > 0
            ? `\nCategory path: ${categoryPaths.join(" › ")}`
            : "";

    return `You are calibrating AI question generation for an Indian ed-tech platform.

**Task:** Search the web for authentic, recent information about the REAL exam below. Summarize how questions are structured and how difficult they are — this brief will guide NEW question generation (not copy official questions verbatim).

**Exam:** ${examLabel}${catLabel ? `\n**Section focus:** ${catLabel}` : ""}
**Question bank name:** ${bankName || "(not set)"}
**Topic / syllabus focus:** ${topic || "(not set)"}
**Section name:** ${sectionName || "(none)"}
**Subject hint:** ${subject || "(infer from topic and category path)"}
**Target difficulty tier:** ${difficulty || "medium"}${categoryNote}

Search for: official exam pattern, recent shift paper analysis for this exam, and difficulty benchmarks for the topic/category scope above.

Return a structured reference brief (max 900 words) with these sections:

1. **Official format** — question types, counts, passage/set structure if applicable
2. **Subjects & syllabus scope** — which subject(s) apply to THIS topic/category path; chapter-level focus if narrow
3. **Difficulty benchmark** — what makes easy/medium/hard in THIS exam (not school tests)
4. **Stem & option style** — length, wording patterns, how distractors are built
5. **Representative patterns** — describe 2–3 question *archetypes* by structure only (do NOT reproduce copyrighted question text verbatim)
6. **Timing & cognitive load** — typical solve time, multi-step expectations
7. **Anti-patterns** — what this exam is NOT for this topic

Be specific to the exam/section named above. If the topic narrows the scope (e.g. "Reading Comprehension" within CAT VARC), focus the brief on that sub-area.`;
};

const formatReferenceBlock = (briefText, source = "web") => {
    const body = String(briefText || "").trim();
    if (!body) return "";
    return `
**EXAM REFERENCE BRIEF (${source === "web" ? "researched from real exam sources via web search" : "built-in exam profile"}) — MUST guide every question you generate:**
${body}

**MANDATORY:** Match the difficulty, format, stem length, and reasoning depth described above. If your draft feels like a school chapter test or a different exam (e.g. JEE-style math for CAT QA), rewrite before output. Do NOT copy official past-paper questions verbatim — create NEW questions that match this reference standard.`;
};

const getStaticFallback = (examProfile, catSection) => {
    if (examProfile === "cat" && catSection && STATIC_FALLBACK_BRIEFS[catSection]) {
        return STATIC_FALLBACK_BRIEFS[catSection];
    }
    if (examProfile === "cat") return STATIC_FALLBACK_BRIEFS.cat_general;
    return STATIC_FALLBACK_BRIEFS[examProfile] || STATIC_FALLBACK_BRIEFS.competitive;
};

const pruneCache = () => {
    const now = Date.now();
    for (const [key, entry] of referenceCache.entries()) {
        if (now - entry.createdAt > CACHE_TTL_MS) {
            referenceCache.delete(key);
        }
    }
};

/**
 * Fetch web-grounded exam reference for question generation calibration.
 * @returns {Promise<{ block: string; source: 'web'|'cache'|'fallback'|'disabled' }>}
 */
export const fetchExamReferenceBrief = async ({
    bankName = "",
    topic = "",
    sectionName = "",
    categoryPaths = [],
    subject = "",
    difficulty = "medium",
    examProfile: examProfileOverride = null,
    catSection: catSectionOverride = undefined,
} = {}) => {
    const examProfile =
        examProfileOverride ||
        detectExamProfile({ bankName, topic, subject, sectionName, categoryPaths });
    const catSection =
        catSectionOverride !== undefined
            ? catSectionOverride
            : detectCatSection({
                  topic,
                  bankName,
                  sectionName,
                  categoryPaths,
              });

    const cacheKey = slugKey([
        examProfile,
        catSection,
        bankName,
        topic,
        sectionName,
        subject,
        difficulty,
    ]);

    pruneCache();
    const cached = referenceCache.get(cacheKey);
    if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
        return { block: cached.block, source: "cache" };
    }

    if (!RESEARCH_ENABLED || !process.env.GEMINI_API_KEY) {
        const fallback = getStaticFallback(examProfile, catSection);
        const block = formatReferenceBlock(fallback, "fallback");
        return { block, source: "fallback" };
    }

    const prompt = buildResearchPrompt({
        examProfile,
        catSection,
        bankName,
        topic,
        sectionName,
        categoryPaths,
        subject,
        difficulty,
    });

    try {
        const result = await genAI.models.generateContent({
            model: RESEARCH_MODEL || resolveGeminiTextModel(),
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: {
                tools: [{ googleSearch: {} }],
                temperature: 0.2,
                maxOutputTokens: 2048,
            },
        });

        const text = (result.text || "").trim();
        if (!text) {
            throw new Error("Empty exam reference response");
        }

        const block = formatReferenceBlock(text, "web");
        referenceCache.set(cacheKey, { block, createdAt: Date.now() });
        console.log(
            `[exam-reference] cached brief for ${examProfile}${catSection ? `/${catSection}` : ""} (${text.length} chars)`
        );
        return { block, source: "web" };
    } catch (error) {
        console.warn(
            "[exam-reference] web research failed — using static fallback:",
            error?.message || error
        );
        const fallback = getStaticFallback(examProfile, catSection);
        const block = formatReferenceBlock(fallback, "fallback");
        referenceCache.set(cacheKey, { block, createdAt: Date.now() });
        return { block, source: "fallback" };
    }
};

/**
 * Generate CAT (Common Admission Test) section question banks via Gemini.
 * Output: temp/competitive/management/cat/{varc,dilr,qa}.txt
 *
 * Usage:
 *   node scripts/generate-cat-papers.mjs
 *   node scripts/generate-cat-papers.mjs --plan-only
 *   node scripts/generate-cat-papers.mjs --section varc
 *   node scripts/generate-cat-papers.mjs --fresh
 */
import dotenv from "dotenv";
import { appendFileSync, existsSync, mkdirSync, unlinkSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

dotenv.config();
process.env.EXAM_REFERENCE_RESEARCH_ENABLED = "0";
process.env.AI_QB_DIFFICULTY_SELF_AUDIT = "0";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "temp", "competitive", "management", "cat");

const TOPIC = "Competitive › Management › CAT";
const CATEGORY_PATH = "Competitive>Management>CAT";

const EXAM_CONTEXT = `The Common Admission Test (CAT) is the entrance exam for admission to the Indian Institutes of Management (IIMs) and many other top B-schools in India.

CAT Exam Pattern (CAT 2024 / CAT 2025):
  VARC  — 24 questions — 40 minutes
  DILR  — 22 questions — 40 minutes
  QA    — 22 questions — 40 minutes
  Total — 68 questions — 120 minutes (2 hours)

Question Types: MCQs (4 options, -1 for wrong) and TITA (type-in answer, no negative marking).
Marking: +3 correct | -1 incorrect MCQ | 0 unattempted | 0 incorrect TITA.
Sectional time limits apply; candidates cannot switch sections during allotted time.
Difficulty: Moderate to Difficult (DILR often hardest).`;

const SECTIONS = [
    {
        id: "varc",
        file: "varc.txt",
        sectionName: "Verbal Ability & Reading Comprehension (VARC)",
        shortLabel: "VARC",
        count: 24,
        sectionTime: "40 minutes",
        syllabus: [
            "Reading Comprehension",
            "Para Jumbles",
            "Para Summary",
            "Odd Sentence Out",
            "Para Completion",
        ],
    },
    {
        id: "dilr",
        file: "dilr.txt",
        sectionName: "Data Interpretation & Logical Reasoning (DILR)",
        shortLabel: "DILR",
        count: 22,
        sectionTime: "40 minutes",
        syllabus: [
            "Tables",
            "Bar, Pie & Line Charts",
            "Caselets",
            "Arrangements",
            "Seating Arrangement",
            "Venn Diagrams",
            "Games & Tournaments",
            "Blood Relations",
            "Puzzles",
            "Networks",
        ],
    },
    {
        id: "qa",
        file: "qa.txt",
        sectionName: "Quantitative Ability (QA)",
        shortLabel: "QA",
        count: 22,
        sectionTime: "40 minutes",
        syllabus: [
            "Arithmetic (Profit & Loss, Time-Speed-Distance, Time & Work, Percentages, Ratio & Proportion, SI & CI)",
            "Algebra",
            "Geometry",
            "Mensuration",
            "Number System",
            "Modern Mathematics",
            "Permutation & Combination",
            "Probability",
        ],
    },
];

function resolveVarcCounts(total) {
    const subsPerPassage = 4;
    const passageCount = Math.max(1, Math.round((total * 0.65) / subsPerPassage));
    const passageSingleCount = subsPerPassage;
    const singleCount = Math.max(0, total - passageCount * passageSingleCount);
    return { passageCount, passageSingleCount, singleCount };
}

function resolveSectionBatchCounts(section, batchSize) {
    if (section.id === "varc") {
        return resolveVarcCounts(batchSize);
    }
    return {
        singleCount: batchSize,
        passageCount: 0,
        passageSingleCount: 0,
    };
}

function buildPlanBlock(section) {
    const syllabusLines = section.syllabus.map((s) => `  • ${s}`).join("\n");
    const formatNote =
        section.id === "varc"
            ? `Target: ${section.count} selectable questions (~65% RC passages + ~35% VA singles)`
            : `Target: ${section.count} single-answer MCQs`;
    const genNote =
        section.id === "varc"
            ? "1. generateQuestionBankSuggestions with passageCount + passageSingleCount for RC and singleCount for Para Jumbles / Odd Sentence Out / Para Summary"
            : `1. generateQuestionBankSuggestions with singleCount=${section.count} (chunked ≤10 per call)`;
    return [
        `CAT (Common Admission Test) — ${section.sectionName}`,
        "=".repeat(60),
        `Topic: ${TOPIC}`,
        `Category path: ${CATEGORY_PATH}`,
        `Section: ${section.sectionName}`,
        formatNote,
        `Section time: ${section.sectionTime}`,
        `Difficulty: hard`,
        `Provider: Gemini (generate-question-bank-suggestions only)`,
        "",
        "EXAM CONTEXT:",
        EXAM_CONTEXT,
        "",
        "SECTION SYLLABUS:",
        syllabusLines,
        "",
        "GENERATION PLAN:",
        genNote,
        "2. generationProvider: gemini",
        "3. inferCountsIfMissing: false",
        "4. No validate / infer API calls",
        "5. EXAM_REFERENCE_RESEARCH_ENABLED=0",
        "6. Questions must match authentic CAT section style and difficulty.",
        "",
        "—".repeat(60),
        "",
    ].join("\n");
}

function resolveCorrectLetter(q) {
    const letters = ["A", "B", "C", "D"];
    if (q.correctIndex != null && q.correctIndex >= 0 && q.correctIndex < 4) {
        return letters[q.correctIndex];
    }
    const raw = q.correctAnswer;
    if (Array.isArray(raw) && raw.length) return String(raw[0]).trim().toUpperCase();
    if (raw != null && String(raw).trim()) return String(raw).trim().toUpperCase();
    return "?";
}

function formatQuestion(q, index) {
    const lines = [];
    const tier = q.difficultyTier || q.difficulty || "";
    lines.push(`Question ${index + 1}${tier ? ` [${tier}]` : ""}`);
    lines.push(`Type: ${q.questionType || "single"}`);
    lines.push(`Stem: ${q.questionText || ""}`);
    const opts = q.options || [];
    const letters = ["A", "B", "C", "D"];
    opts.forEach((opt, i) => {
        if (String(opt || "").trim()) {
            lines.push(`  ${letters[i]}. ${opt}`);
        }
    });
    lines.push(`Correct: ${resolveCorrectLetter(q)}`);
    lines.push(`Explanation: ${q.explanation || ""}`);
    lines.push("");
    return lines.join("\n");
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function parseArgs() {
    const args = process.argv.slice(2);
    const planOnly = args.includes("--plan-only");
    const fresh = args.includes("--fresh");
    let sectionFilter = null;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === "--section" && args[i + 1]) sectionFilter = args[++i].toLowerCase();
    }
    return { planOnly, fresh, sectionFilter };
}

function ensurePlan(section, outPath, { fresh = false } = {}) {
    mkdirSync(dirname(outPath), { recursive: true });
    if (fresh && existsSync(outPath)) unlinkSync(outPath);
    if (!existsSync(outPath)) {
        writeFileSync(outPath, buildPlanBlock(section), "utf8");
        console.log(`  Plan written: ${outPath}`);
    }
}

async function callGenerate(
    generateQuestionBankSuggestions,
    section,
    batchSize,
    excludeQuestionTexts,
    { continuation = false } = {}
) {
    const counts = resolveSectionBatchCounts(section, batchSize);
    const topic =
        section.id === "varc"
            ? `${TOPIC} — CAT VARC: Reading Comprehension, Para Jumbles, Odd Sentence Out & Para Summary`
            : TOPIC;
    let lastErr = null;
    for (let attempt = 1; attempt <= 4; attempt++) {
        try {
            return await generateQuestionBankSuggestions({
                topic,
                bankName: TOPIC,
                difficulty: "hard",
                singleCount: counts.singleCount || 0,
                multipleCount: 0,
                trueFalseCount: 0,
                passageCount: counts.passageCount || 0,
                passageSingleCount: counts.passageSingleCount || 0,
                passageMultipleCount: 0,
                passageTrueFalseCount: 0,
                excludeQuestionTexts,
                categoryPaths: [CATEGORY_PATH],
                sectionName: section.sectionName,
                generationProvider: "gemini",
                inferCountsIfMissing: false,
                generateIntent: "initial",
                topicRelevanceEvaluated: false,
                topicRelevanceRegenerated: false,
                hasGeneratedQuestions: continuation,
                allowContinuation: continuation,
            });
        } catch (err) {
            lastErr = err;
            const wait = 5000 * attempt;
            console.warn(
                `  Attempt ${attempt} failed: ${err.message}. Waiting ${wait / 1000}s...`
            );
            await sleep(wait);
        }
    }
    throw lastErr;
}

async function generateSection(section, generateQuestionBankSuggestions, { fresh = false } = {}) {
    const outPath = join(OUT_DIR, section.file);
    ensurePlan(section, outPath, { fresh });

    const runHeader = [
        `RUN: ${new Date().toISOString()}`,
        `Generating ${section.count} questions for ${section.sectionName}...`,
        "",
    ].join("\n");
    appendFileSync(outPath, runHeader, "utf8");

    const started = Date.now();
    const allQuestions = [];
    const excludeQuestionTexts = [];
    let round = 0;
    const maxRounds = 20;

    while (allQuestions.length < section.count && round < maxRounds) {
        round += 1;
        const need = section.count - allQuestions.length;
        const batchSize = Math.min(need, 10);
        const continuation = allQuestions.length > 0;

        if (round > 1) {
            const topUpHeader = [
                `TOP-UP ${round}: requesting ${batchSize} more (${allQuestions.length}/${section.count} so far)`,
                "",
            ].join("\n");
            appendFileSync(outPath, topUpHeader, "utf8");
            console.log(
                `  Top-up ${round}: +${batchSize} (${allQuestions.length}/${section.count})`
            );
        }

        const result = await callGenerate(
            generateQuestionBankSuggestions,
            section,
            batchSize,
            excludeQuestionTexts,
            { continuation }
        );

        const batch = result?.questions ?? result ?? [];
        for (const q of batch) {
            if (!q?.questionText) continue;
            if (excludeQuestionTexts.includes(q.questionText)) continue;
            allQuestions.push(q);
            excludeQuestionTexts.push(q.questionText);
            if (allQuestions.length >= section.count) break;
        }
    }

    const questions = allQuestions.slice(0, section.count);
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);

    const meta = [
        `Section: ${section.sectionName}`,
        `Received: ${questions.length} / ${section.count} questions (${round} generate call(s))`,
        `Elapsed: ${elapsed}s`,
        "",
        "—".repeat(60),
        "QUESTIONS",
        "—".repeat(60),
        "",
    ].join("\n");
    appendFileSync(outPath, meta, "utf8");

    const body = questions.map((q, i) => formatQuestion(q, i)).join("\n");
    appendFileSync(outPath, body, "utf8");

    const footer = [
        "",
        "=".repeat(60),
        "Raw JSON:",
        JSON.stringify(questions, null, 2),
        "",
    ].join("\n");
    appendFileSync(outPath, footer, "utf8");

    console.log(
        `  ✓ ${questions.length}/${section.count} questions → ${outPath} (${elapsed}s)`
    );
    return questions.length;
}

async function main() {
    const { planOnly, fresh, sectionFilter } = parseArgs();
    const sections = SECTIONS.filter(
        (s) => !sectionFilter || s.id === sectionFilter
    );

    if (!sections.length) {
        console.error(`Unknown section: ${sectionFilter}`);
        process.exit(1);
    }

    if (planOnly) {
        for (const section of sections) {
            ensurePlan(section, join(OUT_DIR, section.file), { fresh });
        }
        console.log("Plan-only complete.");
        return;
    }

    const { generateQuestionBankSuggestions } = await import(
        "../src/services/aiQuestion.service.js"
    );

    console.log("CAT question generation (Gemini, generate API only)\n");

    let total = 0;
    for (const section of sections) {
        console.log(`\n[${section.shortLabel}] ${section.count} questions...`);
        const n = await generateSection(
            section,
            generateQuestionBankSuggestions,
            { fresh }
        );
        total += n;
    }

    console.log(`\nDone. ${total} questions written to ${OUT_DIR}`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

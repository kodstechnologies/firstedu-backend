/**
 * Generate UPSC Prelims papers via Gemini only.
 * Output: temp/upsc/general-studies.txt (100 MCQs) and temp/upsc/csat.txt (80 MCQs)
 *
 * Usage:
 *   node scripts/generate-upsc-papers.mjs
 *   node scripts/generate-upsc-papers.mjs --paper gs
 *   node scripts/generate-upsc-papers.mjs --paper csat
 *   node scripts/generate-upsc-papers.mjs --plan-only
 */
import dotenv from "dotenv";
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

dotenv.config();
process.env.EXAM_REFERENCE_RESEARCH_ENABLED = "0";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMP_ROOT = join(__dirname, "..", "temp", "upsc");

const PAPERS = [
    {
        id: "gs",
        file: "general-studies.txt",
        label: "Paper I — General Studies (GS)",
        sectionName: "General Studies",
        topic: "Competitive › Civil Services › UPSC › Prelims › Paper I — General Studies",
        count: 100,
        marks: 200,
        duration: "2 Hours",
        difficulty: "medium",
    },
    {
        id: "csat",
        file: "csat.txt",
        label: "Paper II — CSAT (Civil Services Aptitude Test)",
        sectionName: "CSAT",
        topic: "Competitive › Civil Services › UPSC › Prelims › Paper II — CSAT",
        count: 80,
        marks: 200,
        duration: "2 Hours",
        difficulty: "medium",
    },
];

const toCategoryPath = (topic) =>
    topic
        .split("›")
        .map((s) => s.trim())
        .filter(Boolean)
        .join(">");

function buildPlanBlock(paper) {
    return [
        `UPSC Preliminary Examination — ${paper.label}`,
        "=".repeat(60),
        `Topic: ${paper.topic}`,
        `Category path: ${toCategoryPath(paper.topic)}`,
        `Section: ${paper.sectionName}`,
        `Target: ${paper.count} single-answer MCQs`,
        `Marks: ${paper.marks}`,
        `Duration: ${paper.duration}`,
        `Difficulty: ${paper.difficulty}`,
        `Provider: Gemini (generate-question-bank-suggestions only)`,
        "",
        "GENERATION PLAN:",
        `1. generateQuestionBankSuggestions with singleCount=${paper.count} (chunked ≤10 per call)`,
        "2. generationProvider: gemini",
        "3. inferCountsIfMissing: false",
        "4. No validate / infer API calls",
        "5. EXAM_REFERENCE_RESEARCH_ENABLED=0",
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
    let paperFilter = null;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === "--paper" && args[i + 1]) paperFilter = args[++i].toLowerCase();
    }
    return { planOnly, paperFilter };
}

function ensurePlan(paper, outPath) {
    mkdirSync(dirname(outPath), { recursive: true });
    if (!existsSync(outPath)) {
        writeFileSync(outPath, buildPlanBlock(paper), "utf8");
        console.log(`  Plan written: ${outPath}`);
    }
}

async function callGenerate(
    generateQuestionBankSuggestions,
    paper,
    singleCount,
    excludeQuestionTexts,
    { continuation = false } = {}
) {
    let lastErr = null;
    for (let attempt = 1; attempt <= 4; attempt++) {
        try {
            return await generateQuestionBankSuggestions({
                topic: paper.topic,
                bankName: paper.topic,
                difficulty: paper.difficulty,
                singleCount,
                multipleCount: 0,
                trueFalseCount: 0,
                passageCount: 0,
                passageSingleCount: 0,
                passageMultipleCount: 0,
                passageTrueFalseCount: 0,
                excludeQuestionTexts,
                categoryPaths: [toCategoryPath(paper.topic)],
                sectionName: paper.sectionName,
                generationProvider: "gemini",
                inferCountsIfMissing: false,
                generateIntent: "initial",
                topicRelevanceEvaluated: false,
                topicRelevanceRegenerated: false,
                hasGeneratedQuestions: continuation,
                allowContinuation: continuation,
                forceOneShot: true,
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

async function generatePaper(paper, generateQuestionBankSuggestions) {
    const outPath = join(TEMP_ROOT, paper.file);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, buildPlanBlock(paper), "utf8");

    const runHeader = [
        `RUN: ${new Date().toISOString()}`,
        `Generating ${paper.count} questions for ${paper.label}...`,
        "",
    ].join("\n");
    appendFileSync(outPath, runHeader, "utf8");

    const started = Date.now();
    const allQuestions = [];
    const excludeQuestionTexts = [];
    let round = 0;
    const maxRounds = Math.ceil(paper.count / 5) + 8;

    while (allQuestions.length < paper.count && round < maxRounds) {
        round += 1;
        const need = paper.count - allQuestions.length;
        const batchSize = Math.min(need, 10);
        const continuation = allQuestions.length > 0;

        if (round > 1) {
            const topUpHeader = [
                `TOP-UP ${round}: requesting ${batchSize} more (${allQuestions.length}/${paper.count} so far)`,
                "",
            ].join("\n");
            appendFileSync(outPath, topUpHeader, "utf8");
            console.log(
                `  Top-up ${round}: +${batchSize} (${allQuestions.length}/${paper.count})`
            );
        } else {
            console.log(`  Batch 1: ${batchSize} questions...`);
        }

        const result = await callGenerate(
            generateQuestionBankSuggestions,
            paper,
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
            if (allQuestions.length >= paper.count) break;
        }

        console.log(`  Received ${batch.length} (total ${allQuestions.length}/${paper.count})`);
        if (allQuestions.length < paper.count) await sleep(2000);
    }

    const questions = allQuestions.slice(0, paper.count);
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);

    const meta = [
        `Section: ${paper.sectionName}`,
        `Received: ${questions.length} / ${paper.count} questions (${round} generate call(s))`,
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
        `CUMULATIVE SUMMARY — ${paper.label}`,
        `Total questions: ${questions.length}`,
        `Marks: ${paper.marks}`,
        `Duration: ${paper.duration}`,
        `Generated: ${new Date().toISOString()}`,
        "=".repeat(60),
        "",
        "Raw JSON:",
        JSON.stringify(questions, null, 2),
        "",
    ].join("\n");
    appendFileSync(outPath, footer, "utf8");

    console.log(
        `  ✓ ${questions.length}/${paper.count} questions → ${outPath} (${elapsed}s)`
    );
    return questions.length;
}

async function main() {
    const { planOnly, paperFilter } = parseArgs();
    const papers = PAPERS.filter((p) => !paperFilter || p.id === paperFilter);

    if (planOnly) {
        for (const paper of papers) {
            ensurePlan(paper, join(TEMP_ROOT, paper.file));
        }
        console.log("Plan-only complete.");
        return;
    }

    const { generateQuestionBankSuggestions } = await import(
        "../src/services/aiQuestion.service.js"
    );

    console.log("UPSC Prelims — Gemini question generation\n");

    let total = 0;
    for (const paper of papers) {
        console.log(`\n[${paper.label}]`);
        const n = await generatePaper(paper, generateQuestionBankSuggestions);
        total += n;
    }

    console.log(`\nDone. ${total} questions written to temp/upsc/`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

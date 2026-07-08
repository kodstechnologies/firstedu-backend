/**
 * Generate JEE Mains / JEE Advanced full-paper questions via Gemini only.
 * Output: temp/jee-mains/{subject}.txt and temp/jee-advance/{subject}.txt
 *
 * Usage:
 *   node scripts/generate-jee-mains-advance-papers.mjs           # plan + generate all
 *   node scripts/generate-jee-mains-advance-papers.mjs --plan-only
 *   node scripts/generate-jee-mains-advance-papers.mjs --exam jee-mains --subject physics
 */
import dotenv from "dotenv";
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

dotenv.config();
process.env.EXAM_REFERENCE_RESEARCH_ENABLED = "0";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMP_ROOT = join(__dirname, "..", "temp");

const EXAMS = [
    {
        id: "jee-mains",
        label: "JEE Mains",
        topic: "Competitive › Engineering › JEE-Mains › Full paper",
        count: 25,
        difficulty: "hard",
        subjects: ["Physics", "Chemistry", "Mathematics"],
    },
    {
        id: "jee-advance",
        label: "JEE Advanced",
        topic: "Competitive › Engineering › JEE-advance › Full paper",
        count: 18,
        difficulty: "hard",
        subjects: ["Physics", "Chemistry", "Mathematics"],
    },
];

const slug = (s) =>
    String(s)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

const toCategoryPath = (topic) =>
    topic
        .split("›")
        .map((s) => s.trim())
        .filter(Boolean)
        .join(">");

function buildPlanBlock(exam, subject) {
    return [
        `${exam.label} Full Paper — ${subject}`,
        "=".repeat(60),
        `Topic: ${exam.topic}`,
        `Category path: ${toCategoryPath(exam.topic)}`,
        `Section: ${subject}`,
        `Target: ${exam.count} single-answer MCQs`,
        `Difficulty: ${exam.difficulty}`,
        `Provider: Gemini (generate-question-bank-suggestions only)`,
        "",
        "GENERATION PLAN:",
        `1. One generateQuestionBankSuggestions call with singleCount=${exam.count}`,
        "2. generationProvider: gemini",
        "3. inferCountsIfMissing: false (explicit counts — no infer API)",
        "4. No validate-question-topic-relevance call",
        "5. No infer-competitive-exam-plan / infer-question-bank-counts call",
        "6. EXAM_REFERENCE_RESEARCH_ENABLED=0 (no reference-research Gemini call)",
        `7. Backend may chunk into ≤10-question Gemini batches internally; all ${exam.count} come from generation.`,
        "",
        "—".repeat(60),
        "",
    ].join("\n");
}

function formatQuestion(q, index) {
    const lines = [];
    lines.push(`Question ${index + 1}`);
    lines.push(`Type: ${q.questionType || "single"}`);
    lines.push(`Stem: ${q.questionText}`);
    const opts = q.options || [];
    const letters = ["A", "B", "C", "D"];
    opts.forEach((opt, i) => {
        if (String(opt || "").trim()) {
            lines.push(`  ${letters[i]}. ${opt}`);
        }
    });
    const correct =
        q.correctIndex != null ? letters[q.correctIndex] : "?";
    lines.push(`Correct: ${correct}`);
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
    let examFilter = null;
    let subjectFilter = null;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === "--exam" && args[i + 1]) examFilter = args[++i];
        if (args[i] === "--subject" && args[i + 1]) subjectFilter = slug(args[++i]);
    }
    return { planOnly, examFilter, subjectFilter };
}

function ensurePlan(exam, subject, outPath) {
    mkdirSync(dirname(outPath), { recursive: true });
    if (!existsSync(outPath)) {
        writeFileSync(outPath, buildPlanBlock(exam, subject), "utf8");
        console.log(`  Plan written: ${outPath}`);
    }
}

async function callGenerate(
    generateQuestionBankSuggestions,
    exam,
    subject,
    singleCount,
    excludeQuestionTexts,
    { continuation = false } = {}
) {
    let lastErr = null;
    for (let attempt = 1; attempt <= 4; attempt++) {
        try {
            return await generateQuestionBankSuggestions({
                topic: exam.topic,
                bankName: exam.topic,
                difficulty: exam.difficulty,
                singleCount,
                multipleCount: 0,
                trueFalseCount: 0,
                passageCount: 0,
                passageSingleCount: 0,
                passageMultipleCount: 0,
                passageTrueFalseCount: 0,
                excludeQuestionTexts,
                categoryPaths: [toCategoryPath(exam.topic)],
                sectionName: subject,
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

async function generateSubject(exam, subject, generateQuestionBankSuggestions) {
    const outDir = join(TEMP_ROOT, exam.id);
    const outPath = join(outDir, `${slug(subject)}.txt`);
    ensurePlan(exam, subject, outPath);

    const runHeader = [
        `RUN: ${new Date().toISOString()}`,
        `Generating ${exam.count} questions for ${subject}...`,
        "",
    ].join("\n");
    appendFileSync(outPath, runHeader, "utf8");

    const started = Date.now();
    const allQuestions = [];
    const excludeQuestionTexts = [];
    let round = 0;
    const maxRounds = 6;

    while (allQuestions.length < exam.count && round < maxRounds) {
        round += 1;
        const need = exam.count - allQuestions.length;
        const batchSize = Math.min(need, 10);
        const continuation = allQuestions.length > 0;

        if (round > 1) {
            const topUpHeader = [
                `TOP-UP ${round}: requesting ${batchSize} more (${allQuestions.length}/${exam.count} so far)`,
                "",
            ].join("\n");
            appendFileSync(outPath, topUpHeader, "utf8");
            console.log(
                `  Top-up ${round}: +${batchSize} (${allQuestions.length}/${exam.count})`
            );
        }

        const result = await callGenerate(
            generateQuestionBankSuggestions,
            exam,
            subject,
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
            if (allQuestions.length >= exam.count) break;
        }
    }

    const questions = allQuestions.slice(0, exam.count);
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);

    const meta = [
        `Subject: ${subject}`,
        `Received: ${questions.length} / ${exam.count} questions (${round} generate call(s))`,
        `Elapsed: ${elapsed}s`,
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
        `  ✓ ${questions.length}/${exam.count} questions → ${outPath} (${elapsed}s)`
    );
    return questions.length;
}

async function main() {
    const { planOnly, examFilter, subjectFilter } = parseArgs();

    const exams = EXAMS.filter((e) => !examFilter || e.id === examFilter);

    if (planOnly) {
        for (const exam of exams) {
            for (const subject of exam.subjects) {
                if (subjectFilter && slug(subject) !== subjectFilter) continue;
                const outPath = join(TEMP_ROOT, exam.id, `${slug(subject)}.txt`);
                ensurePlan(exam, subject, outPath);
            }
        }
        console.log("Plan-only complete.");
        return;
    }

    const { generateQuestionBankSuggestions } = await import(
        "../src/services/aiQuestion.service.js"
    );

    console.log("Gemini question generation (generate API only, no validate/infer)\n");

    let total = 0;
    for (const exam of exams) {
        console.log(`\n[${exam.label}]`);
        for (const subject of exam.subjects) {
            if (subjectFilter && slug(subject) !== subjectFilter) continue;
            console.log(`  ${subject} (${exam.count} questions)...`);
            const n = await generateSubject(
                exam,
                subject,
                generateQuestionBankSuggestions
            );
            total += n;
        }
    }

    console.log(`\nDone. ${total} questions appended across output files.`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

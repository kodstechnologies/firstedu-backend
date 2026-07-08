import dotenv from "dotenv";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(
    __dirname,
    "..",
    "..",
    "jee-main-2019-09jan-shift1-20-questions.txt"
);

const { generateQuestionBankSuggestions } = await import(
    "../src/services/aiQuestion.service.js"
);

const BANK =
    "JEE Main 2019 (09 Jan Shift 1) Previous Year Paper";

const BATCH_SIZE = 5;
const TOTAL = 20;
const BATCHES = TOTAL / BATCH_SIZE;

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
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

console.log(`Generating ${TOTAL} questions in ${BATCHES} batches of ${BATCH_SIZE}...`);

const allQuestions = [];
const excludeQuestionTexts = [];
const started = Date.now();

for (let b = 0; b < BATCHES; b++) {
    console.log(`Batch ${b + 1}/${BATCHES}...`);
    let batch = null;
    let lastErr = null;
    for (let attempt = 1; attempt <= 4; attempt++) {
        try {
            const result = await generateQuestionBankSuggestions({
                topic: BANK,
                bankName: BANK,
                difficulty: "hard",
                singleCount: BATCH_SIZE,
                multipleCount: 0,
                trueFalseCount: 0,
                passageCount: 0,
                excludeQuestionTexts,
                categoryPaths: ["JEE Main > Mathematics"],
            });
            batch = result?.questions ?? result;
            if (result?.detectedSubject?.label) {
                console.log(`  Subject: ${result.detectedSubject.label} (${result.detectedSubject.source})`);
            }
            break;
        } catch (err) {
            lastErr = err;
            const wait = 5000 * attempt;
            console.warn(
                `  Attempt ${attempt} failed: ${err.message}. Waiting ${wait / 1000}s...`
            );
            await sleep(wait);
        }
    }
    if (!batch) throw lastErr;

    allQuestions.push(...batch);
    for (const q of batch) {
        if (q.questionText) excludeQuestionTexts.push(q.questionText);
    }
    console.log(`  Got ${batch.length} (total ${allQuestions.length})`);
    if (b < BATCHES - 1) await sleep(3000);
}

const elapsed = ((Date.now() - started) / 1000).toFixed(1);

const header = [
    "JEE Main 2019 (09 Jan Shift 1) — AI Generated Questions",
    "=".repeat(60),
    `Bank: ${BANK}`,
    `Difficulty: hard`,
    `Count: ${allQuestions.length} single-answer MCQs`,
    `Generated: ${new Date().toISOString()}`,
    `Elapsed: ${elapsed}s`,
    "",
].join("\n");

const body = allQuestions.map((q, i) => formatQuestion(q, i)).join("\n");

const footer = [
    "",
    "=".repeat(60),
    "Raw JSON:",
    JSON.stringify(allQuestions, null, 2),
].join("\n");

writeFileSync(outPath, header + body + footer, "utf8");
console.log(`\nWrote ${allQuestions.length} questions to:\n${outPath}`);

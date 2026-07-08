/**
 * CLAT generation via Gemini:
 *   1. Direct CLAT setter prompt → temp/CLAT/prompt_response.txt
 *   2. FirstEdu generateQuestionBankSuggestions flow → temp/CLAT/flow_response.txt
 *
 * Usage:
 *   node scripts/generate-clat-prompt.mjs
 *   node scripts/generate-clat-prompt.mjs --prompt-only
 *   node scripts/generate-clat-prompt.mjs --flow-only
 */
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { resolveGeminiTextModel } from "../src/services/geminiTextModels.js";

dotenv.config();

process.env.EXAM_REFERENCE_RESEARCH_ENABLED = "0";
process.env.AI_QB_DIFFICULTY_SELF_AUDIT = "0";
process.env.AI_QB_SOLVE_FIRST = "0";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "temp", "CLAT");
const REFERENCE_PATH = join(__dirname, "..", "prompts", "clat-setter-reference.txt");

const CLAT_SECTION_BLUEPRINT = `
SECTION: Legal Reasoning

BLUEPRINT (fill in per section):
- Number of passages: 3
- Words per passage: 380-500, per CLAT norm
- Questions per passage: 4
- Total questions this section: 12
- Question numbering starts at: 1
`;

const CLAT_SETTER_PROMPT =
    readFileSync(REFERENCE_PATH, "utf8").trim() + CLAT_SECTION_BLUEPRINT;

const TOPIC = "Competitive › Law › CLAT › Legal Reasoning";
const CATEGORY_PATH = "Competitive>Law>CLAT>Legal Reasoning";

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

async function callGeminiText(prompt, { temperature = 0.35, maxAttempts = 6 } = {}) {
    if (!process.env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY is not configured in .env");
    }
    const model = resolveGeminiTextModel();
    const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    let lastErr = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            console.log(`[gemini] ${model} attempt ${attempt}/${maxAttempts}...`);
            const result = await genAI.models.generateContent({
                model,
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                config: { temperature },
            });
            const text = (result.text || "").trim();
            if (!text) throw new Error("Gemini returned empty response");
            return { text, model, attempt };
        } catch (err) {
            lastErr = err;
            const wait = Math.min(45000, 4000 * 2 ** (attempt - 1));
            console.warn(`  Failed: ${err.message}. Retrying in ${wait / 1000}s...`);
            await sleep(wait);
        }
    }
    throw lastErr;
}

function formatFlowQuestion(q, index) {
    const letters = ["A", "B", "C", "D"];
    const lines = [];
    lines.push(`Question ${index + 1}`);
    if (q.questionType === "connected") {
        lines.push(`Type: connected (passage)`);
        lines.push(`Title: ${q.title || "(untitled)"}`);
        lines.push(`Passage (${(q.passage || "").split(/\s+/).length} words):`);
        lines.push(q.passage || "");
        lines.push("");
        (q.subQuestions || []).forEach((sub, si) => {
            lines.push(`  Sub ${si + 1}: ${sub.questionText || ""}`);
            (sub.options || []).forEach((opt, oi) => {
                if (String(opt || "").trim()) lines.push(`    ${letters[oi]}. ${opt}`);
            });
            const ci = sub.correctIndex;
            lines.push(
                `    Correct: ${ci != null && ci >= 0 ? letters[ci] : sub.correctAnswer || "?"}`
            );
            lines.push(`    Explanation: ${sub.explanation || ""}`);
            lines.push("");
        });
    } else {
        lines.push(`Type: ${q.questionType || "single"}`);
        lines.push(`Stem: ${q.questionText || ""}`);
        (q.options || []).forEach((opt, i) => {
            if (String(opt || "").trim()) lines.push(`  ${letters[i]}. ${opt}`);
        });
        const ci = q.correctIndex;
        lines.push(
            `Correct: ${ci != null && ci >= 0 ? letters[ci] : q.correctAnswer || "?"}`
        );
        lines.push(`Explanation: ${q.explanation || ""}`);
    }
    lines.push("");
    return lines.join("\n");
}

async function runPromptCall() {
    const started = Date.now();
    const { text, model, attempt } = await callGeminiText(CLAT_SETTER_PROMPT);
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);

    const header = [
        "CLAT UG — Legal Reasoning Section",
        `Generated: ${new Date().toISOString()}`,
        `Provider: Gemini (${model})`,
        `Attempts: ${attempt}`,
        `Elapsed: ${elapsed}s`,
        "Source: Direct CLAT setter prompt (custom)",
        "=".repeat(72),
        "",
    ].join("\n");

    const outPath = join(OUT_DIR, "prompt_response.txt");
    writeFileSync(outPath, header + text + "\n", "utf8");
    console.log(`✓ prompt_response.txt (${elapsed}s) → ${outPath}`);
    return text;
}

async function runFlowCall() {
    const { generateQuestionBankSuggestions } = await import(
        "../src/services/aiQuestion.service.js"
    );

    const started = Date.now();
    console.log("[flow] generateQuestionBankSuggestions — CLAT Legal Reasoning...");
    console.log("  passageCount=3, passageSingleCount=4 (12 passage sub-questions)");

    let result = null;
    let lastErr = null;
    for (let attempt = 1; attempt <= 4; attempt++) {
        try {
            result = await generateQuestionBankSuggestions({
                topic: TOPIC,
                bankName: TOPIC,
                difficulty: "medium",
                singleCount: 0,
                multipleCount: 0,
                trueFalseCount: 0,
                passageCount: 3,
                passageSingleCount: 4,
                passageMultipleCount: 0,
                passageTrueFalseCount: 0,
                excludeQuestionTexts: [],
                categoryPaths: [CATEGORY_PATH],
                sectionName: "Legal Reasoning",
                generationProvider: "gemini",
                inferCountsIfMissing: false,
                generateIntent: "initial",
                generationMode: "prompt_first",
                topicRelevanceEvaluated: false,
                topicRelevanceRegenerated: false,
                hasGeneratedQuestions: false,
                allowContinuation: false,
            });
            break;
        } catch (err) {
            lastErr = err;
            const wait = 5000 * attempt;
            console.warn(`  Attempt ${attempt} failed: ${err.message}. Waiting ${wait / 1000}s...`);
            await sleep(wait);
        }
    }
    if (!result) throw lastErr;

    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    const questions = result?.questions ?? [];
    const summary = result?.pipelineSummary ?? {};

    const header = [
        "CLAT — FirstEdu Backend Generation Flow",
        `Generated: ${new Date().toISOString()}`,
        `Elapsed: ${elapsed}s`,
        `API: generateQuestionBankSuggestions`,
        `Provider: ${result?.generationProvider || "gemini"}`,
        `Topic: ${TOPIC}`,
        "",
        "REQUEST PAYLOAD:",
        JSON.stringify(
            {
                topic: TOPIC,
                bankName: TOPIC,
                difficulty: "medium",
                passageCount: 3,
                passageSingleCount: 4,
                generationProvider: "gemini",
                generateIntent: "initial",
            },
            null,
            2
        ),
        "",
        "PIPELINE SUMMARY:",
        JSON.stringify(summary, null, 2),
        "",
        `QUESTIONS RECEIVED: ${questions.length}`,
        "=".repeat(72),
        "",
    ].join("\n");

    const body = questions.map((q, i) => formatFlowQuestion(q, i)).join("\n");
    const footer = [
        "",
        "=".repeat(72),
        "RAW JSON RESPONSE:",
        JSON.stringify({ questions, pipelineSummary: summary, count: questions.length }, null, 2),
        "",
    ].join("\n");

    const outPath = join(OUT_DIR, "flow_response.txt");
    writeFileSync(outPath, header + body + footer, "utf8");
    console.log(`✓ flow_response.txt (${questions.length} items, ${elapsed}s) → ${outPath}`);
    return result;
}

function parseArgs() {
    const args = process.argv.slice(2);
    return {
        promptOnly: args.includes("--prompt-only"),
        flowOnly: args.includes("--flow-only"),
    };
}

async function main() {
    const { promptOnly, flowOnly } = parseArgs();
    mkdirSync(OUT_DIR, { recursive: true });

    console.log("CLAT generation — Gemini\n");

    if (!flowOnly) {
        console.log("\n[1/2] Direct CLAT setter prompt...");
        await runPromptCall();
    }

    if (!promptOnly) {
        console.log("\n[2/2] Backend generateQuestionBankSuggestions flow...");
        await runFlowCall();
    }

    console.log("\nDone.");
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

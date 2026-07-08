/**
 * Side-by-side comparison: prompt_first vs default (standard flow).
 *
 * Usage:
 *   node scripts/compare-generation-strategies.mjs
 *   node scripts/compare-generation-strategies.mjs --topic "Competitive > Law > CLAT"
 *
 * Output: temp/CLAT/side_by_side_comparison.txt
 */
import dotenv from "dotenv";
import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

dotenv.config();
process.env.EXAM_REFERENCE_RESEARCH_ENABLED = "0";
process.env.AI_QB_DIFFICULTY_SELF_AUDIT = "0";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "temp", "CLAT");
const OUT_FILE = join(OUT_DIR, "side_by_side_comparison.txt");

const DEFAULT_PAYLOAD = {
    topic: "Competitive › Law › CLAT › Legal Reasoning",
    bankName: "Competitive › Law › CLAT › Legal Reasoning",
    difficulty: "medium",
    singleCount: 0,
    multipleCount: 0,
    trueFalseCount: 0,
    passageCount: 1,
    passageSingleCount: 2,
    passageMultipleCount: 0,
    passageTrueFalseCount: 0,
    categoryPaths: ["Competitive>Law>CLAT>Legal Reasoning"],
    sectionName: "Legal Reasoning",
    generationProvider: "gemini",
    generateIntent: "initial",
};

function parseArgs() {
    const args = process.argv.slice(2);
    let topic = DEFAULT_PAYLOAD.topic;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === "--topic" && args[i + 1]) topic = args[++i];
    }
    return {
        ...DEFAULT_PAYLOAD,
        topic,
        bankName: topic,
    };
}

function wordCount(text = "") {
    return String(text || "").trim().split(/\s+/).filter(Boolean).length;
}

function resolveCorrectLetter(q) {
    const letters = ["A", "B", "C", "D"];
    if (q.correctIndex != null && q.correctIndex >= 0) return letters[q.correctIndex];
    const m = String(q.correctAnswer || "").match(/^([A-D])/i);
    return m ? m[1].toUpperCase() : "?";
}

function formatConnectedItem(q, index) {
    const lines = [];
    lines.push(`[Passage ${index + 1}] ${q.title || "(untitled)"}`);
    lines.push(`Words: ${wordCount(q.passage)}`);
    lines.push("");
    lines.push(String(q.passage || "").trim());
    lines.push("");
    (q.subQuestions || []).forEach((sub, si) => {
        lines.push(`Q${si + 1}. ${sub.questionText || ""}`);
        (sub.options || []).forEach((opt, oi) => {
            if (String(opt || "").trim()) {
                lines.push(`  (${String.fromCharCode(65 + oi)}) ${opt}`);
            }
        });
        lines.push(`ANSWER: ${resolveCorrectLetter(sub)}`);
        lines.push(`EXPLANATION: ${String(sub.explanation || "").slice(0, 400)}`);
        lines.push("");
    });
    return lines.join("\n");
}

function formatQuestions(questions = []) {
    const parts = [];
    let n = 0;
    for (const q of questions) {
        if (q.questionType === "connected") {
            parts.push(formatConnectedItem(q, n));
            n += 1;
        } else {
            parts.push(`[Standalone ${n + 1}] ${q.questionText || ""}`);
            n += 1;
        }
    }
    return parts.join("\n---\n\n") || "(no questions)";
}

function summarizeRun(label, result, elapsedMs, builtPrompt = null) {
    const questions = result?.questions ?? [];
    const summary = result?.pipelineSummary ?? {};
    const connected = questions.filter((q) => q.questionType === "connected");
    const passageWords = connected.map((q) => wordCount(q.passage));
    const subCount = connected.reduce(
        (n, q) => n + (q.subQuestions?.length || 0),
        0
    );

    return {
        label,
        elapsedSec: (elapsedMs / 1000).toFixed(1),
        questionItems: questions.length,
        passageCount: connected.length,
        subQuestionCount: subCount,
        passageWords,
        avgPassageWords: passageWords.length
            ? Math.round(passageWords.reduce((a, b) => a + b, 0) / passageWords.length)
            : 0,
        minPassageWords: passageWords.length ? Math.min(...passageWords) : 0,
        maxPassageWords: passageWords.length ? Math.max(...passageWords) : 0,
        correctnessScore: summary.correctnessScore ?? "—",
        difficultyMatchScore: summary.difficultyMatchScore ?? "—",
        generationMode: summary.generationMode ?? label,
        difficultySource: result?.difficultyResolution?.source ?? "—",
        generationDifficulty: result?.generationDifficulty ?? "—",
        promptLength: builtPrompt?.length ?? "—",
        formatted: formatQuestions(questions),
        rawJson: JSON.stringify({ questions, pipelineSummary: summary }, null, 2),
    };
}

function padCol(text, width) {
    const lines = String(text || "").split("\n");
    return lines
        .map((line) => {
            const len = line.length;
            return len >= width ? line.slice(0, width - 1) + "…" : line + " ".repeat(width - len);
        })
        .join("\n");
}

function sideBySideBlock(left, right, width = 58) {
    const leftLines = String(left).split("\n");
    const rightLines = String(right).split("\n");
    const max = Math.max(leftLines.length, rightLines.length);
    const out = [];
    for (let i = 0; i < max; i++) {
        const l = (leftLines[i] ?? "").slice(0, width);
        const r = (rightLines[i] ?? "").slice(0, width);
        out.push(
            l.padEnd(width, " ") + " │ " + r.padEnd(width, " ")
        );
    }
    return out.join("\n");
}

async function runStrategy(
    generateQuestionBankSuggestions,
    buildPromptFirstQuestionBankPrompt,
    payload,
    generationMode
) {
    const started = Date.now();
    const result = await generateQuestionBankSuggestions({
        ...payload,
        generationMode,
    });
    const elapsed = Date.now() - started;
    const builtPrompt =
        generationMode === "prompt_first"
            ? buildPromptFirstQuestionBankPrompt({
                  topic: payload.topic,
                  bankName: payload.bankName,
                  sectionName: payload.sectionName,
                  categoryPaths: payload.categoryPaths,
                  difficulty: payload.difficulty,
                  singleCount: payload.singleCount,
                  multipleCount: payload.multipleCount,
                  trueFalseCount: payload.trueFalseCount,
                  passageCount: payload.passageCount,
                  passageSingleCount: payload.passageSingleCount,
                  passageMultipleCount: payload.passageMultipleCount,
                  passageTrueFalseCount: payload.passageTrueFalseCount,
              })
            : null;
    return {
        result,
        elapsed,
        builtPrompt,
        label: generationMode === "prompt_first" ? "PROMPT FIRST" : "STANDARD FLOW",
    };
}

async function main() {
    const payload = parseArgs();
    mkdirSync(OUT_DIR, { recursive: true });

    const { generateQuestionBankSuggestions } = await import(
        "../src/services/aiQuestion.service.js"
    );
    const { buildPromptFirstQuestionBankPrompt } = await import(
        "../src/services/examPromptFirst.service.js"
    );
    const { detectExamProfile } = await import(
        "../src/services/examDifficultyCalibration.js"
    );

    console.log("Comparing generation strategies (same payload)\n");
    console.log(JSON.stringify(payload, null, 2));
    console.log("");

    console.log("[1/2] prompt_first...");
    const promptRun = await runStrategy(
        generateQuestionBankSuggestions,
        buildPromptFirstQuestionBankPrompt,
        payload,
        "prompt_first"
    );
    console.log(`  done in ${(promptRun.elapsed / 1000).toFixed(1)}s`);

    console.log("[2/2] default (standard flow)...");
    const flowRun = await runStrategy(
        generateQuestionBankSuggestions,
        buildPromptFirstQuestionBankPrompt,
        payload,
        "default"
    );
    console.log(`  done in ${(flowRun.elapsed / 1000).toFixed(1)}s`);

    const prompt = summarizeRun(
        "prompt_first",
        promptRun.result,
        promptRun.elapsed,
        promptRun.builtPrompt
    );
    const flow = summarizeRun("default", flowRun.result, flowRun.elapsed);

    const examProfile = detectExamProfile({
        topic: payload.topic,
        bankName: payload.bankName,
        sectionName: payload.sectionName,
        categoryPaths: payload.categoryPaths,
    });

    const header = [
        "CLAT / EXAM GENERATION — SIDE-BY-SIDE COMPARISON",
        `Generated: ${new Date().toISOString()}`,
        "",
        "SHARED REQUEST (identical for both runs):",
        JSON.stringify(payload, null, 2),
        "",
        `Detected exam profile: ${examProfile}`,
        "",
        "=".repeat(120),
        "",
        "METRICS",
        "",
        sideBySideBlock(
            [
                "PROMPT FIRST (prompt_first)",
                "────────────────────────────",
                `Time: ${prompt.elapsedSec}s`,
                `Pipeline mode: ${prompt.generationMode}`,
                `Difficulty source: ${prompt.difficultySource}`,
                `Generation difficulty: ${prompt.generationDifficulty}`,
                `Built prompt length: ${prompt.promptLength} chars`,
                `Passage items returned: ${prompt.passageCount}`,
                `Sub-questions: ${prompt.subQuestionCount}`,
                `Passage words (each): ${prompt.passageWords.join(", ") || "—"}`,
                `Avg passage words: ${prompt.avgPassageWords}`,
                `Correctness score: ${prompt.correctnessScore}`,
                `Difficulty match: ${prompt.difficultyMatchScore}`,
            ].join("\n"),
            [
                "STANDARD FLOW (default)",
                "────────────────────────────",
                `Time: ${flow.elapsedSec}s`,
                `Pipeline mode: ${flow.generationMode}`,
                `Difficulty source: ${flow.difficultySource}`,
                `Generation difficulty: ${flow.generationDifficulty}`,
                `Built prompt length: internal (buildQuestionBankPrompt)`,
                `Passage items returned: ${flow.passageCount}`,
                `Sub-questions: ${flow.subQuestionCount}`,
                `Passage words (each): ${flow.passageWords.join(", ") || "—"}`,
                `Avg passage words: ${flow.avgPassageWords}`,
                `Correctness score: ${flow.correctnessScore}`,
                `Difficulty match: ${flow.difficultyMatchScore}`,
            ].join("\n")
        ),
        "",
        "KEY DIFFERENCES (what to look for)",
        "",
        sideBySideBlock(
            [
                "• Exam-setter prompt (CLAT 380–500 words)",
                "• Skips solve-first / veteran upscale",
                "• Difficulty gradient in prompt",
                "• Principle + fact pattern in passage",
                "• UI: Generate (prompt strategy)",
            ].join("\n"),
            [
                "• buildQuestionBankPrompt (80–250 word RC)",
                "• May use exam-native hard upscale",
                "• JEE blocks if STEM; generic competitive",
                "• Often principle-summary style",
                "• UI: Generate questions",
            ].join("\n")
        ),
        "",
        "=".repeat(120),
        "",
        "GENERATED CONTENT — SIDE BY SIDE",
        "",
        sideBySideBlock("PROMPT FIRST OUTPUT", "STANDARD FLOW OUTPUT"),
        "",
    ].join("\n");

    const contentCol = sideBySideBlock(prompt.formatted, flow.formatted, 58);

    const footer = [
        "",
        "=".repeat(120),
        "",
        "RAW JSON — PROMPT FIRST",
        prompt.rawJson,
        "",
        "=".repeat(120),
        "",
        "RAW JSON — STANDARD FLOW",
        flow.rawJson,
        "",
    ].join("\n");

    writeFileSync(OUT_FILE, header + contentCol + footer, "utf8");
    console.log(`\n✓ Written: ${OUT_FILE}`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

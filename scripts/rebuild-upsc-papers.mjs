/**
 * Rebuild clean cumulative UPSC txt files from the last JSON block in each file.
 * Optionally top up to target counts.
 */
import dotenv from "dotenv";
import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

dotenv.config();
process.env.EXAM_REFERENCE_RESEARCH_ENABLED = "0";

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPSC_DIR = join(__dirname, "..", "temp", "upsc");

const PAPERS = {
    gs: {
        file: "general-studies.txt",
        label: "Paper I — General Studies (GS)",
        sectionName: "General Studies",
        topic: "Competitive › Civil Services › UPSC › Prelims › Paper I — General Studies",
        count: 100,
        marks: 200,
        duration: "2 Hours",
        difficulty: "medium",
        chemistryFilter: true,
    },
    csat: {
        file: "csat.txt",
        label: "Paper II — CSAT (Civil Services Aptitude Test)",
        sectionName: "CSAT",
        topic: "Competitive › Civil Services › UPSC › Prelims › Paper II — CSAT",
        count: 80,
        marks: 200,
        duration: "2 Hours",
        difficulty: "medium",
        chemistryFilter: false,
    },
};

const toCategoryPath = (topic) =>
    topic.split("›").map((s) => s.trim()).filter(Boolean).join(">");

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
    const tier = q.difficultyTier || q.difficulty || "";
    const lines = [
        `Question ${index + 1}${tier ? ` [${tier}]` : ""}`,
        `Type: ${q.questionType || "single"}`,
        `Stem: ${q.questionText || ""}`,
    ];
    (q.options || []).forEach((opt, i) => {
        if (String(opt || "").trim()) lines.push(`  ${["A", "B", "C", "D"][i]}. ${opt}`);
    });
    lines.push(`Correct: ${resolveCorrectLetter(q)}`);
    lines.push(`Explanation: ${q.explanation || ""}`, "");
    return lines.join("\n");
}

function extractLastJsonQuestions(filePath, { chemistryFilter = false } = {}) {
    const raw = readFileSync(filePath, "utf8");
    const marker = raw.lastIndexOf("Raw JSON:\n");
    if (marker < 0) throw new Error(`No Raw JSON in ${filePath}`);
    const questions = JSON.parse(raw.slice(marker + "Raw JSON:\n".length).trim());
    const seen = new Set();
    const deduped = [];
    for (const q of questions) {
        if (!q?.questionText || seen.has(q.questionText)) continue;
        if (
            chemistryFilter &&
            /ΔG|mol\/L|rate constant|hybridization|molarity|pH|equilibrium constant/i.test(
                q.questionText
            )
        ) {
            continue;
        }
        deduped.push(q);
        seen.add(q.questionText);
    }
    return deduped;
}

function writePaper(paper, questions) {
    const outPath = join(UPSC_DIR, paper.file);
    const header = [
        `UPSC Preliminary Examination — ${paper.label}`,
        "=".repeat(60),
        `Topic: ${paper.topic}`,
        `Section: ${paper.sectionName}`,
        `Total: ${questions.length} single-answer MCQs`,
        `Marks: ${paper.marks}`,
        `Duration: ${paper.duration}`,
        `Generated: ${new Date().toISOString()}`,
        `Provider: Gemini (one-shot)`,
        "",
        "—".repeat(60),
        "QUESTIONS",
        "—".repeat(60),
        "",
    ].join("\n");
    const body = questions.map((q, i) => formatQuestion(q, i)).join("\n");
    const footer = [
        "",
        "=".repeat(60),
        `CUMULATIVE SUMMARY — ${paper.label}`,
        `Total questions: ${questions.length}`,
        `Marks: ${paper.marks}`,
        `Duration: ${paper.duration}`,
        "=".repeat(60),
        "",
        "Raw JSON:",
        JSON.stringify(questions, null, 2),
        "",
    ].join("\n");
    writeFileSync(outPath, header + body + footer, "utf8");
    console.log(`Wrote ${questions.length} → ${outPath}`);
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

async function topUp(paper, need, excludeQuestionTexts, generateQuestionBankSuggestions) {
    let lastErr = null;
    for (let attempt = 1; attempt <= 4; attempt++) {
        try {
            const result = await generateQuestionBankSuggestions({
                topic: paper.topic,
                bankName: paper.topic,
                difficulty: paper.difficulty,
                singleCount: need,
                multipleCount: 0,
                trueFalseCount: 0,
                passageCount: 0,
                excludeQuestionTexts,
                categoryPaths: [toCategoryPath(paper.topic)],
                sectionName: paper.sectionName,
                generationProvider: "gemini",
                inferCountsIfMissing: false,
                forceOneShot: true,
            });
            return result?.questions ?? result ?? [];
        } catch (err) {
            lastErr = err;
            await sleep(5000 * attempt);
        }
    }
    throw lastErr;
}

async function rebuildPaper(paper, generateQuestionBankSuggestions) {
    const filePath = join(UPSC_DIR, paper.file);
    let questions = extractLastJsonQuestions(filePath, paper);
    console.log(`[${paper.sectionName}] loaded ${questions.length} from JSON`);

    const exclude = questions.map((q) => q.questionText).filter(Boolean);
    let rounds = 0;
    while (questions.length < paper.count && rounds < 5) {
        rounds += 1;
        const need = paper.count - questions.length;
        console.log(`[${paper.sectionName}] top-up round ${rounds}: need ${need}`);
        const batch = await topUp(paper, need, exclude, generateQuestionBankSuggestions);
        for (const q of batch) {
            if (!q?.questionText || exclude.includes(q.questionText)) continue;
            if (
                paper.chemistryFilter &&
                /ΔG|mol\/L|rate constant|hybridization|molarity|pH/i.test(q.questionText)
            ) {
                continue;
            }
            questions.push(q);
            exclude.push(q.questionText);
            if (questions.length >= paper.count) break;
        }
    }

    writePaper(paper, questions.slice(0, paper.count));
    return questions.length;
}

async function main() {
    const target = process.argv[2] || "all";
    const { generateQuestionBankSuggestions } = await import(
        "../src/services/aiQuestion.service.js"
    );

    const keys = target === "all" ? Object.keys(PAPERS) : [target];
    let total = 0;
    for (const key of keys) {
        const paper = PAPERS[key];
        if (!paper) throw new Error(`Unknown paper: ${key}`);
        total += await rebuildPaper(paper, generateQuestionBankSuggestions);
    }
    console.log(`Done. ${total} questions across ${keys.join(", ")}.`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

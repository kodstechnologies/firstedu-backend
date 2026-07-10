/**
 * JEE Mains Physics — prompt-first compose step only.
 * Calls resolveComposedGenerationPrompt (meta-prompt → Gemini → full setter prompt).
 *
 * Usage:
 *   node scripts/compose-jee-mains-physics-prompt.mjs
 *
 * Output:
 *   temp/competitive/engineering/jee-mains/physics-prompt-strategy.txt
 */
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { resolveComposedGenerationPrompt } from "../src/services/examPromptComposer.service.js";
import { resolveGeminiTextModel } from "../src/services/geminiTextModels.js";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "temp", "competitive", "engineering", "jee-mains");
const OUT_FILE = join(OUT_DIR, "physics-prompt-strategy.txt");

const TOPIC = "Competitive › Engineering › JEE Mains › Physics";
const CATEGORY_PATH = "Competitive>Engineering>JEE Mains>Physics";

const PAYLOAD = {
    topic: TOPIC,
    bankName: TOPIC,
    sectionName: "",
    categoryPaths: [CATEGORY_PATH],
    subject: "",
    difficulty: "hard",
    singleCount: 10,
    multipleCount: 0,
    trueFalseCount: 0,
    passageCount: 0,
    passageSingleCount: 0,
    passageMultipleCount: 0,
    passageTrueFalseCount: 0,
    excludeQuestionTexts: [],
};

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

async function callLlmText(prompt, { temperature = 0.2, maxAttempts = 6 } = {}) {
    if (!process.env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY is not configured in .env");
    }
    const model = resolveGeminiTextModel();
    const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    let lastErr = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            console.log(`[gemini] compose ${model} attempt ${attempt}/${maxAttempts}...`);
            const result = await genAI.models.generateContent({
                model,
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                config: { temperature },
            });
            const text = (result.text || "").trim();
            if (!text) throw new Error("Gemini returned empty response");
            return text;
        } catch (err) {
            lastErr = err;
            const wait = Math.min(45000, 5000 * 2 ** (attempt - 1));
            console.warn(`  Failed: ${err.message}. Retrying in ${wait / 1000}s...`);
            await sleep(wait);
        }
    }
    throw lastErr;
}

async function main() {
    mkdirSync(OUT_DIR, { recursive: true });

    const started = Date.now();
    console.log("JEE Mains Physics — PROMPT_COMPOSE flow\n");
    console.log(`  topic: ${TOPIC}`);
    console.log(`  counts: ${PAYLOAD.singleCount} single, hard`);
    console.log(`  maxSelectableSlots: 10\n`);

    const composed = await resolveComposedGenerationPrompt(PAYLOAD, {
        callLlmText: (prompt, opts) => callLlmText(prompt, opts),
    });

    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    const model = resolveGeminiTextModel();

    const header = [
        "COMPOSED FULL PROMPT (prompt_first — PROMPT_COMPOSE)",
        `Generated: ${new Date().toISOString()}`,
        `Topic: ${TOPIC}`,
        `Provider: Gemini (${model})`,
        `Compose source: ${composed.source}`,
        `Elapsed: ${elapsed}s`,
        `Counts: ${PAYLOAD.singleCount} single, ${PAYLOAD.multipleCount} multi, ${PAYLOAD.trueFalseCount} TF`,
        `Difficulty: ${PAYLOAD.difficulty}`,
        `maxSelectableSlots: 10`,
        "=".repeat(72),
        "",
    ].join("\n");

    const body = composed.prompt || "";
    const footer = [
        "",
        "=".repeat(72),
        "META",
        JSON.stringify(
            {
                source: composed.source,
                composedBodyLength: composed.composedBody?.length ?? 0,
                fullPromptLength: body.length,
                savedPath: composed.savedPath ?? null,
            },
            null,
            2
        ),
        "",
    ].join("\n");

    writeFileSync(OUT_FILE, header + body + footer, "utf8");
    console.log(`\n✓ Wrote ${OUT_FILE}`);
    console.log(`  full prompt: ${body.length} chars, ${elapsed}s`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

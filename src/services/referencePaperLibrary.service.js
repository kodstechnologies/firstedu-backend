/**
 * Reference-paper-grounded generation: a small library of real/representative
 * past papers keyed by exam profile (reference-papers/<examProfile>.txt).
 * The paper is used ONLY as a difficulty floor to exceed — topic/concept-slot
 * planning stays fully AI-driven (the same archetype planner solve-first
 * already uses), never derived from the paper's own topic list.
 */

import { existsSync, readFileSync, statSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { ApiError } from "../utils/ApiError.js";
import { pipelineTrace } from "../utils/aiApiCallLogger.js";
import { parseJsonObjectFromAIText } from "../utils/aiJsonRepair.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REFERENCE_PAPER_DIR = join(__dirname, "..", "..", "reference-papers");

/** examProfile -> { text, mtimeMs } */
const paperCache = new Map();
/** examProfile -> { mtimeMs, difficultyCalibration } */
const guidanceCache = new Map();

const referencePaperPath = (examProfile) =>
    join(REFERENCE_PAPER_DIR, `${examProfile}.txt`);

export const hasReferencePaper = (examProfile) =>
    existsSync(referencePaperPath(examProfile));

/** Returns the raw paper text, or null if no paper is configured for this profile. */
export const loadReferencePaper = (examProfile) => {
    const filePath = referencePaperPath(examProfile);
    if (!existsSync(filePath)) return null;

    const mtimeMs = statSync(filePath).mtimeMs;
    const cached = paperCache.get(examProfile);
    if (cached && cached.mtimeMs === mtimeMs) return cached.text;

    const text = readFileSync(filePath, "utf8").trim();
    paperCache.set(examProfile, { text, mtimeMs });
    return text;
};

const REFERENCE_PAPER_MAX_CHARS = 12_000;

const buildExtractionPrompt = (paperText) => `You are analyzing a real past exam paper. Its ONLY purpose here is to establish a difficulty FLOOR that new questions must exceed — you are not extracting a topic list, and the new questions do not need to stay within this paper's exact subject coverage.

=== REFERENCE PAPER (excerpt) ===
${paperText.slice(0, REFERENCE_PAPER_MAX_CHARS)}
=== END REFERENCE PAPER ===

Read the paper above and return a JSON object with exactly this field:
{
  "difficultyCalibration": "2-4 sentences characterizing the ACTUAL difficulty pattern observed in these real questions — typical step count, whether concepts get combined/fused, how much time pressure a real student would feel. Describe what you actually see in THIS paper, not a generic description. End with an explicit statement of what 'harder than this' would look like for this exam (e.g. deeper concept fusion, tighter time pressure, less telegraphed setups)."
}

Return ONLY the JSON object, no markdown fences, no commentary.`;

/**
 * Extracts a difficulty-floor description from the stored reference paper for
 * an exam profile — used purely to instruct generation to exceed it, never to
 * source topics or concept slots. One LLM call, cached per (profile, paper
 * mtime) so repeat generations against the same paper don't re-extract.
 */
export const extractReferencePaperGuidance = async ({
    examProfile,
    callLlmText,
}) => {
    const filePath = referencePaperPath(examProfile);
    if (!existsSync(filePath)) {
        throw new ApiError(
            400,
            `No reference paper configured for exam profile "${examProfile}". Add one at reference-papers/${examProfile}.txt`
        );
    }

    const mtimeMs = statSync(filePath).mtimeMs;
    const cached = guidanceCache.get(examProfile);
    if (cached && cached.mtimeMs === mtimeMs) {
        return { difficultyCalibration: cached.difficultyCalibration };
    }

    const paperText = loadReferencePaper(examProfile);
    pipelineTrace("REFERENCE_PAPER_EXTRACTION_START", {
        examProfile,
        paperLength: paperText.length,
    });

    const raw = await callLlmText(buildExtractionPrompt(paperText), {
        temperature: 0.1,
    });
    const parsed = parseJsonObjectFromAIText(raw);

    const difficultyCalibration = String(
        parsed?.difficultyCalibration || ""
    ).trim();

    if (!difficultyCalibration) {
        throw new ApiError(
            500,
            `Reference paper extraction for "${examProfile}" returned no usable difficulty calibration.`
        );
    }

    guidanceCache.set(examProfile, { mtimeMs, difficultyCalibration });
    pipelineTrace("REFERENCE_PAPER_EXTRACTION_DONE", {
        examProfile,
        difficultyCalibrationLength: difficultyCalibration.length,
    });

    return { difficultyCalibration };
};

/**
 * File logs for prompt-first (prompt-based) question generation.
 * All artifacts live under temp/prompt_based_generation/<run-key>/.
 */

import { existsSync, mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const PROMPT_BASED_GENERATION_DIR = join(
    __dirname,
    "..",
    "..",
    "temp",
    "prompt_based_generation"
);

const slugify = (value = "") =>
    String(value || "exam")
        .replace(/[^\w]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48)
        .toLowerCase() || "exam";

export const isPromptBasedGenLoggingEnabled = () => {
    const flag = process.env.AI_QB_PROMPT_BASED_GEN_LOG;
    if (flag === "0" || flag === "false") return false;
    return true;
};

const noopRun = () => ({
    runDir: null,
    runKey: null,
    save: () => null,
    finalize: () => null,
});

/**
 * @param {object} meta
 * @returns {{ runDir: string|null, runKey: string|null, save: Function, finalize: Function }}
 */
export const createPromptBasedGenerationRun = (meta = {}) => {
    if (!isPromptBasedGenLoggingEnabled()) {
        return noopRun();
    }

    try {
        const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        const slug = slugify(meta.topic || meta.bankName);
        const workflowLogKey = String(meta.workflowLogKey || "").trim();
        let runKey = workflowLogKey ? `${workflowLogKey}-${slug}` : `${stamp}-${slug}`;

        let runDir = join(PROMPT_BASED_GENERATION_DIR, runKey);
        if (existsSync(runDir)) {
            runKey = `${runKey}-${Date.now().toString(36)}`;
            runDir = join(PROMPT_BASED_GENERATION_DIR, runKey);
        }

        mkdirSync(runDir, { recursive: true });
        writeFileSync(
            join(runDir, "run-meta.json"),
            JSON.stringify(
                {
                    ...meta,
                    runKey,
                    startedAt: new Date().toISOString(),
                },
                null,
                2
            ),
            "utf8"
        );

        return {
            runDir,
            runKey,
            save(filename, content) {
                const path = join(runDir, filename);
                const body =
                    typeof content === "string"
                        ? content
                        : JSON.stringify(content, null, 2);
                writeFileSync(path, body, "utf8");
                return path;
            },
            finalize(summary = {}) {
                const path = join(runDir, "run-summary.json");
                writeFileSync(
                    path,
                    JSON.stringify(
                        {
                            ...summary,
                            runKey,
                            finishedAt: new Date().toISOString(),
                        },
                        null,
                        2
                    ),
                    "utf8"
                );
                return path;
            },
        };
    } catch {
        return noopRun();
    }
};

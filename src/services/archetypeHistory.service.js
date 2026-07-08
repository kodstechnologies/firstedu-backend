/**
 * Persist concept-slot / archetype ids across generation sessions per bank section.
 */

import fs from "fs/promises";
import path from "path";
import { pipelineTrace } from "../utils/aiApiCallLogger.js";

const HISTORY_DIR = path.join(process.cwd(), "temp", "archetype-history");
const MAX_ARCHETYPES_PER_BANK = Math.min(
    500,
    Math.max(50, Number(process.env.AI_QB_ARCHETYPE_HISTORY_MAX || 200))
);

const slugify = (text = "") =>
    String(text || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "")
        .slice(0, 96) || "default";

const historyPath = (bankName, sectionName) =>
    path.join(
        HISTORY_DIR,
        `${slugify(bankName)}__${slugify(sectionName || "default")}.json`
    );

export const isArchetypeHistoryEnabled = () => {
    const flag = process.env.AI_QB_ARCHETYPE_HISTORY;
    if (flag === "0" || flag === "false") return false;
    return true;
};

/** Load archetype ids previously used for this bank section. */
export const loadPersistedArchetypes = async ({
    bankName = "",
    sectionName = "",
} = {}) => {
    if (!isArchetypeHistoryEnabled() || !bankName?.trim()) return [];

    try {
        const raw = await fs.readFile(historyPath(bankName, sectionName), "utf8");
        const parsed = JSON.parse(raw);
        const list = Array.isArray(parsed?.archetypes)
            ? parsed.archetypes
            : Array.isArray(parsed)
              ? parsed
              : [];
        return [...new Set(list.map(String).filter(Boolean))].slice(
            -MAX_ARCHETYPES_PER_BANK
        );
    } catch (err) {
        if (err?.code !== "ENOENT") {
            pipelineTrace("ARCHETYPE_HISTORY_LOAD_FAILED", {
                error: err?.message || String(err),
            });
        }
        return [];
    }
};

/** Append new archetype ids to bank-section history (deduped, capped). */
export const persistArchetypes = async ({
    bankName = "",
    sectionName = "",
    archetypes = [],
} = {}) => {
    if (!isArchetypeHistoryEnabled() || !bankName?.trim()) return;

    const incoming = [...new Set((archetypes || []).map(String).filter(Boolean))];
    if (!incoming.length) return;

    try {
        await fs.mkdir(HISTORY_DIR, { recursive: true });
        const existing = await loadPersistedArchetypes({ bankName, sectionName });
        const merged = [...new Set([...existing, ...incoming])].slice(
            -MAX_ARCHETYPES_PER_BANK
        );
        await fs.writeFile(
            historyPath(bankName, sectionName),
            JSON.stringify(
                {
                    bankName,
                    sectionName: sectionName || "",
                    updatedAt: new Date().toISOString(),
                    archetypes: merged,
                },
                null,
                2
            ),
            "utf8"
        );
        pipelineTrace("ARCHETYPE_HISTORY_SAVED", {
            bank: bankName,
            section: sectionName || "(default)",
            total: merged.length,
            added: incoming.length,
        });
    } catch (err) {
        pipelineTrace("ARCHETYPE_HISTORY_SAVE_FAILED", {
            error: err?.message || String(err),
        });
    }
};

export default {
    isArchetypeHistoryEnabled,
    loadPersistedArchetypes,
    persistArchetypes,
};

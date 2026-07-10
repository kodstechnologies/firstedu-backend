/** Anthropic Claude text models for question generation (Messages API). */

export const CLAUDE_TEXT_MODEL_OPTIONS = [
    {
        id: "claude-sonnet-5",
        label: "Claude Sonnet 5",
        traffic: "medium",
        description:
            "Best speed + intelligence balance for exam MCQ generation (recommended)",
    },
    {
        id: "claude-sonnet-4-6",
        label: "Claude Sonnet 4.6",
        traffic: "medium",
        description: "Previous Sonnet generation — stable fallback",
    },
    {
        id: "claude-opus-4-8",
        label: "Claude Opus 4.8",
        traffic: "high",
        description: "Highest quality; slower and more expensive",
    },
];

export const CLAUDE_TEXT_MODEL_IDS = CLAUDE_TEXT_MODEL_OPTIONS.map((m) => m.id);

/** Default for question bank generation; override with CLAUDE_TEXT_MODEL in .env */
export const DEFAULT_CLAUDE_TEXT_MODEL = "claude-sonnet-5";

export const getClaudeTextModelOptions = () => CLAUDE_TEXT_MODEL_OPTIONS;

export const getClaudeTextModelMeta = (modelId) =>
    CLAUDE_TEXT_MODEL_OPTIONS.find((m) => m.id === modelId) || null;

export const resolveClaudeTextModel = (requestedModel) => {
    const fallback = String(
        process.env.CLAUDE_TEXT_MODEL || DEFAULT_CLAUDE_TEXT_MODEL
    ).trim();
    const model = String(requestedModel || fallback).trim();
    if (!CLAUDE_TEXT_MODEL_IDS.includes(model)) {
        throw new Error(
            `Unsupported Claude text model "${model}". Choose one of: ${CLAUDE_TEXT_MODEL_IDS.join(", ")}`
        );
    }
    return model;
};

import { ApiError } from "../utils/ApiError.js";

export const GENERATION_PROVIDER_IDS = ["gemini", "openai", "claude"];

/** @param {string} [provider] */
export const normalizeGenerationProvider = (provider) => {
    const p = String(provider || "gemini").trim().toLowerCase();
    if (p === "openai" || p === "claude") return p;
    return "gemini";
};

export const assertGenerationProviderConfigured = (provider) => {
    const p = normalizeGenerationProvider(provider);
    if (p === "gemini" && !process.env.GEMINI_API_KEY) {
        throw new ApiError(500, "Gemini API key is not configured (GEMINI_API_KEY)");
    }
    if (p === "openai" && !process.env.OPENAI_API_KEY) {
        throw new ApiError(500, "OpenAI API key is not configured (OPENAI_API_KEY)");
    }
    if (p === "claude" && !getAnthropicApiKey()) {
        throw new ApiError(
            500,
            "Anthropic API key is not configured (ANTHROPIC_API_KEY)"
        );
    }
    return p;
};

/** Supports standard API key; optional OAuth token for local/dev tooling. */
export const getAnthropicApiKey = () =>
    String(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_OAUTH_TOKEN || "").trim() ||
    null;

export const resolveGenerationTemperature = (
    provider,
    { genTemperature, openaiDefault = 0.15, defaultTemp = 0.1 } = {}
) => {
    if (genTemperature != null && Number.isFinite(Number(genTemperature))) {
        return Number(genTemperature);
    }
    return normalizeGenerationProvider(provider) === "openai"
        ? openaiDefault
        : defaultTemp;
};

export const generationProviderLabel = (provider) => {
    const p = normalizeGenerationProvider(provider);
    if (p === "openai") return "OpenAI";
    if (p === "claude") return "Claude";
    return "Gemini";
};

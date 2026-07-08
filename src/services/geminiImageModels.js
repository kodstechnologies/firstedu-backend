/** Gemini image model registry — Imagen (generateImages) + Nano Banana (generateContent). */

const IMAGEN_OPTIONS = [
    {
        id: "imagen-4.0-fast-generate-001",
        label: "Imagen 4 Fast",
        family: "imagen",
        description: "Fastest — good for quick drafts and testing",
    },
    {
        id: "imagen-4.0-generate-001",
        label: "Imagen 4 Standard",
        family: "imagen",
        description: "Balanced quality and speed (recommended)",
    },
    {
        id: "imagen-4.0-ultra-generate-001",
        label: "Imagen 4 Ultra",
        family: "imagen",
        description: "Highest fidelity — slower, best for final diagrams",
    },
];

const NANO_BANANA_OPTIONS = [
    {
        id: "gemini-2.5-flash-image",
        label: "Nano Banana",
        family: "nano_banana",
        description:
            "Gemini 2.5 Flash Image — fast, good for bulk exam diagrams",
    },
    {
        id: "gemini-3.1-flash-image",
        label: "Nano Banana 2",
        family: "nano_banana",
        description:
            "Gemini 3.1 Flash Image — sharper details and better text on figures",
    },
];

export const GEMINI_IMAGE_MODEL_OPTIONS = [...IMAGEN_OPTIONS, ...NANO_BANANA_OPTIONS];

export const GEMINI_IMAGE_MODEL_IDS = GEMINI_IMAGE_MODEL_OPTIONS.map((m) => m.id);

export const IMAGEN_IMAGE_MODEL_IDS = IMAGEN_OPTIONS.map((m) => m.id);

export const NANO_BANANA_IMAGE_MODEL_IDS = NANO_BANANA_OPTIONS.map((m) => m.id);

export const DEFAULT_IMAGEN_MODEL = "imagen-4.0-generate-001";

export const DEFAULT_GEMINI_IMAGE_MODEL = DEFAULT_IMAGEN_MODEL;

export const getGeminiImageModelOptions = () => GEMINI_IMAGE_MODEL_OPTIONS;

export const getImageModelMeta = (modelId) =>
    GEMINI_IMAGE_MODEL_OPTIONS.find((m) => m.id === modelId) || null;

export const isNanoBananaImageModel = (modelId) =>
    NANO_BANANA_IMAGE_MODEL_IDS.includes(String(modelId || "").trim());

export const isImagenImageModel = (modelId) =>
    IMAGEN_IMAGE_MODEL_IDS.includes(String(modelId || "").trim());

export const resolveGeminiImageModel = (requestedModel) => {
    const fallback = String(
        process.env.GEMINI_IMAGE_MODEL || DEFAULT_GEMINI_IMAGE_MODEL
    ).trim();
    const model = String(requestedModel || fallback).trim();
    if (!GEMINI_IMAGE_MODEL_IDS.includes(model)) {
        throw new Error(
            `Unsupported Gemini image model "${model}". Choose one of: ${GEMINI_IMAGE_MODEL_IDS.join(", ")}`
        );
    }
    return model;
};

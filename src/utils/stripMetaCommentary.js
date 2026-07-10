/** Strip LLM draft/meta phrases — used by all generation paths. */
export const stripMetaCommentary = (text = "") =>
    String(text || "")
        .replace(/\(?\s*re-?calculat(?:ing|e)[^.)]*\)?/gi, "")
        .replace(/\(?\s*re-?evaluat(?:ing|e)[^.)]*\)?/gi, "")
        .replace(/\(?\s*correcting[^.)]*\)?/gi, "")
        .replace(/\bCorrection:\s*[^.]*\./gi, "")
        .replace(/\bwait\b[^.]*\./gi, "")
        .replace(/\?\s*No,[^.]*\./gi, "")
        .replace(
            /\(?\s*(?:Let'?s|let us)\s+(?:adjust|use|recalculate|recompute|try|assume|pick|choose|set|take)[^.)]*\)?/gi,
            ""
        )
        .replace(
            /\bhowever,?\s+considering\b[^.]*\bcalculated\s+as\b[^.]*\./gi,
            ""
        )
        .replace(/\bhowever,?\s+considering\b[^.]*\./gi, "")
        .replace(/\bcalculated\s+as\s+[^.]*\b(?:instead|but)\b[^.]*\./gi, "")
        .replace(/\(?\s*(?:Let'?s|Adjusting|adjust)\s+(?:mass|to match|parameters|F\s+to)[^.)]*\)?/gi, "")
        .replace(/\bFinal check:[^.]*\./gi, "")
        .replace(/\bis incorrect\b[^.]*\./gi, "")
        .replace(/\busing\s+standard\s+constants[^.]*\./gi, "")
        .replace(/\b(?:let us|let's)\s+use\s+option\s+[A-D][^.]*\./gi, "")
        .trim();

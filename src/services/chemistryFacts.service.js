/**
 * Curated chemistry facts for deterministic verification (hybridization, dipole, etc.).
 */

const normFormula = (s) =>
    String(s || "")
        .replace(/\s+/g, "")
        .replace(/[₀-₉]/g, (c) => {
            const sub = "₀₁₂₃₄₅₆₇₈₉";
            const i = sub.indexOf(c);
            return i >= 0 ? String(i) : c;
        })
        .toUpperCase();

export { normFormula };

/** Steric-number / VSEPR hybridization for common exam molecules. */
export const HYBRIDIZATION_BY_FORMULA = {
    SF6: "sp³d²",
    SF4: "sp³d",
    XEF4: "sp³d²",
    XEF2: "sp³d",
    PF5: "sp³d",
    PCL5: "sp³d",
    CH4: "sp³",
    NH3: "sp³",
    H2O: "sp³",
    CO2: "sp",
    BF3: "sp²",
    BCL3: "sp²",
    C2H4: "sp²",
    C2H2: "sp",
    XEF6: "sp³d³",
    IF7: "sp³d³",
    CLF3: "sp³d",
    BRF5: "sp³d²",
};

/** Molecules with zero dipole moment (symmetric). */
export const ZERO_DIPOLE_MOLECULES = new Set(
    [
        "CO2",
        "BF3",
        "CCL4",
        "CH4",
        "CS2",
        "BCL3",
        "BECL2",
        "PCL5",
        "SF6",
        "XEF4",
    ].map(normFormula)
);

/** Molecules that are polar (common distractors for zero-dipole items). */
export const POLAR_MOLECULES = new Set(
    ["H2O", "NH3", "HCL", "CH3CL", "SO2", "NO2", "CHCL3", "PH3"].map(normFormula)
);

export const getHybridizationForFormula = (formula) => {
    const key = normFormula(formula);
    return HYBRIDIZATION_BY_FORMULA[key] || null;
};

export const isZeroDipoleMolecule = (formula) =>
    ZERO_DIPOLE_MOLECULES.has(normFormula(formula));

export const extractMoleculeFromStem = (stem) => {
    const text = String(stem || "");
    const patterns = [
        /\b(in|of|for)\s+([A-Z][A-Za-z₀-₉\d]{1,8})\s+molecule\b/i,
        /\bhybridization\b[^A-Z]*\b(?:of\s+)?(?:the\s+)?(?:central\s+atom\s+in\s+)?([A-Z][A-Za-z₀-₉\d]{1,8})\b/i,
        /\bcentral\s+(?:sulfur|atom)\s+in\s+(?:the\s+)?([A-Z][A-Za-z₀-₉\d]{1,8})\b/i,
        /\b([A-Z][A-Za-z₀-₉\d]{1,8})\s+molecule\b/i,
        /\bin\s+([A-Z]{1,2}F\d+)\b/i,
    ];
    for (const pat of patterns) {
        const m = text.match(pat);
        if (m?.[1]) {
            const f = normFormula(m[1]);
            if (HYBRIDIZATION_BY_FORMULA[f]) return m[1];
        }
    }
    return null;
};

const normHybrid = (s) =>
    String(s || "")
        .toLowerCase()
        .replace(/\s+/g, "")
        .replace(/³/g, "3")
        .replace(/²/g, "2")
        .replace(/dsp/g, "sp3d")
        .replace(/d2sp3/g, "sp3d2");

export const hybridizationMatches = (a, b) => normHybrid(a) === normHybrid(b);

export const extractHybridizationFromText = (text) => {
    const m = String(text || "").match(
        /\b(sp(?:³|3)?d(?:³|3)?|sp(?:³|3)?d(?:²|2)|sp(?:³|3)?d|dsp(?:³|3)|sp(?:³|3)|sp(?:²|2)|sp)\b/i
    );
    return m ? m[1] : null;
};

/** Radial nodes for orbital n l: n - l - 1 */
export const radialNodesForOrbital = (n, l) => Math.max(0, n - l - 1);

export const parseOrbitalFromStem = (stem) => {
    const m = String(stem || "").match(/\b(\d)\s*([spdf])\b/i);
    if (!m) return null;
    const n = Number(m[1]);
    const lMap = { s: 0, p: 1, d: 2, f: 3 };
    const l = lMap[m[2].toLowerCase()];
    if (!Number.isFinite(n) || l == null) return null;
    return { n, l, label: `${n}${m[2].toLowerCase()}` };
};

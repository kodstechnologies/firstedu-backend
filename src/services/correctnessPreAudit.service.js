/**
 * Deterministic correctness checks before / alongside LLM audit.
 * Catches explanation vs answer-key mismatches the model auditor often misses.
 */

import { computeSeparatedValidationScores, ISSUE_CATEGORY } from "./topicRelevanceValidation.service.js";
import {
    independentlyVerifyQuestion,
    parseNumber,
} from "./questionNumericVerify.service.js";
import {
    extractHybridizationFromText,
    extractMoleculeFromStem,
    getHybridizationForFormula,
    hybridizationMatches,
} from "./chemistryFacts.service.js";

const parseMarkedLetter = (correctAnswer) => {
    const m = String(correctAnswer || "").match(/^([A-D])\b/i);
    return m ? m[1].toUpperCase() : null;
};

const getMarkedOptionIndex = (q) => {
    if (Number.isFinite(q.correctIndex)) return q.correctIndex;
    const letter = parseMarkedLetter(q.correctAnswer);
    if (letter) return letter.charCodeAt(0) - 65;
    const opts = q.options || [];
    const ans = String(q.correctAnswer || "").trim();
    if (!ans) return null;
    const idx = opts.findIndex(
        (o) =>
            String(o || "").trim() === ans ||
            ans.endsWith(String(o || "").trim())
    );
    return idx >= 0 ? idx : null;
};

const norm = (s) =>
    String(s || "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();

const looksLikeNomenclatureOption = (s) =>
    /\b(?:bromo|chloro|iodo|fluoro|methyl|ethyl|propyl|butyl|benzene|cyclo|pentane|hexane|heptane|octane|butene|propene|isomer|toluene|aniline|carboxy|hydroxy|amino|nitro|oxo|yl)\b/i.test(
        String(s || "")
    );

const levenshteinRatio = (a, b) => {
    if (a === b) return 1;
    const m = a.length;
    const n = b.length;
    if (!m || !n) return 0;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(
                dp[i - 1][j] + 1,
                dp[i][j - 1] + 1,
                dp[i - 1][j - 1] + cost
            );
        }
    }
    const dist = dp[m][n];
    return 1 - dist / Math.max(m, n);
};

const optionTextSimilarity = (a, b) => {
    const na = norm(a);
    const nb = norm(b);
    if (!na || !nb) return 0;
    if (na === nb) return 1;
    return levenshteinRatio(na, nb);
};

const extractSqrtRadicand = (text) => {
    const m = String(text || "").match(/(?:√|sqrt\s*\(?\s*)(\d+(?:\.\d+)?)/i);
    return m ? m[1] : null;
};

const optionContainsValue = (optionText, value) => {
    const o = norm(optionText);
    const v = norm(value);
    if (!o || !v) return false;
    if (o === v || o.includes(v)) return true;
    const oSqrt = extractSqrtRadicand(o);
    const vSqrt = extractSqrtRadicand(v);
    if (oSqrt && vSqrt && oSqrt === vSqrt) return true;
    if (vSqrt && o.includes(vSqrt)) return true;
    if (/[:]|(?:am|pm)\b/.test(v)) {
        const hour = v.match(/^(\d{1,2})/)?.[1];
        if (hour && (o === `${hour} pm` || o === `${hour} am`)) return false;
        return false;
    }
    const num = v.match(/^(\d+(?:\.\d+)?)/);
    if (num && o.includes(num[1])) return true;
    return false;
};

const findOptionIndexForValue = (opts, value, excludeIdx = -1) =>
    opts.findIndex(
        (o, i) => i !== excludeIdx && optionContainsValue(o, value)
    );

/** pH / buffer stems with options outside 0–14 (e.g. bare 44 or 74). */
const detectInvalidPhScaleOptions = (q) => {
    const stem = norm(q.questionText);
    if (!/\bph\b|\bpka\b|\bbuffer\b|\bacetic acid\b|\bhenderson/i.test(stem)) {
        return null;
    }
    const opts = q.options || [];
    for (let i = 0; i < opts.length; i++) {
        const text = String(opts[i] || "").trim();
        const m = text.match(/^(\d+(?:\.\d+)?)\s*$/);
        if (!m) continue;
        const val = Number(m[1]);
        if (!Number.isFinite(val)) continue;
        if (val > 14 || val < 0) {
            return {
                questionNumber: q.sampleNumber,
                issue: `Invalid pH option ${String.fromCharCode(65 + i)} ("${text}") — pH must be between 0 and 14.`,
                severity: "critical",
                confidence: "confirmed",
                category: ISSUE_CATEGORY.FACTUAL,
            };
        }
    }
    return null;
};

/** Hybridization in stem vs marked option (e.g. SF6 must be sp³d²). */
const detectHybridizationFactualError = (q) => {
    const stem = String(q.questionText || "");
    if (!/hybridization/i.test(stem)) return null;
    const mol = extractMoleculeFromStem(stem);
    if (!mol) return null;
    const expected = getHybridizationForFormula(mol);
    if (!expected) return null;
    const opts = q.options || [];
    const markedIdx = getMarkedOptionIndex(q);
    if (markedIdx == null || !opts[markedIdx]) return null;
    const markedHyb = extractHybridizationFromText(opts[markedIdx]);
    if (!markedHyb || hybridizationMatches(markedHyb, expected)) return null;
    const altIdx = opts.findIndex((o) =>
        hybridizationMatches(extractHybridizationFromText(o), expected)
    );
    if (altIdx >= 0) {
        return {
            questionNumber: q.sampleNumber,
            issue: `${mol} hybridization should be ${expected} but marked ${opts[markedIdx]}; ${expected} is option ${String.fromCharCode(65 + altIdx)}.`,
            severity: "critical",
            confidence: "confirmed",
            category: ISSUE_CATEGORY.FACTUAL,
        };
    }
    return {
        questionNumber: q.sampleNumber,
        issue: `${mol} hybridization should be ${expected} but marked ${opts[markedIdx]}.`,
        severity: "critical",
        confidence: "confirmed",
        category: ISSUE_CATEGORY.FACTUAL,
    };
};

/** Independent numeric/factual solve disagrees with marked answer. */
const detectIndependentSolveMismatch = (q) => {
    const result = independentlyVerifyQuestion({
        questionText: q.questionText,
        options: q.options,
        correctIndex: getMarkedOptionIndex(q),
        correctAnswer: q.correctAnswer,
    });
    if (result.verified !== false) return null;
    return {
        questionNumber: q.sampleNumber,
        issue:
            result.issue ||
            `Independent solve disagrees with marked answer (${result.expected?.display || "see expected"}).`,
        severity: "critical",
        confidence: "confirmed",
        category: ISSUE_CATEGORY.FACTUAL,
    };
};

/** Invalid distractors (e.g. "30 PM"). */
const detectInvalidOptions = (q) => {
    const opts = q.options || [];
    for (const opt of opts) {
        const text = String(opt || "");
        if (/\b(?:[2-9]\d|3\d)\s*PM\b/i.test(text)) {
            return {
                questionNumber: q.sampleNumber,
                issue: `Invalid option: "${text}" — not a valid clock time.`,
                severity: "major",
                confidence: "confirmed",
                category: ISSUE_CATEGORY.FACTUAL,
            };
        }
    }
    return null;
};

/** Explanation explicitly names a different answer than the marked option. */
const detectExplanationConclusionMismatch = (q) => {
    const explanation = String(q.explanation || "");
    const opts = q.options || [];
    const markedIdx = getMarkedOptionIndex(q);
    if (markedIdx == null || !opts[markedIdx]) return null;

    const claimPatterns = [
        /(\d+(?:\.\d+)?)\s+is the answer/i,
        /answer is\s*(\d+(?:\.\d+)?)/i,
        /correct answer is\s*(\d+(?:\.\d+)?)/i,
        /conclud(?:es|ing)\s+(?:that\s+)?(?:the\s+)?(?:answer\s+is\s+)?(\d+(?:\.\d+)?)\b/i,
        /therefore,?\s+(?:the\s+)?(?:product\s+is\s+)?(\d+(?:\.\d+)?)\b/i,
        /ways\s*=\s*(\d+(?:\.\d+)?)/i,
        /total\s*=\s*(\d+(?:\.\d+)?)/i,
    ];

    for (const pat of claimPatterns) {
        const matches = [...explanation.matchAll(new RegExp(pat.source, pat.flags + "g"))];
        if (!matches.length) continue;
        const claimed = matches[matches.length - 1][1];
        if (optionContainsValue(opts[markedIdx], claimed)) continue;
        const altIdx = findOptionIndexForValue(opts, claimed, markedIdx);
        if (altIdx >= 0) {
            return {
                questionNumber: q.sampleNumber,
                issue: `Explanation concludes ${claimed} but marked answer is ${String.fromCharCode(65 + markedIdx)} (${opts[markedIdx]}); ${claimed} matches option ${String.fromCharCode(65 + altIdx)}.`,
                severity: "critical",
                confidence: "confirmed",
                category: ISSUE_CATEGORY.FACTUAL,
            };
        }
    }
    return null;
};

/** Explanation names a compound/option text that differs from the marked answer. */
const detectExplanationNamedConclusionMismatch = (q) => {
    const explanation = String(q.explanation || "");
    const opts = (q.options || []).map((o) => String(o || "").trim()).filter(Boolean);
    const markedIdx = getMarkedOptionIndex(q);
    if (markedIdx == null || !opts[markedIdx]) return null;

    const tail = explanation.slice(Math.max(0, explanation.length - 320));
    const patterns = [
        /\btherefore,?\s+(?:the\s+(?:correct\s+)?(?:product|compound|isomer|structure|answer)\s+is\s+)?([^.;,\n]{4,120})/i,
        /\bconclud(?:es|ing)\s+(?:that\s+)?(?:the\s+)?(?:product|compound|isomer|structure|answer)\s+is\s+([^.;,\n]{4,120})/i,
        /\bhence,?\s+(?:the\s+)?(?:product|compound|isomer|structure)\s+is\s+([^.;,\n]{4,120})/i,
    ];

    for (const pat of patterns) {
        const match = tail.match(pat);
        if (!match?.[1]) continue;
        const claimed = norm(match[1]);
        if (claimed.length < 4) continue;

        const markedNorm = norm(opts[markedIdx]);
        if (markedNorm.includes(claimed) || claimed.includes(markedNorm)) continue;

        let bestIdx = -1;
        let bestScore = 0;
        for (let i = 0; i < opts.length; i++) {
            const score = optionTextSimilarity(claimed, opts[i]);
            if (score > bestScore) {
                bestScore = score;
                bestIdx = i;
            }
        }

        if (bestIdx >= 0 && bestIdx !== markedIdx && bestScore >= 0.55) {
            return {
                questionNumber: q.sampleNumber,
                issue: `Explanation concludes "${match[1].trim()}" but marked answer is ${String.fromCharCode(65 + markedIdx)} (${opts[markedIdx]}).`,
                severity: "critical",
                confidence: "confirmed",
                category: ISSUE_CATEGORY.FACTUAL,
            };
        }
    }
    return null;
};

const EXPLANATION_META_COMMENTARY =
    /\b(?:re-?evaluat|re-?calculat|recomput|adjustment|editing option|my mistake|error in distractor|let(?:'s| us)\s+(?:adjust|use|recalculate|assume|pick|choose)|however,?\s+considering|calculated\s+as|is incorrect,\s*checking|none match|correction:|wait)\b/i;

/** Draft/meta commentary in explanation — not publishable on first pass. */
const detectExplanationMetaCommentary = (q) => {
    const explanation = String(q.explanation || "");
    if (!EXPLANATION_META_COMMENTARY.test(explanation)) return null;
    return {
        questionNumber: q.sampleNumber,
        issue:
            "Explanation contains draft/meta commentary (re-evaluating, correcting, etc.) — solve once and output the final answer only.",
        severity: "critical",
        confidence: "confirmed",
        category: ISSUE_CATEGORY.STYLE,
    };
};

/** Explanation names a different option letter as correct than the marked answer. */
const detectExplanationOptionClaimMismatch = (q) => {
    const explanation = String(q.explanation || "");
    const markedIdx = getMarkedOptionIndex(q);
    if (markedIdx == null) return null;
    const markedLetter = String.fromCharCode(65 + markedIdx);
    const claims = [
        ...explanation.matchAll(/\boption\s+([A-D])\s+is\s+correct\b/gi),
        ...explanation.matchAll(/\b([A-D])\s+is\s+(?:the\s+)?correct(?:\s+answer)?\b/gi),
    ];
    for (const m of claims) {
        const claimed = m[1].toUpperCase();
        if (claimed !== markedLetter && ["A", "B", "C", "D"].includes(claimed)) {
            return {
                questionNumber: q.sampleNumber,
                issue: `Explanation states option ${claimed} is correct but marked answer is ${markedLetter}.`,
                severity: "critical",
                confidence: "confirmed",
                category: ISSUE_CATEGORY.FACTUAL,
            };
        }
    }
    return null;
};

const VAGUE_JUSTIFICATION =
    /\b(?:adjusting for(?: the)? specific|specific (?:fringe|logic)|fringe count logic|without (?:proper )?(?:calculation|derivation)|hence (?:the )?answer follows|logic suggests|therefore we choose)\b/i;

/** Explanation uses vague hand-waving instead of deriving the marked answer. */
const detectExplanationVagueJustification = (q) => {
    const explanation = String(q.explanation || "");
    if (!VAGUE_JUSTIFICATION.test(explanation)) return null;
    return {
        questionNumber: q.sampleNumber,
        issue:
            "Explanation uses vague justification without valid mathematical derivation of the marked answer.",
        severity: "major",
        confidence: "confirmed",
        category: ISSUE_CATEGORY.STYLE,
    };
};

/** Explanation's final computed value is absent from all options (e.g. fringe math → 12.5 mm but options are 10, 15…). */
const detectExplanationFinalValueNotInOptions = (q) => {
    const explanation = String(q.explanation || "");
    const opts = q.options || [];
    const markedIdx = getMarkedOptionIndex(q);
    if (markedIdx == null || !opts.length) return null;

    const tail = explanation.slice(Math.max(0, explanation.length - 400));
    const matches = [
        ...tail.matchAll(
            /(?:=|is|are|gives?|yields?|difference\s+(?:is|of)?|equals?)\s*(-?\d+(?:\.\d+)?)\s*(mm|cm|m|eV|keV|MeV|nm|Å|Hz|kHz|s|ms|N|J|W|%|rad\/s|m\/s(?:²)?)?/gi
        ),
    ];
    if (!matches.length) return null;

    const last = matches[matches.length - 1];
    const val = last[1];
    const unit = String(last[2] || "").trim();
    if (!/^\d/.test(val)) return null;

    const anyOptMatches = opts.some(
        (o) =>
            optionContainsValue(o, val) ||
            (unit && norm(o).includes(norm(`${val} ${unit}`)))
    );
    const markedMatches =
        optionContainsValue(opts[markedIdx], val) ||
        (unit && norm(opts[markedIdx]).includes(norm(`${val} ${unit}`)));

    if (!anyOptMatches) {
        return {
            questionNumber: q.sampleNumber,
            issue: `Explanation derives ${val}${unit ? ` ${unit}` : ""} but that value does not appear among any option.`,
            severity: "critical",
            confidence: "confirmed",
            category: ISSUE_CATEGORY.FACTUAL,
        };
    }
    if (!markedMatches) {
        const altIdx = findOptionIndexForValue(opts, val, markedIdx);
        if (altIdx >= 0) {
            return {
                questionNumber: q.sampleNumber,
                issue: `Explanation concludes ${val}${unit ? ` ${unit}` : ""} but marked answer is ${String.fromCharCode(65 + markedIdx)} (${opts[markedIdx]}).`,
                severity: "critical",
                confidence: "confirmed",
                category: ISSUE_CATEGORY.FACTUAL,
            };
        }
    }
    return null;
};

/** Option text is trivially copied from or embedded in the stem (e.g. coordinates already in the equation). */
const detectTrivialOptionInStem = (q) => {
    const stem = norm(q.questionText);
    const opts = q.options || [];
    const isAptitudeTrapDistractor = (raw) => {
        const t = String(raw || "").trim();
        if (/^\d+(\.\d+)?\s*%$/.test(t)) return true;
        if (t.length <= 4) return true;
        return false;
    };
    for (let i = 0; i < opts.length; i++) {
        const raw = String(opts[i] || "").trim();
        const o = norm(raw);
        if (isAptitudeTrapDistractor(raw)) continue;
        if (/%/.test(stem) && /^\d+(\.\d+)?\s*%$/.test(raw)) continue;
        if (o.length >= 3 && (stem.includes(o) || stem.includes(raw.toLowerCase()))) {
            return {
                questionNumber: q.sampleNumber,
                issue: `Option ${String.fromCharCode(65 + i)} ("${raw}") is trivially embedded in the question stem — use a less obvious distractor.`,
                severity: "major",
                confidence: "confirmed",
                category: ISSUE_CATEGORY.STYLE,
            };
        }
    }
    return null;
};

/** Near-duplicate options (e.g. two "butene" without 1-/2- prefix). */
const detectNearDuplicateOptions = (q) => {
    if (String(q.questionType || "").toLowerCase() === "true_false") return null;
    const opts = (q.options || []).map((o) => String(o || "").trim()).filter(Boolean);
    if (opts.length < 2) return null;

    const looksLikeMathOrFormulaDistractor = (s) =>
        /[√/^()]|sqrt|mol|π|λ|β|\/\s*m|eV|mm|cm/i.test(s);

    for (let i = 0; i < opts.length; i++) {
        for (let j = i + 1; j < opts.length; j++) {
            if (norm(opts[i]) === norm(opts[j])) continue;
            const shorter = opts[i].length < opts[j].length ? opts[i] : opts[j];
            const longer = opts[i].length >= opts[j].length ? opts[i] : opts[j];
            if (shorter.length < 4) continue;
            if (
                looksLikeMathOrFormulaDistractor(shorter) &&
                looksLikeMathOrFormulaDistractor(longer)
            ) {
                continue;
            }
            const lengthRatio = shorter.length / longer.length;
            const substringHit =
                lengthRatio >= 0.9 && norm(longer).includes(norm(shorter));
            const similar =
                optionTextSimilarity(shorter, longer) > 0.92 || substringHit;
            if (similar) {
                const nomenclaturePair =
                    looksLikeNomenclatureOption(shorter) ||
                    looksLikeNomenclatureOption(longer);
                return {
                    questionNumber: q.sampleNumber,
                    issue: `Options ${String.fromCharCode(65 + i)} and ${String.fromCharCode(65 + j)} are near-duplicates — use clearly distinct distractors.`,
                    severity: nomenclaturePair ? "critical" : "major",
                    confidence: "confirmed",
                    category: nomenclaturePair
                        ? ISSUE_CATEGORY.FACTUAL
                        : ISSUE_CATEGORY.STYLE,
                };
            }
        }
    }
    return null;
};

/** Invalid scientific notation like "0 x 10^-5" instead of "1.0 × 10⁻⁵". */
const detectMalformedScientificNotationOptions = (q) => {
    if (String(q.questionType || "").toLowerCase() === "true_false") return null;
    const opts = (q.options || []).map((o) => String(o || "").trim()).filter(Boolean);
    const malformed = opts.filter((o) => /^0\s*[x×]\s*10/i.test(o));
    if (malformed.length >= 1) {
        return {
            questionNumber: q.sampleNumber,
            issue: `Option formatting error; use standard scientific notation (e.g. 1.0 × 10⁻⁵), not "${malformed[0]}".`,
            severity: "major",
            confidence: "confirmed",
            category: ISSUE_CATEGORY.FACTUAL,
        };
    }
    const leadingZero = opts.filter((o) => /^0(?:\s|$|\.)/.test(o) && !/^0\.\d/.test(o));
    if (leadingZero.length >= 3) {
        return {
            questionNumber: q.sampleNumber,
            issue: "Option formatting error; all options begin with '0' — use distinct, valid numeric values.",
            severity: "minor",
            confidence: "confirmed",
            category: ISSUE_CATEGORY.STYLE,
        };
    }
    return null;
};

/** Two or more identical option texts. */
const detectDuplicateOptions = (q) => {
    if (String(q.questionType || "").toLowerCase() === "true_false") return null;
    const opts = (q.options || []).map(norm).filter(Boolean);
    if (opts.length < 2) return null;
    if (opts.length !== new Set(opts).size) {
        return {
            questionNumber: q.sampleNumber,
            issue: "Two or more options are identical.",
            severity: "critical",
            confidence: "confirmed",
            category: ISSUE_CATEGORY.FACTUAL,
        };
    }
    return null;
};

/** "Multiple correct" MCQs are capped at exactly 2 correct answers — 3 or 4 correct is not a valid question for this format. */
const detectAllOptionsMarkedCorrect = (q) => {
    if (String(q.questionType || "").toLowerCase() !== "multiple") return null;
    const opts = q.options || [];
    const correctIdx = Array.isArray(q.multipleCorrectIndexes)
        ? q.multipleCorrectIndexes
        : [];
    if (opts.length < 2 || !correctIdx.length) return null;
    const uniqueCorrect = new Set(correctIdx.map(Number));
    if (uniqueCorrect.size > 2) {
        return {
            questionNumber: q.sampleNumber,
            issue: `${uniqueCorrect.size} of ${opts.length} options are marked correct — multiple-correct questions must have exactly 2 correct answers, never 3 or all ${opts.length}.`,
            severity: "major",
            confidence: "confirmed",
            category: ISSUE_CATEGORY.FACTUAL,
        };
    }
    return null;
};

/** Explanation self-corrects (Wait / nearest option) to a value that ≠ marked answer. */
const detectExplanationSelfCorrection = (q) => {
    const explanation = String(q.explanation || "");
    if (
        !/\bwait\b|\bcorrecting\b|\bnearest option\b|\bcheck math\b/i.test(
            explanation
        ) &&
        !EXPLANATION_META_COMMENTARY.test(explanation)
    ) {
        return null;
    }

    const opts = q.options || [];
    const markedIdx = getMarkedOptionIndex(q);
    if (markedIdx == null || !opts[markedIdx]) return null;

    const calcPortion = explanation.split(/\bnearest option\b/i)[0] || explanation;
    const timeMatches = [
        ...calcPortion.matchAll(
            /(\d{1,2}:\d{2}\s*(?:AM|PM)|\d{1,2}\s*(?:AM|PM))/gi
        ),
    ];
    if (timeMatches.length) {
        const colonTimes = timeMatches.filter((m) => m[1].includes(":"));
        const lastTime = (colonTimes.length ? colonTimes : timeMatches)[
            (colonTimes.length ? colonTimes : timeMatches).length - 1
        ][1];
        const markedOpt = norm(opts[markedIdx]);
        const timeNorm = norm(lastTime);
        const hourOnly = timeNorm.match(/^(\d{1,2})\s*(?:am|pm)$/);
        const matchesMarked =
            markedOpt === timeNorm ||
            markedOpt.includes(timeNorm) ||
            (hourOnly && markedOpt === `${hourOnly[1]} ${timeNorm.includes("pm") ? "pm" : "am"}`);
        if (!matchesMarked) {
            return {
                questionNumber: q.sampleNumber,
                issue: `Explanation revises to "${lastTime}" but marked answer is ${String.fromCharCode(65 + markedIdx)} (${opts[markedIdx]}).`,
                severity: "major",
                confidence: "confirmed",
                category: ISSUE_CATEGORY.FACTUAL,
            };
        }
    }

    const finalEquals = [
        ...explanation.matchAll(/=\s*(-?\d+(?:\.\d+)?)/g),
    ];
    if (finalEquals.length) {
        const val = finalEquals[finalEquals.length - 1][1];
        if (!optionContainsValue(opts[markedIdx], val)) {
            const altIdx = findOptionIndexForValue(opts, val, markedIdx);
            if (altIdx >= 0) {
                return {
                    questionNumber: q.sampleNumber,
                    issue: `Explanation self-corrects to ${val} but marked answer does not match that value.`,
                    severity: "critical",
                    confidence: "confirmed",
                    category: ISSUE_CATEGORY.FACTUAL,
                };
            }
            return {
                questionNumber: q.sampleNumber,
                issue: `Explanation derives ${val} in a self-correction but marked answer is ${String.fromCharCode(65 + markedIdx)} (${opts[markedIdx]}).`,
                severity: "major",
                confidence: "confirmed",
                category: ISSUE_CATEGORY.FACTUAL,
            };
        }
    }

    return null;
};

/** "Correction: ... is X" or derivation body contradicts marked option before Therefore. */
const detectExplanationCorrectionContradiction = (q) => {
    const explanation = String(q.explanation || "");
    const opts = q.options || [];
    const markedIdx = getMarkedOptionIndex(q);
    if (markedIdx == null || !opts[markedIdx]) return null;

    const correction = explanation.match(
        /Correction:\s*[^.]*?\b(?:is|=)\s*(\d+(?:\.\d+)?)\s*(W|J|N|m\/s(?:²)?|eV|mm|cm)?/i
    );
    if (correction) {
        const val = correction[1];
        if (!optionContainsValue(opts[markedIdx], val)) {
            const altIdx = findOptionIndexForValue(opts, val, markedIdx);
            const suffix = altIdx >= 0 ? `; ${val} matches option ${String.fromCharCode(65 + altIdx)}.` : ".";
            return {
                questionNumber: q.sampleNumber,
                issue: `Correction clause asserts ${val}${correction[2] ? ` ${correction[2]}` : ""} but marked answer is ${String.fromCharCode(65 + markedIdx)} (${opts[markedIdx]})${suffix}`,
                severity: "major",
                confidence: "confirmed",
                category: ISSUE_CATEGORY.FACTUAL,
            };
        }
    }

    const body = explanation.split(/\bTherefore\b/i)[0] || "";
    if (!body || body.length < 20) return null;

    const derivations = [
        ...body.matchAll(
            /(?:Power|P)\s*=\s*[^=]*=\s*(\d+(?:\.\d+)?)\s*W/gi
        ),
        ...body.matchAll(/=\s*(\d+(?:\.\d+)?)\s*W\b/gi),
    ];
    if (!derivations.length) return null;

    const val = derivations[derivations.length - 1][1];
    if (optionContainsValue(opts[markedIdx], val)) return null;

    const altIdx = findOptionIndexForValue(opts, val, markedIdx);
    if (altIdx >= 0) {
        return {
            questionNumber: q.sampleNumber,
            issue: `Explanation derives ${val} W but marked answer is ${String.fromCharCode(65 + markedIdx)} (${opts[markedIdx]}); ${val} W matches option ${String.fromCharCode(65 + altIdx)}.`,
            severity: "major",
            confidence: "confirmed",
            category: ISSUE_CATEGORY.FACTUAL,
        };
    }

    if (/\bCorrection:|re-?calculat/i.test(body)) {
        return {
            questionNumber: q.sampleNumber,
            issue: `Power calculation yields ${val} W; explanation states ${opts[markedIdx]} but marked answer does not match final calculation.`,
            severity: "major",
            confidence: "confirmed",
            category: ISSUE_CATEGORY.FACTUAL,
        };
    }

    return null;
};

/** Final arithmetic in explanation (= N) disagrees with marked numeric option. */
const detectExplanationNumericMismatch = (q) => {
    const explanation = String(q.explanation || "");
    const opts = q.options || [];
    const markedIdx = getMarkedOptionIndex(q);
    if (markedIdx == null || !opts[markedIdx]) return null;

    const tail = explanation.slice(Math.max(0, explanation.length - 280));
    const calcMatches = [...tail.matchAll(/=\s*(-?\d+(?:\.\d+)?)/g)];
    if (!calcMatches.length) return null;

    const val = calcMatches[calcMatches.length - 1][1];
    if (!/^\d/.test(val)) return null;
    if (optionContainsValue(opts[markedIdx], val)) return null;

    const altIdx = findOptionIndexForValue(opts, val, markedIdx);
    if (altIdx >= 0) {
        return {
            questionNumber: q.sampleNumber,
            issue: `Explanation derives ${val} but marked answer is ${String.fromCharCode(65 + markedIdx)} (${opts[markedIdx]}).`,
            severity: "critical",
            confidence: "confirmed",
            category: ISSUE_CATEGORY.FACTUAL,
        };
    }
    return null;
};

const BATCH_DUPLICATE_STEM_RATIO = 0.85;

/** Near-duplicate stems within the same batch (e.g. Q5 = Q14, Q8 = Q15). */
export const detectBatchDuplicateStemIssues = (sampled = []) => {
    const issues = [];
    const seen = [];

    for (const q of sampled) {
        const stem = norm(q.questionText);
        if (!stem || stem.length < 12) continue;

        for (const prev of seen) {
            const ratio = levenshteinRatio(stem, prev.norm);
            const duplicate =
                stem === prev.norm ||
                ratio >= BATCH_DUPLICATE_STEM_RATIO ||
                (stem.length >= 20 &&
                    prev.norm.length >= 20 &&
                    (stem.includes(prev.norm) || prev.norm.includes(stem)));
            if (!duplicate) continue;

            issues.push({
                questionNumber: q.sampleNumber,
                issue: `Near-duplicate of question ${prev.sampleNumber} — same stem or logic; use a different problem.`,
                severity: "major",
                confidence: "confirmed",
                category: ISSUE_CATEGORY.DIVERSITY,
            });
            break;
        }

        seen.push({ norm: stem, sampleNumber: q.sampleNumber });
    }

    return issues;
};

/** Normalized stem for within-batch duplicate checks. */
export const normStemForBatchCompare = (s) => norm(s);

/**
 * True if stem is a near-duplicate of any stem already accepted in this batch.
 * @param {string} stem
 * @param {string[]} seenStems normalized stems from normStemForBatchCompare
 */
export const isBatchStemNearDuplicate = (
    stem,
    seenStems = [],
    { ratioThreshold = 0.85, veteran = false } = {}
) => {
    const n = norm(stem);
    if (!n || n.length < 12) return false;
    const threshold = veteran ? Math.min(ratioThreshold, 0.75) : ratioThreshold;

    for (const prev of seenStems) {
        const ratio = levenshteinRatio(n, prev);
        if (
            n === prev ||
            ratio >= threshold ||
            (n.length >= 20 &&
                prev.length >= 20 &&
                (n.includes(prev) || prev.includes(n)))
        ) {
            return true;
        }
    }
    return false;
};

export const registerBatchStem = (stem, seenStems = []) => {
    const n = norm(stem);
    if (n && n.length >= 12) seenStems.push(n);
    return seenStems;
};

/**
 * The pipeline appends "Therefore, the correct answer is <marked option>." to solve-first
 * explanations. That sentence is generated by CODE from the key, so it always agrees with
 * the key and masks whatever the model actually concluded. Strip it (it has historically
 * been appended twice) so the detectors below see the model's real conclusion.
 */
const stripAppendedClosing = (explanation) => {
    let text = String(explanation || "").trim();
    const closing = /\s*Therefore,?\s*the\s+correct\s+answer\s+is\s+[^.]*\.?\s*$/i;
    for (let i = 0; i < 3 && closing.test(text); i++) {
        text = text.replace(closing, "").trim();
    }
    return text;
};

/** Tolerance that can never be wide enough to span two distinct options. */
const optionGapTolerance = (value, opts) => {
    const vals = opts
        .map((o) => parseNumber(o))
        .filter(Number.isFinite)
        .slice()
        .sort((a, b) => a - b);
    let gap = Infinity;
    for (let i = 1; i < vals.length; i++) {
        const d = Math.abs(vals[i] - vals[i - 1]);
        if (d > 0) gap = Math.min(gap, d);
    }
    const relative = Math.max(Math.abs(value) * 0.02, 1e-9);
    return Number.isFinite(gap) ? Math.min(relative, gap / 2) : relative;
};

const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whole-token mention — "Team 1" must not match inside "Team 14". */
const namesOption = (text, option) => {
    const o = String(option || "").trim();
    if (o.length < 3) return false;
    return new RegExp(`(?:^|\\W)${escapeRe(o)}(?:\\W|$)`, "i").test(String(text || ""));
};

/**
 * Explanation's own conclusion contradicts the marked key — for ANY generation path.
 *
 * The solve-first path checks this at build time (questionSolveFirst), but the one-shot /
 * passage / multi-correct / full-paper paths never call buildMcqFromSkeleton and so had no
 * equivalent gate. Running it here as a deterministic detector covers every path, and
 * flattenQuestionBankForCorrectnessAudit() already expands passage sub-questions.
 *
 * Improvements over the older explanation detectors: reads the WHOLE derivation rather
 * than the last 280 chars (which were dominated by the appended closing), recognises
 * "is / equals / yields / gives / therefore N" as well as "= N", uses a gap-bounded
 * tolerance, and handles text answers by option name.
 */
const detectExplanationContradictsKey = (q) => {
    const opts = (q.options || []).map((o) => String(o ?? "").trim());
    const markedIdx = getMarkedOptionIndex(q);
    if (markedIdx == null || !opts[markedIdx]) return null;
    const body = stripAppendedClosing(q.explanation);
    if (!body) return null;

    const marked = opts[markedIdx];
    const markedNum = parseNumber(marked);
    const isNumericAnswer =
        Number.isFinite(markedNum) &&
        /^-?\d+(?:\.\d+)?\s*[%°]?[a-zA-ZμΩ°/·⁻¹²³]{0,10}$/.test(marked);

    if (isNumericAnswer) {
        const NUM = "(-?\\d+(?:\\.\\d+)?)";
        const re = new RegExp(
            `(?:=|\\bis\\b|\\bequals?\\b|\\byields?\\b|\\bgives?\\b|\\btherefore\\b[^.]{0,24}?)\\s*${NUM}`,
            "gi"
        );
        const found = [...body.matchAll(re)]
            .map((m) => parseFloat(m[1]))
            .filter(Number.isFinite);
        if (!found.length) return null;
        const concluded = found[found.length - 1];
        const tol = optionGapTolerance(concluded, opts);
        if (Math.abs(concluded - markedNum) <= tol) return null;
        const altIdx = opts.findIndex((o, i) => {
            if (i === markedIdx) return false;
            const n = parseNumber(o);
            return Number.isFinite(n) && Math.abs(n - concluded) <= tol;
        });
        if (altIdx < 0) return null; // concluded value isn't any option — other detectors own that
        return {
            questionNumber: q.sampleNumber,
            issue: `Explanation concludes ${concluded} but marked answer is ${String.fromCharCode(65 + markedIdx)} (${marked}); ${concluded} matches option ${String.fromCharCode(65 + altIdx)}.`,
            severity: "critical",
            confidence: "confirmed",
            category: ISSUE_CATEGORY.FACTUAL,
        };
    }

    // Text answer: does the closing clause name a DIFFERENT option than the key?
    const sentences = body.split(/(?<=[.!?])\s+/).filter(Boolean);
    const lastSentence = sentences[sentences.length - 1] || body;
    const clause =
        lastSentence.match(/\b(?:therefore|thus|hence|so)\b[,:]?\s*(.+)$/i)?.[1] ||
        lastSentence;
    if (namesOption(clause, marked)) return null;
    const altIdx = opts.findIndex((o, i) => i !== markedIdx && namesOption(clause, o));
    if (altIdx < 0) return null;
    return {
        questionNumber: q.sampleNumber,
        issue: `Explanation concludes "${opts[altIdx]}" but marked answer is ${String.fromCharCode(65 + markedIdx)} (${marked}).`,
        severity: "critical",
        confidence: "confirmed",
        category: ISSUE_CATEGORY.FACTUAL,
    };
};

/**
 * Text-answer consistency check — explanation mentions wrong option.
 * Uses word-boundary matching to distinguish "Team 1" from "Team 14".
 * For non-STEM paths (DILR, VARC, CAT QA text answers).
 */
const detectTextAnswerConsistency = (q) => {
    const explanation = String(q.explanation || "");
    const opts = (q.options || []).map((o) => String(o || "").trim()).filter(Boolean);
    const markedIdx = getMarkedOptionIndex(q);

    if (markedIdx == null || !opts[markedIdx]) return null;

    // Only run on non-numeric answers — numeric path uses its own checks
    const markedOption = opts[markedIdx];
    if (/^\d+(?:\.\d+)?(?:\s+[a-zA-Z°\/·\-]+)?$/.test(markedOption)) return null;

    // Extract last 400 chars for conclusion patterns
    const tail = explanation.slice(Math.max(0, explanation.length - 400));

    // Patterns that indicate a final conclusion
    const conclusionPatterns = [
        /therefore,?\s+(?:the\s+)?(?:answer\s+(?:is|:|=)\s+)?(.+?)(?:\.|$)/i,
        /hence,?\s+(.+?)(?:\.|$)/i,
        /thus,?\s+(.+?)(?:\.|$)/i,
        /the\s+(?:correct\s+)?answer\s+(?:is|:|=)\s+(.+?)(?:\.|$)/i,
        /correct\s+(?:answer|option|choice)\s+(?:is|:|=)\s+(.+?)(?:\.|$)/i,
    ];

    const mentioned = new Set();
    for (const pattern of conclusionPatterns) {
        const m = tail.match(pattern);
        if (m && m[1]) {
            mentioned.add(m[1].trim());
        }
    }

    if (!mentioned.size) return null; // No conclusion found

    // Check if any mentioned value matches an option (other than marked)
    for (const text of mentioned) {
        // Skip very short mentions (noise)
        if (text.length < 2) continue;

        const mentionedMatches = opts.some((opt, idx) =>
            idx !== markedIdx && mentionsToken(opt, text)
        );

        if (mentionedMatches) {
            const altIdx = opts.findIndex((opt, idx) =>
                idx !== markedIdx && mentionsToken(opt, text)
            );
            return {
                questionNumber: q.sampleNumber,
                issue: `Explanation concludes "${text}" but marked answer is ${String.fromCharCode(65 + markedIdx)} ("${markedOption}"); "${text}" matches option ${String.fromCharCode(65 + altIdx)}.`,
                severity: "critical",
                confidence: "confirmed",
                category: ISSUE_CATEGORY.FACTUAL,
            };
        }
    }

    return null;
};

/**
 * Word-boundary token matching.
 * "Team 1" matches in "Team 1 won" but NOT in "Team 14".
 * Used for text-answer consistency checks in non-STEM exams.
 */
const mentionsToken = (fullText, token) => {
    const full = norm(fullText);
    const normalized = norm(token);

    if (!full || !normalized) return false;
    if (normalized.length < 2) return false; // Too short

    if (full === normalized) return true;

    // Word-boundary regex: token must be its own word, not substring
    const escapedToken = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const wordBoundary = new RegExp(`\\b${escapedToken}\\b`);
    return wordBoundary.test(full);
};

const DETECTORS = [
    detectExplanationContradictsKey,
    detectInvalidPhScaleOptions,
    detectHybridizationFactualError,
    detectIndependentSolveMismatch,
    detectInvalidOptions,
    detectMalformedScientificNotationOptions,
    detectDuplicateOptions,
    detectAllOptionsMarkedCorrect,
    detectNearDuplicateOptions,
    detectTrivialOptionInStem,
    detectExplanationVagueJustification,
    detectExplanationFinalValueNotInOptions,
    detectExplanationMetaCommentary,
    detectExplanationOptionClaimMismatch,
    detectExplanationConclusionMismatch,
    detectExplanationNamedConclusionMismatch,
    detectExplanationSelfCorrection,
    detectExplanationCorrectionContradiction,
    detectExplanationNumericMismatch,
    detectTextAnswerConsistency, // NEW: for non-STEM text answers (DILR, VARC, CAT)
];

/**
 * @param {Array<object>} sampled Questions with sampleNumber
 * @returns {{ confirmedIssues: object[], suspectedIssues: object[], correctnessScore: number, styleScore: number, factualIssues: object[], styleIssues: object[] }}
 */
export const runDeterministicCorrectnessAudit = (sampled = []) => {
    const confirmedIssues = [];
    const seen = new Set();

    for (const q of sampled) {
        for (const detect of DETECTORS) {
            const issue = detect(q);
            if (!issue) continue;
            const key = `${issue.questionNumber}::${issue.issue}`;
            if (seen.has(key)) continue;
            seen.add(key);
            confirmedIssues.push(issue);
        }
    }

    for (const issue of detectBatchDuplicateStemIssues(sampled)) {
        const key = `${issue.questionNumber}::${issue.issue}`;
        if (seen.has(key)) continue;
        seen.add(key);
        confirmedIssues.push(issue);
    }

    const separated = computeSeparatedValidationScores(confirmedIssues);

    return {
        confirmedIssues: separated.tagged,
        suspectedIssues: [],
        correctnessScore: separated.correctnessScore,
        styleScore: separated.styleScore,
        factualIssues: separated.factualIssues,
        styleIssues: separated.styleIssues,
    };
};

const toAuditShape = (q, sampleNumber) => {
    const idx = getMarkedOptionIndex(q);
    const opts = q.options || [];
    const letter = idx != null ? String.fromCharCode(65 + idx) : "";
    return {
        questionType: q.questionType || "single",
        questionText: q.questionText,
        options: opts,
        correctIndex: idx,
        correctAnswer: letter ? `${letter}. ${opts[idx] || ""}` : q.correctAnswer,
        explanation: q.explanation,
        sampleNumber,
    };
};

/** Flatten standalone + passage sub-questions for deterministic audit. */
export const flattenQuestionBankForCorrectnessAudit = (questions = []) => {
    const entries = [];
    let n = 0;
    for (let topIndex = 0; topIndex < questions.length; topIndex++) {
        const q = questions[topIndex];
        if (q.questionType === "connected") {
            for (let subIndex = 0; subIndex < (q.subQuestions || []).length; subIndex++) {
                n += 1;
                entries.push({
                    ref: { topIndex, subIndex },
                    auditItem: toAuditShape(q.subQuestions[subIndex], n),
                });
            }
        } else {
            n += 1;
            entries.push({
                ref: { topIndex },
                auditItem: toAuditShape(q, n),
            });
        }
    }
    return entries;
};

/** Issues that warrant stripping or mandatory repair before shipping. */
const isStrippableCorrectnessIssue = (issue) => {
    const sev = String(issue?.severity || "major").toLowerCase();
    const cat = String(issue?.category || "").toLowerCase();
    const text = String(issue?.issue || "");

    if (cat === ISSUE_CATEGORY.FACTUAL && ["critical", "major"].includes(sev)) {
        return true;
    }
    if (cat === ISSUE_CATEGORY.STYLE && sev === "critical") {
        return true;
    }
    if (
        sev !== "minor" &&
        /draft\/meta commentary|independent solve disagrees|does not appear among|not among any option|explanation (?:concludes|derives|states)|marked answer is option/i.test(
            text
        )
    ) {
        return true;
    }
    return false;
};

/** Block flawed MCQs at generation time — no separate correctness repair pass. */
export const assertGenerationCorrectness = (q, sampleNumber = 1) => {
    const entries = flattenQuestionBankForCorrectnessAudit([q]);
    if (!entries.length) {
        throw new Error("Empty or invalid question");
    }
    const audit = runDeterministicCorrectnessAudit([
        { ...entries[0].auditItem, sampleNumber },
    ]);
    const blocking = (audit.confirmedIssues || []).filter(
        isStrippableCorrectnessIssue
    );
    if (blocking.length) {
        throw new Error(blocking.map((i) => i.issue).join("; "));
    }
};

/** Find entries with critical/major correctness defects (for repair / strip). */
export const findFlawedQuestionBankEntries = (questions = []) => {
    const entries = flattenQuestionBankForCorrectnessAudit(questions);
    const audit = runDeterministicCorrectnessAudit(
        entries.map((e) => e.auditItem)
    );
    const strippableIssues = (audit.confirmedIssues || []).filter(
        isStrippableCorrectnessIssue
    );
    const flawedNumbers = new Set(
        strippableIssues
            .map((i) => i.questionNumber)
            .filter((n) => Number.isFinite(n))
    );
    const issuesByNumber = new Map();
    for (const issue of audit.confirmedIssues) {
        const qn = issue.questionNumber;
        if (!Number.isFinite(qn)) continue;
        if (!issuesByNumber.has(qn)) issuesByNumber.set(qn, []);
        issuesByNumber.get(qn).push(issue);
    }

    return {
        entries,
        audit,
        flawedEntries: entries
            .filter((e) => flawedNumbers.has(e.auditItem.sampleNumber))
            .map((e) => ({
                ...e,
                issues: issuesByNumber.get(e.auditItem.sampleNumber) || [],
            })),
        hasFlaws: flawedNumbers.size > 0,
    };
};

/** Remove questions/sub-questions that still fail critical checks. */
const stripFlawedQuestionsOnly = (questions = [], flawedEntries = []) => {
    const flawedTop = new Set();
    const flawedSubs = new Map();

    for (const entry of flawedEntries) {
        const { topIndex, subIndex } = entry.ref;
        if (subIndex != null) {
            if (!flawedSubs.has(topIndex)) flawedSubs.set(topIndex, new Set());
            flawedSubs.get(topIndex).add(subIndex);
        } else {
            flawedTop.add(topIndex);
        }
    }

    const next = [];
    for (let topIndex = 0; topIndex < questions.length; topIndex++) {
        const q = questions[topIndex];
        if (flawedTop.has(topIndex)) continue;

        if (q.questionType === "connected") {
            const badSubs = flawedSubs.get(topIndex);
            if (badSubs?.size) {
                const subQuestions = (q.subQuestions || []).filter(
                    (_, subIndex) => !badSubs.has(subIndex)
                );
                if (!subQuestions.length) continue;
                next.push({ ...q, subQuestions });
            } else {
                next.push(q);
            }
        } else {
            next.push(q);
        }
    }

    return next;
};

/**
 * Repair flawed entries (optional) then strip any that still fail deterministic checks.
 * @param {Function} [options.repairFn] async (questions, flawedEntries, pass) => questions
 */
export const stripFlawedQuestionBankEntries = async (
    questions = [],
    { repairFn = null, maxRepairPasses = 0 } = {}
) => {
    let current = questions;
    let strippedCount = 0;
    const strippedByType = { single: 0, multiple: 0, true_false: 0, connected: 0 };
    let repairedPasses = 0;
    let audit = null;

    const tallyStripped = (flawedEntries) => {
        for (const e of flawedEntries) {
            if (e.ref?.subIndex != null) continue; // passage sub-question, not top-level count
            const t = e.auditItem?.questionType || "single";
            strippedByType[t] = (strippedByType[t] || 0) + 1;
        }
    };

    for (let pass = 0; pass <= maxRepairPasses; pass++) {
        const { flawedEntries, hasFlaws, audit: passAudit } =
            findFlawedQuestionBankEntries(current);
        audit = passAudit;
        if (!hasFlaws || !flawedEntries.length) break;

        if (pass < maxRepairPasses && typeof repairFn === "function") {
            const repaired = await repairFn(current, flawedEntries, pass);
            if (repaired && repaired !== current) {
                current = repaired;
                repairedPasses += 1;
                continue;
            }
        }

        strippedCount = flawedEntries.length;
        tallyStripped(flawedEntries);
        current = stripFlawedQuestionsOnly(current, flawedEntries);
        break;
    }

    const finalCheck = findFlawedQuestionBankEntries(current);
    if (finalCheck.hasFlaws && finalCheck.flawedEntries.length) {
        strippedCount += finalCheck.flawedEntries.length;
        tallyStripped(finalCheck.flawedEntries);
        current = stripFlawedQuestionsOnly(
            current,
            finalCheck.flawedEntries
        );
        audit = finalCheck.audit;
    }

    return {
        questions: current,
        strippedCount,
        strippedByType,
        repairedPasses,
        audit,
    };
};

/**
 * Minimal parallel paper pipeline (token-efficient):
 *
 *   Gemini generate (Q + proposed answer)  [parallel]
 *        ↓
 *   Free schema check (no LLM)
 *        ↓
 *   o3 independent solve + verify answer + verifiedSolution  [parallel]
 *        · empty / infra / uncertain → same-seat o3 retry (NO Gemini)
 *        · clear QUALITY fail → Gemini replace ≤ JEE_ADV_QUALITY_REPLACE_MAX
 *        ↓
 *   READY (Gemini stem + o3 answer + o3 verifiedSolution)
 *
 * Removed from this path: hard Code QC stage, Gemini Expand, Luna paper audit.
 */

import { callOpenAIReasoningJson } from "./openaiReasoningChat.service.js";
import { isDuplicateStem } from "./paperCodeValidation.service.js";
import { dedupePaperQuestionsByStem } from "../utils/paperQuestionDedupe.js";
import { resolvePaperExam } from "./paperExamIdentity.service.js";
import { getGenerationJob } from "./questionBankGenerationJobStore.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const mapPool = async (items, concurrency, fn) => {
  const n = Math.max(1, Math.min(Number(concurrency) || 1, items.length || 1));
  const results = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    while (true) {
      const i = cursor;
      cursor += 1;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, () => worker())
  );
  return results;
};

const getSolverModel = () =>
  String(process.env.PAPER_SOLVER_MODEL || "o3").trim() || "o3";
const getSolverEffort = () =>
  String(process.env.PAPER_SOLVER_REASONING_EFFORT || "high")
    .trim()
    .toLowerCase() || "high";
const getSolverTimeoutMs = () =>
  Math.max(
    30_000,
    Math.min(300_000, Number(process.env.PAPER_SOLVER_TIMEOUT_MS || 120_000))
  );
/** Higher default — o3 must return verifiedSolution, not just a key. Default 10k prevents TPM reservation spikes. */
const getSolverMaxTokens = () =>
  Math.max(2000, Math.min(25000, Number(process.env.PAPER_SOLVER_MAX_TOKENS || 10000)));

const genConcurrency = () =>
  Math.max(
    1,
    Math.min(
      8,
      Number(
        process.env.PAPER_GENERATE_CONCURRENCY ||
          process.env.JEE_ADV_GENERATE_CONCURRENCY ||
          6
      )
    )
  );
const o3Concurrency = () =>
  Math.max(
    1,
    Math.min(
      8,
      Number(
        process.env.PAPER_O3_CONCURRENCY ||
          process.env.JEE_ADV_O3_CONCURRENCY ||
          2
      )
    )
  );

const infraTimeoutRetries = () =>
  Math.max(
    0,
    Math.min(
      5,
      Number(
        process.env.PAPER_VERIFY_TIMEOUT_RETRIES ??
          process.env.JEE_ADV_VERIFY_TIMEOUT_RETRIES ??
          4
      )
    )
  );

const o3SameSeatRetries = () =>
  Math.max(
    0,
    Math.min(
      5,
      Number(
        process.env.PAPER_O3_SAME_SEAT_RETRIES ??
          process.env.JEE_ADV_O3_SAME_SEAT_RETRIES ??
          2
      )
    )
  );

const qualityReplaceMax = (needSeats) => {
  const raw =
    process.env.PAPER_QUALITY_REPLACE_MAX ??
    process.env.JEE_ADV_QUALITY_REPLACE_MAX;
  if (raw === "0" || raw === "false") return 0;
  if (raw != null && String(raw).trim() !== "") {
    const parsed = Number(raw);
    return Math.max(needSeats, Number.isFinite(parsed) ? parsed : 0);
  }
  return Math.max(0, Number(needSeats) || 0);
};

const isInfraError = (err) => {
  const code = String(err?.code || "");
  const msg = String(err?.message || err || "");
  const status = Number(err?.response?.status || err?.status || 0);
  return (
    status === 429 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    code === "ECONNABORTED" ||
    code === "ETIMEDOUT" ||
    code === "ECONNRESET" ||
    code === "ENOTFOUND" ||
    code === "O3_EMPTY" ||
    code === "O3_INFRA" ||
    /timeout|ECONNABORTED|ETIMEDOUT|network|socket hang up|fetch failed|temporarily unavailable|429|rate limit|502|503|504|empty response|unparseable/i.test(
      msg
    )
  );
};

const getRetryAfterSeconds = (err) => {
  const header =
    err?.response?.headers?.["retry-after"] ||
    err?.response?.headers?.["Retry-After"] ||
    err?.headers?.["retry-after"] ||
    err?.headers?.["Retry-After"];
  if (!header) return null;
  const sec = Number(header);
  if (Number.isFinite(sec) && sec > 0) return sec;
  const date = new Date(header).getTime();
  if (Number.isFinite(date) && date > Date.now()) {
    return Math.ceil((date - Date.now()) / 1000);
  }
  return null;
};

const withInfraRetries = async (fn, { label, pipelineLog, maxAttempts } = {}) => {
  const attempts = Math.max(1, 1 + (maxAttempts ?? infraTimeoutRetries()));
  let lastErr;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      const is429 =
        Number(err?.response?.status || err?.status || 0) === 429 ||
        /429|rate limit/i.test(String(err?.message || err || ""));
      const canRetry = isInfraError(err) && attempt < attempts;
      if (!canRetry) throw err;

      const retryAfterSec = getRetryAfterSeconds(err);
      const jitter = Math.floor(Math.random() * 2000);
      let backoffMs;
      if (is429) {
        // Exponential backoff: 2s -> 4s -> 8s -> 16s -> 30s (+ jitter)
        const exp = Math.min(30000, 2000 * Math.pow(2, attempt - 1) + jitter);
        backoffMs = retryAfterSec ? Math.max(exp, retryAfterSec * 1000 + jitter) : exp;
      } else {
        backoffMs = Math.min(8000, 1000 * attempt + jitter);
      }

      pipelineLog?.("INFRA_RETRY", {
        label,
        attempt,
        nextAttempt: attempt + 1,
        maxAttempts: attempts,
        backoffMs,
        retryAfter: retryAfterSec || null,
        reason: err?.message || String(err),
        status: err?.response?.status || null,
        rateLimitReset:
          err?.response?.headers?.["x-ratelimit-reset-requests"] ||
          err?.response?.headers?.["x-ratelimit-reset-tokens"] ||
          null,
      });
      await sleep(backoffMs);
    }
  }
  throw lastErr;
};

const parseJsonLoose = (raw) => {
  if (raw && typeof raw === "object") return raw;
  let text = String(raw || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  if (!text) return null;

  const tryParse = (value) => {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  };

  let parsed = tryParse(text);
  if (parsed) return parsed;

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const sliced = text.slice(start, end + 1);
    parsed = tryParse(sliced);
    if (parsed) return parsed;
    // Common o3 failure: invalid single backslashes inside LaTeX in verifiedSolution.
    parsed = tryParse(sliced.replace(/\\(?!["\\/bfnrtu])/g, "\\\\"));
    if (parsed) return parsed;
  }

  // Last resort: pull the fields we actually need even if the full blob is truncated.
  const pick = (key) => {
    const m = text.match(
      new RegExp(
        `"${key}"\\s*:\\s*("(?:\\\\.|[^"\\\\])*"|true|false|null|-?\\d+(?:\\.\\d+)?)`,
        "i"
      )
    );
    if (!m) return undefined;
    try {
      return JSON.parse(m[1]);
    } catch {
      return String(m[1] || "")
        .replace(/^"|"$/g, "")
        .replace(/\\n/g, "\n");
    }
  };
  const independentAnswer = pick("independentAnswer");
  if (independentAnswer == null || independentAnswer === "") return null;
  return {
    independentAnswer,
    answerMatches: pick("answerMatches"),
    calculationCorrect: pick("calculationCorrect"),
    questionValid: pick("questionValid") ?? true,
    confidence: pick("confidence") || "medium",
    verifiedSolution: pick("verifiedSolution") || "",
    issues: ["partial_o3_json_recovered"],
  };
};

const proposedKeyOf = (q, type) => {
  if (type === "integer") {
    const n = Number(q.correctAnswer ?? q.finalAnswer);
    return Number.isFinite(n) ? n : null;
  }
  if (type === "match") {
    const letter = String(q.correctAnswer || "")
      .trim()
      .toUpperCase()
      .match(/[A-D]/);
    return letter ? letter[0] : null;
  }
  if (type === "multiple") {
    const letters = (
      Array.isArray(q.correctAnswer)
        ? q.correctAnswer
        : String(q.correctAnswer || q.correctLetters || "")
            .toUpperCase()
            .split(/[^A-D]+/)
    )
      .map((s) => String(s).replace(/[^A-D]/g, "").slice(0, 1))
      .filter((s) => /^[A-D]$/.test(s));
    const uniq = [...new Set(letters)].sort();
    return uniq.length ? uniq.join(",") : null;
  }
  const letter = String(q.correctAnswer || "")
    .trim()
    .toUpperCase()
    .match(/[A-D]/);
  if (letter) return letter[0];
  if (Number.isInteger(q.correctIndex) && q.correctIndex >= 0 && q.correctIndex <= 3) {
    return String.fromCharCode(65 + q.correctIndex);
  }
  return null;
};

const keysMatch = (type, a, b) => {
  if (a == null || b == null) return false;
  if (type === "integer") return Math.abs(Number(a) - Number(b)) < 1e-6;
  return String(a) === String(b);
};

/**
 * Free local schema check — NOT a model stage.
 * Only blocks outputs o3 cannot usefully solve (missing stem / broken shape).
 */
export const schemaOkForO3 = (q, typeHint = null) => {
  const issues = [];
  if (!q || typeof q !== "object") {
    return { ok: false, issues: ["not_an_object"] };
  }
  const type = String(
    typeHint || q._advancedType || q.questionType || ""
  ).toLowerCase();
  if (!["single", "multiple", "integer", "match"].includes(type)) {
    issues.push(`invalid_type:${type || "empty"}`);
  }
  const stem = String(q.questionText || q.text || "").trim();
  if (!stem || stem.length < 12) issues.push("missing_or_short_stem");

  if (type === "integer") {
    const n = Number(q.correctAnswer ?? q.finalAnswer ?? q.answerDisplay);
    if (!Number.isFinite(n)) issues.push("integer_answer_not_numeric");
  } else if (type === "match") {
    const listI = Array.isArray(q.listI) ? q.listI : [];
    const listII = Array.isArray(q.listII) ? q.listII : [];
    if (listI.length < 2 || listII.length < 2) {
      issues.push("match_lists_incomplete");
    }
    if (!proposedKeyOf(q, "match")) issues.push("match_missing_proposed_key");
  } else if (type === "single" || type === "multiple") {
    const opts = Array.isArray(q.options) ? q.options : [];
    if (opts.length < 2) issues.push("options_incomplete");
    if (!proposedKeyOf(q, type)) issues.push("missing_proposed_key");
  }
  return { ok: issues.length === 0, issues };
};

const callOpenAiJson = async ({
  kind,
  model,
  effort,
  timeoutMs,
  maxTokens,
  prompt,
  developerHint,
  pipelineLog,
  recordUsage,
  jobId,
}) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("missing_OPENAI_API_KEY");
  pipelineLog?.(
    kind === "solve" ? "OPENAI_SOLVE_REQUEST" : "OPENAI_VERIFY_REQUEST",
    {
      model,
      kind,
      timeoutMs,
      reasoningEffort: effort,
      maxCompletionTokens: maxTokens,
      promptChars: String(prompt || "").length,
      promptPreview: String(prompt || "").slice(0, 400),
    }
  );
  const started = Date.now();
  try {
    const packed = await callOpenAIReasoningJson({
      apiKey,
      prompt,
      model,
      reasoningEffort: effort,
      callWithRetries: async (fn) => fn(),
      toError: (e) => e,
      timeoutMs,
      withUsage: true,
      disableFallback: true,
      maxCompletionTokens: maxTokens,
      developerHint,
    });
    const text = packed?.text ?? packed;
    const usage = {
      provider: "openai",
      model: packed?.model || model,
      kind,
      promptTokens: Number(packed?.usage?.promptTokens) || 0,
      completionTokens: Number(packed?.usage?.completionTokens) || 0,
      totalTokens: Number(packed?.usage?.totalTokens) || 0,
      reasoningTokens: Number(packed?.usage?.reasoningTokens) || 0,
    };
    recordUsage?.(jobId, usage);
    pipelineLog?.(
      kind === "solve" ? "OPENAI_SOLVE_RESPONSE" : "OPENAI_VERIFY_RESPONSE",
      {
        model: packed?.model || model,
        kind,
        elapsedMs: Date.now() - started,
        responseChars: String(text || "").length,
        responsePreview: String(text || "").slice(0, 500),
        tokens: usage,
      }
    );
    return text;
  } catch (err) {
    pipelineLog?.(
      kind === "solve" ? "OPENAI_SOLVE_ERROR" : "OPENAI_VERIFY_ERROR",
      {
        model,
        kind,
        elapsedMs: Date.now() - started,
        timeoutMs,
        error: {
          message: err?.message,
          code: err?.code,
          status: err?.response?.status,
        },
      }
    );
    throw err;
  }
};

const buildO3SolvePrompt = (q, type, examHint = {}) => {
  const proposed = proposedKeyOf(q, type);
  const opts = (q.options || []).map(
    (o, i) =>
      `${String.fromCharCode(65 + i)}. ${typeof o === "string" ? o : o?.text || o}`
  );
  const lists = [
    q.listI?.length
      ? `List-I:\n${q.listI.map((x, i) => `${i + 1}. ${x}`).join("\n")}`
      : "",
    q.listII?.length
      ? `List-II:\n${q.listII
          .map((x, i) => `${String.fromCharCode(80 + i)}. ${x}`)
          .join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const exam = resolvePaperExam({
    examType: q._examType || examHint?.examType,
    examLabel: q._examLabel || examHint?.examLabel,
  });
  const examLabel = exam.examLabel;

  return `You are an independent ${examLabel} solver (o3).
Solve from first principles. Do NOT trust the proposed answer.
You MUST return a complete verified derivation in verifiedSolution.

Type: ${type}
Exam: ${examLabel}
Chapter: ${q._chapter || q.chapter || ""}
STEM:
${q.questionText}
${lists}
${opts.length ? `OPTIONS:\n${opts.join("\n")}` : ""}

PROPOSED ANSWER (from writer — verify independently): ${proposed}

Return ONLY JSON:
{
  "independentAnswer": "...",
  "answerMatches": true|false,
  "calculationCorrect": true|false,
  "questionValid": true|false,
  "confidence": "high"|"medium"|"low",
  "verifiedSolution": "full insight-first derivation ending with the locked answer. Use LaTeX with $...$.",
  "issues": []
}

Rules:
- independentAnswer: letter A-D, letters CSV for multiple, or number for integer
- verifiedSolution: complete student-facing explanation (this becomes the final explanation)
- If proposed answer is wrong, set answerMatches false and still give the correct independentAnswer + verifiedSolution for the CORRECT answer
- Do not rewrite the stem; do not invent options`;
};

export const o3VerifyCompact = async (q, type, ctx) => {
  const proposed = proposedKeyOf(q, type);
  let raw;
  try {
    raw = await withInfraRetries(
      async (attempt) =>
        callOpenAiJson({
          kind: "solve",
          model: getSolverModel(),
          effort: attempt > 1 ? "medium" : getSolverEffort(),
          timeoutMs: getSolverTimeoutMs(),
          maxTokens: Math.min(24000, getSolverMaxTokens() + (attempt > 1 ? 4000 : 0)),
          prompt: buildO3SolvePrompt(q, type, ctx),
          developerHint:
            "Return ONLY JSON. Independently solve. verifiedSolution is mandatory and must derive independentAnswer.",
          pipelineLog: ctx.pipelineLog,
          recordUsage: ctx.recordUsage,
          jobId: ctx.jobId,
        }),
      { label: "o3_verify", pipelineLog: ctx.pipelineLog }
    );
  } catch (err) {
    return {
      pass: false,
      infra: true,
      uncertain: false,
      result: {
        independentAnswer: null,
        answerMatches: false,
        calculationCorrect: false,
        questionValid: true,
        confidence: "low",
        verifiedSolution: "",
        issues: [err?.message || "o3_infra_error"],
        proposedKey: proposed,
        empty: true,
      },
    };
  }

  if (!String(raw || "").trim()) {
    return {
      pass: false,
      infra: true,
      uncertain: false,
      result: {
        independentAnswer: null,
        answerMatches: false,
        calculationCorrect: false,
        questionValid: true,
        confidence: "low",
        verifiedSolution: "",
        issues: ["empty_o3_response"],
        proposedKey: proposed,
        empty: true,
      },
    };
  }

  const parsed = parseJsonLoose(raw);
  if (!parsed || typeof parsed !== "object") {
    return {
      pass: false,
      infra: true,
      uncertain: false,
      result: {
        independentAnswer: null,
        answerMatches: false,
        calculationCorrect: false,
        questionValid: true,
        confidence: "low",
        verifiedSolution: "",
        issues: ["unparseable_o3_response"],
        proposedKey: proposed,
        empty: true,
      },
    };
  }

  const independent =
    parsed.independentAnswer ??
    parsed.derived_answer ??
    parsed.answer ??
    null;
  let independentNorm = independent;
  if (type === "integer") {
    const n = Number(independent);
    independentNorm = Number.isFinite(n) ? n : null;
  } else if (type === "multiple") {
    const letters = String(independent || "")
      .toUpperCase()
      .split(/[^A-D]+/)
      .filter((s) => /^[A-D]$/.test(s));
    independentNorm = [...new Set(letters)].sort().join(",") || null;
  } else {
    const m = String(independent || "")
      .toUpperCase()
      .match(/[A-D]/);
    independentNorm = m ? m[0] : String(independent || "").trim() || null;
  }

  const hasExplicitFail =
    parsed.answerMatches === false ||
    parsed.calculationCorrect === false ||
    parsed.questionValid === false;

  if (independentNorm == null && !hasExplicitFail) {
    return {
      pass: false,
      infra: true,
      uncertain: false,
      result: {
        independentAnswer: null,
        answerMatches: false,
        calculationCorrect: false,
        questionValid: true,
        confidence: "low",
        verifiedSolution: String(parsed.verifiedSolution || "").trim(),
        issues: ["o3_missing_independent_answer"],
        proposedKey: proposed,
        empty: true,
      },
    };
  }

  const answerMatches =
    parsed.answerMatches === true || keysMatch(type, independentNorm, proposed);
  const calculationCorrect = parsed.calculationCorrect === true;
  const questionValid = parsed.questionValid !== false;
  const confidence = String(parsed.confidence || "medium").toLowerCase();
  const verifiedSolution = String(
    parsed.verifiedSolution || parsed.explanation || parsed.solution || ""
  ).trim();

  const pass =
    answerMatches &&
    calculationCorrect &&
    questionValid &&
    confidence !== "low" &&
    parsed.answerMatches !== false &&
    verifiedSolution.length >= 40;

  const uncertain =
    !pass &&
    !hasExplicitFail &&
    (confidence === "medium" || confidence === "low" || verifiedSolution.length < 40);

  return {
    pass,
    infra: false,
    uncertain: Boolean(uncertain && !pass),
    result: {
      independentAnswer: independentNorm,
      answerMatches,
      calculationCorrect,
      questionValid,
      confidence,
      verifiedSolution,
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      proposedKey: proposed,
    },
  };
};

const isValidKeyForQuestion = (type, key, locked) => {
  if (key == null) return false;
  if (type === "integer") {
    return Number.isFinite(Number(key));
  }
  if (type === "multiple") {
    const letters = String(key)
      .toUpperCase()
      .split(/[^A-D]+/)
      .filter((s) => /^[A-D]$/.test(s));
    if (!letters.length) return false;
    const maxIdx = Array.isArray(locked?.options) ? locked.options.length : 4;
    return letters.every((L) => {
      const idx = L.charCodeAt(0) - 65;
      return idx >= 0 && idx < maxIdx;
    });
  }
  // single / match
  const letter = String(key).toUpperCase().slice(0, 1);
  if (!/^[A-D]$/.test(letter)) return false;
  const maxIdx = Array.isArray(locked?.options) ? locked.options.length : 4;
  const idx = letter.charCodeAt(0) - 65;
  return idx >= 0 && idx < maxIdx;
};

const isTier1RekeyEnabled = () => {
  const v =
    process.env.PAPER_TIER1_REKEY_ENABLED ??
    process.env.AI_QB_STAGE_A_ANSWER_LOCK;
  if (v === "0" || v === "false") return false;
  return true;
};

const applyO3Lock = (item, out, stampTrust, { rekeyed = false } = {}) => {
  const type = item.type;
  const key = out.result.independentAnswer;
  const isRekeyed = Boolean(rekeyed || !out.result.answerMatches);
  const locked = {
    ...item.locked,
    explanation: out.result.verifiedSolution,
    _insight: String(out.result.verifiedSolution || "").slice(0, 280),
    _o3Verify: out.result,
    _o3DerivedKey: key,
    _verifiedSolution: out.result.verifiedSolution,
    _stageAAnswerLocked: true,
    _proposedKeyMatch: out.result.answerMatches,
    _doubleSolverAgree: out.result.answerMatches,
    _lockMode: `o3(${getSolverModel()})+solution`,
    _productionReady: true,
    _needsReview: false,
    _trustBadge: isRekeyed ? "O3-REKEYED" : "O3-VERIFIED",
    _trustGrade: "production_o3",
    _explanationExpanded: true,
    _explanationSource: "o3_verifiedSolution",
    _solverTruthApplied: isRekeyed,
    _rekeyedByO3: isRekeyed,
  };

  if (type === "integer" && key != null) {
    locked.correctAnswer = key;
    locked.finalAnswer = key;
    locked.answerDisplay = String(key);
  } else if (type === "multiple" && key) {
    const letters = String(key).split(",").filter(Boolean);
    locked.correctAnswer = letters;
    locked.correctLetters = letters;
    locked.multipleCorrectIndexes = letters.map((L) => L.charCodeAt(0) - 65);
    locked.correctIndex = locked.multipleCorrectIndexes[0] ?? 0;
  } else if (key) {
    const letter = String(key).toUpperCase().slice(0, 1);
    locked.correctAnswer = letter;
    locked.correctIndex = letter.charCodeAt(0) - 65;
  }

  item.stage = "ready_to_confirm";
  item.locked = stampTrust(locked);
  item.answerKey =
    item.locked.correctAnswer ?? item.locked.answerDisplay ?? key ?? null;
  item.o3 = out.result;
  return item;
};

const verifySeatWithO3Budget = async (item, ctx, stampTrust) => {
  const maxAttempts = 1 + o3SameSeatRetries();
  let lastOut = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    item.stage = "validating";
    await ctx.checkpointItem?.(item);
    const out = await o3VerifyCompact(item.locked, item.type, ctx);
    lastOut = out;
    item.o3 = out.result;
    item.o3Attempts = attempt;

    if (out.pass) {
      applyO3Lock(item, out, stampTrust, { rekeyed: false });
      await ctx.checkpointItem?.(item);
      return { ok: true, item, kind: "pass" };
    }

    // TIER 1: Auto-rekey if question is valid and o3 solved independently with high confidence
    const canTier1Rekey =
      isTier1RekeyEnabled() &&
      out.result?.questionValid === true &&
      !out.result?.answerMatches &&
      out.result?.confidence === "high" &&
      out.result?.calculationCorrect === true &&
      String(out.result?.verifiedSolution || "").trim().length >= 40 &&
      isValidKeyForQuestion(item.type, out.result?.independentAnswer, item.locked);

    if (canTier1Rekey) {
      ctx.pipelineLog?.("TIER1_REKEY", {
        seq: item.seq,
        type: item.type,
        topicId: item.topicId,
        chapter: item.chapter,
        generatorKey: out.result.proposedKey,
        solverKey: out.result.independentAnswer,
        confidence: out.result.confidence,
        reason: "o3_high_confidence_rekey",
      });
      applyO3Lock(item, out, stampTrust, { rekeyed: true });
      await ctx.checkpointItem?.(item);
      return { ok: true, item, kind: "rekeyed" };
    }

    if (out.infra) {
      return { ok: false, item, kind: "infra", detail: out.result };
    }

    if (out.uncertain && attempt < maxAttempts) {
      ctx.pipelineLog?.("O3_SAME_SEAT", {
        seq: item.seq,
        attempt,
        maxAttempts,
        infra: false,
        uncertain: true,
        willRetry: true,
        issues: out.result?.issues,
        solutionChars: String(out.result?.verifiedSolution || "").length,
      });
      await sleep(Math.min(4000, 1000 * attempt));
      continue;
    }

    if (out.uncertain) {
      return { ok: false, item, kind: "uncertain", detail: out.result };
    }
    return { ok: false, item, kind: "quality", detail: out.result };
  }
  return { ok: false, item, kind: "infra", detail: lastOut?.result };
};

/**
 * @param {object} args
 * @param {object} args.plan
 * @param {object} args.config
 * @param {function} args.onProgress
 * @param {object[]} args.resumeItems
 * @param {object} args.deps
 */
export const runParallelPaperPipeline = async ({
  plan,
  config,
  onProgress,
  resumeItems = [],
  deps,
}) => {
  const {
    generateBatch,
    toUiQuestion,
    checkpointItem,
    failItem,
    normalizeSubject,
    pipelineLog,
    recordUsage,
    jobId,
    runQuestionContext,
    stampTrust,
  } = deps;

  const ctx = {
    pipelineLog,
    recordUsage,
    jobId,
    examType: config?.examType,
    examLabel: config?.examLabel,
  };
  const expectedTotal =
    plan.totalQuestions ||
    Object.values(plan.typeCounts || {}).reduce(
      (s, n) => s + (Number(n) || 0),
      0
    );

  const types = ["single", "multiple", "integer", "match"];
  const seats = [];
  for (const t of types) {
    for (const slot of plan.slots?.[t] || []) {
      seats.push({ type: t, slot });
    }
  }

  const failures = [];
  const keptBySeq = new Map();
  for (const it of resumeItems || []) {
    if (
      it?.locked &&
      (it.stage === "ready_to_confirm" ||
        it.stage === "verified" ||
        it.stage === "expanded")
    ) {
      keptBySeq.set(Number(it.seq), {
        ...it,
        stage: "ready_to_confirm",
        locked: {
          ...it.locked,
          _productionReady: true,
          _trustBadge: it.locked._trustBadge || "O3-VERIFIED",
        },
      });
    }
  }

  let seq = 1;
  for (const it of resumeItems || []) {
    seq = Math.max(seq, (Number(it.seq) || 0) + 1);
  }
  for (const k of keptBySeq.keys()) {
    seq = Math.max(seq, Number(k) + 1);
  }

  const exclude = [...keptBySeq.values()].map((it) =>
    String(it.locked?.questionText || "").slice(0, 180)
  );

  const needSeats = Math.max(0, expectedTotal - keptBySeq.size);
  const seatQueue = seats.slice(0, needSeats);
  const unusedPool = types.flatMap((t) =>
    (plan.unusedSlots?.[t] || []).map((slot) => ({ type: t, slot }))
  );

  const makeItem = (type, slot, seqNum, attempt = 1) => ({
    seq: seqNum,
    type,
    subject: normalizeSubject(slot.subject),
    topicId: slot.topicId || "",
    chapter: slot.chapter || "",
    conceptSlot: slot.conceptSlot || slot.hardArchetype || "",
    stage: "queued",
    attempt,
  });

  const generateOne = async (seat, seqNum, attempt, excludeTexts) => {
    const item = makeItem(seat.type, seat.slot, seqNum, attempt);
    return runQuestionContext(item, async () => {
      pipelineLog("QUESTION_START", {
        seq: seqNum,
        type: seat.type,
        topicId: item.topicId,
        attempt,
        phase: "gemini_then_o3",
      });
      item.stage = "generating";
      await checkpointItem(item);
      let generated = null;
      try {
        generated = await withInfraRetries(
          async () => {
            const part = await generateBatch({
              type: seat.type,
              count: 1,
              slots: [seat.slot],
              subject: item.subject,
              excludeTexts,
              examType: config?.examType,
              examLabel: config?.examLabel,
            });
            const q = part[0] || null;
            if (q) {
              q._examType = config?.examType;
              q._examLabel = config?.examLabel;
            }
            return q;
          },
          { label: `gemini_generate_seq_${seqNum}`, pipelineLog }
        );
      } catch (err) {
        return failItem(
          item,
          isInfraError(err) ? "generate_timeout" : "generate_error",
          err?.message || String(err)
        );
      }
      if (!generated) {
        return failItem(item, "generate_empty", "no question");
      }
      item.stage = "generated";
      item.raw = generated;
      await checkpointItem(item);

      // Free schema check only (not a model / hard QC stage)
      if (isDuplicateStem(generated.questionText, excludeTexts)) {
        return failItem(item, "duplicate_stem", "near-duplicate stem");
      }
      const schema = schemaOkForO3(generated, seat.type);
      if (!schema.ok) {
        return failItem(item, "schema_invalid", schema.issues);
      }
      item.stage = "generated_ok";
      item.locked = generated;
      await checkpointItem(item);
      return item;
    });
  };

  onProgress?.({
    phase: "generate",
    message: `Parallel Gemini generate ×${seatQueue.length} (then o3 solve+solution)`,
    plan,
  });

  let working = [];
  let unusedCursor = 0;
  const initial = await mapPool(seatQueue, genConcurrency(), async (seat, i) => {
    const seqNum = seq + i;
    return generateOne(seat, seqNum, 1, exclude);
  });
  seq += seatQueue.length;

  for (const item of initial) {
    if (item?.locked && (item.stage === "generated_ok" || item.stage === "generated")) {
      working.push(item);
      exclude.push(String(item.locked.questionText || "").slice(0, 180));
    } else {
      failures.push(item);
    }
  }

  // Soft fill for schema/dup fails only — capped by quality replace budget later shared pool
  const schemaFillMax = Math.min(
    needSeats,
    Number(
      process.env.PAPER_SCHEMA_REPLACE_MAX ??
        process.env.JEE_ADV_SCHEMA_REPLACE_MAX ??
        needSeats
    ) || needSeats
  );
  let schemaFills = 0;
  while (
    working.length < needSeats &&
    schemaFills < schemaFillMax
  ) {
    schemaFills += 1;
    let seat;
    if (unusedPool.length > 0 && unusedCursor < unusedPool.length) {
      seat = unusedPool[unusedCursor++];
    } else if (unusedPool.length > 0) {
      seat = unusedPool[(unusedCursor++) % unusedPool.length];
    } else if (seats.length > 0) {
      seat = seats[schemaFills % seats.length];
    } else {
      break;
    }
    const item = await generateOne(seat, seq++, schemaFills + 1, exclude);
    if (item?.locked && item.stage === "generated_ok") {
      working.push(item);
      exclude.push(String(item.locked.questionText || "").slice(0, 180));
    } else {
      failures.push(item);
    }
  }

  onProgress?.({
    phase: "o3_verify",
    message: `Parallel o3 solve+verify+solution ×${working.length}`,
    questions: dedupePaperQuestionsByStem(
      working.map((it) => toUiQuestion(it.locked, config))
    ),
    items: [...keptBySeq.values(), ...working, ...failures],
    failures,
  });

  const replaceBudget = qualityReplaceMax(needSeats);
  const o3Ctx = { ...ctx, checkpointItem, pipelineLog };
  const o3Results = await mapPool(working, o3Concurrency(), async (item) => {
    try {
      return await verifySeatWithO3Budget(item, o3Ctx, stampTrust);
    } catch (err) {
      return {
        ok: false,
        item,
        kind: isInfraError(err) ? "infra" : "quality",
        detail: err?.message || String(err),
      };
    }
  });

  working = [];
  const pendingSeats = [];
  for (const res of o3Results) {
    if (res?.ok && res.item?.locked) {
      working.push(res.item);
      continue;
    }
    const kind = res?.kind || "quality";
    const reason =
      kind === "infra"
        ? "o3_infra_exhausted"
        : kind === "uncertain"
          ? "o3_uncertain_exhausted"
          : "o3_fail";
    failures.push(await failItem(res.item, reason, res.detail || res.item?.o3));
    if (res?.item) {
      pendingSeats.push({
        type: res.item.type,
        slot: {
          subject: res.item.subject,
          topicId: res.item.topicId,
          chapter: res.item.chapter,
          conceptSlot: res.item.conceptSlot,
        },
        failedCount: 1,
      });
    }
  }

  let qualityReplacesUsed = 0;
  let replaceAttempts = 0;
  const maxReplaceAttempts = Math.max(replaceBudget * 3, expectedTotal * 3, 100);

  const getUniqueCount = () =>
    dedupePaperQuestionsByStem(
      [...keptBySeq.values(), ...working].map((it) => it.locked).filter(Boolean)
    ).length;

  const isCancelled = () => {
    if (!jobId) return false;
    const j = getGenerationJob(jobId);
    return String(j?.status || "").toLowerCase() === "cancelled";
  };

  while (
    !isCancelled() &&
    getUniqueCount() < expectedTotal &&
    replaceAttempts < maxReplaceAttempts
  ) {
    replaceAttempts += 1;
    let seatEntry = pendingSeats.shift();
    let seat;
    if (seatEntry) {
      // If this specific topic slot has failed repeatedly (>= 3 times), swap with an alternate unused slot in same subject if available
      if (seatEntry.failedCount >= 3) {
        const altIndex = unusedPool.findIndex(
          (u) =>
            u.type === seatEntry.type &&
            normalizeSubject(u.slot.subject) ===
              normalizeSubject(seatEntry.slot.subject)
        );
        if (altIndex >= 0) {
          const [alt] = unusedPool.splice(altIndex, 1);
          seat = alt;
          pipelineLog?.("TOPIC_FALLBACK_SWAP", {
            seq,
            fromTopic: seatEntry.slot.topicId,
            toTopic: alt.slot.topicId,
            failedCount: seatEntry.failedCount,
          });
        } else {
          seat = { type: seatEntry.type, slot: seatEntry.slot };
        }
      } else {
        seat = { type: seatEntry.type, slot: seatEntry.slot };
      }
    } else if (unusedPool.length > 0 && unusedCursor < unusedPool.length) {
      seat = unusedPool[unusedCursor++];
    } else if (unusedPool.length > 0) {
      seat = unusedPool[(unusedCursor++) % unusedPool.length];
    } else if (seats.length > 0) {
      seat = seats[replaceAttempts % seats.length];
    } else {
      break;
    }

    const currentCount = getUniqueCount();
    pipelineLog?.("QUALITY_REPLACE", {
      used: qualityReplacesUsed,
      budget: replaceBudget,
      working: currentCount,
      needSeats: expectedTotal,
      attempt: replaceAttempts,
      pendingCount: pendingSeats.length,
    });
    onProgress?.({
      phase: "o3_repair",
      message: `Quality replace attempt ${replaceAttempts} — ${currentCount}/${expectedTotal}`,
    });

    let item = await generateOne(
      seat,
      seq++,
      (seatEntry?.failedCount || 0) + 1,
      exclude
    );
    if (!(item?.locked && item.stage === "generated_ok")) {
      failures.push(item);
      pendingSeats.push({
        type: seat.type,
        slot: seat.slot,
        failedCount: (seatEntry?.failedCount || 0) + 1,
      });
      continue;
    }

    const res = await verifySeatWithO3Budget(item, o3Ctx, stampTrust);
    if (res.ok && res.item?.locked) {
      working.push(res.item);
      exclude.push(String(res.item.locked.questionText || "").slice(0, 180));
      qualityReplacesUsed += 1;
    } else {
      const kind = res?.kind || "quality";
      failures.push(
        await failItem(
          res.item,
          kind === "infra"
            ? "o3_infra_exhausted"
            : kind === "uncertain"
              ? "o3_uncertain_exhausted"
              : "o3_fail",
          res.detail || res.item?.o3
        )
      );
      // Requeue slot back into pendingSeats so it will be retried
      pendingSeats.push({
        type: seat.type,
        slot: seat.slot,
        failedCount: (seatEntry?.failedCount || 0) + 1,
      });
      if (kind !== "infra") {
        qualityReplacesUsed += 1;
      }
    }
  }

  const allLocked = [...keptBySeq.values(), ...working]
    .map((it) => it.locked)
    .filter(Boolean);
  const uniqueFinal = dedupePaperQuestionsByStem(allLocked).slice(0, expectedTotal);

  const byType = { single: [], multiple: [], integer: [], match: [] };
  for (const q of uniqueFinal) {
    const t = String(q._advancedType || q.questionType || "single").toLowerCase();
    if (byType[t]) byType[t].push(q);
  }

  const counts = {
    single: byType.single.length,
    multiple: byType.multiple.length,
    integer: byType.integer.length,
    match: byType.match.length,
    total: uniqueFinal.length,
    expected: expectedTotal,
    qualityReplacesUsed,
    qualityReplaceBudget: replaceBudget,
  };

  const isFullyComplete = uniqueFinal.length >= expectedTotal;
  onProgress?.({
    phase: isFullyComplete ? "done" : "partial",
    message: isFullyComplete
      ? `Paper ready — ${uniqueFinal.length}/${expectedTotal} (Gemini→o3)`
      : `Partial — ${uniqueFinal.length}/${expectedTotal} o3-verified. Click Resume to complete.`,
    questions: uniqueFinal.map((q) => toUiQuestion(q, config)),
    items: [...finalItems, ...failures],
    failures,
    counts,
  });

  return {
    plan,
    questions: uniqueFinal.map((q) => toUiQuestion(q, config)),
    raw: uniqueFinal,
    items: [...finalItems, ...failures],
    failures,
    paperAudit: null,
    tokenUsage: deps.readTokenSummary?.(jobId)?.byModel || {},
    counts,
    completionStatus:
      uniqueFinal.length >= expectedTotal
        ? "completed"
        : uniqueFinal.length > 0
          ? "partially_completed"
          : "failed",
  };
};

export default {
  mapPool,
  o3VerifyCompact,
  schemaOkForO3,
  runParallelPaperPipeline,
};

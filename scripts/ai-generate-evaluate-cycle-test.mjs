/**
 * Full integration test (test script only):
 *   REAL_RUN=1  — same topic for generate + evaluate (production-like)
 *   default     — mismatch test (math generate vs chemistry evaluate)
 *
 * Steps: login → generate → evaluate initial → regen (if <80) → evaluate regen
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.API_BASE_URL || "http://localhost:8001";
const IS_REAL_RUN = process.env.REAL_RUN === "1" || process.env.TEST_MODE === "real";

const CAT_TOPIC =
  process.env.TEST_TOPIC ||
  "CAT Quantitative Aptitude — Percentages, profit and loss, and simple/compound interest";

const GENERATE_TOPIC = IS_REAL_RUN
  ? CAT_TOPIC
  : "Limits and definite integrals (JEE Main Mathematics)";
const EVALUATE_TOPIC = IS_REAL_RUN
  ? CAT_TOPIC
  : "JEE Main Organic Chemistry — SN1 and SN2 nucleophilic substitution mechanisms only";

const BANK_NAME = IS_REAL_RUN ? "CAT QA cycle test" : "JEE Main cycle test";
const SECTION_NAME = IS_REAL_RUN ? "Quantitative Aptitude" : "Mathematics";
const SUBJECT = IS_REAL_RUN ? "Quantitative Aptitude" : "Mathematics";
const EVAL_SECTION = IS_REAL_RUN ? "Quantitative Aptitude" : "Chemistry";
const EVAL_SUBJECT = IS_REAL_RUN ? "Quantitative Aptitude" : "Chemistry";

const OUTPUT_FILE =
  process.env.OUTPUT_FILE ||
  path.resolve(
    __dirname,
    IS_REAL_RUN
      ? "../../ai-cat-real-run-test.txt"
      : "../../ai-generate-evaluate-cycle-test.txt"
  );
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "iscorre2026@gmail.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Iscorre2026@321";

const DIFFICULTY = "medium";
const PASS_SCORE = 80;
const TARGET_LOW_SCORE = 75;
/** Omit type counts — backend infers from topic via inferCountsIfMissing */
const USE_INFERRED_COUNTS = process.env.USE_EXPLICIT_COUNTS !== "1";

const log = [];
const stamp = () => new Date().toISOString();

function section(title) {
  log.push("");
  log.push("=".repeat(72));
  log.push(title);
  log.push("=".repeat(72));
}

function appendJson(label, obj) {
  log.push(`${label}:`);
  log.push(JSON.stringify(redact(obj), null, 2));
}

function redact(obj) {
  return JSON.parse(
    JSON.stringify(obj, (_, v) => {
      if (typeof v === "string" && v.startsWith("eyJ")) return "[REDACTED_JWT]";
      return v;
    })
  );
}

async function api(method, urlPath, token, body, retries = 3) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const started = Date.now();
    try {
      const res = await fetch(`${BASE_URL}${urlPath}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const elapsedMs = Date.now() - started;
      let data;
      const text = await res.text();
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }
      return { status: res.status, ok: res.ok, elapsedMs, data };
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 2000 * attempt));
        continue;
      }
    }
  }
  throw lastErr;
}

function formatCorrectAnswer(q) {
  const opts = Array.isArray(q.options) ? q.options : [];
  if (q.questionType === "multiple" && Array.isArray(q.multipleCorrectIndexes)) {
    return q.multipleCorrectIndexes
      .map((i) => `${String.fromCharCode(65 + i)}. ${opts[i] || ""}`)
      .join("; ");
  }
  const idx = Number.isFinite(q.correctIndex) ? q.correctIndex : 0;
  return `${String.fromCharCode(65 + idx)}. ${opts[idx] || ""}`;
}

function mapQuestionsForEvaluation(questions) {
  const out = [];
  for (const q of questions || []) {
    if (q.questionType === "connected") {
      const passage = String(q.passage || "").trim();
      for (const sub of q.subQuestions || q.connectedQuestions || []) {
        const questionText = String(sub.questionText || "").trim();
        if (questionText.length < 5) continue;
        out.push({
          questionType: sub.questionType || "single",
          questionText,
          options: sub.options || [],
          correctAnswer: formatCorrectAnswer(sub),
          ...(passage ? { passage } : {}),
        });
      }
    } else {
      const questionText = String(q.questionText || "").trim();
      if (questionText.length < 5) continue;
      out.push({
        questionType: q.questionType || "single",
        questionText,
        options: q.options || [],
        correctAnswer: formatCorrectAnswer(q),
      });
    }
  }
  return out;
}

function buildTopicRelevanceFeedback(relevance) {
  if (!relevance) return null;
  return {
    overallScore: relevance.overallScore,
    regenerationInstructions:
      relevance.regenerationInstructions || relevance.summary || "",
  };
}

function buildGenerateBody(overrides = {}) {
  const infer =
    USE_INFERRED_COUNTS && overrides.generateIntent !== "evaluation_regen";
  const base = infer
    ? {
        singleCount: 0,
        multipleCount: 0,
        trueFalseCount: 0,
        passageCount: 0,
        inferCountsIfMissing: true,
        maxSelectableSlots: Number(process.env.MAX_SELECTABLE_SLOTS) || 20,
      }
    : {
        singleCount: Number(process.env.SINGLE_COUNT) || 5,
        multipleCount: 0,
        trueFalseCount: 0,
        passageCount: 0,
      };
  return {
    topic: GENERATE_TOPIC,
    bankName: BANK_NAME,
    difficulty: DIFFICULTY,
    excludeQuestionTexts: [],
    sectionName: SECTION_NAME,
    subject: SUBJECT,
    ...base,
    ...overrides,
  };
}

async function runEvaluate(token, stepLabel, questions, { alreadyEvaluated = false } = {}) {
  section(stepLabel);
  const evaluationQuestions = mapQuestionsForEvaluation(questions);
  if (!evaluationQuestions.length) {
    throw new Error(`No questions mapped for ${stepLabel}`);
  }

  log.push(`Generate topic (Gemini): ${GENERATE_TOPIC}`);
  log.push(
    IS_REAL_RUN
      ? `Evaluate topic (OpenAI): ${EVALUATE_TOPIC}`
      : `Evaluate topic (OpenAI, test mismatch): ${EVALUATE_TOPIC}`
  );

  const evaluateBody = {
    topic: EVALUATE_TOPIC,
    bankName: BANK_NAME,
    difficulty: DIFFICULTY,
    sectionName: EVAL_SECTION,
    subject: EVAL_SUBJECT,
    alreadyEvaluated,
    questions: evaluationQuestions,
  };
  appendJson("Request", {
    method: "POST",
    url: "/admin/ai/validate-question-topic-relevance",
    body: evaluateBody,
  });

  const evaluateRes = await api(
    "POST",
    "/admin/ai/validate-question-topic-relevance",
    token,
    evaluateBody
  );
  appendJson("Response", {
    status: evaluateRes.status,
    elapsedMs: evaluateRes.elapsedMs,
    data: evaluateRes.data,
  });

  if (!evaluateRes.ok) {
    throw new Error(`${stepLabel} failed (${evaluateRes.status})`);
  }

  const result = evaluateRes.data?.data || evaluateRes.data;
  const score = Number(result?.overallScore);
  log.push(
    `Score: ${Number.isFinite(score) ? score : "N/A"}/100 (${result?.verdict ?? "unknown"})`
  );
  if (!IS_REAL_RUN && Number.isFinite(score) && score >= TARGET_LOW_SCORE) {
    log.push(
      `Note: expected score below ${TARGET_LOW_SCORE} for mismatch test; got ${score}.`
    );
  }
  return { result, score, evaluationQuestions, evaluateRes };
}

async function main() {
  section(
    `AI GENERATE → EVALUATE → REGENERATE → RE-EVALUATE${IS_REAL_RUN ? " (REAL RUN)" : ""} (${stamp()})`
  );
  log.push(`Base URL: ${BASE_URL}`);
  log.push(`Output file: ${OUTPUT_FILE}`);
  log.push(`Mode: ${IS_REAL_RUN ? "REAL RUN — same topic for generate and evaluate" : "MISMATCH TEST"}`);
  if (IS_REAL_RUN) {
    log.push(`Topic: ${CAT_TOPIC}`);
  } else {
    log.push(
      `Test design: math generate vs chemistry evaluate to obtain score < ${TARGET_LOW_SCORE}.`
    );
  }

  section("STEP 1 — Admin login");
  const loginBody = { email: ADMIN_EMAIL, password: ADMIN_PASSWORD };
  appendJson("Request", { method: "POST", url: "/admin/login", body: loginBody });
  const loginRes = await api("POST", "/admin/login", null, loginBody);
  appendJson("Response", {
    status: loginRes.status,
    elapsedMs: loginRes.elapsedMs,
    data: loginRes.data,
  });

  if (!loginRes.ok) {
    throw new Error(`Login failed (${loginRes.status})`);
  }

  const token =
    loginRes.data?.data?.accessToken || loginRes.data?.accessToken;
  if (!token) {
    throw new Error("No accessToken in login response");
  }
  log.push(`Token received (${token.slice(0, 20)}…)`);

  section("STEP 2 — Generate question bank suggestions (Gemini)");
  const generateBody = buildGenerateBody({
    generateIntent: "initial",
    topicRelevanceEvaluated: false,
    topicRelevanceRegenerated: false,
    hasGeneratedQuestions: false,
    allowContinuation: false,
  });
  appendJson("Request", {
    method: "POST",
    url: "/admin/ai/generate-question-bank-suggestions",
    body: generateBody,
  });

  const generateRes = await api(
    "POST",
    "/admin/ai/generate-question-bank-suggestions",
    token,
    generateBody
  );
  appendJson("Response", {
    status: generateRes.status,
    elapsedMs: generateRes.elapsedMs,
    data: generateRes.data,
  });

  if (!generateRes.ok) {
    throw new Error(`Generate failed (${generateRes.status})`);
  }

  const questions =
    generateRes.data?.data?.questions || generateRes.data?.questions || [];
  const inferredCounts = generateRes.data?.data?.inferredCounts;
  log.push(`Generated ${questions.length} question(s).`);
  if (inferredCounts) {
    log.push(
      `AI inferred counts: ${inferredCounts.singleCount} single, ${inferredCounts.multipleCount} multiple, ${inferredCounts.trueFalseCount} T/F, ${inferredCounts.passageCount} passage(s) — ${inferredCounts.rationale || ""}`
    );
  }

  const initialEval = await runEvaluate(
    token,
    "STEP 3 — Evaluate INITIAL generated questions (OpenAI)",
    questions,
    { alreadyEvaluated: false }
  );

  const topicRelevanceFeedback = buildTopicRelevanceFeedback(initialEval.result);
  let regenRes = null;
  let regenQuestions = [];
  let regenEval = null;

  if (Number.isFinite(initialEval.score) && initialEval.score < PASS_SCORE && topicRelevanceFeedback) {
    section("STEP 4 — Regenerate using evaluation feedback (Gemini, targeted)");
    const flawedNumbers = (
      initialEval.result?.flawedQuestionNumbers || []
    ).map(Number).filter((n) => Number.isFinite(n) && n >= 1);
    const failedSet = new Set(flawedNumbers);
    const passingExclude = initialEval.evaluationQuestions
      .map((q, i) => ({ q, sampleNum: i + 1 }))
      .filter(({ sampleNum }) => !failedSet.has(sampleNum))
      .map(({ q }) => q.questionText)
      .filter(Boolean);
    const replacementCount = Math.max(1, flawedNumbers.length || 1);

    const regenBody = buildGenerateBody({
      generateIntent: "evaluation_regen",
      topicRelevanceEvaluated: true,
      topicRelevanceRegenerated: false,
      hasGeneratedQuestions: true,
      allowContinuation: false,
      topicRelevanceFeedback,
      excludeQuestionTexts: passingExclude,
      maxSelectableSlots: replacementCount,
      singleCount: replacementCount,
      multipleCount: 0,
      trueFalseCount: 0,
      passageCount: 0,
      passageSingleCount: 0,
      passageMultipleCount: 0,
      passageTrueFalseCount: 0,
    });
    appendJson("Request", {
      method: "POST",
      url: "/admin/ai/generate-question-bank-suggestions",
      body: regenBody,
    });

    regenRes = await api(
      "POST",
      "/admin/ai/generate-question-bank-suggestions",
      token,
      regenBody
    );
    appendJson("Response", {
      status: regenRes.status,
      elapsedMs: regenRes.elapsedMs,
      data: regenRes.data,
    });

    if (!regenRes.ok) {
      throw new Error(`Regenerate failed (${regenRes.status})`);
    }

    regenQuestions =
      regenRes.data?.data?.questions || regenRes.data?.questions || [];
    const targetedRegen =
      regenRes.data?.data?.targetedRegeneration ||
      regenRes.data?.targetedRegeneration ||
      null;
    log.push(`Regenerated ${regenQuestions.length} replacement question(s).`);
    if (targetedRegen) {
      log.push(
        `Targeted regen: replacementCount=${targetedRegen.replacementCount ?? "?"} failed=[${(targetedRegen.failedQuestionNumbers || []).join(", ")}]`
      );
      if (
        flawedNumbers.length &&
        Number(targetedRegen.replacementCount) !== replacementCount
      ) {
        log.push(
          `WARN: targeted replacementCount (${targetedRegen.replacementCount}) != expected (${replacementCount})`
        );
      }
    }

    regenEval = await runEvaluate(
      token,
      "STEP 5 — Evaluate REGENERATED questions (OpenAI)",
      regenQuestions,
      { alreadyEvaluated: false }
    );
  } else {
    section("STEP 4 — Regenerate skipped");
    log.push(
      `Initial score ${initialEval.score}/100 is at or above ${PASS_SCORE}, or feedback missing — regeneration not triggered.`
    );
  }

  section("SUMMARY");
  log.push(`Mode: ${IS_REAL_RUN ? "REAL RUN" : "MISMATCH TEST"}`);
  log.push(`Topic: ${GENERATE_TOPIC}`);
  log.push(`Initial questions generated: ${questions.length}`);
  log.push(
    `Initial evaluate score: ${initialEval.result?.overallScore ?? "N/A"}/100 (${initialEval.result?.verdict ?? "unknown"})`
  );
  log.push(
    `Initial regeneration instructions: ${initialEval.result?.regenerationInstructions || "—"}`
  );
  if (regenEval) {
    log.push(`Regenerated questions: ${regenQuestions.length}`);
    log.push(`Regenerate step: SUCCESS (${regenRes.elapsedMs} ms)`);
    log.push(
      `Regenerated evaluate score: ${regenEval.result?.overallScore ?? "N/A"}/100 (${regenEval.result?.verdict ?? "unknown"})`
    );
    const initialDiffMatch =
      initialEval.result?.dimensionScores?.difficultyMatch ??
      initialEval.result?.difficultyMatchScore;
    const regenDiffMatch =
      regenEval.result?.dimensionScores?.difficultyMatch ??
      regenEval.result?.difficultyMatchScore;
    if (Number.isFinite(initialDiffMatch) && Number.isFinite(regenDiffMatch)) {
      log.push(
        `Difficulty match: initial ${initialDiffMatch} → regen ${regenDiffMatch} (${regenDiffMatch >= initialDiffMatch ? "improved/same" : "lower"})`
      );
      if (regenDiffMatch >= 80) {
        log.push(`PASS: regen difficultyMatchScore >= 80`);
      } else if (regenDiffMatch > initialDiffMatch) {
        log.push(`PARTIAL: difficultyMatch improved but still below 80`);
      } else {
        log.push(`WARN: regen difficultyMatch did not improve`);
      }
    }
    log.push(
      `Regenerated regeneration instructions: ${regenEval.result?.regenerationInstructions || "—"}`
    );
  }
  log.push(`Test completed at ${stamp()}`);

  fs.writeFileSync(OUTPUT_FILE, log.join("\n"), "utf8");
  console.log(`Done. Log saved to:\n${OUTPUT_FILE}`);
  console.log(
    `Initial score: ${initialEval.result?.overallScore}/100 | Regenerated score: ${regenEval ? regenEval.result?.overallScore : "n/a"}/100 | Regen count: ${regenQuestions.length}`
  );
}

main().catch((err) => {
  section("ERROR");
  log.push(String(err?.stack || err));
  try {
    fs.writeFileSync(OUTPUT_FILE, log.join("\n"), "utf8");
    console.error(`Failed. Partial log saved to:\n${OUTPUT_FILE}`);
  } catch {
    console.error(err);
  }
  process.exit(1);
});

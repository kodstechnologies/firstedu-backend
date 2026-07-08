/**
 * Generate ai-api-logs for multiple topics (infer → generate → validate).
 * Output: temp/ai-api-logs/{YYYY-MM-DD}/{HH}-{mm}-{dd}-{MM}-{yy}-{topic-slug}.txt
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { buildLogFileName } from "../src/utils/aiApiCallLogger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.API_BASE_URL || "http://localhost:8001";
const LOG_ROOT = path.resolve(__dirname, "../temp/ai-api-logs");
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "iscorre2026@gmail.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Iscorre2026@321";
const MAX_SELECTABLE_SLOTS = 10;

const LOG_DATE = process.env.LOG_DATE?.trim() || "";
const LOG_SUBDIR = process.env.LOG_SUBDIR?.trim() || "";

const logDateFolder = (date = new Date()) => {
  if (LOG_DATE) return LOG_DATE;
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const getLogDir = (date = new Date()) => {
  const base = path.join(LOG_ROOT, logDateFolder(date));
  return LOG_SUBDIR ? path.join(base, LOG_SUBDIR) : base;
};

const logRelativePath = (fileName, date = new Date()) => {
  const parts = [logDateFolder(date)];
  if (LOG_SUBDIR) parts.push(LOG_SUBDIR);
  parts.push(fileName);
  return parts.join("/");
};

const DEFAULT_TOPICS = [
  "Competitive › Engineering › JEE › Physics",
  "Competitive › MBA › CAT › Quantitative Aptitude",
  "Competitive › Medical › NEET › Biology",
  "Skill Development › React.js",
  "Competitive › UPSC › Indian Polity",
];

const TOPICS = process.env.TOPICS_JSON
  ? JSON.parse(process.env.TOPICS_JSON)
  : DEFAULT_TOPICS;

const toCategoryPath = (topic) =>
  topic
    .split("›")
    .map((s) => s.trim())
    .filter(Boolean)
    .join(">");

const formatLogBlock = (endpointPath, requestBody, responseBody) => {
  const url = `${BASE_URL}${endpointPath}`;
  const reqLine = JSON.stringify(requestBody ?? {});
  const resLine = JSON.stringify(responseBody ?? {}, null, 4);
  return `${url}\n\n${reqLine}\n\n${resLine}\n\n`;
};

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
          ...(String(sub.explanation || "").trim()
            ? { explanation: String(sub.explanation || "").trim() }
            : {}),
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
        ...(String(q.explanation || "").trim()
          ? { explanation: String(q.explanation || "").trim() }
          : {}),
      });
    }
  }
  return out;
}

async function api(method, urlPath, token, body, retries = 3) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${BASE_URL}${urlPath}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }
      return { status: res.status, ok: res.ok, data };
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

async function login() {
  const loginRes = await api("POST", "/admin/login", null, {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  });
  if (!loginRes.ok) {
    throw new Error(`Login failed (${loginRes.status}): ${JSON.stringify(loginRes.data)}`);
  }
  const token = loginRes.data?.data?.accessToken || loginRes.data?.accessToken;
  if (!token) throw new Error("No accessToken in login response");
  return token;
}

async function processTopic(token, topic) {
  const bankName = topic;
  const categoryPaths = [toCategoryPath(topic)];
  const logDir = getLogDir();
  const fileName = buildLogFileName(topic);
  const filePath = path.join(logDir, fileName);

  console.log(`\n[${topic}] → ${logRelativePath(fileName)}`);

  const inferReq = {
    topic,
    bankName,
    difficulty: "medium",
    maxSelectableSlots: MAX_SELECTABLE_SLOTS,
    generateIntent: "initial",
  };

  const generateReq = {
    topic,
    bankName,
    difficulty: "medium",
    singleCount: 0,
    multipleCount: 0,
    trueFalseCount: 0,
    passageCount: 0,
    passageSingleCount: 0,
    passageMultipleCount: 0,
    passageTrueFalseCount: 0,
    excludeQuestionTexts: [],
    categoryPaths,
    sectionName: "",
    generateIntent: "initial",
    topicRelevanceEvaluated: false,
    topicRelevanceRegenerated: false,
    hasGeneratedQuestions: false,
    allowContinuation: false,
    maxSelectableSlots: MAX_SELECTABLE_SLOTS,
    inferCountsIfMissing: true,
    connectedCount: 0,
  };

  const generateRes = await api(
    "POST",
    "/admin/ai/generate-question-bank-suggestions",
    token,
    generateReq
  );

  if (!generateRes.ok) {
    throw new Error(
      `Generate failed for "${topic}" (${generateRes.status}): ${JSON.stringify(generateRes.data)}`
    );
  }

  const questions =
    generateRes.data?.data?.questions || generateRes.data?.questions || [];
  const inferredCounts = generateRes.data?.data?.inferredCounts || null;
  const competitiveExamPlan =
    generateRes.data?.data?.competitiveExamPlan || null;
  const detectedSubject = generateRes.data?.data?.detectedSubject || {
    id: null,
    label: null,
    source: null,
  };

  const inferRes = competitiveExamPlan
    ? {
        competitiveExamPlan,
        usedFallback: false,
        detectedSubject,
      }
    : {
        inferredCounts,
        usedFallback: false,
        detectedSubject,
      };

  let logContent = "";
  logContent += formatLogBlock(
    competitiveExamPlan
      ? "/admin/ai/infer-competitive-exam-plan"
      : "/admin/ai/infer-question-bank-counts",
    inferReq,
    inferRes
  );
  logContent += formatLogBlock(
    "/admin/ai/generate-question-bank-suggestions",
    generateReq,
    generateRes.data
  );

  const evalQuestions = mapQuestionsForEvaluation(questions);
  const validateReq = {
    topic,
    bankName,
    difficulty: "medium",
    sectionName: "",
    questions: evalQuestions,
    alreadyEvaluated: false,
  };

  const validateRes = await api(
    "POST",
    "/admin/ai/validate-question-topic-relevance",
    token,
    validateReq
  );

  if (!validateRes.ok) {
    throw new Error(
      `Validate failed for "${topic}" (${validateRes.status}): ${JSON.stringify(validateRes.data)}`
    );
  }

  logContent += formatLogBlock(
    "/admin/ai/validate-question-topic-relevance",
    validateReq,
    validateRes.data
  );

  fs.mkdirSync(logDir, { recursive: true });
  fs.writeFileSync(filePath, logContent, "utf8");

  const score = validateRes.data?.data?.overallScore ?? "N/A";
  console.log(`  ✓ ${questions.length} questions, relevance score: ${score}/100`);
  console.log(`  Saved: ${filePath}`);

  return filePath;
}

async function main() {
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Topics: ${TOPICS.length}`);

  const token = await login();
  console.log("Admin login OK");

  const saved = [];
  for (const topic of TOPICS) {
    try {
      const filePath = await processTopic(token, topic);
      saved.push(filePath);
    } catch (err) {
      console.error(`  ✗ Failed for "${topic}":`, err.message);
    }
  }

  console.log(`\nDone. ${saved.length}/${TOPICS.length} log files written.`);
  for (const f of saved) console.log(`  ${f}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE_URL = process.env.API_BASE_URL || "http://localhost:8001";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "iscorre2026@gmail.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Iscorre2026@321";

const questionsFile = process.argv[2];
const questions = questionsFile
    ? JSON.parse(fs.readFileSync(path.resolve(questionsFile), "utf8"))
    : JSON.parse(process.env.QUESTIONS_JSON || "[]");
const topic =
    process.env.TOPIC ||
    "Competitive › Engineering › JEE › Physics";
const difficulty = process.env.DIFFICULTY || "medium";
const bankName = process.env.BANK_NAME || topic;

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

function mapQuestionsForEvaluation(raw) {
    return (raw || []).map((q) => ({
        questionType: q.questionType || "single",
        questionText: q.questionText,
        options: q.options || [],
        correctAnswer: formatCorrectAnswer(q),
        ...(q.explanation ? { explanation: q.explanation } : {}),
    }));
}

async function api(method, urlPath, token, body) {
    const res = await fetch(`${BASE_URL}${urlPath}`, {
        method,
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    return { status: res.status, ok: res.ok, data };
}

async function main() {
    const loginRes = await api("POST", "/admin/login", null, {
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
    });
    if (!loginRes.ok) {
        console.error("Login failed", loginRes);
        process.exit(1);
    }
    const token =
        loginRes.data?.data?.accessToken || loginRes.data?.accessToken;

    const evalQuestions = mapQuestionsForEvaluation(questions);
    const validateReq = {
        topic,
        bankName,
        difficulty,
        sectionName: "",
        questions: evalQuestions,
        alreadyEvaluated: false,
    };

    console.log(`Evaluating ${evalQuestions.length} questions for: ${topic}\n`);
    const validateRes = await api(
        "POST",
        "/admin/ai/validate-question-topic-relevance",
        token,
        validateReq
    );

    if (!validateRes.ok) {
        console.error("Validate failed", JSON.stringify(validateRes.data, null, 2));
        process.exit(1);
    }

    const d = validateRes.data?.data || {};
    console.log("=== VALIDATION RESULT ===");
    console.log(`Overall score:      ${d.overallScore}/100 (${d.verdict})`);
    console.log(`Topic relevance:    ${d.topicRelevanceScore}/100`);
    console.log(`Correctness:        ${d.correctnessScore}/100 (factual only)`);
    if (d.correctnessBreakdown) {
        const cb = d.correctnessBreakdown;
        console.log(
            `  Breakdown:          ${cb.correctQuestions}/${cb.questionsAudited} clean · ${cb.criticalErrors} critical · ${cb.majorErrors} major · ${cb.minorErrors} minor`
        );
        console.log(`  Derivation:         ${cb.derivation}`);
    } else if (d.correctQuestions != null) {
        console.log(
            `  Breakdown:          ${d.correctQuestions} clean · ${d.criticalErrors ?? 0} critical · ${d.majorErrors ?? 0} major · ${d.minorErrors ?? 0} minor`
        );
    }
    if (d.overallScoreBreakdown?.derivation) {
        console.log(`Overall derivation: ${d.overallScoreBreakdown.derivation}`);
    }
    if (d.styleScore != null) {
        console.log(`Style / craft:      ${d.styleScore}/100`);
    }
    if (d.authenticityScore != null) {
        console.log(`JEE authenticity:   ${d.authenticityScore}/100`);
    }
    const factual = d.factualIssues || [];
    const style = d.styleIssues || [];
    if (factual.length || style.length) {
        console.log(`\nIssue split: ${factual.length} factual, ${style.length} style`);
    }
    console.log(`Sample: ${d.sampleCount}/${d.totalCount}`);
    console.log("\n--- Confirmed issues ---");
    for (const issue of d.confirmedIssues || []) {
        const cat = issue.category ? ` ${issue.category}` : "";
        console.log(
            `Q${issue.questionNumber} [${issue.severity}${cat}]: ${issue.issue}`
        );
    }
    if (!(d.confirmedIssues || []).length) {
        console.log("(none)");
    }
    console.log("\n--- Full response ---");
    console.log(JSON.stringify(validateRes.data, null, 2));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

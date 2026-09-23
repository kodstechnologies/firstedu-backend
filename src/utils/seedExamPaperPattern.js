import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import ExamPaperPattern from "../models/ExamPaperPattern.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const resolveExisting = (candidates) =>
  candidates.find((p) => fs.existsSync(p)) || null;

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));

const SECTION_DEFS = [
  {
    key: "section_1_single_correct",
    type: "single",
    label: "Single Correct",
    order: 1,
  },
  {
    key: "section_2_multi_correct",
    type: "multi",
    label: "Multi-Correct",
    order: 2,
  },
  {
    key: "section_3_numerical",
    type: "integer",
    label: "Numerical / Integer",
    order: 3,
  },
  {
    key: "section_4_match_list",
    type: "match",
    label: "Match the Column",
    order: 4,
  },
  {
    key: "section_5_paragraph",
    type: "paragraph",
    label: "Comprehension / Paragraph",
    order: 5,
  },
];

const buildSections = (paperBlock = {}) =>
  SECTION_DEFS.map((def) => {
    const raw = paperBlock[def.key] || {};
    return {
      key: def.key,
      type: def.type,
      label: def.label,
      questions: Number(raw.questions || 0) || 0,
      options: Number(raw.options || 0) || 0,
      order: def.order,
    };
  }).filter((s) => s.questions > 0 || ["match", "paragraph"].includes(s.type));

const typeCountsFromSections = (sections = []) => {
  const counts = {
    single: 0,
    multi: 0,
    integer: 0,
    match: 0,
    paragraph: 0,
    total: 0,
  };
  for (const s of sections) {
    if (counts[s.type] != null) counts[s.type] += s.questions;
  }
  counts.total =
    counts.single +
    counts.multi +
    counts.integer +
    counts.match +
    counts.paragraph;
  return counts;
};

const upsertPaper = async (payload) =>
  ExamPaperPattern.findOneAndUpdate(
    {
      examType: payload.examType,
      year: payload.year,
      paperNumber: payload.paperNumber,
    },
    { $set: payload },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

const seedPatternFile = async ({
  examType,
  examLabelFallback,
  relativePath,
  sourceLabel,
}) => {
  const patternPath = resolveExisting([
    path.resolve(process.cwd(), relativePath),
    path.resolve(__dirname, "../../", relativePath),
  ]);

  if (!patternPath) {
    console.warn(`ExamPaperPattern: pattern file missing (${relativePath}) — skip.`);
    return [];
  }

  const pattern = readJson(patternPath);
  const year = Number(pattern.year || 2026);
  const examDay = pattern.exam_day || {};

  // Newer NEET/CAT-style files use top-level `structure` (+ section tables)
  // instead of structure_per_subject_per_paper. Normalize so the rest of the
  // seeder is shared.
  let perPaper = pattern.structure_per_subject_per_paper || null;
  if (!perPaper && pattern.structure && typeof pattern.structure === "object") {
    const st = pattern.structure;
    const qps = st.questions_per_subject || st.questions_per_section || {};
    const qpsValues = Object.values(qps)
      .map((n) => Number(n) || 0)
      .filter((n) => n > 0);
    const perSubject =
      Number(
        qps.Physics ||
          qps.Chemistry ||
          qps.Botany ||
          qps.VARC ||
          qps.DILR ||
          qps.QA ||
          0
      ) ||
      (qpsValues.length
        ? Math.round(qpsValues.reduce((a, b) => a + b, 0) / qpsValues.length)
        : 0) ||
      Math.round(Number(st.total_questions || 180) / 4) ||
      45;
    const sectionCount = Math.max(
      1,
      (Array.isArray(pattern.section_order) && pattern.section_order.length) ||
        (Array.isArray(pattern.sections) &&
          pattern.sections.every((s) => typeof s === "string") &&
          pattern.sections.length) ||
        qpsValues.length ||
        1
    );
    const mcqSplit = st.approx_mcq_tita_split || {};
    let singleQs = Number(mcqSplit.mcq)
      ? Math.round(Number(mcqSplit.mcq) / sectionCount)
      : perSubject;
    let integerQs = Number(mcqSplit.tita)
      ? Math.round(Number(mcqSplit.tita) / sectionCount)
      : 0;
    if (integerQs > 0 && singleQs + integerQs !== perSubject) {
      singleQs = Math.max(0, perSubject - integerQs);
    }
    perPaper = {
      Paper_1: {
        paper_number: 1,
        label: `${examLabelFallback || pattern.exam || "Exam"} Paper`,
        session: examDay.single_paper
          ? "single"
          : examDay.slots
            ? "slot-varies"
            : "",
        start_time: st.start_time || "",
        end_time: st.end_time || "",
        duration_minutes: Number(
          st.total_duration_minutes ||
            pattern.grand_total?.duration_minutes ||
            180
        ),
        total_marks: Number(st.total_marks || 0),
        questions_per_subject: perSubject,
        total_questions: Number(st.total_questions || 0),
        total_questions_scored: Number(st.total_questions || 0),
        overall_difficulty: st.overall_difficulty || "",
        section_1_single_correct: {
          questions: singleQs,
          options: Number(st.question_format?.options || 4) || 4,
          type: "single",
        },
        section_2_multi_correct: { questions: 0, options: 4, type: "multi" },
        section_3_numerical: {
          questions: integerQs,
          options: 0,
          type: "integer",
        },
        section_4_match_list: { questions: 0, options: 4, type: "match" },
        section_5_paragraph: { questions: 0, options: 4, type: "paragraph" },
        formats: Array.isArray(st.question_types)
          ? st.question_types
          : integerQs > 0
            ? ["Single Correct MCQ", "TITA"]
            : ["Single Correct MCQ"],
      },
    };
  }

  const subjects = Array.isArray(pattern.bank_subjects)
    ? pattern.bank_subjects
    : Array.isArray(pattern.biology_split) && Array.isArray(pattern.subjects)
      ? [
          ...pattern.subjects.filter(
            (s) => !/^bio/i.test(String(s)) && !/^biology$/i.test(String(s))
          ),
          ...pattern.biology_split,
        ]
      : Array.isArray(pattern.subjects)
        ? pattern.subjects
        : Array.isArray(pattern.sections) &&
            pattern.sections.every((s) => typeof s === "string")
          ? pattern.sections
          : Array.isArray(pattern.section_order)
            ? pattern.section_order
            : ["Physics", "Chemistry", "Mathematics"];
  const results = [];

  const structureQps =
    pattern.structure?.questions_per_subject ||
    pattern.structure?.questions_per_section ||
    null;
  const structureQpsTable = structureQps
    ? Object.fromEntries(
        Object.entries(structureQps).map(([key, val]) => [
          key,
          { questions: Number(val) || 0 },
        ])
      )
    : null;

  for (const [paperKey, block] of Object.entries(perPaper || {})) {
    const paperNumber = Number(
      block.paper_number || (paperKey === "Paper_2" ? 2 : 1)
    );
    const sections = buildSections(block);
    const activeSections = sections.filter((s) => s.questions > 0);
    const typeCounts = typeCountsFromSections(
      SECTION_DEFS.map((def) => ({
        type: def.type,
        questions: Number(block[def.key]?.questions || 0) || 0,
      }))
    );

    const doc = await upsertPaper({
      examType,
      examLabel: pattern.cycle || pattern.exam || examLabelFallback,
      year,
      paperNumber,
      paperKey,
      paperLabel: block.label || `Paper ${paperNumber}`,
      session: block.session || "",
      examDate: examDay.date || "",
      examDateLabel: examDay.date_label || "",
      startTime: block.start_time || "",
      endTime: block.end_time || "",
      durationMinutes: Number(block.duration_minutes || 180),
      totalMarks: Number(block.total_marks || 0),
      totalQuestions: Number(block.total_questions || 0),
      questionsPerSubject: Number(
        block.questions_per_subject || typeCounts.total
      ),
      subjects,
      formats: Array.isArray(block.formats) ? block.formats : [],
      overallDifficulty: block.overall_difficulty || "",
      mandatoryBothPapers: Boolean(examDay.mandatory_both_papers),
      sections: activeSections,
      typeCounts,
      source: sourceLabel || relativePath,
      dataProvenance: pattern.data_provenance || "",
      quickComparison:
        structureQpsTable ||
        pattern.section_table ||
        pattern.combined_subject_table ||
        pattern.all_subjects_table ||
        pattern.quick_comparison ||
        undefined,
      isActive: true,
    });

    results.push({
      examType: doc.examType,
      year: doc.year,
      paper: doc.paperLabel,
      questions: doc.totalQuestions,
      perSubject: doc.questionsPerSubject,
      marks: doc.totalMarks,
      session: `${doc.startTime}-${doc.endTime}`,
      types: doc.typeCounts,
      subjects: doc.subjects,
    });
  }

  return results;
};

/**
 * Seed official paper patterns:
 * - JEE Advanced 2026 Paper 1 + Paper 2
 * - JEE Main 2026 Paper 1 (B.E./B.Tech)
 * - NEET UG 2026 single paper
 * - CAT 2026 slot paper (VARC / DILR / QA)
 * - GMAT Focus Edition 2026 (Quant / Verbal / Data Insights)
 * - CLAT UG 2026 (English / Current Affairs / Legal / Logical / Quant)
 * - IBPS PO Prelims 2026 (English / Quant / Reasoning)
 * - SSC CGL Tier 1 2026 (Reasoning / GA / Quant / English)
 * - SSC CGL Tier 2 2026 Paper I (Maths / Reasoning / English / GA / Computer)
 * - UPSC CSE Prelims 2026 GS Paper I (History / Polity / Geography / Economy / Environment / Science / CA)
 */
export const seedExamPaperPattern = async () => {
  const results = [
    ...(await seedPatternFile({
      examType: "jee_advanced",
      examLabelFallback: "JEE Advanced",
      relativePath: "jee_advanced/jee_advanced_pattern_totals.json",
      sourceLabel: "jee_advanced/jee_advanced_pattern_totals.json",
    })),
    ...(await seedPatternFile({
      examType: "jee_main",
      examLabelFallback: "JEE Main",
      relativePath:
        "jee main exam all seed files/jee_main_pattern_totals.json",
      sourceLabel: "jee main exam all seed files/jee_main_pattern_totals.json",
    })),
    ...(await seedPatternFile({
      examType: "neet",
      examLabelFallback: "NEET UG",
      relativePath: "NEET UG LATEST SEED FILE/neet_pattern_totals.json",
      sourceLabel: "NEET UG LATEST SEED FILE/neet_pattern_totals.json",
    })),
    ...(await seedPatternFile({
      examType: "cat",
      examLabelFallback: "CAT",
      relativePath: "CAT EXAM LATAETS SEED FILE/cat_pattern_totals.json",
      sourceLabel: "CAT EXAM LATAETS SEED FILE/cat_pattern_totals.json",
    })),
    ...(await seedPatternFile({
      examType: "gmat",
      examLabelFallback: "GMAT Focus Edition",
      relativePath: "GMAT EXAM  SEED DATA/gmat_pattern_totals.json",
      sourceLabel: "GMAT EXAM  SEED DATA/gmat_pattern_totals.json",
    })),
    ...(await seedPatternFile({
      examType: "clat",
      examLabelFallback: "CLAT UG",
      relativePath: "CLAT EXAM SEED FILES/clat_pattern_totals.json",
      sourceLabel: "CLAT EXAM SEED FILES/clat_pattern_totals.json",
    })),
    ...(await seedPatternFile({
      examType: "ibps",
      examLabelFallback: "IBPS PO Prelims",
      relativePath:
        "IBPS PO prelims syllabus and seed file/ibps_po_prelims_pattern_totals.json",
      sourceLabel:
        "IBPS PO prelims syllabus and seed file/ibps_po_prelims_pattern_totals.json",
    })),
    ...(await seedPatternFile({
      examType: "ssc_cgl_tier1",
      examLabelFallback: "SSC CGL Tier 1",
      relativePath:
        "ssc cgl tier 1 question paper/ssc_cgl_tier1_pattern_totals.json",
      sourceLabel:
        "ssc cgl tier 1 question paper/ssc_cgl_tier1_pattern_totals.json",
    })),
    ...(await seedPatternFile({
      examType: "ssc_cgl_tier2",
      examLabelFallback: "SSC CGL Tier 2",
      relativePath:
        "ssc cgl tier 2 question paper/ssc_cgl_tier2_pattern_totals.json",
      sourceLabel:
        "ssc cgl tier 2 question paper/ssc_cgl_tier2_pattern_totals.json",
    })),
    ...(await seedPatternFile({
      examType: "upsc",
      examLabelFallback: "UPSC CSE Prelims",
      relativePath: "files/upsc_cse_prelims/upsc_gs_pattern_totals.json",
      sourceLabel: "files/upsc_cse_prelims/upsc_gs_pattern_totals.json",
    })),
  ];

  console.log(
    `Seeded ExamPaperPattern: ${results
      .map(
        (r) =>
          `${r.examType}/${r.paper} ${r.questions}Q/${r.marks} · ${r.perSubject}/subject`
      )
      .join("; ") || "none"}`
  );

  return { seeded: true, papers: results };
};

export default seedExamPaperPattern;

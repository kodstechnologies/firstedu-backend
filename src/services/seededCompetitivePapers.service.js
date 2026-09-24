import Category from "../models/Category.js";
import Test from "../models/Test.js";
import JeeMainCompetitivePaper from "../models/JeeMainCompetitivePaper.js";
import JeeAdvancedCompetitivePaper from "../models/JeeAdvancedCompetitivePaper.js";
import NeetCompetitivePaper from "../models/NeetCompetitivePaper.js";
import ClatCompetitivePaper from "../models/ClatCompetitivePaper.js";
import IbpsCompetitivePaper from "../models/IbpsCompetitivePaper.js";
import GmatCompetitivePaper from "../models/GmatCompetitivePaper.js";
import CatCompetitivePaper from "../models/CatCompetitivePaper.js";
import SscCglTier1CompetitivePaper from "../models/SscCglTier1CompetitivePaper.js";
import SscCglTier2CompetitivePaper from "../models/SscCglTier2CompetitivePaper.js";
import UpscCompetitivePaper from "../models/UpscCompetitivePaper.js";

const EXAM_REGISTRY = [
  {
    examKey: "jee_main",
    label: "JEE Main",
    Paper: JeeMainCompetitivePaper,
    match: (name) => /^jee\s*mains?$/i.test(String(name || "").trim()),
  },
  {
    examKey: "jee_advanced",
    label: "JEE Advanced",
    Paper: JeeAdvancedCompetitivePaper,
    match: (name) => {
      const n = String(name || "").trim();
      if (/^jee\s*advanc(?:e|ed)\s*[12]$/i.test(n)) return false;
      return /jee\s*advanc(?:e|ed)/i.test(n);
    },
  },
  {
    examKey: "neet",
    label: "NEET",
    Paper: NeetCompetitivePaper,
    match: (name) => {
      const n = String(name || "").trim();
      return /\bneet\b/i.test(n) && !/\bpg\b/i.test(n);
    },
  },
  {
    examKey: "clat",
    label: "CLAT",
    Paper: ClatCompetitivePaper,
    match: (name) => {
      const n = String(name || "").trim();
      if (/^clat[\s_-]*20\d{2}$/i.test(n)) return false;
      return /\bclat\b/i.test(n);
    },
  },
  {
    examKey: "ibps",
    label: "IBPS PO Prelims",
    Paper: IbpsCompetitivePaper,
    match: (name) => /ibps(\s*po)?(\s*prelims)?/i.test(String(name || "")),
  },
  {
    examKey: "gmat",
    label: "GMAT",
    Paper: GmatCompetitivePaper,
    match: (name) => /\bgmat\b/i.test(String(name || "")),
  },
  {
    examKey: "cat",
    label: "CAT",
    Paper: CatCompetitivePaper,
    match: (name) =>
      /^cat$/i.test(String(name || "").trim()) ||
      /\bcommon\s+admission\s+test\b/i.test(String(name || "")),
  },
  {
    examKey: "ssc_cgl_tier2",
    label: "SSC CGL Tier 2",
    Paper: SscCglTier2CompetitivePaper,
    match: (name) =>
      /ssc\s*cgl.*tier\s*(2|ii)\b|\bcgl\s*tier\s*(2|ii)\b/i.test(
        String(name || "")
      ),
  },
  {
    examKey: "ssc_cgl_tier1",
    label: "SSC CGL Tier 1",
    Paper: SscCglTier1CompetitivePaper,
    match: (name) =>
      /ssc\s*cgl\b|\bcgl\s*tier\s*[i1]\b/i.test(String(name || "")) &&
      !/tier\s*(2|ii)\b/i.test(String(name || "")),
  },
  {
    examKey: "upsc",
    label: "UPSC Prelims",
    Paper: UpscCompetitivePaper,
    match: (name) => /\bupsc\b/i.test(String(name || "")),
  },
];

const walkCategoryAncestors = async (startId) => {
  const nodes = [];
  let currentId = startId;
  const seen = new Set();
  for (let depth = 0; depth < 12 && currentId; depth += 1) {
    const key = String(currentId);
    if (seen.has(key)) break;
    seen.add(key);
    const node = await Category.findById(currentId)
      .select("name parent rootType")
      .lean();
    if (!node) break;
    nodes.push(node);
    currentId = node.parent || null;
  }
  return nodes;
};

export const resolveSeededExamFromCategory = async (categoryId) => {
  if (!categoryId) return null;
  const ancestors = await walkCategoryAncestors(categoryId);
  for (const node of ancestors) {
    for (const exam of EXAM_REGISTRY) {
      if (exam.match(node.name)) {
        return {
          examKey: exam.examKey,
          label: exam.label,
          categoryId: node._id,
          categoryName: node.name,
          Paper: exam.Paper,
        };
      }
    }
  }
  return null;
};

const mapPaperAsTest = (paper, { categoryId, categoryPath, linkedTest } = {}) => {
  const testId = linkedTest?._id || null;
  return {
    _id: testId || paper._id,
    title: paper.title,
    description:
      paper.description ||
      `${paper.title} — seeded competitive paper (${paper.examType || "exam"}).`,
    durationMinutes: paper.durationMinutes || linkedTest?.durationMinutes || 0,
    price: linkedTest?.price ?? 0,
    originalPrice: linkedTest?.price ?? 0,
    effectivePrice: linkedTest?.price ?? 0,
    isPublished: paper.isPublished !== false,
    categoryId: linkedTest?.categoryId || categoryId || null,
    categoryPath: categoryPath || "",
    applicableFor: "Competitive",
    paperSource: `${paper.examType || "seeded"}_db`,
    examType: paper.examType || null,
    paperKey: paper.paperKey,
    paperId: paper._id,
    totalQuestions: paper.totalQuestions ?? 0,
    totalMarks: paper.totalMarks ?? 0,
    subjects: paper.subjects || [],
    isSeededPaper: true,
    // Pillar edit URL uses testId when present; seeded-only papers are view-only.
    testId: testId
      ? {
          _id: testId,
          title: linkedTest.title,
          durationMinutes: linkedTest.durationMinutes,
          price: linkedTest.price ?? 0,
          originalPrice: linkedTest.price ?? 0,
          effectivePrice: linkedTest.price ?? 0,
        }
      : null,
    createdAt: paper.createdAt,
    updatedAt: paper.updatedAt,
  };
};

export const listSeededPapersForExam = async (examKey) => {
  const exam = EXAM_REGISTRY.find((e) => e.examKey === examKey);
  if (!exam) return [];
  return exam.Paper.find({ isActive: { $ne: false } })
    .sort({ sortOrder: 1, createdAt: 1 })
    .lean();
};

export const listSeededPapersForCategory = async (
  categoryId,
  { categoryPath = "" } = {}
) => {
  const resolved = await resolveSeededExamFromCategory(categoryId);
  if (!resolved) return { exam: null, papers: [], tests: [] };

  const papers = await resolved.Paper.find({ isActive: { $ne: false } })
    .sort({ sortOrder: 1, createdAt: 1 })
    .lean();

  const paperIds = papers.map((p) => p._id);
  const linkedTests =
    resolved.examKey === "jee_main" && paperIds.length
      ? await Test.find({
          jeeMainPaper: { $in: paperIds },
          applicableFor: "Competitive",
        })
          .select("_id title jeeMainPaper categoryId price durationMinutes")
          .lean()
      : [];

  const testByPaper = new Map(
    linkedTests.map((t) => [String(t.jeeMainPaper), t])
  );

  const tests = papers.map((paper) =>
    mapPaperAsTest(paper, {
      categoryId: resolved.categoryId,
      categoryPath,
      linkedTest: testByPaper.get(String(paper._id)) || null,
    })
  );

  return {
    exam: {
      examKey: resolved.examKey,
      label: resolved.label,
      categoryId: resolved.categoryId,
      categoryName: resolved.categoryName,
    },
    papers,
    tests,
  };
};

export const listAllSeededPaperSummaries = async () => {
  const results = [];
  for (const exam of EXAM_REGISTRY) {
    const papers = await exam.Paper.find({ isActive: { $ne: false } })
      .select(
        "paperKey title examType totalQuestions totalMarks durationMinutes isPublished sortOrder createdAt"
      )
      .sort({ sortOrder: 1, createdAt: 1 })
      .lean();
    results.push({
      examKey: exam.examKey,
      label: exam.label,
      paperCount: papers.length,
      papers,
    });
  }
  return results;
};

export default {
  resolveSeededExamFromCategory,
  listSeededPapersForExam,
  listSeededPapersForCategory,
  listAllSeededPaperSummaries,
};

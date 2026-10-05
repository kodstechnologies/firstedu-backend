import Test from "../models/Test.js";
import Category from "../models/Category.js";
import QuestionBank from "../models/QuestionBank.js";
import AiQuestionBank from "../models/AiQuestionBank.js";
import Question from "../models/Question.js";
import AiQuestion from "../models/AiQuestion.js";
import { attachOfferToList } from "../utils/offerUtils.js";
import categoryRepository from "../repository/category.repository.js";
import {
  listSeededPapersForCategory,
  normalizeSubjectKey,
  resolveSeededExamFromCategory,
} from "./seededCompetitivePapers.service.js";

/** "Mathematics · Section A" → "Mathematics" */
function sectionSubjectLabel(name = "") {
  return String(name || "")
    .trim()
    .split(/\s*[·•|]\s*/)[0]
    .trim();
}

function subjectNamesMatch(a, b) {
  const left = normalizeSubjectKey(sectionSubjectLabel(a));
  const right = normalizeSubjectKey(sectionSubjectLabel(b));
  return Boolean(left) && left === right;
}

/** Saved as "… › All subjects · d83c013b" even if later subjects were cancelled. */
function bankIsAllSubjects(bank) {
  const hay = [bank?.name, bank?.generationTopic, bank?.examLabel]
    .map((part) => String(part || ""))
    .join(" ");
  return /\ball\s+subjects\b/i.test(hay);
}

/** Last folder in "Exam › Verbal · abcd1234" — used for every exam, not one list. */
function subjectLabelFromBankTitle(bank) {
  const raw = String(bank?.generationTopic || bank?.name || "");
  const parts = raw
    .split(/\s*›\s*/)
    .map((part) => part.replace(/\s*[·•]\s*[a-f0-9]{4,12}\s*$/i, "").trim())
    .filter(Boolean);
  const last = parts[parts.length - 1] || "";
  if (!last || /^all\s+subjects$/i.test(last)) return "";
  return last;
}

function matchSubjectNodes(labels, subjectNodes) {
  const matched = [];
  const seen = new Set();
  for (const node of subjectNodes) {
    if (!labels.some((label) => subjectNamesMatch(label, node.name))) continue;
    const id = String(node._id);
    if (seen.has(id)) continue;
    seen.add(id);
    matched.push(node);
  }
  return matched;
}

/**
 * A bank that only contains one subject belongs on that subject node.
 * A bank with several subjects stays on the exam (All).
 * extraLabels are question.subject values when the bank has no section names.
 */
export function homeCategoryForBank(
  bank,
  examId,
  subjectNodes = [],
  fallbackCategoryId,
  extraLabels = []
) {
  // All-subjects papers stay on the exam. A cancelled subject must not
  // move the bank onto whichever subject finished.
  if (bankIsAllSubjects(bank)) {
    return String(examId || fallbackCategoryId || "");
  }

  const sections = Array.isArray(bank?.sections) ? bank.sections : [];
  const labels = [];
  for (const section of sections) {
    const questionCount = Array.isArray(section?.questions)
      ? section.questions.length
      : 0;
    const hasQuestions = Number(section?.count) > 0 || questionCount > 0;
    if (!hasQuestions) continue;
    const label = sectionSubjectLabel(section?.name);
    if (label) labels.push(label);
  }

  const matched = matchSubjectNodes(labels, subjectNodes);
  if (matched.length === 1) return String(matched[0]._id);
  if (matched.length > 1) return String(examId || fallbackCategoryId || "");

  const fromTitle = matchSubjectNodes(
    [subjectLabelFromBankTitle(bank)].filter(Boolean),
    subjectNodes
  );
  if (fromTitle.length === 1) return String(fromTitle[0]._id);

  const fromQuestions = matchSubjectNodes(extraLabels, subjectNodes);
  if (fromQuestions.length === 1) return String(fromQuestions[0]._id);
  if (fromQuestions.length > 1) return String(examId || fallbackCategoryId || "");

  const bankCategoryIds = new Set(
    (Array.isArray(bank?.categories) ? bank.categories : []).map((cat) =>
      String(cat?._id || cat)
    )
  );
  const fromBank = subjectNodes.filter((node) =>
    bankCategoryIds.has(String(node._id))
  );
  if (fromBank.length === 1) return String(fromBank[0]._id);
  if (fromBank.length > 1) return String(examId || fallbackCategoryId || "");

  const explicit = subjectNodes.find(
    (node) => String(node._id) === String(fallbackCategoryId)
  );
  if (explicit) return String(explicit._id);
  return String(fallbackCategoryId || examId || "");
}

/** True when the bank name, sections, or category already pick the subject. */
function bankNeedsQuestionSubjects(bank, subjectNodes = []) {
  if (!bank || bankIsAllSubjects(bank)) return false;
  const sections = Array.isArray(bank.sections) ? bank.sections : [];
  const labels = [];
  for (const section of sections) {
    const questionCount = Array.isArray(section?.questions)
      ? section.questions.length
      : 0;
    if (!(Number(section?.count) > 0 || questionCount > 0)) continue;
    const label = sectionSubjectLabel(section?.name);
    if (label) labels.push(label);
  }
  if (matchSubjectNodes(labels, subjectNodes).length > 0) return false;
  if (
    matchSubjectNodes(
      [subjectLabelFromBankTitle(bank)].filter(Boolean),
      subjectNodes
    ).length === 1
  ) {
    return false;
  }
  const bankCategoryIds = new Set(
    (Array.isArray(bank.categories) ? bank.categories : []).map((cat) =>
      String(cat?._id || cat)
    )
  );
  return !subjectNodes.some((node) => bankCategoryIds.has(String(node._id)));
}

async function loadQuestionSubjectsByBank(tests = []) {
  const manualIds = [];
  const aiIds = [];
  for (const test of tests) {
    if (test?.questionBank) manualIds.push(test.questionBank);
    if (test?.aiQuestionBank) aiIds.push(test.aiQuestionBank);
  }
  const [manual, ai] = await Promise.all([
    manualIds.length
      ? Question.aggregate([
          {
            $match: {
              questionBank: { $in: manualIds },
              subject: { $nin: [null, ""] },
            },
          },
          { $group: { _id: "$questionBank", subjects: { $addToSet: "$subject" } } },
        ])
      : [],
    aiIds.length
      ? AiQuestion.aggregate([
          {
            $match: {
              aiQuestionBank: { $in: aiIds },
              subject: { $nin: [null, ""] },
            },
          },
          {
            $group: { _id: "$aiQuestionBank", subjects: { $addToSet: "$subject" } },
          },
        ])
      : [],
  ]);
  const byId = new Map();
  for (const row of [...manual, ...ai]) {
    byId.set(
      String(row._id),
      (row.subjects || []).map((subject) => String(subject || "").trim()).filter(Boolean)
    );
  }
  return byId;
}

async function loadBanksById(tests = []) {
  const manualIds = [];
  const aiIds = [];
  for (const test of tests) {
    if (test?.questionBank) manualIds.push(test.questionBank);
    if (test?.aiQuestionBank) aiIds.push(test.aiQuestionBank);
  }
  const [manualBanks, aiBanks] = await Promise.all([
    manualIds.length
      ? QuestionBank.find({ _id: { $in: manualIds } })
          .select("name sections categories")
          .lean()
      : [],
    aiIds.length
      ? AiQuestionBank.find({ _id: { $in: aiIds } })
          .select("name generationTopic examLabel sections categories")
          .lean()
      : [],
  ]);
  const byId = new Map();
  for (const bank of [...manualBanks, ...aiBanks]) {
    byId.set(String(bank._id), bank);
  }
  return byId;
}

async function attachQuestionCounts(tests = []) {
  const manualIds = [];
  const aiIds = [];
  for (const test of tests) {
    if (!test || test.isSeededPaper || test.totalQuestions) continue;
    if (test.questionBank) manualIds.push(test.questionBank);
    if (test.aiQuestionBank) aiIds.push(test.aiQuestionBank);
  }
  if (!manualIds.length && !aiIds.length) return tests;

  const [manual, ai] = await Promise.all([
    manualIds.length
      ? Question.aggregate([
          { $match: { questionBank: { $in: manualIds } } },
          { $group: { _id: "$questionBank", total: { $sum: 1 } } },
        ])
      : [],
    aiIds.length
      ? AiQuestion.aggregate([
          { $match: { aiQuestionBank: { $in: aiIds } } },
          { $group: { _id: "$aiQuestionBank", total: { $sum: 1 } } },
        ])
      : [],
  ]);
  const counts = new Map();
  for (const row of [...manual, ...ai]) {
    counts.set(String(row._id), row.total || 0);
  }
  return tests.map((test) => {
    if (!test || test.totalQuestions) return test;
    const bankId = String(test.aiQuestionBank || test.questionBank || "");
    return { ...test, totalQuestions: counts.get(bankId) || 0 };
  });
}

export async function alignCompetitiveTestCategory(data = {}) {
  if (!data?.categoryId || (!data.questionBank && !data.aiQuestionBank)) {
    return data;
  }
  const seeded = await resolveSeededExamFromCategory(data.categoryId);
  if (!seeded?.categoryId) return data;
  const subjects = await Category.find({ parent: seeded.categoryId })
    .select("_id name")
    .lean();
  const bank = data.aiQuestionBank
    ? await AiQuestionBank.findById(data.aiQuestionBank)
          .select("name generationTopic examLabel sections categories")
        .lean()
    : await QuestionBank.findById(data.questionBank)
          .select("name sections categories")
        .lean();
  const questionSubjects = bankNeedsQuestionSubjects(bank, subjects)
    ? data.aiQuestionBank
      ? await AiQuestion.distinct("subject", {
          aiQuestionBank: data.aiQuestionBank,
          subject: { $nin: [null, ""] },
        })
      : await Question.distinct("subject", {
          questionBank: data.questionBank,
          subject: { $nin: [null, ""] },
        })
    : [];
  const home = homeCategoryForBank(
    bank,
    seeded.categoryId,
    subjects,
    data.categoryId,
    questionSubjects
  );
  if (home) data.categoryId = home;
  return data;
}

/** Mark subject nodes that actually have a single-subject test. */
export async function annotateCompetitiveSubjectTests(nodes = []) {
  const tests = await Test.find({
    applicableFor: "Competitive",
    categoryId: { $ne: null },
  })
    .select("categoryId questionBank aiQuestionBank")
    .lean();
  if (!tests.length) return;

  const banksById = await loadBanksById(tests);
  const homes = new Set();
  const examCache = new Map();
  const subjectCache = new Map();
  const needsSubjects = [];

  for (const test of tests) {
    const key = String(test.categoryId);
    if (!examCache.has(key)) {
      examCache.set(key, (await resolveSeededExamFromCategory(test.categoryId)) || null);
    }
    const seeded = examCache.get(key);
    if (!seeded?.categoryId) continue;
    const examKey = String(seeded.categoryId);
    if (!subjectCache.has(examKey)) {
      subjectCache.set(
        examKey,
        await Category.find({ parent: seeded.categoryId }).select("_id name").lean()
      );
    }
    const bankId = test.aiQuestionBank || test.questionBank;
    const bank = banksById.get(String(bankId || ""));
    const subjects = subjectCache.get(examKey) || [];
    if (bankNeedsQuestionSubjects(bank, subjects)) {
      needsSubjects.push({ test, seeded, subjects });
      continue;
    }
    const home = homeCategoryForBank(
      bank,
      seeded.categoryId,
      subjects,
      test.categoryId
    );
    if (home) homes.add(home);
  }

  if (needsSubjects.length) {
    const subjectsByBank = await loadQuestionSubjectsByBank(
      needsSubjects.map((row) => row.test)
    );
    for (const row of needsSubjects) {
      const bankId = row.test.aiQuestionBank || row.test.questionBank;
      const home = homeCategoryForBank(
        banksById.get(String(bankId || "")),
        row.seeded.categoryId,
        row.subjects,
        row.test.categoryId,
        subjectsByBank.get(String(bankId || "")) || []
      );
      if (home) homes.add(home);
    }
  }

  const walk = (list) => {
    for (const node of list || []) {
      if (homes.has(String(node._id))) node.hasTests = true;
      if (node.children?.length) walk(node.children);
    }
  };
  walk(nodes);
}

/**
 * Walk the category tree upward from `startId` and return a
 * human-readable path string like "Competitive > Class 1 > Biology".
 */
async function buildCategoryPath(startId) {
  if (!startId) return '';
  const leaf = await Category.findById(startId).select('name parent').lean();
  if (!leaf) return '';

  const visited = new Map();
  visited.set(leaf._id.toString(), leaf);

  let idsToFetch = leaf.parent ? [leaf.parent] : [];
  for (let depth = 0; depth < 10; depth++) {
    if (!idsToFetch.length) break;
    const ancestors = await Category
      .find({ _id: { $in: idsToFetch } })
      .select('name parent')
      .lean();
    idsToFetch = [];
    for (const anc of ancestors) {
      visited.set(anc._id.toString(), anc);
      if (anc.parent && !visited.has(anc.parent.toString())) {
        idsToFetch.push(anc.parent);
      }
    }
  }

  const parts = [];
  let current = leaf;
  while (current) {
    parts.push(current.name);
    const parentId = current.parent ? current.parent.toString() : null;
    current = parentId ? visited.get(parentId) : null;
  }
  parts.reverse();
  return parts.join(' > ');
}

export const createCompetitiveTest = async (data) => {
  // Legacy bypass: Tests now structurally link directly via Test module
  return true;
};

export const getCompetitiveTests = async (options = {}) => {
  const {
    categoryId,
    page = 1,
    limit = 10,
    search,
    isPublished,
    includeSeededPapers = false,
    overview = false,
  } = options;
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  const query = {};
  let scopeHomeToCategory = false;
  let examForScope = null;
  let subjectNodesForScope = [];
  if (categoryId) {
    const seededExam = await resolveSeededExamFromCategory(categoryId);
    const isExamNode =
      seededExam && String(seededExam.categoryId) === String(categoryId);
    const subjectScoped = Boolean(seededExam?.isSubjectSelection);

    if (seededExam && subjectScoped) {
      // Subject click stays on that subject only.
      scopeHomeToCategory = true;
      examForScope = seededExam;
      subjectNodesForScope = await Category.find({ parent: seededExam.categoryId })
        .select("_id name")
        .lean();
      query.categoryId = {
        $in: [
          seededExam.categoryId,
          ...subjectNodesForScope.map((node) => node._id),
        ],
      };
    } else if (seededExam && isExamNode) {
      examForScope = seededExam;
      subjectNodesForScope = await Category.find({ parent: seededExam.categoryId })
        .select("_id name")
        .lean();
      query.categoryId = {
        $in: [
          seededExam.categoryId,
          ...subjectNodesForScope.map((node) => node._id),
        ],
      };
      // Exam overview includes every section. The default exam list stays full papers.
      scopeHomeToCategory = !overview;
    } else {
      const descendantIds = await categoryRepository.findDescendantIds(categoryId);
      const categoryIds = new Set(descendantIds.map(String));
      if (seededExam?.categoryId) {
        categoryIds.add(String(seededExam.categoryId));
      }
      query.categoryId = { $in: [...categoryIds] };
    }
  }
  // When isPublished flag is provided, filter by publish status.
  // Student routes pass isPublished: true so draft tests are never exposed.
  // Admin routes omit this flag so all tests (including drafts) are returned.
  if (isPublished !== undefined) {
    query.isPublished = isPublished;
  }
  if (search) {
    query.title = { $regex: search, $options: 'i' };
  }

  // Build the full ancestor path once (all tests on this page share the same category)
  const categoryPath = await buildCategoryPath(categoryId);

  const [rawTests, manualTotal] = await Promise.all([
    Test.find(query).sort({ createdAt: -1 }).lean(),
    Test.countDocuments(query),
  ]);

  let tests = rawTests.map((t) => ({
    ...t,
    categoryPath,
    sourceType: (t.paperSource === "ai" || Boolean(t.aiQuestionBank)) ? "ai" : "manual",
    isSeededPaper: Boolean(t.jeeMainPaper) || String(t.paperSource || "").endsWith("_db"),
    paperId: t.jeeMainPaper || t.paperId || null,
    testId: {
      _id: t._id,
      title: t.title,
      durationMinutes: t.durationMinutes,
      price: t.price ?? 0,
      originalPrice: t.price ?? 0,
      effectivePrice: t.price ?? 0,
    },
  }));

  if (scopeHomeToCategory && examForScope) {
    const realTests = tests.filter((test) => !test.isSeededPaper);
    const banksById = await loadBanksById(realTests);
    const undecided = realTests.filter((test) => {
      const bankId = test.aiQuestionBank || test.questionBank;
      return bankNeedsQuestionSubjects(
        banksById.get(String(bankId || "")),
        subjectNodesForScope
      );
    });
    const subjectsByBank = undecided.length
      ? await loadQuestionSubjectsByBank(undecided)
      : new Map();
    tests = realTests.filter((test) => {
      const bankId = test.aiQuestionBank || test.questionBank;
      const home = homeCategoryForBank(
        banksById.get(String(bankId || "")),
        examForScope.categoryId,
        subjectNodesForScope,
        test.categoryId,
        subjectsByBank.get(String(bankId || "")) || []
      );
      return home === String(categoryId);
    });
  }

  // Admin competitive pillar: also surface seeded papers that only live in
  // *competitivepapers collections (NEET, CAT, …) and are not yet Test docs.
  if (includeSeededPapers && categoryId) {
    const seeded = await listSeededPapersForCategory(categoryId, {
      categoryPath,
    });
    if (seeded.tests?.length) {
      const seen = new Set(
        tests.map((t) => {
          if (t.jeeMainPaper) return `paper:${t.jeeMainPaper}`;
          if (t.paperId) return `paper:${t.paperId}`;
          return `test:${t._id}`;
        })
      );

      for (const seededTest of seeded.tests) {
        const paperKey = seededTest.paperId
          ? `paper:${seededTest.paperId}`
          : `test:${seededTest._id}`;
        if (seen.has(paperKey)) continue;
        if (seen.has(`test:${seededTest._id}`)) continue;
        if (search) {
          const hay = String(seededTest.title || "").toLowerCase();
          if (!hay.includes(String(search).toLowerCase())) continue;
        }
        if (
          isPublished !== undefined &&
          Boolean(seededTest.isPublished) !== Boolean(isPublished)
        ) {
          continue;
        }
        seen.add(paperKey);
        tests.push(seededTest);
      }
    }
  }

  tests.sort((a, b) => {
    const aTime = new Date(a.createdAt || 0).getTime();
    const bTime = new Date(b.createdAt || 0).getTime();
    return bTime - aTime;
  });

  const total = Math.max(manualTotal, tests.length);
  tests = tests.slice(skip, skip + limitNum);
  tests = await attachQuestionCounts(tests);

  if (tests.length > 0 && categoryId) {
    const category = await Category.findById(categoryId).lean();
    if (category?.isFree) {
      tests = tests.map(t => ({
        ...t,
        originalPrice: t.price || 0,
        discountedPrice: 0,
        effectivePrice: 0,
        discountAmount: t.price || 0,
      }));
    } else {
      // Use pillar-level offer (e.g. "Competitive") when available; "Test" as fallback
      const pillarModuleType = category?.rootType || "Test";
      tests = await attachOfferToList(tests, pillarModuleType, "price");
    }
  } else if (tests.length > 0) {
    tests = await attachOfferToList(tests, "Test", "price");
  }

  return {
    tests,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum) || 1,
    },
  };
};

export const updateCompetitiveTest = async (id, updateData) => {
  // Not used actively since edits hit the main Test Builder API
  return true;
};

export const deleteCompetitiveTest = async (id) => {
  return await Test.findByIdAndDelete(id);
};

export default {
  createCompetitiveTest,
  getCompetitiveTests,
  updateCompetitiveTest,
  deleteCompetitiveTest,
};

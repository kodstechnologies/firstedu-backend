/**
 * Copy seeded competitive papers into questionbanks + questions.
 * Section-wise, with options. Does not change school or other pillars,
 * and does not delete the competitive paper collections.
 *
 * Safe to run again: a paper that already has seedPaperKey is skipped.
 */
import dotenv from "dotenv";
import mongoose from "mongoose";
import Category from "../src/models/Category.js";
import Question from "../src/models/Question.js";
import QuestionBank from "../src/models/QuestionBank.js";
import JeeMainCompetitivePaper from "../src/models/JeeMainCompetitivePaper.js";
import JeeMainCompetitiveQuestion from "../src/models/JeeMainCompetitiveQuestion.js";
import JeeAdvancedCompetitivePaper from "../src/models/JeeAdvancedCompetitivePaper.js";
import JeeAdvancedCompetitiveQuestion from "../src/models/JeeAdvancedCompetitiveQuestion.js";
import NeetCompetitivePaper from "../src/models/NeetCompetitivePaper.js";
import NeetCompetitiveQuestion from "../src/models/NeetCompetitiveQuestion.js";
import ClatCompetitivePaper from "../src/models/ClatCompetitivePaper.js";
import ClatCompetitiveQuestion from "../src/models/ClatCompetitiveQuestion.js";
import IbpsCompetitivePaper from "../src/models/IbpsCompetitivePaper.js";
import IbpsCompetitiveQuestion from "../src/models/IbpsCompetitiveQuestion.js";
import GmatCompetitivePaper from "../src/models/GmatCompetitivePaper.js";
import GmatCompetitiveQuestion from "../src/models/GmatCompetitiveQuestion.js";
import CatCompetitivePaper, {
  CatCompetitiveQuestion,
} from "../src/models/CatCompetitivePaper.js";
import SscCglTier1CompetitivePaper, {
  SscCglTier1CompetitiveQuestion,
} from "../src/models/SscCglTier1CompetitivePaper.js";
import SscCglTier2CompetitivePaper, {
  SscCglTier2CompetitiveQuestion,
} from "../src/models/SscCglTier2CompetitivePaper.js";
import UpscCompetitivePaper, {
  UpscCompetitiveQuestion,
} from "../src/models/UpscCompetitivePaper.js";

dotenv.config();

const EXAMS = [
  {
    label: "JEE Main",
    Paper: JeeMainCompetitivePaper,
    Question: JeeMainCompetitiveQuestion,
    categoryName: "JEE Mains",
    parentName: "Engineering",
    subjects: ["Mathematics", "Physics", "Chemistry"],
  },
  {
    label: "JEE Advanced",
    Paper: JeeAdvancedCompetitivePaper,
    Question: JeeAdvancedCompetitiveQuestion,
    categoryName: "JEE FULL PAPER",
    parentName: "Engineering",
    subjects: ["Mathematics", "Physics", "Chemistry"],
  },
  {
    label: "NEET",
    Paper: NeetCompetitivePaper,
    Question: NeetCompetitiveQuestion,
    categoryName: "NEET UG",
    parentName: "Competitive",
    subjects: ["Physics", "Chemistry", "Botany", "Zoology"],
  },
  {
    label: "CLAT",
    Paper: ClatCompetitivePaper,
    Question: ClatCompetitiveQuestion,
    categoryName: "CLAT",
    parentName: "LAW",
    subjects: [
      "English Language",
      "Current Affairs including General Knowledge",
      "Legal Reasoning",
      "Logical Reasoning",
      "Quantitative Techniques",
    ],
  },
  {
    label: "IBPS",
    Paper: IbpsCompetitivePaper,
    Question: IbpsCompetitiveQuestion,
    categoryName: "IBPS PO Prelims",
    parentName: "Banking",
    subjects: ["English Language", "Quantitative Aptitude", "Reasoning Ability"],
  },
  {
    label: "GMAT",
    Paper: GmatCompetitivePaper,
    Question: GmatCompetitiveQuestion,
    categoryName: "GMAT",
    parentName: "MBA",
    subjects: ["Quantitative Reasoning", "Verbal Reasoning", "Data Insights"],
  },
  {
    label: "CAT",
    Paper: CatCompetitivePaper,
    Question: CatCompetitiveQuestion,
    categoryName: "CAT",
    parentName: "MBA",
    subjects: [
      "Verbal Ability and Reading Comprehension",
      "Data Interpretation and Logical Reasoning",
      "Quantitative Ability",
    ],
  },
  {
    label: "SSC CGL Tier 1",
    Paper: SscCglTier1CompetitivePaper,
    Question: SscCglTier1CompetitiveQuestion,
    categoryName: "SSC CGL Tier 1",
    parentName: "Government",
    subjects: [
      "General Intelligence and Reasoning",
      "General Awareness",
      "Quantitative Aptitude",
      "English Comprehension",
    ],
  },
  {
    label: "SSC CGL Tier 2",
    Paper: SscCglTier2CompetitivePaper,
    Question: SscCglTier2CompetitiveQuestion,
    categoryName: "SSC CGL Tier 2",
    parentName: "Government",
    subjects: [
      "Mathematical Abilities",
      "Reasoning and General Intelligence",
      "English Language and Comprehension",
      "General Awareness",
      "Computer Knowledge",
    ],
  },
  {
    label: "UPSC",
    Paper: UpscCompetitivePaper,
    Question: UpscCompetitiveQuestion,
    categoryName: "UPSC CSE Prelims",
    parentName: "Government",
    subjects: [
      "History",
      "Indian Polity and Governance",
      "Geography",
      "Economic and Social Development",
      "Environment and Ecology",
      "General Science",
      "Current Affairs",
    ],
  },
];

const sectionNameOf = question => {
  const subject = String(question.subject || "General").trim() || "General";
  const section = String(question.section || "").trim();
  return section ? `${subject} · Section ${section}` : subject;
};

const subjectRank = (name, subjects) => {
  const subject = name.split(" · Section ")[0];
  const index = subjects.findIndex(
    item => item.toLowerCase() === subject.toLowerCase()
  );
  return index === -1 ? 99 : index;
};

const mapOptions = options =>
  (Array.isArray(options) ? options : [])
    .map(option => {
      const text = String(option?.text || option?.key || "").trim();
      if (!text) return null;
      return { text, isCorrect: Boolean(option?.isCorrect) };
    })
    .filter(Boolean);

const findCategory = async (name, parentName) => {
  const matches = await Category.find({
    name,
    rootType: "Competitive",
  }).lean();
  for (const category of matches) {
    const parent = category.parent
      ? await Category.findById(category.parent).select("name").lean()
      : null;
    if (parent?.name === parentName) return category;
  }
  throw new Error(`Competitive category not found: ${parentName} > ${name}`);
};

const importPaper = async (exam, paper, createdBy, categoryId) => {
  const existing = await QuestionBank.findOne({ seedPaperKey: paper.paperKey })
    .select("_id")
    .lean();
  if (existing) {
    return { status: "skipped", paperKey: paper.paperKey };
  }

  const sourceQuestions = await exam.Question.find({
    paper: paper._id,
    isActive: { $ne: false },
  })
    .sort({ orderInPaper: 1 })
    .lean();

  const grouped = new Map();
  for (const question of sourceQuestions) {
    const name = sectionNameOf(question);
    if (!grouped.has(name)) grouped.set(name, []);
    grouped.get(name).push(question);
  }

  const sectionNames = [...grouped.keys()].sort((left, right) => {
    const rank = subjectRank(left, exam.subjects) - subjectRank(right, exam.subjects);
    if (rank !== 0) return rank;
    return left.localeCompare(right);
  });

  const sections = sectionNames.map((name, index) => ({
    id: index + 1,
    name,
    count: grouped.get(name).length,
    difficulty: "medium",
    timeMinutes: 0,
    questions: [],
  }));

  const bank = await QuestionBank.create({
    name: paper.title,
    categories: [categoryId],
    useSectionWiseDifficulty: false,
    useSectionWiseQuestions: true,
    overallDifficulty: "medium",
    sections,
    seedPaperKey: paper.paperKey,
    createdBy,
  });

  const docs = [];
  let orderInBank = 0;
  sectionNames.forEach((name, sectionIndex) => {
    const rows = grouped.get(name);
    for (const question of rows) {
      const options = mapOptions(question.options);
      const explanation = String(question.explanation || "").trim();
      docs.push({
        questionText: question.questionText,
        questionType: question.questionType || "single",
        options,
        correctAnswer: question.correctAnswer,
        explanation: explanation || "Solution is stored with this question.",
        subject: name,
        topic: question.topic || undefined,
        difficulty: question.difficulty || "medium",
        marks: question.marks ?? 1,
        negativeMarks: question.negativeMarks ?? 0,
        passage: String(question.passage || "").trim() || undefined,
        tags: ["competitive-seed", paper.paperKey],
        questionBank: bank._id,
        sectionIndex,
        orderInBank,
        createdBy,
        isActive: true,
      });
      orderInBank += 1;
    }
  });

  const created = docs.length ? await Question.insertMany(docs) : [];
  const idsBySection = sections.map(() => []);
  created.forEach(question => {
    idsBySection[question.sectionIndex]?.push(question._id);
  });
  bank.sections = sections.map((section, index) => ({
    ...section,
    questions: idsBySection[index],
  }));
  await bank.save();

  return {
    status: "imported",
    paperKey: paper.paperKey,
    questions: created.length,
    sections: sections.length,
  };
};

const uri = process.env.MONGODB_URI;
const dbName = process.env.DB_NAME || "FirstEdu";
await mongoose.connect(uri, { dbName });

const admin = await mongoose.connection.db.collection("admins").findOne({
  email: "admin@testladr.com",
});
if (!admin) {
  throw new Error("admin@testladr.com was not found");
}

for (const exam of EXAMS) {
  const category = await findCategory(exam.categoryName, exam.parentName);
  const papers = await exam.Paper.find({ isActive: { $ne: false } }).sort({
    sortOrder: 1,
    createdAt: 1,
  });
  let imported = 0;
  let skipped = 0;
  let questions = 0;
  for (const paper of papers) {
    const result = await importPaper(exam, paper, admin._id, category._id);
    if (result.status === "skipped") skipped += 1;
    else {
      imported += 1;
      questions += result.questions;
    }
  }
  console.log(
    `${exam.label}: imported ${imported}, skipped ${skipped}, questions ${questions}, category ${exam.parentName} > ${exam.categoryName}`
  );
}

await mongoose.disconnect();

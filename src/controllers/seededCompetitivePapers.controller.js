import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import {
  listAllSeededPaperSummaries,
  listSeededPapersForCategory,
  listSeededPapersForExam,
  resolveSeededExamFromCategory,
} from "../services/seededCompetitivePapers.service.js";

export const listSeededCompetitivePapersAdmin = asyncHandler(async (req, res) => {
  const { categoryId, examKey } = req.query;

  if (categoryId) {
    const result = await listSeededPapersForCategory(categoryId);
    return res.status(200).json(
      ApiResponse.success(
        {
          exam: result.exam,
          papers: result.tests,
        },
        "Seeded competitive papers fetched successfully"
      )
    );
  }

  if (examKey) {
    const papers = await listSeededPapersForExam(String(examKey));
    return res
      .status(200)
      .json(
        ApiResponse.success(papers, "Seeded competitive papers fetched successfully")
      );
  }

  const summaries = await listAllSeededPaperSummaries();
  return res.status(200).json(
    ApiResponse.success(summaries, "Seeded competitive papers summary fetched")
  );
});

export const resolveSeededExamAdmin = asyncHandler(async (req, res) => {
  const { categoryId } = req.query;
  if (!categoryId) throw new ApiError(400, "categoryId is required");
  const exam = await resolveSeededExamFromCategory(categoryId);
  return res.status(200).json(
    ApiResponse.success(
      exam
        ? {
            examKey: exam.examKey,
            label: exam.label,
            categoryId: exam.categoryId,
            categoryName: exam.categoryName,
          }
        : null,
      exam ? "Seeded exam resolved" : "No seeded exam for this category"
    )
  );
});

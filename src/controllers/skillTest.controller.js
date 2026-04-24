import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import skillTestService from "../services/skillTest.service.js";
import skillTestValidator from "../validation/skillTest.validator.js";
import ExamSession from "../models/ExamSession.js";
import TestPurchase from "../models/TestPurchase.js";
import { resolveAccessStatus } from "../utils/categoryAccessUtils.js";

export const createSkillTest = asyncHandler(async (req, res) => {
  const { error, value } = skillTestValidator.createSkillTest.validate(req.body);
  if (error) throw new ApiError(400, "Validation Error", error.details.map(x => x.message));

  const created = await skillTestService.createSkillTest(value);
  return res.status(201).json(ApiResponse.success(created, "Skill test added successfully"));
});

export const getSkillTests = asyncHandler(async (req, res) => {
  const { categoryId, page, limit } = req.query;
  const result = await skillTestService.getSkillTests({ categoryId, page, limit });
  return res.status(200).json(ApiResponse.success(result.tests, "Skill tests fetched successfully", result.pagination));
});

export const updateSkillTest = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { error, value } = skillTestValidator.updateSkillTest.validate(req.body);
  if (error) throw new ApiError(400, "Validation Error", error.details.map(x => x.message));

  const updated = await skillTestService.updateSkillTest(id, value);
  return res.status(200).json(ApiResponse.success(updated, "Skill test updated successfully"));
});

export const deleteSkillTest = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await skillTestService.deleteSkillTest(id);
  return res.status(200).json(ApiResponse.success(null, "Skill test deleted successfully"));
});

export const getSkillTestsForStudent = asyncHandler(async (req, res) => {
  const { categoryId, page, limit } = req.query;
  if (!categoryId) throw new ApiError(400, "categoryId is required");

  // Resolve full post-purchase access status (new content detection + price diff)
  const accessStatus = await resolveAccessStatus(req.user._id, categoryId);

  const result = await skillTestService.getSkillTests({ categoryId, page, limit, isPublished: true });

  // Attach testStatus and testSessionId so the frontend can show Result / Retake buttons
  const testIds = result.tests.map(t => t._id);
  const examSessions = await ExamSession.find({
    student: req.user._id,
    test: { $in: testIds },
  }).sort({ createdAt: -1 }).lean();

  const sessionMap = {};
  for (const session of examSessions) {
    if (!sessionMap[session.test]) sessionMap[session.test] = session;
  }

  // Find individual test purchases
  const testPurchases = await TestPurchase.find({
    student: req.user._id,
    test: { $in: testIds },
    paymentStatus: "completed"
  }).lean();
  const purchasedTestIds = new Set(testPurchases.map(p => p.test.toString()));

  const testsWithStatus = result.tests.map(test => {
    const session = sessionMap[test._id];

    let isNewLocked = false;
    if (accessStatus.hasAccess && accessStatus.purchaseDate) {
      if (new Date(test.createdAt) > new Date(accessStatus.purchaseDate)) {
        if (!purchasedTestIds.has(test._id.toString())) {
          isNewLocked = true;
        }
      }
    }

    return {
      ...test,
      testStatus: session ? session.status : null,
      testSessionId: session ? session._id : null,
      isNewLocked,
      isPurchased: purchasedTestIds.has(test._id.toString())
    };
  });

  return res.status(200).json(
    ApiResponse.success(
      testsWithStatus,
      "Skill tests fetched successfully",
      {
        ...result.pagination,
        hasAccess:     accessStatus.hasAccess,
        upgradable:    accessStatus.upgradable,
        upgradeCost:   accessStatus.upgradeCost,
        isFreeUpgrade: accessStatus.isFreeUpgrade,
        hasNewContent: accessStatus.upgradable,
      }
    )
  );
});

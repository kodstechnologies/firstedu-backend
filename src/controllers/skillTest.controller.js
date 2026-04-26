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

  // The original date the student purchased this category (never changes, even after upgrades)
  const originalBuyDate = accessStatus.purchase?.createdAt;
  const THIRTY_DAYS_AGO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const testsWithStatus = result.tests.map(test => {
    const session = sessionMap[test._id];

    // Core rules for NEW badge
    const isAddedAfterPurchase = originalBuyDate
      ? new Date(test.createdAt) > new Date(originalBuyDate)
      : false;
    const isUnder30Days = new Date(test.createdAt) > THIRTY_DAYS_AGO;
    const isUnattempted = !session; // No exam session exists

    // isNew: test was added AFTER the student's original purchase AND (is under 30 days old OR never attempted).
    const isNew = isAddedAfterPurchase && (isUnder30Days || isUnattempted);

    // isNewLocked: test added after latest upgrade checkpoint AND not individually purchased.
    // Controls whether the test is locked (access gate).
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
      isNew,
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
        // Only expose a cost when there is actually something to upgrade.
        upgradeCost:   accessStatus.upgradable ? accessStatus.upgradeCost : 0,
        isFreeUpgrade: accessStatus.upgradable ? accessStatus.isFreeUpgrade : false,
        hasNewContent: accessStatus.upgradable,
      }
    )
  );
});

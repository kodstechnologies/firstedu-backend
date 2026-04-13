import walletService from "./wallet.service.js";

// Points configuration
const POINTS_CONFIG = {
  COURSE_PURCHASE: 50, // Points for purchasing a course
  TEST_COMPLETION: 50, // Points for completing a test
  CATEGORY_PURCHASE: 50, // Points for purchasing a category
};

/**
 * Award points for course purchase
 */
export const awardCoursePurchasePoints = async (
  studentId,
  courseId,
  courseTitle,
) => {
  return await walletService.addRewardPoints(
    studentId,
    POINTS_CONFIG.COURSE_PURCHASE,
    "course_purchase",
    `Points earned for purchasing course: ${courseTitle}`,
    courseId,
    "Course",
  );
};

/**
 * Award points for test completion
 */
export const awardTestCompletionPoints = async (
  studentId,
  testId,
  testTitle,
) => {
  return await walletService.addRewardPoints(
    studentId,
    POINTS_CONFIG.TEST_COMPLETION,
    "test_completion",
    `Points earned for completing test: ${testTitle}`,
    testId,
    "Test",
  );
};

/**
 * Award points for challenge-yourself completion.
 * Rule: 500% of test price (5x price).
 */
export const awardChallengeYourselfCompletionPoints = async (
  studentId,
  testId,
  testTitle,
  testPrice,
) => {
  const points = Math.round(Math.max(0, Number(testPrice) || 0) * 5);
  if (points <= 0) {
    return null;
  }

  return await walletService.addRewardPoints(
    studentId,
    points,
    "challenge_yourself_completion",
    `Points earned for completing challenge-yourself test: ${testTitle}`,
    testId,
    "Test",
  );
};

/**
 * Award points for category purchase
 */
export const awardCategoryPurchasePoints = async (
  studentId,
  categoryId,
  categoryTitle,
) => {
  return await walletService.addRewardPoints(
    studentId,
    POINTS_CONFIG.CATEGORY_PURCHASE,
    "category_purchase",
    `Points earned for purchasing category: ${categoryTitle}`,
    categoryId,
    "Category",
  );
};

export default {
  awardCoursePurchasePoints,
  awardTestCompletionPoints,
  awardChallengeYourselfCompletionPoints,
  awardCategoryPurchasePoints,
  POINTS_CONFIG,
};

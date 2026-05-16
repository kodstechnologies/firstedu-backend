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
  customPoints = null
) => {
  const points = customPoints != null ? Number(customPoints) : POINTS_CONFIG.TEST_COMPLETION;
  if (points <= 0) return null;

  return await walletService.addRewardPoints(
    studentId,
    points,
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
  // USER REQUIREMENT: Remove the 500% points logic. 
  // Points are now awarded only upon purchase (handled in marketplace service).
  return null;
};

/**
 * Award points for test purchase
 */
export const awardTestPurchasePoints = async (
  studentId,
  testId,
  testTitle,
  customPoints = null
) => {
  const points = customPoints != null ? Number(customPoints) : 0; // Default to 0 for purchase unless specified
  if (points <= 0) return null;

  return await walletService.addRewardPoints(
    studentId,
    points,
    "test_purchase",
    `Points earned for purchasing test: ${testTitle}`,
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
  awardTestPurchasePoints,
  awardChallengeYourselfCompletionPoints,
  awardCategoryPurchasePoints,
  POINTS_CONFIG,
};

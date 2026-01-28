import walletService from "./wallet.service.js";

// Points configuration
const POINTS_CONFIG = {
  COURSE_PURCHASE: 50, // Points for purchasing a course
  TEST_COMPLETION: 50, // Points for completing a test
};

/**
 * Award points for course purchase
 */
export const awardCoursePurchasePoints = async (studentId, courseId, courseTitle) => {
  return await walletService.addRewardPoints(
    studentId,
    POINTS_CONFIG.COURSE_PURCHASE,
    "course_purchase",
    `Points earned for purchasing course: ${courseTitle}`,
    courseId,
    "Course"
  );
};

/**
 * Award points for test completion
 */
export const awardTestCompletionPoints = async (studentId, testId, testTitle) => {
  return await walletService.addRewardPoints(
    studentId,
    POINTS_CONFIG.TEST_COMPLETION,
    "test_completion",
    `Points earned for completing test: ${testTitle}`,
    testId,
    "Test"
  );
};

export default {
  awardCoursePurchasePoints,
  awardTestCompletionPoints,
  POINTS_CONFIG,
};


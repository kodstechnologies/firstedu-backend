import { ApiError } from "../utils/ApiError.js";
import courseRepository from "../repository/course.repository.js";
import testRepository from "../repository/test.repository.js";
import courseTestLinkRepository from "../repository/courseTestLink.repository.js";
import orderRepository from "../repository/order.repository.js";
import razorpayOrderIntentRepository from "../repository/razorpayOrderIntent.repository.js";
import pointsService from "./points.service.js";
import {
  createRazorpayOrder,
  verifyPaymentSignature,
} from "../utils/razorpayUtils.js";

/**
 * Get all published courses (marketplace listing)
 */
export const getCourses = async (options = {}) => {
  const {
    page = 1,
    limit = 10,
    search,
    category,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = options;

  const query = { isPublished: true };
  if (category) query.category = category;
  if (search) {
    const regex = { $regex: search, $options: "i" };
    query.$or = [{ title: regex }, { description: regex }];
  }

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);

  const result = await courseRepository.findAll(query, {
    page: pageNum,
    limit: limitNum,
    sortBy,
    sortOrder,
    search,
    category,
  });

  const courses = result.courses.map((course) => {
    const courseObj = course.toObject();
    delete courseObj.contentUrl;
    return courseObj;
  });
  const total = result.pagination.total;

  return {
    courses,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum) || 1,
    },
  };
};

/**
 * Get course by ID with purchase status for student
 */
export const getCourseById = async (courseId, studentId) => {
  const course = await courseRepository.findById(courseId, {
    category: "name slug",
  });

  if (!course) throw new ApiError(404, "Course not found");
  if (!course.isPublished) throw new ApiError(404, "Course not found");

  const purchase = await orderRepository.findCoursePurchase({
    student: studentId,
    course: courseId,
    paymentStatus: "completed",
  });

  const courseData = course.toObject();
  courseData.isPurchased = !!purchase;
  if (!courseData.isPurchased) delete courseData.contentUrl;

  return courseData;
};

/**
 * Create Razorpay order for course checkout
 */
export const createCourseOrder = async (courseId, studentId) => {
  const course = await courseRepository.findById(courseId);

  if (!course || !course.isPublished) {
    throw new ApiError(404, "Course not found");
  }

  const existingPurchase = await orderRepository.findCoursePurchase({
    student: studentId,
    course: courseId,
    paymentStatus: "completed",
  });
  if (existingPurchase) {
    throw new ApiError(400, "Course already purchased");
  }

  const price = Number(course.price);
  if (!price || price < 1) {
    throw new ApiError(400, "Course price is invalid or free");
  }

  const receipt = `course_${courseId}_${studentId}_${Date.now()}`.substring(0, 40);
  const order = await createRazorpayOrder(price, receipt);

  await razorpayOrderIntentRepository.create({
    orderId: order.orderId,
    studentId,
    type: "course",
    entityId: courseId,
    entityModel: "Course",
    amountPaise: order.amount,
    currency: order.currency || "INR",
    receipt,
  });

  const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
  if (!razorpayKeyId) {
    throw new ApiError(500, "Payment gateway not configured");
  }

  return {
    orderId: order.orderId,
    amount: order.amount,
    currency: order.currency,
    key: razorpayKeyId,
    courseId,
    courseTitle: course.title,
  };
};

/**
 * Purchase course (verify Razorpay payment and complete purchase)
 */
export const purchaseCourse = async (
  courseId,
  studentId,
  { razorpayOrderId, razorpayPaymentId, razorpaySignature }
) => {
  const course = await courseRepository.findById(courseId);

  if (!course || !course.isPublished) {
    throw new ApiError(404, "Course not found");
  }

  const existingPurchase = await orderRepository.findCoursePurchase({
    student: studentId,
    course: courseId,
    paymentStatus: "completed",
  });
  if (existingPurchase) {
    throw new ApiError(400, "Course already purchased");
  }

  const isValid = verifyPaymentSignature(
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature
  );
  if (!isValid) {
    throw new ApiError(400, "Payment verification failed");
  }

  const purchaseData = await orderRepository.createCoursePurchase({
    student: studentId,
    course: courseId,
    purchasePrice: course.price,
    paymentId: razorpayPaymentId,
    paymentStatus: "completed",
  });

  try {
    await pointsService.awardCoursePurchasePoints(
      studentId,
      courseId,
      course.title || "Course"
    );
  } catch (error) {
    console.error("Error awarding points for course purchase:", error);
  }

  return purchaseData;
};

/**
 * Get student's purchased courses (paginated)
 */
export const getMyCourses = async (studentId, page = 1, limit = 10) => {
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  const purchases = await orderRepository.findCoursePurchases(studentId);
  const total = purchases.length;
  const paginatedPurchases = purchases.slice(skip, skip + limitNum);

  return {
    purchases: paginatedPurchases,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum) || 1,
    },
  };
};

/**
 * Get follow-up tests for a course (requires purchase)
 */
export const getCourseFollowUpTests = async (courseId, studentId) => {
  const purchase = await orderRepository.findCoursePurchase({
    student: studentId,
    course: courseId,
    paymentStatus: "completed",
  });

  if (!purchase) {
    throw new ApiError(
      403,
      "You must purchase this course to access follow-up tests"
    );
  }

  return await courseTestLinkRepository.findAll(
    { course: courseId },
    { sortBy: "order", sortOrder: "asc" }
  );
};

/**
 * Get all published tests (marketplace listing)
 */
export const getTests = async (options = {}) => {
  const {
    page = 1,
    limit = 10,
    search,
    category,
    testType,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = options;

  const query = { isPublished: true };
  if (category) query.category = category;
  if (testType) query.testType = testType;
  if (search) {
    const regex = { $regex: search, $options: "i" };
    query.$or = [{ title: regex }, { description: regex }];
  }

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);

  const result = await testRepository.findAllTests(query, {
    page: pageNum,
    limit: limitNum,
    sortBy,
    sortOrder,
    search,
    category,
    testType,
    isPublished: true,
  });

  const tests = result.tests.map((test) => {
    const testObj = test.toObject();
    delete testObj.questions;
    delete testObj.randomConfig;
    return testObj;
  });
  const total = result.pagination.total;

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

/**
 * Create Razorpay order for test checkout
 */
export const createTestOrder = async (testId, studentId) => {
  const test = await testRepository.findTestById(testId);

  if (!test || !test.isPublished) {
    throw new ApiError(404, "Test not found");
  }

  const existingPurchase = await orderRepository.findTestPurchase({
    student: studentId,
    test: testId,
    paymentStatus: "completed",
  });
  if (existingPurchase) {
    throw new ApiError(400, "Test already purchased");
  }

  const price = Number(test.price);
  if (!price || price < 1) {
    throw new ApiError(400, "Test price is invalid or free");
  }

  const receipt = `test_${testId}_${studentId}_${Date.now()}`.substring(0, 40);
  const order = await createRazorpayOrder(price, receipt);

  await razorpayOrderIntentRepository.create({
    orderId: order.orderId,
    studentId,
    type: "test",
    entityId: testId,
    entityModel: "Test",
    amountPaise: order.amount,
    currency: order.currency || "INR",
    receipt,
  });

  const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
  if (!razorpayKeyId) {
    throw new ApiError(500, "Payment gateway not configured");
  }

  return {
    orderId: order.orderId,
    amount: order.amount,
    currency: order.currency,
    key: razorpayKeyId,
    testId,
    testTitle: test.title,
  };
};

/**
 * Get test by ID with purchase status for student
 */
export const getTestById = async (testId, studentId) => {
  const test = await testRepository.findTestById(testId, {
    category: "name slug",
    questions: "questionText questionType options marks subject topic difficulty",
  });

  if (!test) throw new ApiError(404, "Test not found");
  if (!test.isPublished) throw new ApiError(404, "Test not found");

  const purchase = await orderRepository.findTestPurchase({
    student: studentId,
    test: testId,
    paymentStatus: "completed",
  });

  const testData = test.toObject();
  testData.isPurchased = !!purchase;
  return testData;
};

/**
 * Purchase test (verify Razorpay payment and complete purchase)
 */
export const purchaseTest = async (
  testId,
  studentId,
  { razorpayOrderId, razorpayPaymentId, razorpaySignature }
) => {
  const test = await testRepository.findTestById(testId);

  if (!test || !test.isPublished) {
    throw new ApiError(404, "Test not found");
  }

  const existingPurchase = await orderRepository.findTestPurchase({
    student: studentId,
    test: testId,
    paymentStatus: "completed",
  });
  if (existingPurchase) {
    throw new ApiError(400, "Test already purchased");
  }

  const isValid = verifyPaymentSignature(
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature
  );
  if (!isValid) {
    throw new ApiError(400, "Payment verification failed");
  }

  return await orderRepository.createTestPurchase({
    student: studentId,
    test: testId,
    purchasePrice: test.price,
    paymentId: razorpayPaymentId,
    paymentStatus: "completed",
  });
};

/**
 * Get all published test bundles (marketplace listing)
 */
export const getTestBundles = async (options = {}) => {
  const {
    page = 1,
    limit = 10,
    search,
    category,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = options;

  const query = { isActive: true };
  if (category) query.category = category;
  if (search) {
    const regex = { $regex: search, $options: "i" };
    query.$or = [{ name: regex }, { description: regex }];
  }

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);

  const result = await testRepository.findAllBundles(query, {
    page: pageNum,
    limit: limitNum,
    sortBy,
    sortOrder,
    search,
    category,
    isActive: true,
  });

  return {
    bundles: result.bundles,
    pagination: result.pagination,
  };
};

/**
 * Create Razorpay order for test bundle checkout
 */
export const createTestBundleOrder = async (bundleId, studentId) => {
  const bundle = await testRepository.findBundleById(bundleId, {
    category: "name slug",
    tests: "title durationMinutes totalMarks testType",
  });

  if (!bundle || !bundle.isActive) {
    throw new ApiError(404, "Test bundle not found");
  }

  const existingPurchase = await orderRepository.findTestPurchase({
    student: studentId,
    testBundle: bundleId,
    paymentStatus: "completed",
  });
  if (existingPurchase) {
    throw new ApiError(400, "Test bundle already purchased");
  }

  const price = Number(bundle.price);
  if (!price || price < 1) {
    throw new ApiError(400, "Test bundle price is invalid or free");
  }

  const receipt = `bundle_${bundleId}_${studentId}_${Date.now()}`.substring(0, 40);
  const order = await createRazorpayOrder(price, receipt);

  await razorpayOrderIntentRepository.create({
    orderId: order.orderId,
    studentId,
    type: "bundle",
    entityId: bundleId,
    entityModel: "TestBundle",
    amountPaise: order.amount,
    currency: order.currency || "INR",
    receipt,
  });

  const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
  if (!razorpayKeyId) {
    throw new ApiError(500, "Payment gateway not configured");
  }

  return {
    orderId: order.orderId,
    amount: order.amount,
    currency: order.currency,
    key: razorpayKeyId,
    bundleId,
    bundleName: bundle.name,
  };
};

/**
 * Purchase test bundle (verify Razorpay payment and complete purchase)
 */
export const purchaseTestBundle = async (
  bundleId,
  studentId,
  { razorpayOrderId, razorpayPaymentId, razorpaySignature }
) => {
  const bundle = await testRepository.findBundleById(bundleId, {
    category: "name slug",
    tests: "title durationMinutes totalMarks testType",
  });

  if (!bundle || !bundle.isActive) {
    throw new ApiError(404, "Test bundle not found");
  }

  const existingPurchase = await orderRepository.findTestPurchase({
    student: studentId,
    testBundle: bundleId,
    paymentStatus: "completed",
  });
  if (existingPurchase) {
    throw new ApiError(400, "Test bundle already purchased");
  }

  const isValid = verifyPaymentSignature(
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature
  );
  if (!isValid) {
    throw new ApiError(400, "Payment verification failed");
  }

  return await orderRepository.createTestPurchase({
    student: studentId,
    testBundle: bundleId,
    purchasePrice: bundle.price,
    paymentId: razorpayPaymentId,
    paymentStatus: "completed",
  });
};

/**
 * Get student's purchased tests (paginated)
 */
export const getMyTests = async (studentId, page = 1, limit = 10) => {
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  const purchases = await orderRepository.findTestPurchases(studentId);
  const total = purchases.length;
  const paginatedPurchases = purchases.slice(skip, skip + limitNum);

  return {
    purchases: paginatedPurchases,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum) || 1,
    },
  };
};

export default {
  getCourses,
  getCourseById,
  createCourseOrder,
  purchaseCourse,
  getMyCourses,
  getCourseFollowUpTests,
  getTests,
  getTestById,
  createTestOrder,
  purchaseTest,
  getTestBundles,
  createTestBundleOrder,
  purchaseTestBundle,
  getMyTests,
};

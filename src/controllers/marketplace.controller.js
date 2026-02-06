
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import courseRepository from "../repository/course.repository.js";
import testRepository from "../repository/test.repository.js";
import courseTestLinkRepository from "../repository/courseTestLink.repository.js";
import orderRepository from "../repository/order.repository.js";
import marketplaceValidator from "../validation/marketplace.validator.js";
import pointsService from "../services/points.service.js";

// Get All Published Courses (Marketplace)
export const getCourses = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    search,
    category,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = req.query;

  const query = { isPublished: true };

  if (category) {
    query.category = category;
  }

  if (search) {
    const regex = { $regex: search, $options: "i" };
    query.$or = [{ title: regex }, { description: regex }];
  }

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;
  const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

  const result = await courseRepository.findAll(query, {
    page: pageNum,
    limit: limitNum,
    sortBy,
    sortOrder,
    search,
    category,
  });
  
  const courses = result.courses.map(course => {
    const courseObj = course.toObject();
    delete courseObj.contentUrl;
    return courseObj;
  });
  const total = result.pagination.total;

  return res.status(200).json(
    ApiResponse.success(
      courses,
      "Courses fetched successfully",
      {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      }
    )
  );
});

// Get Course Details (with purchase status)
export const getCourseById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const studentId = req.user._id;

  const course = await courseRepository.findById(id, { category: "name slug" });

  if (!course) {
    throw new ApiError(404, "Course not found");
  }

  if (!course.isPublished) {
    throw new ApiError(404, "Course not found");
  }

  // Check if student has purchased this course
  const purchase = await orderRepository.findCoursePurchase({
    student: studentId,
    course: id,
    paymentStatus: "completed",
  });

  const courseData = course.toObject();
  courseData.isPurchased = !!purchase;
  if (!courseData.isPurchased) {
    // Hide content URL if not purchased
    delete courseData.contentUrl;
  }

  return res
    .status(200)
    .json(ApiResponse.success(courseData, "Course fetched successfully"));
});

// Purchase Course
export const purchaseCourse = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const studentId = req.user._id;
  const { error, value } = marketplaceValidator.purchaseCourse.validate(req.body);

  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }

  const { paymentId } = value;

  const course = await courseRepository.findById(id);

  if (!course || !course.isPublished) {
    throw new ApiError(404, "Course not found");
  }

  // Check if already purchased
  const existingPurchase = await orderRepository.findCoursePurchase({
    student: studentId,
    course: id,
    paymentStatus: "completed",
  });

  if (existingPurchase) {
    throw new ApiError(400, "Course already purchased");
  }

  const purchaseData = await orderRepository.createCoursePurchase({
    student: studentId,
    course: id,
    purchasePrice: course.price,
    paymentId: paymentId || `PAY_${Date.now()}`,
    paymentStatus: "completed",
  });

  // Award points for course purchase
  try {
    await pointsService.awardCoursePurchasePoints(
      studentId,
      id,
      course.title || "Course"
    );
  } catch (error) {
    console.error("Error awarding points for course purchase:", error);
    // Don't fail purchase if points awarding fails
  }

  return res
    .status(201)
    .json(
      ApiResponse.success(
        purchaseData,
        "Course purchased successfully"
      )
    );
});

// Get Student's Purchased Courses
export const getMyCourses = asyncHandler(async (req, res) => {
  const studentId = req.user._id;
  const { page = 1, limit = 10 } = req.query;

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  const purchases = await orderRepository.findCoursePurchases(studentId);
  const total = purchases.length;
  const paginatedPurchases = purchases.slice(skip, skip + limitNum);

  return res.status(200).json(
    ApiResponse.success(
      paginatedPurchases,
      "Purchased courses fetched successfully",
      {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      }
    )
  );
});

// Get Follow-up Tests for a Course
export const getCourseFollowUpTests = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const studentId = req.user._id;

  // Check if student has purchased the course
  const purchase = await orderRepository.findCoursePurchase({
    student: studentId,
    course: id,
    paymentStatus: "completed",
  });

  if (!purchase) {
    throw new ApiError(403, "You must purchase this course to access follow-up tests");
  }

  const links = await courseTestLinkRepository.findAll(
    { course: id },
    { sortBy: "order", sortOrder: "asc" }
  );

  return res
    .status(200)
    .json(
      ApiResponse.success(
        links,
        "Follow-up tests fetched successfully"
      )
    );
});

// Get All Published Tests (Marketplace)
export const getTests = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    search,
    category,
    testType,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = req.query;

  const query = { isPublished: true };

  if (category) {
    query.category = category;
  }

  if (testType) {
    query.testType = testType;
  }

  if (search) {
    const regex = { $regex: search, $options: "i" };
    query.$or = [{ title: regex }, { description: regex }];
  }

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;
  const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

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
  
  const tests = result.tests.map(test => {
    const testObj = test.toObject();
    delete testObj.questions;
    delete testObj.randomConfig;
    return testObj;
  });
  const total = result.pagination.total;

  return res.status(200).json(
    ApiResponse.success(
      tests,
      "Tests fetched successfully",
      {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      }
    )
  );
});

// Get Test Details (with purchase status)
export const getTestById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const studentId = req.user._id;

  const test = await testRepository.findTestById(id, {
    category: "name slug",
    questions: "questionText questionType options marks subject topic difficulty",
  });

  if (!test) {
    throw new ApiError(404, "Test not found");
  }

  if (!test.isPublished) {
    throw new ApiError(404, "Test not found");
  }

  // Check if student has purchased this test
  const purchase = await orderRepository.findTestPurchase({
    student: studentId,
    test: id,
    paymentStatus: "completed",
  });

  const testData = test.toObject();
  testData.isPurchased = !!purchase;

  return res
    .status(200)
    .json(ApiResponse.success(testData, "Test fetched successfully"));
});

// Purchase Test
export const purchaseTest = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const studentId = req.user._id;
  const { error, value } = marketplaceValidator.purchaseTest.validate(req.body);

  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }

  const { paymentId } = value;

  const test = await testRepository.findTestById(id);

  if (!test || !test.isPublished) {
    throw new ApiError(404, "Test not found");
  }

  // Check if already purchased
  const existingPurchase = await orderRepository.findTestPurchase({
    student: studentId,
    test: id,
    paymentStatus: "completed",
  });

  if (existingPurchase) {
    throw new ApiError(400, "Test already purchased");
  }

  const purchaseData = await orderRepository.createTestPurchase({
    student: studentId,
    test: id,
    purchasePrice: test.price,
    paymentId: paymentId || `PAY_${Date.now()}`,
    paymentStatus: "completed",
  });

  return res
    .status(201)
    .json(
      ApiResponse.success(
        purchaseData,
        "Test purchased successfully"
      )
    );
});

// Get All Published Test Bundles (Marketplace)
export const getTestBundles = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    search,
    category,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = req.query;

  const query = { isActive: true };

  if (category) {
    query.category = category;
  }

  if (search) {
    const regex = { $regex: search, $options: "i" };
    query.$or = [{ name: regex }, { description: regex }];
  }

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;
  const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

  const result = await testRepository.findAllBundles(query, {
    page: pageNum,
    limit: limitNum,
    sortBy,
    sortOrder,
    search,
    category,
    isActive: true,
  });
  
  const bundles = result.bundles;
  const total = result.pagination.total;

  return res.status(200).json(
    ApiResponse.success(
      bundles,
      "Test bundles fetched successfully",
      {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      }
    )
  );
});

// Purchase Test Bundle
export const purchaseTestBundle = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const studentId = req.user._id;
  const { error, value } = marketplaceValidator.purchaseTestBundle.validate(req.body);

  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }

  const { paymentId } = value;

  const bundle = await testRepository.findBundleById(id, {
    category: "name slug",
    tests: "title durationMinutes totalMarks testType",
  });

  if (!bundle || !bundle.isActive) {
    throw new ApiError(404, "Test bundle not found");
  }

  // Check if already purchased
  const existingPurchase = await orderRepository.findTestPurchase({
    student: studentId,
    testBundle: id,
    paymentStatus: "completed",
  });

  if (existingPurchase) {
    throw new ApiError(400, "Test bundle already purchased");
  }

  const purchaseData = await orderRepository.createTestPurchase({
    student: studentId,
    testBundle: id,
    purchasePrice: bundle.price,
    paymentId: paymentId || `PAY_${Date.now()}`,
    paymentStatus: "completed",
  });

  return res
    .status(201)
    .json(
      ApiResponse.success(
        purchaseData,
        "Test bundle purchased successfully"
      )
    );
});

// Get Student's Purchased Tests
export const getMyTests = asyncHandler(async (req, res) => {
  const studentId = req.user._id;
  const { page = 1, limit = 10 } = req.query;

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  const purchases = await orderRepository.findTestPurchases(studentId);
  const total = purchases.length;
  const paginatedPurchases = purchases.slice(skip, skip + limitNum);

  return res.status(200).json(
    ApiResponse.success(
      purchases,
      "Purchased tests fetched successfully",
      {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      }
    )
  );
});

export default {
  getCourses,
  getCourseById,
  purchaseCourse,
  getMyCourses,
  getCourseFollowUpTests,
  getTests,
  getTestById,
  purchaseTest,
  getTestBundles,
  purchaseTestBundle,
  getMyTests,
};

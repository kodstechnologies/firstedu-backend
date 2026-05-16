import { ApiError } from "../utils/ApiError.js";
import courseRepository from "../repository/course.repository.js";
import testRepository from "../repository/test.repository.js";
import courseTestLinkRepository from "../repository/courseTestLink.repository.js";
import orderRepository from "../repository/order.repository.js";
import examSessionRepository from "../repository/examSession.repository.js";
import eventRegistrationRepository from "../repository/eventRegistration.repository.js";
import tournamentRepository from "../repository/tournament.repository.js";
import razorpayOrderIntentRepository from "../repository/razorpayOrderIntent.repository.js";
import pointsService from "./points.service.js";
import walletService from "./wallet.service.js";
import {
  createRazorpayOrder,
  verifyPaymentSignature,
} from "../utils/razorpayUtils.js";
import { attachOfferToList, attachOfferToItem, getApplicableOfferDetails, getAmountToCharge } from "../utils/offerUtils.js";
import couponService from "./coupon.service.js";
import studentRepository from "../repository/student.repository.js";
import { sendCourseEnrollmentEmail, sendTestBundlePurchaseEmail } from "../utils/sendEmail.js";
import Category from "../models/Category.js";
import { getOlympiads } from "./studentOlympiad.service.js";
import { getTournaments } from "./tournament.service.js";

const buildCategoryPathsMap = async () => {
  const categories = await Category.find({}).select('name parent').lean();
  const catMap = new Map();
  categories.forEach(c => catMap.set(c._id.toString(), c));

  const pathMap = new Map();
  const getPath = (id) => {
    if (!id) return '';
    const idStr = id.toString();
    if (pathMap.has(idStr)) return pathMap.get(idStr);
    
    let current = catMap.get(idStr);
    if (!current) {
      pathMap.set(idStr, '');
      return '';
    }
    
    const parts = [];
    const visited = new Set();
    while (current && !visited.has(current._id.toString())) {
      parts.push(current.name);
      visited.add(current._id.toString());
      current = current.parent ? catMap.get(current.parent.toString()) : null;
    }
    const path = parts.reverse().join(' > ');
    pathMap.set(idStr, path);
    return path;
  };

  return getPath;
};

const DIRECT_PURCHASABLE_TEST_TYPES = [
  "test",
  "challenge_yourself",
  "challenge_yourfriends",
  "competition_sector",
  "Olympiads",
  "School",
  "Competitive",
  "Skill Development",
  "certificate",
  "competitive",
  "school",
  "skill development",
  "skill",
  "olympiads",
];

const isDirectPurchasableTest = (test) => {
  const applicableFor = (test?.applicableFor || "test").toLowerCase().trim();
  return DIRECT_PURCHASABLE_TEST_TYPES.includes(applicableFor);
};

const getFrontendItemType = (test) => {
  const appFor = (test?.applicableFor || "").toLowerCase().trim();
  if (appFor.startsWith("challenge")) return "challenge";
  if (appFor === "school") return "school";
  if (appFor === "competitive") return "competitive";
  if (appFor === "skill" || appFor === "skill development") return "skill";
  if (appFor === "olympiads") return "olympiad";
  return "test";
};

const attachPurchasedFlagToTests = async (tests, studentId) => {
  if (!studentId || !tests.length) {
    tests.forEach((t) => (t.purchased = false));
    return tests;
  }
  const testIds = tests.map((t) => t._id.toString());
  const purchasedIds = await orderRepository.findPurchasedTestIdsForStudent(
    studentId,
    testIds
  );
  const purchasedSet = new Set(purchasedIds);
  tests.forEach((t) => {
    t.purchased = purchasedSet.has(t._id.toString());
  });
  return tests;
};

const attachPurchasedFlagToBundles = async (bundles, studentId) => {
  if (!studentId || !bundles.length) {
    bundles.forEach((b) => (b.purchased = false));
    return bundles;
  }
  const purchases = await orderRepository.findTestPurchases(studentId);
  const purchasedBundleIds = new Set(
    purchases
      .map((p) => p.testBundle?._id?.toString() || p.testBundle?.toString())
      .filter(Boolean)
  );
  bundles.forEach((b) => {
    b.purchased = purchasedBundleIds.has(b._id.toString());
  });
  return bundles;
};

/**
 * Get all published courses (marketplace listing)
 * Filters: type (pdf | video | audio), access (free | paid | both)
 * - free: price === 0, paid: price > 0, both: no filter
 */
export const getCourses = async (options = {}) => {
  const {
    page = 1,
    limit = 10,
    search,
    category,
    sortBy = "createdAt",
    sortOrder = "desc",
    type,
    access,
    isCertification,
  } = options;
 
  const query = { isPublished: true };
  if (typeof isCertification === "boolean") {
    query.isCertification = isCertification;
  }
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
    type,
    access,
  });

  const coursesRaw = result.courses.map((course) => {
    const courseObj = course.toObject();
    delete courseObj.contentUrl;
    return courseObj;
  });
  const courses = await attachOfferToList(coursesRaw, "Course", "price");
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
  const course = await courseRepository.findById(courseId);

  if (!course) throw new ApiError(404, "Course not found");
  if (!course.isPublished) throw new ApiError(404, "Course not found");

  const purchase = await orderRepository.findCoursePurchase({
    student: studentId,
    course: courseId,
    paymentStatus: "completed",
  });

  const courseData = await attachOfferToItem(course, "Course", "price");
  courseData.isPurchased = !!purchase;
  if (!courseData.isPurchased) delete courseData.contentUrl;

  return courseData;
};

/**
 * Initiate course purchase. Handles free, wallet, and razorpay (like test/test-bundle).
 * - free: completes purchase immediately if price is 0
 * - wallet: deducts balance and completes purchase immediately
 * - razorpay: creates order, returns order details; purchase completed via purchase API after payment
 * @param {Object} options - { couponCode?: string }
 */
export const initiateCoursePayment = async (courseId, studentId, paymentMethod, options = {}) => {
  const { couponCode } = options;
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

  const price = Number(course.price) || 0;

  const { amountToCharge, couponId, appliedOffer, appliedCoupon } = await getAmountToCharge("Course", price, couponCode);

  if (paymentMethod === "free") {
    if (amountToCharge > 0) {
      throw new ApiError(400, "This course is paid. Use paymentMethod: wallet or razorpay.");
    }
    const purchase = await orderRepository.createCoursePurchase({
      student: studentId,
      course: courseId,
      purchasePrice: 0,
      paymentId: "free",
      paymentStatus: "completed",
    });
    try {
      await pointsService.awardCoursePurchasePoints(studentId, courseId, course.title || "Course");
    } catch (error) {
      console.error("Error awarding points for course purchase:", error);
    }
    (async () => {
      try {
        const student = await studentRepository.findById(studentId);
        if (student) await sendCourseEnrollmentEmail(student.email, student.name, course.title || "Course", amountToCharge, new Date());
      } catch (err) {
        console.error("Error sending course enrollment email:", err);
      }
    })();
    return { purchase, completed: true };
  }

  if (paymentMethod === "wallet") {
    if (amountToCharge < 1) {
      throw new ApiError(400, "This course is free. Use paymentMethod: free.");
    }
    await walletService.deductMonetaryBalance(studentId, amountToCharge, "User");
    const purchase = await orderRepository.createCoursePurchase({
      student: studentId,
      course: courseId,
      purchasePrice: amountToCharge,
      paymentId: "wallet",
      paymentStatus: "completed",
    });
    if (couponId) {
      await couponService.incrementCouponUsedCount(couponId);
    }
    try {
      await pointsService.awardCoursePurchasePoints(studentId, courseId, course.title || "Course");
    } catch (error) {
      console.error("Error awarding points for course purchase:", error);
    }
    (async () => {
      try {
        const student = await studentRepository.findById(studentId);
        if (student) await sendCourseEnrollmentEmail(student.email, student.name, course.title || "Course", amountToCharge, new Date());
      } catch (err) {
        console.error("Error sending course enrollment email:", err);
      }
    })();
    return { purchase, completed: true };
  }

  if (paymentMethod === "razorpay") {
    if (amountToCharge < 1) {
      throw new ApiError(400, "This course is free. Use paymentMethod: free.");
    }
    const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
    const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!razorpayKeyId || !razorpayKeySecret) {
      throw new ApiError(500, "Payment gateway not configured");
    }
    const receipt = `course_${courseId}_${studentId}_${Date.now()}`.substring(0, 40);
    let order;
    try {
      order = await createRazorpayOrder(amountToCharge, receipt);
    } catch (err) {
      const statusCode = err?.statusCode ?? err?.response?.status;
      const code = err?.error?.code ?? err?.response?.data?.error?.code;
      if (statusCode === 401 || code === "BAD_REQUEST_ERROR") {
        console.error("[Razorpay] Authentication failed:", err?.error ?? err?.message ?? err);
        throw new ApiError(500, "Payment gateway authentication failed.");
      }
      console.error("[Razorpay] Order create error:", err?.error ?? err?.message ?? err);
      throw new ApiError(500, "Payment gateway error. Please try again later.");
    }

    await razorpayOrderIntentRepository.create({
      orderId: order.orderId,
      studentId,
      type: "course",
      entityId: courseId,
      entityModel: "Course",
      amountPaise: order.amount,
      currency: order.currency || "INR",
      receipt,
      couponId: couponId || undefined,
    });

    return {
      completed: false,
      orderId: order.orderId,
      amount: order.amount,
      currency: order.currency,
      key: razorpayKeyId,
      courseId,
      courseTitle: course.title,
      appliedOffer: appliedOffer || undefined,
      appliedCoupon: appliedCoupon || undefined,
      originalPrice: price,
      discountedPrice: amountToCharge,
    };
  }

  throw new ApiError(400, "Invalid paymentMethod. Use: free, wallet, or razorpay.");
};

/** @deprecated Use initiateCoursePayment with paymentMethod: 'razorpay' */
export const createCourseOrder = async (courseId, studentId, options = {}) => {
  const result = await initiateCoursePayment(courseId, studentId, "razorpay", options);
  if (result.completed) return result.purchase;
  return result;
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

  const intent = await razorpayOrderIntentRepository.findByOrderId(razorpayOrderId);
  if (!intent) {
    throw new ApiError(400, "Invalid order or payment already used");
  }
  const studentIdStr = studentId?.toString?.() ?? String(studentId);
  const courseIdStr = courseId?.toString?.() ?? String(courseId);
  if (intent.studentId?.toString?.() !== studentIdStr) {
    throw new ApiError(403, "This payment was made by a different user");
  }
  if (intent.type !== "course" || intent.entityId?.toString?.() !== courseIdStr) {
    throw new ApiError(400, "Payment does not match this course");
  }
  const purchasePrice = intent.amountPaise / 100;

  const purchaseData = await orderRepository.createCoursePurchase({
    student: studentId,
    course: courseId,
    purchasePrice,
    paymentId: razorpayPaymentId,
    paymentStatus: "completed",
  });
  await razorpayOrderIntentRepository.markReconciled(razorpayOrderId, razorpayPaymentId);

  if (intent.couponId) {
    await couponService.incrementCouponUsedCount(intent.couponId);
  }

  try {
    await pointsService.awardCoursePurchasePoints(
      studentId,
      courseId,
      course.title || "Course"
    );
  } catch (error) {
    console.error("Error awarding points for course purchase:", error);
  }

  (async () => {
    try {
      const student = await studentRepository.findById(studentId);
      if (student) await sendCourseEnrollmentEmail(student.email, student.name, course.title || "Course", purchasePrice, new Date());
    } catch (err) {
      console.error("Error sending course enrollment email:", err);
    }
  })();

  return purchaseData;
};

/**
 * Get student's purchased courses (paginated).
 * Filters: search (title/description), contentType (pdf | video | audio)
 */
export const getMyCourses = async (studentId, page = 1, limit = 10, options = {}) => {
  const { search, contentType, isCertification } = options;
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  let purchases = await orderRepository.findCoursePurchases(studentId);

  // Filter by isCertification
  if (typeof isCertification === "boolean") {
    purchases = purchases.filter(
      (p) => p.course && Boolean(p.course.isCertification) === isCertification
    );
  }

  // Filter by contentType (pdf, video, audio)
  if (contentType) {
    const type = String(contentType).toLowerCase();
    if (["pdf", "video", "audio"].includes(type)) {
      purchases = purchases.filter(
        (p) => p.course && String(p.course.contentType || "").toLowerCase() === type
      );
    }
  }

  // Filter by search (title, description)
  if (search && search.trim()) {
    const term = search.trim().toLowerCase();
    purchases = purchases.filter((p) => {
      if (!p.course) return false;
      const title = (p.course.title || "").toLowerCase();
      const desc = (p.course.description || "").toLowerCase();
      return title.includes(term) || desc.includes(term);
    });
  }

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
 * Get course content for viewing/download (requires purchase).
 * Returns contentUrl and contentType for video, audio, or PDF.
 */
export const getCourseContentForDownload = async (courseId, studentId) => {
  const purchase = await orderRepository.findCoursePurchase({
    student: studentId,
    course: courseId,
    paymentStatus: "completed",
  });
  if (!purchase) {
    throw new ApiError(403, "You must purchase this course to access content");
  }

  const course = await courseRepository.findById(courseId);
  if (!course || !course.isPublished) {
    throw new ApiError(404, "Course not found");
  }
  if (!course.contentUrl) {
    throw new ApiError(404, "Course content is not available");
  }

  return {
    contentUrl: course.contentUrl,
    contentType: course.contentType || "pdf",
    title: course.title,
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
 * Get tests and/or test bundles in one API (student marketplace).
 * type: "test" | "testBundle" | "both" — filter to tests only, bundles only, or both (default: both)
 */
export const getTestsAndBundles = async (options = {}) => {
  const {
    type = "both",
    page = 1,
    limit = 10,
    search,
    category,
    sortBy = "createdAt",
    sortOrder = "desc",
    questionBank,
    studentId,
  } = options;

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);

  if (type === "test") {
    const result = await getTests({
      page: pageNum,
      limit: limitNum,
      search,
      category,
      questionBank,
      sortBy,
      sortOrder,
      applicableFor: DIRECT_PURCHASABLE_TEST_TYPES,
      studentId,
    });
    return {
      items: result.tests.map((t) => ({
        ...toTestItem(t),
        itemType: getFrontendItemType(t),
      })),
      pagination: result.pagination,
    };
  }

  if (type === "challenges") {
    const result = await getTests({
      page: pageNum,
      limit: limitNum,
      search,
      category,
      questionBank,
      sortBy,
      sortOrder,
      applicableFor: ["challenge_yourself", "challenge_yourfriends"],
      studentId,
    });
    return {
      items: result.tests.map((t) => ({
        ...toTestItem(t),
        itemType: getFrontendItemType(t),
      })),
      pagination: result.pagination,
    };
  }

  if (type === "school") {
    const result = await getTests({
      page: pageNum,
      limit: limitNum,
      search,
      category,
      questionBank,
      sortBy,
      sortOrder,
      applicableFor: ["school", "School"],
      studentId,
    });
    return {
      items: result.tests.map((t) => ({
        ...toTestItem(t),
        itemType: getFrontendItemType(t),
      })),
      pagination: result.pagination,
    };
  }

  if (type === "competitive") {
    const result = await getTests({
      page: pageNum,
      limit: limitNum,
      search,
      category,
      questionBank,
      sortBy,
      sortOrder,
      applicableFor: ["competitive", "Competitive"],
      studentId,
    });
    return {
      items: result.tests.map((t) => ({
        ...toTestItem(t),
        itemType: getFrontendItemType(t),
      })),
      pagination: result.pagination,
    };
  }

  if (type === "skill") {
    const result = await getTests({
      page: pageNum,
      limit: limitNum,
      search,
      category,
      questionBank,
      sortBy,
      sortOrder,
      applicableFor: ["skill", "skill development", "Skill Development"],
      studentId,
    });
    return {
      items: result.tests.map((t) => ({
        ...toTestItem(t),
        itemType: getFrontendItemType(t),
      })),
      pagination: result.pagination,
    };
  }

  if (type === "testBundle") {
    const result = await getTestBundles({
      page: pageNum,
      limit: limitNum,
      search,
      category,
      sortBy,
      sortOrder,
      studentId,
    });
    return {
      items: result.bundles.map((b) => ({
        ...toBundleItem(b),
        itemType: "testBundle",
      })),
      pagination: result.pagination,
    };
  }

  if (type === "olympiad") {
    const result = await getOlympiads({
      page: pageNum,
      limit: limitNum,
      search,
      categoryId: category,
      studentId,
    });
    return {
      items: result.olympiads.map((o) => ({
        ...toOlympiadItem(o),
      })),
      pagination: result.pagination,
    };
  }

  if (type === "tournament") {
    const result = await getTournaments({
      page: pageNum,
      limit: limitNum,
      search,
      category,
      isPublished: true,
      studentId,
    });
    return {
      items: result.tournaments.map((t) => ({
        ...toTournamentItem(t),
      })),
      pagination: result.pagination,
    };
  }

  // type === "both" or "all" — single merged list + one pagination
  const fetchSize = pageNum * limitNum;
  const [testsResult, bundlesResult, olympiadsResult, tournamentsResult] = await Promise.all([
    getTests({
      page: 1,
      limit: fetchSize,
      search,
      category,
      questionBank,
      sortBy,
      sortOrder,
      studentId,
    }),
    getTestBundles({
      page: 1,
      limit: fetchSize,
      search,
      category,
      sortBy,
      sortOrder,
      studentId,
    }),
    getOlympiads({
      page: 1,
      limit: fetchSize,
      search,
      categoryId: category,
      studentId,
    }),
    getTournaments({
      page: 1,
      limit: fetchSize,
      search,
      category,
      isPublished: true,
      studentId,
    }),
  ]);

  const testsTotal = testsResult.pagination.total;
  const bundlesTotal = bundlesResult.pagination.total;
  const olympiadsTotal = olympiadsResult.pagination.total;
  const tournamentsTotal = tournamentsResult.pagination.total;
  const total = testsTotal + bundlesTotal + olympiadsTotal + tournamentsTotal;
  const sortDesc = sortOrder === "desc";

  const testItems = testsResult.tests.map((t) => ({
    ...toTestItem(t),
    itemType: getFrontendItemType(t),
  }));
  const bundleItems = bundlesResult.bundles.map((b) => ({
    ...toBundleItem(b),
    itemType: "testBundle",
  }));
  const olympiadItems = olympiadsResult.olympiads.map((o) => ({
    ...toOlympiadItem(o),
  }));
  const tournamentItems = tournamentsResult.tournaments.map((t) => ({
    ...toTournamentItem(t),
  }));

  const merged = [...testItems, ...bundleItems, ...olympiadItems, ...tournamentItems].sort((a, b) => {
    const dateA = new Date(a.createdAt || 0).getTime();
    const dateB = new Date(b.createdAt || 0).getTime();
    return sortDesc ? dateB - dateA : dateA - dateB;
  });

  const start = (pageNum - 1) * limitNum;
  const items = merged.slice(start, start + limitNum);

  return {
    items,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum) || 1,
    },
  };
};

const toTestItem = (test) => {
  const obj = test?.toObject ? test.toObject() : { ...test };
  delete obj.questions;
  delete obj.randomConfig;
  return obj;
};

const toBundleItem = (bundle) => {
  return bundle?.toObject ? bundle.toObject() : { ...bundle };
};

const toOlympiadItem = (olympiad) => {
  const obj = olympiad?.toObject ? olympiad.toObject() : { ...olympiad };
  return {
    ...obj,
    itemType: "olympiad",
    purchased: Boolean(obj.isRegistered),
  };
};

const toTournamentItem = (tournament) => {
  const obj = tournament?.toObject ? tournament.toObject() : { ...tournament };
  return {
    ...obj,
    itemType: "tournament",
    // purchased field will be added by attachPurchasedFlagToTournaments if we want
  };
};

/**
 * Get all published tests (marketplace listing)
 */
export const getTests = async (options = {}) => {
  const {
    page = 1,
    limit = 10,
    search,
    questionBank,
    category,
    sortBy = "createdAt",
    sortOrder = "desc",
    applicableFor,
    studentId,
  } = options;

  const query = { isPublished: true };
  if (applicableFor) {
    query.applicableFor = Array.isArray(applicableFor)
      ? { $in: applicableFor }
      : applicableFor;
  } else {
    query.applicableFor = { $in: DIRECT_PURCHASABLE_TEST_TYPES };
  }

  if (questionBank) query.questionBank = questionBank;
  if (search) {
    const regex = { $regex: search, $options: "i" };
    query.$or = [
      { title: regex },
      { description: regex },
      { applicableFor: regex },
    ];
  }

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);

  const result = await testRepository.findAllTests(query, {
    page: pageNum,
    limit: limitNum,
    sortBy,
    sortOrder,
    search,
    questionBank,
    category,
    isPublished: true,
  });

  const getPath = await buildCategoryPathsMap();

  const testsRaw = result.tests.map((test) => {
    const testObj = test.toObject();
    delete testObj.questions;
    delete testObj.randomConfig;

    let catId = testObj.categoryId;
    if (!catId && testObj.questionBank?.categories?.length > 0) {
      catId = testObj.questionBank.categories[0]._id || testObj.questionBank.categories[0];
    }
    if (catId) {
      testObj.categoryPath = getPath(catId);
    }

    return testObj;
  });

  const tests = await attachOfferToList(testsRaw, "Test", "price");
  await attachPurchasedFlagToTests(tests, studentId);

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
 * Initiate test purchase. Handles free, wallet, and razorpay (like tournament/workshop).
 * - free: completes purchase immediately if price is 0
 * - wallet: deducts balance and completes purchase immediately
 * - razorpay: creates order, returns order details; purchase completed via purchase API after payment
 * @param {Object} options - { couponCode?: string }
 */
export const initiateTestPayment = async (testId, studentId, paymentMethod, options = {}) => {
  const { couponCode } = options;
  const test = await testRepository.findTestById(testId);

  if (!test || !test.isPublished) {
    throw new ApiError(404, "Test not found");
  }
  console.log("DEBUG_TEST_APPFOR:", test.applicableFor, test._id, test.title);
  if (!isDirectPurchasableTest(test)) {
    throw new ApiError(400, `This test is not available for direct purchase. Its applicableFor is: ${test.applicableFor}`);
  }

  const existingPurchase = await orderRepository.findTestPurchase({
    student: studentId,
    test: testId,
    paymentStatus: "completed",
  });
  if (existingPurchase) {
    throw new ApiError(400, "Test already purchased");
  }

  const price = Number(test.price) || 0;

  const shouldApplyOfferAndCoupon = test.applicableFor !== "challenge_yourself";
  
  const moduleTypeForOffer = test.applicableFor && test.applicableFor !== "test" 
    ? test.applicableFor 
    : "Test";

  const {
    amountToCharge,
    couponId,
    appliedOffer,
    appliedCoupon,
  } = shouldApplyOfferAndCoupon
    ? await getAmountToCharge(moduleTypeForOffer, price, couponCode)
    : {
        amountToCharge: price,
        couponId: null,
        appliedOffer: null,
        appliedCoupon: null,
      };

  if (paymentMethod === "free") {
    if (amountToCharge > 0) {
      throw new ApiError(400, "This test is paid. Use paymentMethod: wallet or razorpay.");
    }
    const purchase = await orderRepository.createTestPurchase({
      student: studentId,
      test: testId,
      purchasePrice: 0,
      paymentId: "free",
      paymentStatus: "completed",
    });
    return { purchase, completed: true };
  }

  if (paymentMethod === "wallet") {
    if (amountToCharge < 1) {
      throw new ApiError(400, "This test is free. Use paymentMethod: free.");
    }
    await walletService.deductMonetaryBalance(studentId, amountToCharge, "User");
    const purchase = await orderRepository.createTestPurchase({
      student: studentId,
      test: testId,
      purchasePrice: amountToCharge,
      paymentId: "wallet",
      paymentStatus: "completed",
    });
    if (couponId) {
      await couponService.incrementCouponUsedCount(couponId);
    }
    return { purchase, completed: true };
  }

  if (paymentMethod === "razorpay") {
    if (amountToCharge < 1) {
      throw new ApiError(400, "This test is free. Use paymentMethod: free.");
    }
    const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
    const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!razorpayKeyId || !razorpayKeySecret) {
      throw new ApiError(500, "Payment gateway not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env");
    }
    const receipt = `test_${testId}_${studentId}_${Date.now()}`.substring(0, 40);
    let order;
    try {
      order = await createRazorpayOrder(amountToCharge, receipt);
    } catch (err) {
      const statusCode = err?.statusCode ?? err?.response?.status;
      const code = err?.error?.code ?? err?.response?.data?.error?.code;
      if (statusCode === 401 || code === "BAD_REQUEST_ERROR") {
        console.error("[Razorpay] Authentication failed:", err?.error ?? err?.message ?? err);
        throw new ApiError(500, "Payment gateway authentication failed. Please check Razorpay credentials.");
      }
      console.error("[Razorpay] Order create error:", err?.error ?? err?.message ?? err);
      throw new ApiError(500, "Payment gateway error. Please try again later.");
    }

    await razorpayOrderIntentRepository.create({
      orderId: order.orderId,
      studentId,
      type: "test",
      entityId: testId,
      entityModel: "Test",
      amountPaise: order.amount,
      currency: order.currency || "INR",
      receipt,
      couponId: couponId || undefined,
    });

    return {
      completed: false,
      orderId: order.orderId,
      amount: order.amount,
      currency: order.currency,
      key: razorpayKeyId,
      testId,
      testTitle: test.title,
      appliedOffer: appliedOffer || undefined,
      appliedCoupon: appliedCoupon || undefined,
      originalPrice: price,
      discountedPrice: amountToCharge,
    };
  }

  throw new ApiError(400, "Invalid paymentMethod. Use: free, wallet, or razorpay.");
};

/** @deprecated Use initiateTestPayment with paymentMethod: 'razorpay' */
export const createTestOrder = async (testId, studentId) => {
  const result = await initiateTestPayment(testId, studentId, "razorpay");
  if (result.completed) return result.purchase;
  return result;
};

/**
 * Get test by ID with full details (no payment check)
 */
export const getTestById = async (testId) => {
  const test = await testRepository.findTestById(testId, {
    questionBank: "name categories",
  });

  if (!test) throw new ApiError(404, "Test not found");
  if (!test.isPublished) throw new ApiError(404, "Test not found");
  if (!isDirectPurchasableTest(test)) {
    throw new ApiError(404, "Test not found");
  }

  const moduleTypeForOffer = test.applicableFor && test.applicableFor !== "test" 
    ? test.applicableFor 
    : "Test";
  const testData = await attachOfferToItem(test, moduleTypeForOffer, "price");
  delete testData.questions;
  delete testData.randomConfig;

  const getPath = await buildCategoryPathsMap();
  let catId = testData.categoryId;
  if (!catId && testData.questionBank?.categories?.length > 0) {
    catId = testData.questionBank.categories[0]._id || testData.questionBank.categories[0];
  }
  if (catId) {
    testData.categoryPath = getPath(catId);
  }

  return testData;
};

/**
 * Purchase test (verify Razorpay payment and complete purchase)
 * Called only after initiateTestPayment with paymentMethod: razorpay and user completed Razorpay checkout
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
  if (!isDirectPurchasableTest(test)) {
    throw new ApiError(400, `This test is not available for direct purchase. Its applicableFor is: ${test.applicableFor}`);
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

  const intent = await razorpayOrderIntentRepository.findByOrderId(razorpayOrderId);
  if (!intent) {
    throw new ApiError(400, "Invalid order or payment already used");
  }
  const studentIdStr = studentId?.toString?.() ?? String(studentId);
  const testIdStr = testId?.toString?.() ?? String(testId);
  if (intent.studentId?.toString?.() !== studentIdStr) {
    throw new ApiError(403, "This payment was made by a different user");
  }
  if (intent.type !== "test" || intent.entityId?.toString?.() !== testIdStr) {
    throw new ApiError(400, "Payment does not match this test");
  }
  // Intent amount may be discounted (offer applied)
  const purchasePrice = intent.amountPaise / 100;

  const purchase = await orderRepository.createTestPurchase({
    student: studentId,
    test: testId,
    purchasePrice,
    paymentId: razorpayPaymentId,
    paymentStatus: "completed",
  });
  await razorpayOrderIntentRepository.markReconciled(razorpayOrderId, razorpayPaymentId);
  if (intent.couponId) {
    await couponService.incrementCouponUsedCount(intent.couponId);
  }
  return purchase;
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
    studentId,
  } = options;

  const query = { isActive: true };
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

  const getPath = await buildCategoryPathsMap();
  const bundlesRaw = result.bundles.map((b) => {
    const bundleObj = b.toObject ? b.toObject() : b;
    let catId = bundleObj.category;
    if (catId) {
      bundleObj.categoryPath = getPath(catId);
    } else if (bundleObj.tests?.length > 0) {
      const firstTest = bundleObj.tests[0];
      const testCatId = firstTest?.categoryId || (firstTest?.questionBank?.categories?.[0]?._id || firstTest?.questionBank?.categories?.[0]);
      if (testCatId) {
        bundleObj.categoryPath = getPath(testCatId);
      }
    }
    return bundleObj;
  });
  const bundles = await attachOfferToList(bundlesRaw, "TestSeries", "price");
  await attachPurchasedFlagToBundles(bundles, studentId);

  return {
    bundles,
    pagination: result.pagination,
  };
};

/**
 * Initiate test bundle purchase. Handles free, wallet, and razorpay (like tournament/workshop).
 * @param {Object} options - { couponCode?: string }
 */
export const initiateTestBundlePayment = async (bundleId, studentId, paymentMethod, options = {}) => {
  const { couponCode } = options;
  const bundle = await testRepository.findBundleById(bundleId, {
    tests: "title durationMinutes questionBank",
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

  const price = Number(bundle.price) || 0;

  const { amountToCharge, couponId, appliedOffer, appliedCoupon } = await getAmountToCharge("TestSeries", price, couponCode);

  if (paymentMethod === "free") {
    if (amountToCharge > 0) {
      throw new ApiError(400, "This test bundle is paid. Use paymentMethod: wallet or razorpay.");
    }
    const purchase = await orderRepository.createTestPurchase({
      student: studentId,
      testBundle: bundleId,
      purchasePrice: 0,
      paymentId: "free",
      paymentStatus: "completed",
    });
    (async () => {
      try {
        const student = await studentRepository.findById(studentId);
        if (student) await sendTestBundlePurchaseEmail(student.email, student.name, bundle.name || "Bundle", amountToCharge, new Date());
      } catch (err) {
        console.error("Error sending test bundle purchase email:", err);
      }
    })();
    return { purchase, completed: true };
  }

  if (paymentMethod === "wallet") {
    if (amountToCharge < 1) {
      throw new ApiError(400, "This test bundle is free. Use paymentMethod: free.");
    }
    await walletService.deductMonetaryBalance(studentId, amountToCharge, "User");
    const purchase = await orderRepository.createTestPurchase({
      student: studentId,
      testBundle: bundleId,
      purchasePrice: amountToCharge,
      paymentId: "wallet",
      paymentStatus: "completed",
    });
    if (couponId) {
      await couponService.incrementCouponUsedCount(couponId);
    }
    (async () => {
      try {
        const student = await studentRepository.findById(studentId);
        if (student) await sendTestBundlePurchaseEmail(student.email, student.name, bundle.name || "Bundle", amountToCharge, new Date());
      } catch (err) {
        console.error("Error sending test bundle purchase email:", err);
      }
    })();
    return { purchase, completed: true };
  }

  if (paymentMethod === "razorpay") {
    if (amountToCharge < 1) {
      throw new ApiError(400, "This test bundle is free. Use paymentMethod: free.");
    }
    const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
    const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!razorpayKeyId || !razorpayKeySecret) {
      throw new ApiError(500, "Payment gateway not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env");
    }
    const receipt = `bundle_${bundleId}_${studentId}_${Date.now()}`.substring(0, 40);
    let order;
    try {
      order = await createRazorpayOrder(amountToCharge, receipt);
    } catch (err) {
      const statusCode = err?.statusCode ?? err?.response?.status;
      const code = err?.error?.code ?? err?.response?.data?.error?.code;
      if (statusCode === 401 || code === "BAD_REQUEST_ERROR") {
        console.error("[Razorpay] Authentication failed:", err?.error ?? err?.message ?? err);
        throw new ApiError(500, "Payment gateway authentication failed. Please check Razorpay credentials.");
      }
      console.error("[Razorpay] Order create error:", err?.error ?? err?.message ?? err);
      throw new ApiError(500, "Payment gateway error. Please try again later.");
    }

    await razorpayOrderIntentRepository.create({
      orderId: order.orderId,
      studentId,
      type: "bundle",
      entityId: bundleId,
      entityModel: "TestBundle",
      amountPaise: order.amount,
      currency: order.currency || "INR",
      receipt,
      couponId: couponId || undefined,
    });

    return {
      completed: false,
      orderId: order.orderId,
      amount: order.amount,
      currency: order.currency,
      key: razorpayKeyId,
      bundleId,
      bundleName: bundle.name,
      appliedOffer: appliedOffer || undefined,
      appliedCoupon: appliedCoupon || undefined,
      originalPrice: price,
      discountedPrice: amountToCharge,
    };
  }

  throw new ApiError(400, "Invalid paymentMethod. Use: free, wallet, or razorpay.");
};

/** @deprecated Use initiateTestBundlePayment with paymentMethod: 'razorpay' */
export const createTestBundleOrder = async (bundleId, studentId) => {
  const result = await initiateTestBundlePayment(bundleId, studentId, "razorpay");
  if (result.completed) return result.purchase;
  return result;
};

/**
 * Purchase test bundle (verify Razorpay payment and complete purchase)
 * Called only after initiateTestBundlePayment with paymentMethod: razorpay
 */
export const purchaseTestBundle = async (
  bundleId,
  studentId,
  { razorpayOrderId, razorpayPaymentId, razorpaySignature }
) => {
  const bundle = await testRepository.findBundleById(bundleId, {
    tests: "title durationMinutes questionBank",
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

  const intent = await razorpayOrderIntentRepository.findByOrderId(razorpayOrderId);
  if (!intent) {
    throw new ApiError(400, "Invalid order or payment already used");
  }
  const studentIdStr = studentId?.toString?.() ?? String(studentId);
  const bundleIdStr = bundleId?.toString?.() ?? String(bundleId);
  if (intent.studentId?.toString?.() !== studentIdStr) {
    throw new ApiError(403, "This payment was made by a different user");
  }
  if (intent.type !== "bundle" || intent.entityId?.toString?.() !== bundleIdStr) {
    throw new ApiError(400, "Payment does not match this test bundle");
  }
  // Intent amount may be discounted (offer applied)
  const purchasePrice = intent.amountPaise / 100;

  const purchase = await orderRepository.createTestPurchase({
    student: studentId,
    testBundle: bundleId,
    purchasePrice,
    paymentId: razorpayPaymentId,
    paymentStatus: "completed",
  });
  await razorpayOrderIntentRepository.markReconciled(razorpayOrderId, razorpayPaymentId);
  if (intent.couponId) {
    await couponService.incrementCouponUsedCount(intent.couponId);
  }
  (async () => {
    try {
      const student = await studentRepository.findById(studentId);
      if (student) await sendTestBundlePurchaseEmail(student.email, student.name, bundle.name || "Bundle", purchasePrice, new Date());
    } catch (err) {
      console.error("Error sending test bundle purchase email:", err);
    }
  })();
  return purchase;
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

/**
 * Check if categories array contains the given categoryId
 */
const hasCategory = (categories, categoryId) => {
  if (!categories || !Array.isArray(categories) || !categoryId) return false;
  const idStr = categoryId.toString();
  return categories.some((c) => (c?._id ?? c)?.toString?.() === idStr);
};


const tournamentStagesPopulate = [
  {
    path: "stages.test",
    select: "title description durationMinutes questionBank",
    populate: { path: "questionBank", select: "name categories" },
  },
];

/**
 * Get exam hall - purchased tests, test bundles, and (when live) tournaments the student joined.
 * Tournament tests appear only when event startTime <= now <= endTime (or stage window for tournaments).
 * @param {string} type - "test" | "testBundle" | "tournament" | "both" (test+bundle) | "all" (default: all)
 * @param {string} category - Filter by category ID (questionBank categories for tests / tournament)
 */
export const getExamHall = async (studentId, page = 1, limit = 20, type = "all", category = null) => {
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;
  const now = new Date();
  const nowMs = now.getTime();
  /** Include in exam hall whenever event is live: startTime <= now <= endTime. */
  const isWithinEventWindow = (startTime, endTime) => {
    const startMs = new Date(startTime).getTime();
    const endMs = new Date(endTime).getTime();
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) return false;
    return nowMs >= startMs && nowMs <= endMs;
  };

  const purchases = await orderRepository.findTestPurchasesForExamHall(studentId);
  const purchaseTestIds = [];
  purchases.forEach((p) => {
    if (p.test) purchaseTestIds.push(p.test._id);
    else if (p.testBundle?.tests?.length)
      p.testBundle.tests.forEach((t) => t?._id && purchaseTestIds.push(t._id));
  });
  const statusMap = await examSessionRepository.getSessionStatusMapByStudent(studentId, purchaseTestIds);
  const getTestStatus = (testId) => statusMap[testId?.toString?.() ?? ""]?.status ?? "not_started";
  const getSessionId = (testId) => statusMap[testId?.toString?.() ?? ""]?.sessionId ?? null;

  const purchaseItems = purchases
    .filter((p) => p.test || p.testBundle)
    .map((p) => {
      const base = { _id: p._id, purchaseDate: p.purchaseDate, purchasePrice: p.purchasePrice };
      if (p.test) {
        return {
          ...base,
          type: "test",
          test: p.test,
          testId: p.test._id,
          testStatus: getTestStatus(p.test._id),
          sessionId: getSessionId(p.test._id),
        };
      }
      const bundleTests = (p.testBundle?.tests || []).map((t) => {
        const plain = t?.toObject ? t.toObject() : { ...t };
        return { ...plain, testStatus: getTestStatus(t._id), sessionId: getSessionId(t._id) };
      });
      return {
        ...base,
        type: "testBundle",
        testBundle: p.testBundle,
        bundleId: p.testBundle._id,
        tests: bundleTests,
      };
    });

  const eventRegs = await eventRegistrationRepository.find(
    { student: studentId, eventType: "tournament", paymentStatus: "completed" },
    { limit: 500 }
  );
  const tournamentIds = [...new Set(eventRegs.filter((r) => r.eventType === "tournament").map((r) => r.eventId).filter(Boolean))];

  const eventTestIds = [];
  const tournamentItems = [];
  if (tournamentIds.length > 0) {
    const tournaments = await tournamentRepository.find(
      { _id: { $in: tournamentIds }, isPublished: true },
      { populate: tournamentStagesPopulate, limit: 500 }
    );
    for (const t of tournaments) {
      const stages = t.stages || [];
      const liveStages = stages
        .filter((s) => s.test && s.startTime && s.endTime)
        .filter((s) => isWithinEventWindow(s.startTime, s.endTime))
        .map((s) => {
          eventTestIds.push(s.test._id);
          const plain = s.test?.toObject ? s.test.toObject() : { ...s.test };
          return {
            ...(s.toObject ? s.toObject() : { ...s }),
            test: { ...plain },
            testId: s.test._id,
          };
        });
      if (liveStages.length > 0) {
        tournamentItems.push({
          _id: t._id,
          type: "tournament",
          tournamentId: t._id,
          tournamentTitle: t.title,
          stages: liveStages,
        });
      }
    }
  }

  const eventStatusMap =
    eventTestIds.length > 0
      ? await examSessionRepository.getSessionStatusMapByStudent(studentId, [...new Set(eventTestIds)])
      : {};
  const getEventTestStatus = (id) => eventStatusMap[id?.toString?.() ?? ""]?.status ?? "not_started";
  const getEventSessionId = (id) => eventStatusMap[id?.toString?.() ?? ""]?.sessionId ?? null;
  tournamentItems.forEach((item) => {
    (item.stages || []).forEach((st) => {
      st.testStatus = getEventTestStatus(st.testId);
      st.sessionId = getEventSessionId(st.testId);
      if (st.test) {
        st.test = { ...st.test, testStatus: st.testStatus, sessionId: st.sessionId };
      }
    });
  });

  let combined = [...purchaseItems, ...tournamentItems];

  const typeFilter = (item) => {
    if (type === "test") return item.type === "test";
    if (type === "testBundle") return item.type === "testBundle";
    if (type === "tournament") return item.type === "tournament";
    if (type === "both") return item.type === "test" || item.type === "testBundle";
    return true;
  };
  const categoryFilter = (item) => {
    if (!category) return true;
    if (item.type === "test" && item.test) return hasCategory(item.test?.questionBank?.categories, category);
    if (item.type === "testBundle" && item.testBundle?.tests) {
      return item.testBundle.tests.some((t) => hasCategory(t?.questionBank?.categories, category));
    }

    if (item.type === "tournament" && item.stages) {
      return item.stages.some((s) => hasCategory(s.test?.questionBank?.categories, category));
    }
    return false;
  };

  combined = combined.filter((i) => typeFilter(i) && categoryFilter(i));
  const total = combined.length;
  const paginated = combined.slice(skip, skip + limitNum);

  return {
    items: paginated,
    pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) || 1 },
  };
};

export default {
  getCourses,
  getCourseById,
  initiateCoursePayment,
  createCourseOrder,
  purchaseCourse,
  getMyCourses,
  getCourseContentForDownload,
  getCourseFollowUpTests,
  getTests,
  getTestById,
  initiateTestPayment,
  createTestOrder,
  purchaseTest,
  getTestBundles,
  getTestsAndBundles,
  initiateTestBundlePayment,
  createTestBundleOrder,
  purchaseTestBundle,
  getMyTests,
  getExamHall,
};
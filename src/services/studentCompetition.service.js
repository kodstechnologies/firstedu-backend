import studentCompetitionRepository from "../repository/studentCompetition.repository.js";
import testRepository from "../repository/test.repository.js";
import orderRepository from "../repository/order.repository.js";
import razorpayOrderIntentRepository from "../repository/razorpayOrderIntent.repository.js";
import pointsService from "./points.service.js";
import walletService from "./wallet.service.js";
import couponService from "./coupon.service.js";
import {
  createRazorpayOrder,
  verifyPaymentSignature,
} from "../utils/razorpayUtils.js";
import { getAmountToCharge, attachOfferToList, attachOfferToItem } from "../utils/offerUtils.js";
import { ApiError } from "../utils/ApiError.js";
import CompetitionCategory from "../models/CompetitionCategory.js";
import CompetitionTest from "../models/CompetitionTest.js";
import CompetitionSector from "../models/CompetitionSector.js";
import TestPurchase from "../models/TestPurchase.js";
import ExamSession from "../models/ExamSession.js";

// ==================== STUDENT COMPETITION SECTORS ====================

const getStudentCompetitionSectors = async () => {
  return await studentCompetitionRepository.findAllSectorsWithPopulate();
};

const getCompetitionsBySector = async (sectorId, userId) => {
  const sector = await CompetitionSector.findById(sectorId).lean();
  if (!sector || sector.status !== "Public") {
    throw new ApiError(404, "Competition Sector not found or not public");
  }

  const categories = await CompetitionCategory.find({ sectorId, status: "Public" })
    .populate({
      path: "tests",
      populate: { path: "testId" },
    })
    .sort({ createdAt: -1 })
    .lean();

  // Attach per-student hasPurchase flag via a single bulk query
  let purchasedCategoryIds = new Set();
  if (userId && categories.length > 0) {
    const categoryIds = categories.map(c => c._id);
    const purchases = await TestPurchase.find({
      student: userId,
      competitionCategory: { $in: categoryIds },
      paymentStatus: "completed",
    }).select("competitionCategory").lean();
    purchases.forEach(p => {
      if (p.competitionCategory) {
        purchasedCategoryIds.add(p.competitionCategory.toString());
      }
    });
  }

  const competitionsWithPurchase = categories.map(cat => ({
    ...cat,
    hasPurchase: purchasedCategoryIds.has(cat._id.toString()),
  }));

  const competitionsWithOffers = await attachOfferToList(competitionsWithPurchase, "CompetitionCategory", "price");

  return {
    ...sector,
    competitions: competitionsWithOffers,
  };
};


const getSingleCompetitionWithTests = async (categoryId, userId) => {
  const category = await CompetitionCategory.findOne({ _id: categoryId, status: "Public" })
    .populate({
      path: "tests",
      populate: { path: "testId" }
    })
    .lean();

  if (!category) throw new ApiError(404, "Competition category not found or not public");

  // Filter out unpublished tests
  category.tests = (category.tests || []).filter(entry => entry.testId?.isPublished);

  // If student is logged in, check which tests are purchased and their session status
  if (userId && category.tests.length > 0) {
    const purchasedTests = await orderRepository.findTestPurchases(userId);
    const purchasedTestIds = purchasedTests.map(p => p.test?._id?.toString() || p.test?.toString());
    
    // Check if they own THIS category (bundle)
    const categoryPurchase = await orderRepository.findTestPurchase({
      student: userId,
      competitionCategory: categoryId,
      paymentStatus: "completed"
    });

    category.isPurchased = !!categoryPurchase;

    // Bulk-query ExamSession for all tests in this category (completed, paused, in_progress)
    const rawTestIds = category.tests.map(entry => entry.testId?._id).filter(Boolean);
    const sessions = await ExamSession.find({
      student: userId,
      test: { $in: rawTestIds },
      competitionCategory: categoryId,
      status: { $in: ["completed", "paused", "in_progress"] },
    }).select("_id test status").lean();

    // Build a map: testId string → { sessionId, sessionStatus }
    const sessionMap = {};
    sessions.forEach(s => {
      const key = s.test?.toString();
      if (key && !sessionMap[key]) {
        // Prefer completed > in_progress > paused if multiple exist
        sessionMap[key] = { sessionId: s._id, sessionStatus: s.status };
      }
    });

    category.tests = category.tests.map(entry => {
      const isOwnedThroughCategory = !!categoryPurchase;
      const isOwnedIndividually = purchasedTestIds.includes(entry.testId?._id?.toString());
      const sessionData = sessionMap[entry.testId?._id?.toString()] || {};
      
      return {
        ...entry,
        isPurchased: isOwnedThroughCategory || isOwnedIndividually,
        sessionStatus: sessionData.sessionStatus || null,
        sessionId: sessionData.sessionId || null,
      };
    });
  }

  return await attachOfferToItem(category, "CompetitionCategory", "price");
};


// ==================== COMPETITION TEST PURCHASE ====================

const initiateTestPayment = async (testId, studentId, paymentMethod, options = {}) => {
  const { couponCode } = options;
  const test = await testRepository.findTestById(testId);

  if (!test || !test.isPublished) {
    throw new ApiError(404, "Test not found");
  }
  
  // NOTE: We do NOT check isStandaloneMarketplaceTest(test) here 
  // because this is specifically for competition tests (applicableFor: 'competition')

  const existingPurchase = await orderRepository.findTestPurchase({
    student: studentId,
    test: testId,
    paymentStatus: "completed",
  });
  if (existingPurchase) {
    throw new ApiError(400, "Test already purchased");
  }

  const price = Number(test.price) || 0;

  const { amountToCharge, couponId, appliedOffer, appliedCoupon } = await getAmountToCharge("Test", price, couponCode);

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
    const receipt = `comptest_${testId}_${studentId}_${Date.now()}`.substring(0, 40);
    let order;
    try {
      order = await createRazorpayOrder(amountToCharge, receipt);
    } catch (err) {
      const statusCode = err?.statusCode ?? err?.response?.status;
      const code = err?.error?.code ?? err?.response?.data?.error?.code;
      if (statusCode === 401 || code === "BAD_REQUEST_ERROR") {
        console.error("[Razorpay (Competition)] Authentication failed:", err?.error ?? err?.message ?? err);
        throw new ApiError(500, "Payment gateway authentication failed. Please check Razorpay credentials.");
      }
      console.error("[Razorpay (Competition)] Order create error:", err?.error ?? err?.message ?? err);
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

const purchaseTest = async (
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

// ==================== COMPETITION CATEGORY PURCHASE ====================

const initiateCategoryPayment = async (categoryId, studentId, paymentMethod, options = {}) => {
  const { couponCode } = options;
  const category = await CompetitionCategory.findById(categoryId);

  if (!category || category.status !== "Public") {
    throw new ApiError(404, "Competition category not found or not public");
  }

  const existingPurchase = await orderRepository.findTestPurchase({
    student: studentId,
    competitionCategory: categoryId,
    paymentStatus: "completed",
  });
  if (existingPurchase) {
    throw new ApiError(400, "Category bundle already purchased");
  }

  const price = category.price || 0;

  const { amountToCharge, couponId, appliedOffer, appliedCoupon } = await getAmountToCharge("CompetitionCategory", price, couponCode);

  if (paymentMethod === "free") {
    if (!category.isFree && amountToCharge > 0) {
      throw new ApiError(400, "This category is paid. Use wallet or razorpay.");
    }
    const purchase = await orderRepository.createTestPurchase({
      student: studentId,
      competitionCategory: categoryId,
      purchasePrice: 0,
      paymentId: "free",
      paymentStatus: "completed",
    });
    // Increment purchase counts
    await CompetitionCategory.findByIdAndUpdate(categoryId, { $inc: { purchaseCount: 1 } });
    await CompetitionTest.updateMany({ categoryId }, { $inc: { purchaseCount: 1 } });
    
    return { purchase, completed: true };
  }

  if (paymentMethod === "wallet") {
    await walletService.deductMonetaryBalance(studentId, amountToCharge, "User");
    const purchase = await orderRepository.createTestPurchase({
      student: studentId,
      competitionCategory: categoryId,
      purchasePrice: amountToCharge,
      paymentId: "wallet",
      paymentStatus: "completed",
    });
    if (couponId) {
      await couponService.incrementCouponUsedCount(couponId);
    }
    // Increment purchase counts
    await CompetitionCategory.findByIdAndUpdate(categoryId, { $inc: { purchaseCount: 1 } });
    await CompetitionTest.updateMany({ categoryId }, { $inc: { purchaseCount: 1 } });

    return { purchase, completed: true };
  }

  if (paymentMethod === "razorpay") {
    const receipt = `comp_cat_${categoryId}_${studentId}_${Date.now()}`.substring(0, 40);
    const order = await createRazorpayOrder(amountToCharge, receipt);
    
    await razorpayOrderIntentRepository.create({
      studentId,
      orderId: order.orderId,        // ✅ was order.id (undefined)
      amountPaise: amountToCharge * 100,
      receipt,
      type: "bundle",                // ✅ was "competitionCategory" (invalid enum)
      entityId: categoryId,
      entityModel: "CompetitionCategory", // ✅ was missing (required field)
      couponId,
    });

    return {
      completed: false,
      orderId: order.orderId,
      amount: order.amount,
      currency: order.currency || "INR",
      key: process.env.RAZORPAY_KEY_ID,
      appliedOffer: appliedOffer || undefined,
      appliedCoupon: appliedCoupon || undefined,
      originalPrice: price,
      discountedPrice: amountToCharge,
    };
  }

  throw new ApiError(400, "Unsupported payment method");
};

const purchaseCategory = async (categoryId, studentId, paymentData) => {
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = paymentData;

  const existingPurchase = await orderRepository.findTestPurchase({
    student: studentId,
    competitionCategory: categoryId,
    paymentStatus: "completed",
  });
  if (existingPurchase) {
    throw new ApiError(400, "Category already purchased");
  }

  const isValid = verifyPaymentSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature);
  if (!isValid) throw new ApiError(400, "Payment verification failed");

  const intent = await razorpayOrderIntentRepository.findByOrderId(razorpayOrderId);
  if (!intent || intent.type !== "bundle" || intent.entityId?.toString() !== categoryId.toString()) {
    throw new ApiError(400, "Invalid payment intent for this category");
  }

  const purchasePrice = intent.amountPaise / 100;

  const purchase = await orderRepository.createTestPurchase({
    student: studentId,
    competitionCategory: categoryId,
    purchasePrice,
    paymentId: razorpayPaymentId,
    paymentStatus: "completed",
  });

  await razorpayOrderIntentRepository.markReconciled(razorpayOrderId, razorpayPaymentId);
  if (intent.couponId) {
    await couponService.incrementCouponUsedCount(intent.couponId);
  }

  // Increment purchase counts
  await CompetitionCategory.findByIdAndUpdate(categoryId, { $inc: { purchaseCount: 1 } });
  await CompetitionTest.updateMany({ categoryId }, { $inc: { purchaseCount: 1 } });

  return purchase;
};

export default {
  getStudentCompetitionSectors,
  getCompetitionsBySector,
  getSingleCompetitionWithTests,
  initiateTestPayment,
  purchaseTest,
  initiateCategoryPayment,
  purchaseCategory
};

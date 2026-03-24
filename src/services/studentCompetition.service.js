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
import { getAmountToCharge } from "../utils/offerUtils.js";
import { ApiError } from "../utils/ApiError.js";

// ==================== STUDENT COMPETITION SECTORS ====================

const getStudentCompetitionSectors = async () => {
  return await studentCompetitionRepository.findAllSectorsWithPopulate();
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

  if (paymentMethod === "free") {
    if (price > 0) {
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

  const { amountToCharge, couponId, appliedOffer, appliedCoupon } = await getAmountToCharge("Test", price, couponCode);

  if (paymentMethod === "wallet") {
    if (price < 1) {
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
    if (price < 1) {
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

export default {
  getStudentCompetitionSectors,
  initiateTestPayment,
  purchaseTest
};

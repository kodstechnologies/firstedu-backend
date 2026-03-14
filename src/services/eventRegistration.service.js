import { ApiError } from "../utils/ApiError.js";
import eventRegistrationRepository from "../repository/eventRegistration.repository.js";
import olympiadRepository from "../repository/olympiad.repository.js";
import tournamentRepository from "../repository/tournament.repository.js";
import workshopRepository from "../repository/workshop.repository.js";
import examSessionRepository from "../repository/examSession.repository.js";
import walletService from "./wallet.service.js";
import razorpayOrderIntentRepository from "../repository/razorpayOrderIntent.repository.js";
import { createRazorpayOrder, verifyPaymentSignature } from "../utils/razorpayUtils.js";
import { getAmountToCharge } from "../utils/offerUtils.js";
import couponService from "./coupon.service.js";

const EVENT_MODEL_MAP = {
  olympiad: "Olympiad",
  tournament: "Tournament",
  workshop: "Workshop",
  challenge: "Challenge",
};

const EVENT_TYPE_TO_OFFER_MODULE = {
  olympiad: "Olympiad",
  tournament: "Tournament",
  workshop: "Workshop",
};

export const registerForEvent = async (
  eventType,
  eventId,
  studentId,
  options = {}
) => {
  const {
    paymentStatus = "completed",
    paymentId = null,
    paymentMethod = null,
    razorpayOrderId = null,
    razorpayPaymentId = null,
    razorpaySignature = null,
    couponCode = null,
  } = options;

  // Check if already registered
  const existingRegistration = await eventRegistrationRepository.findOne({
    student: studentId,
    eventType,
    eventId,
  });

  if (existingRegistration) {
    throw new ApiError(400, `Already registered for this ${eventType}`);
  }

  // Validate event exists and get event details
  let event;
  if (eventType === "olympiad") {
    event = await olympiadRepository.findById(eventId);
  } else if (eventType === "tournament") {
    event = await tournamentRepository.findById(eventId);
  } else if (eventType === "workshop") {
    event = await workshopRepository.findById(eventId);
  }

  if (!event || !event.isPublished) {
    throw new ApiError(404, `${eventType} not found`);
  }

  const now = new Date();
  if (
    now < new Date(event.registrationStartTime) ||
    now > new Date(event.registrationEndTime)
  ) {
    throw new ApiError(400, `Registration is not open for this ${eventType}`);
  }

  const registeredCount = await eventRegistrationRepository.count({
    eventType,
    eventId,
    paymentStatus: "completed",
  });
  if (event.maxParticipants && registeredCount >= event.maxParticipants) {
    throw new ApiError(400, "Maximum participants reached");
  }

  const price = Number(event.price) || 0;

  // When event has a price, payment is required before registration
  if (price > 0) {
    const offerModule = EVENT_TYPE_TO_OFFER_MODULE[eventType];
    const { amountToCharge: regAmountToCharge, couponId } = offerModule
      ? await getAmountToCharge(offerModule, price, couponCode)
      : { amountToCharge: price, couponId: null };

    if (paymentMethod === "wallet") {
      await walletService.deductMonetaryBalance(studentId, regAmountToCharge, "User");
      if (couponId) await couponService.incrementCouponUsedCount(couponId);
      return await eventRegistrationRepository.create({
        student: studentId,
        eventType,
        eventId,
        eventModel: EVENT_MODEL_MAP[eventType],
        status: "registered",
        paymentStatus: "completed",
        paymentId: paymentId || "wallet",
        paymentMethod: "wallet",
        amountPaid: regAmountToCharge,
      });
    }
    if (paymentMethod === "gateway") {
      if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
        throw new ApiError(
          400,
          "For gateway payment, razorpayOrderId, razorpayPaymentId and razorpaySignature are required."
        );
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
      const eventIdStr = eventId?.toString?.() ?? String(eventId);
      if (intent.studentId?.toString?.() !== studentIdStr) {
        throw new ApiError(403, "This payment was made by a different user");
      }
      if (intent.type !== eventType || intent.entityId?.toString?.() !== eventIdStr) {
        throw new ApiError(400, "Payment does not match this event");
      }
      // Intent amount may be discounted (offer applied); signature verification confirms payment
      const created = await eventRegistrationRepository.create({
        student: studentId,
        eventType,
        eventId,
        eventModel: EVENT_MODEL_MAP[eventType],
        status: "registered",
        paymentStatus: "completed",
        paymentId: razorpayPaymentId,
        paymentMethod: "razorpay",
        amountPaid: intent.amountPaise / 100,
      });
      await razorpayOrderIntentRepository.markReconciled(razorpayOrderId, razorpayPaymentId);
      if (intent.couponId) await couponService.incrementCouponUsedCount(intent.couponId);
      return created;
    }
    throw new ApiError(
      400,
      "Payment required. Use initiate-payment endpoint to pay via gateway (then send razorpayOrderId, razorpayPaymentId, razorpaySignature, paymentMethod: 'gateway'), or send paymentMethod: 'wallet' to pay with wallet balance."
    );
  }

  return await eventRegistrationRepository.create({
    student: studentId,
    eventType,
    eventId,
    eventModel: EVENT_MODEL_MAP[eventType],
    status: "registered",
    paymentStatus: "completed",
    paymentId: paymentId || undefined,
    paymentMethod: paymentMethod === "wallet" ? "wallet" : "free",
    amountPaid: 0,
  });
};

export const getRegistrations = async (options = {}) => {
  const { studentId, eventType, eventId, status } = options;

  const query = {};
  if (studentId) query.student = studentId;
  if (eventType) query.eventType = eventType;
  if (eventId) query.eventId = eventId;
  if (status) query.status = status;

  return await eventRegistrationRepository.find(query, {
    populate: [
      { path: "eventId", select: "title startTime endTime" },
      { path: "student", select: "name email" },
    ],
    sort: { registeredAt: -1 },
  });
};

export const getRegistrationById = async (id) => {
  return await eventRegistrationRepository.findById(id, [
    { path: "eventId", select: "title startTime endTime" },
    { path: "student", select: "name email" },
  ]);
};

export const getRegistrationByEvent = async (eventType, eventId, studentId) => {
  return await eventRegistrationRepository.findOne(
    {
      student: studentId,
      eventType,
      eventId,
    },
    [
      { path: "eventId", select: "title startTime endTime" },
    ]
  );
};

export const getMyEventsDashboard = async (studentId) => {
  const registrations = await eventRegistrationRepository.find(
    { student: studentId },
    {
      populate: [
        { path: "eventId", select: "title startTime endTime" },
      ],
      sort: { registeredAt: -1 },
    }
  );

  const now = new Date();
  const upcoming = [];
  const live = [];
  const past = [];

  for (const reg of registrations) {
    const event = reg.eventId;
    if (!event) continue;

    const startTime = new Date(event.startTime);
    const endTime = new Date(event.endTime);

    if (now < startTime) {
      upcoming.push(reg);
    } else if (now >= startTime && now <= endTime) {
      live.push(reg);
    } else {
      past.push(reg);
    }
  }

  return {
    upcoming,
    live,
    past,
  };
};

export const getTournamentProgress = async (tournamentId, studentId) => {
  const tournament = await tournamentRepository.findById(tournamentId, [
    { path: "stages.test", select: "title durationMinutes questionBank" },
  ]);

  if (!tournament) {
    throw new ApiError(404, "Tournament not found");
  }

  const registration = await eventRegistrationRepository.findOne({
    student: studentId,
    eventType: "tournament",
    eventId: tournamentId,
  });

  if (!registration) {
    return { qualifiedStages: [], currentStage: null };
  }

  const now = new Date();
  let currentStage = null;
  let qualifiedStages = [];

  // Check which stages student has qualified for
  for (const stage of tournament.stages) {
    const stageSession = await examSessionRepository.findOne({
      student: studentId,
      test: stage.test._id,
      status: "completed",
    });

    if (stageSession) {
      const score = stageSession.score || 0;
      if (score >= (stage.minimumMarksToQualify || 0)) {
        qualifiedStages.push(stage._id.toString());
      }
    }

    // Check if this is the current active stage
    if (
      now >= new Date(stage.startTime) &&
      now <= new Date(stage.endTime) &&
      qualifiedStages.includes(stage._id.toString())
    ) {
      currentStage = stage;
    }
  }

  return { qualifiedStages, currentStage };
};

export const updateRegistration = async (id, updateData) => {
  const registration = await eventRegistrationRepository.findById(id);
  if (!registration) {
    throw new ApiError(404, "Registration not found");
  }

  return await eventRegistrationRepository.updateById(id, updateData);
};

const EVENT_TYPE_TO_MODEL = {
  olympiad: "Olympiad",
  tournament: "Tournament",
  workshop: "Workshop",
};

/**
 * Initiate event registration. Handles free, wallet, and razorpay.
 * - free: completes registration immediately (only if event price is 0)
 * - wallet: deducts balance and completes registration immediately
 * - razorpay: creates order, returns order details; registration completed via register API after payment
 */
export const initiateEventRegistration = async (
  eventType,
  eventId,
  studentId,
  paymentMethod,
  options = {}
) => {
  const { couponCode } = options;
  const existing = await eventRegistrationRepository.findOne({
    student: studentId,
    eventType,
    eventId,
  });
  if (existing) {
    throw new ApiError(400, `Already registered for this ${eventType}`);
  }

  let event;
  if (eventType === "olympiad") {
    event = await olympiadRepository.findById(eventId);
  } else if (eventType === "tournament") {
    event = await tournamentRepository.findById(eventId);
  } else if (eventType === "workshop") {
    event = await workshopRepository.findById(eventId);
  } else {
    throw new ApiError(400, "Invalid event type");
  }

  if (!event || !event.isPublished) {
    throw new ApiError(404, `${eventType} not found`);
  }

  const now = new Date();
  if (now < new Date(event.registrationStartTime) || now > new Date(event.registrationEndTime)) {
    throw new ApiError(400, "Registration is not open for this event");
  }

  const registeredCount = await eventRegistrationRepository.count({
    eventType,
    eventId,
    paymentStatus: "completed",
  });
  if (event.maxParticipants && registeredCount >= event.maxParticipants) {
    throw new ApiError(400, "Maximum participants reached");
  }

  const price = Number(event.price) || 0;
  const offerModule = EVENT_TYPE_TO_OFFER_MODULE[eventType];
  const { amountToCharge, couponId, appliedOffer, appliedCoupon } = offerModule
    ? await getAmountToCharge(offerModule, price, couponCode)
    : { amountToCharge: price, couponId: null, appliedOffer: null, appliedCoupon: null };

  if (paymentMethod === "free") {
    if (price > 0) {
      throw new ApiError(400, "This event is paid. Use paymentMethod: wallet or razorpay.");
    }
    const registration = await registerForEvent(eventType, eventId, studentId, {});
    return { registration, completed: true };
  }

  if (paymentMethod === "wallet") {
    const registration = await registerForEvent(eventType, eventId, studentId, {
      paymentMethod: "wallet",
      couponCode,
    });
    return { registration, completed: true };
  }

  if (paymentMethod === "razorpay") {
    if (price < 1) {
      throw new ApiError(400, "This event is free. Use paymentMethod: free.");
    }
    const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
    const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!razorpayKeyId || !razorpayKeySecret) {
      throw new ApiError(500, "Payment gateway not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env");
    }
    const receipt = `${eventType}_${eventId}_${studentId}_${Date.now()}`.substring(0, 40);
    let order;
    try {
      order = await createRazorpayOrder(amountToCharge, receipt);
    } catch (err) {
      const statusCode = err?.statusCode ?? err?.response?.status;
      const code = err?.error?.code ?? err?.response?.data?.error?.code;
      if (statusCode === 401 || code === "BAD_REQUEST_ERROR") {
        console.error("[Razorpay] Authentication failed. Check RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET:", err?.error ?? err?.message ?? err);
        throw new ApiError(500, "Payment gateway authentication failed. Please check Razorpay credentials in server .env (RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET).");
      }
      console.error("[Razorpay] Order create error:", err?.error ?? err?.message ?? err);
      throw new ApiError(500, "Payment gateway error. Please try again later.");
    }

    await razorpayOrderIntentRepository.create({
      orderId: order.orderId,
      studentId,
      type: eventType,
      entityId: eventId,
      entityModel: EVENT_TYPE_TO_MODEL[eventType],
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
      eventType,
      eventId,
      eventTitle: event.title,
      appliedOffer: appliedOffer || undefined,
      appliedCoupon: appliedCoupon || undefined,
      originalPrice: price,
      discountedPrice: amountToCharge,
    };
  }

  throw new ApiError(400, "Invalid paymentMethod. Use: free, wallet, or razorpay.");
};

/** @deprecated Use initiateEventRegistration with paymentMethod: 'razorpay' */
export const initiateEventPayment = async (eventType, eventId, studentId) => {
  return initiateEventRegistration(eventType, eventId, studentId, "razorpay");
};

export default {
  registerForEvent,
  getRegistrations,
  getRegistrationById,
  getRegistrationByEvent,
  getMyEventsDashboard,
  getTournamentProgress,
  updateRegistration,
  initiateEventPayment,
  initiateEventRegistration,
};


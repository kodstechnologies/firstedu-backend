import { ApiError } from "../utils/ApiError.js";
import OlympiadTest from "../models/OlympiadTest.js";
import Test from "../models/Test.js";
import EventRegistration from "../models/EventRegistration.js";
import razorpayOrderIntentRepository from "../repository/razorpayOrderIntent.repository.js";
import { createRazorpayOrder, verifyPaymentSignature } from "../utils/razorpayUtils.js";
import walletService from "./wallet.service.js";
import studentRepository from "../repository/student.repository.js";
import { sendEventRegistrationEmail } from "../utils/sendEmail.js";
import { attachOfferToList, attachOfferToItem, getAmountToCharge } from "../utils/offerUtils.js";

const VALID_STATUSES = ["upcoming", "open", "live", "completed", "past"];

const buildStatusQuery = (status) => {
  const now = new Date();
  switch (status) {
    case "upcoming":
      return { registrationStartTime: { $gt: now } };
    case "open":
      return {
        registrationStartTime: { $lte: now },
        registrationEndTime: { $gte: now },
      };
    case "live":
      return {
        startTime: { $lte: now },
        endTime: { $gte: now },
      };
    case "completed":
    case "past":
      return { endTime: { $lt: now } };
    default:
      return null;
  }
};

export const getOlympiads = async (options = {}) => {
  const { page = 1, limit = 10, search, status, categoryId, studentId } = options;

  let query = {};
  
  if (categoryId) query.categoryId = categoryId;

  if (search) {
    query.$or = [
      { title: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
    ];
  }

  const normalizedStatus = typeof status === "string" ? status.trim().toLowerCase() : null;
  if (normalizedStatus && VALID_STATUSES.includes(normalizedStatus)) {
    const statusQuery = buildStatusQuery(normalizedStatus);
    if (statusQuery) Object.assign(query, statusQuery);
  }

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const skip = (pageNum - 1) * limitNum;

  const [olympiads, total] = await Promise.all([
    OlympiadTest.find(query)
      .populate({
        path: "testId",
        select: "price durationMinutes imageUrl title",
        match: { isPublished: true },
      })
      .populate({
        path: "categoryId",
        select: "name parent",
        populate: { path: "parent", select: "name" }
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    OlympiadTest.countDocuments(query),
  ]);

  // Filter out any olympiad whose test is not published
  const filtered = olympiads.filter((o) => o.testId !== null);

  let registeredEventIds = new Set();
  if (studentId) {
    const registrations = await EventRegistration.find({
      student: studentId,
      eventType: "olympiad",
      eventId: { $in: filtered.map((o) => o._id) }
    }).select("eventId").lean();
    registeredEventIds = new Set(registrations.map((r) => r.eventId.toString()));
  }

  const now = Date.now();
  const transformed = filtered.map(o => {
    let currentStatus = "closed";
    if (o.registrationStartTime && now < new Date(o.registrationStartTime).getTime()) currentStatus = "upcoming";
    else if (o.registrationStartTime && o.registrationEndTime && now >= new Date(o.registrationStartTime).getTime() && now <= new Date(o.registrationEndTime).getTime()) currentStatus = "open";
    else if (o.startTime && o.endTime && now >= new Date(o.startTime).getTime() && now <= new Date(o.endTime).getTime()) currentStatus = "live";
    else if (o.endTime && now > new Date(o.endTime).getTime()) currentStatus = "completed";

    let categoryName = o.categoryId?.name || "";
    if (o.categoryId?.parent?.name) {
      categoryName = `${o.categoryId.parent.name} > ${o.categoryId.name}`;
    }

    return {
      ...o,
      price: o.testId?.price || 0,
      originalPrice: o.testId?.price || 0,
      status: currentStatus,
      isRegistrationOpen: currentStatus === "open",
      categoryName,
      isRegistered: registeredEventIds.has(o._id.toString()),
    };
  });

  const finalItems = await attachOfferToList(transformed, "Olympiads", "price");

  return {
    olympiads: finalItems,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum),
    },
  };
};

export const getOlympiadById = async (id, studentId = null) => {
  const olympiad = await OlympiadTest.findById(id)
    .populate("testId", "price durationMinutes imageUrl title description isPublished")
    .populate({
      path: "categoryId",
      select: "name parent",
      populate: { path: "parent", select: "name" }
    })
    .lean();

  if (!olympiad || !olympiad.testId || !olympiad.testId.isPublished) {
    throw new ApiError(404, "Olympiad not found or not published");
  }

  let isRegistered = false;
  if (studentId) {
    const existing = await EventRegistration.findOne({
      student: studentId,
      eventType: "olympiad",
      eventId: id,
    });
    isRegistered = !!existing;
  }

  const now = Date.now();
  let currentStatus = "closed";
  if (olympiad.registrationStartTime && now < new Date(olympiad.registrationStartTime).getTime()) currentStatus = "upcoming";
  else if (olympiad.registrationStartTime && olympiad.registrationEndTime && now >= new Date(olympiad.registrationStartTime).getTime() && now <= new Date(olympiad.registrationEndTime).getTime()) currentStatus = "open";
  else if (olympiad.startTime && olympiad.endTime && now >= new Date(olympiad.startTime).getTime() && now <= new Date(olympiad.endTime).getTime()) currentStatus = "live";
  else if (olympiad.endTime && now > new Date(olympiad.endTime).getTime()) currentStatus = "completed";

  let categoryName = olympiad.categoryId?.name || "";
  if (olympiad.categoryId?.parent?.name) {
    categoryName = `${olympiad.categoryId.parent.name} > ${olympiad.categoryId.name}`;
  }

  const transformed = {
    ...olympiad,
    price: olympiad.testId?.price || 0,
    originalPrice: olympiad.testId?.price || 0,
    status: currentStatus,
    isRegistrationOpen: currentStatus === "open",
    categoryName,
    isRegistered,
  };

  const finalItem = await attachOfferToItem(transformed, "Olympiads", "price");
  return finalItem;
};

export const initiateOlympiadRegistration = async (id, studentId, options) => {
  const { paymentMethod, couponCode } = options;
  const olympiad = await OlympiadTest.findById(id).populate("testId");
  if (!olympiad || !olympiad.testId) {
    throw new ApiError(404, "Olympiad not found");
  }

  const now = new Date();
  if (now < new Date(olympiad.registrationStartTime) || now > new Date(olympiad.registrationEndTime)) {
    throw new ApiError(400, "Registration is not active at this time");
  }

  const existing = await EventRegistration.findOne({
    student: studentId,
    eventType: "olympiad",
    eventId: id,
  });

  if (existing) {
    throw new ApiError(400, "Already registered for this Olympiad");
  }

  const basePrice = Number(olympiad.testId.price) || 0;
  
  const { amountToCharge, couponId, appliedOffer, appliedCoupon } = await getAmountToCharge("Olympiads", basePrice, couponCode);

  if (amountToCharge <= 0) {
    if (paymentMethod !== "free") throw new ApiError(400, "This olympiad is free with current offers/coupons. Use method 'free'");
    // Automatically complete registration
    const reg = await EventRegistration.create({
      student: studentId,
      eventType: "olympiad",
      eventId: id,
      eventModel: "Olympiad",
      status: "registered",
      paymentStatus: "completed",
      paymentMethod: "free",
      amountPaid: 0,
      appliedOffer: appliedOffer || undefined,
      appliedCoupon: appliedCoupon || undefined,
    });
    
    // Increment purchase count
    await OlympiadTest.findByIdAndUpdate(id, { $inc: { purchaseCount: 1 } });
    
    return { completed: true, registration: reg };
  }

  if (paymentMethod === "wallet") {
    await walletService.deductMonetaryBalance(studentId, amountToCharge, "User");
    const reg = await EventRegistration.create({
      student: studentId,
      eventType: "olympiad",
      eventId: id,
      eventModel: "Olympiad",
      status: "registered",
      paymentStatus: "completed",
      paymentId: "wallet",
      paymentMethod: "wallet",
      amountPaid: amountToCharge,
      appliedOffer: appliedOffer || undefined,
      appliedCoupon: appliedCoupon || undefined,
    });
    
    await OlympiadTest.findByIdAndUpdate(id, { $inc: { purchaseCount: 1 } });
    return { completed: true, registration: reg };
  }

  if (paymentMethod === "razorpay") {
    const receipt = `olympiad_${id}_${studentId}_${Date.now()}`.substring(0, 40);
    const order = await createRazorpayOrder(amountToCharge, receipt);

    await razorpayOrderIntentRepository.create({
      orderId: order.orderId,
      studentId,
      type: "Olympiads",
      entityId: id,
      entityModel: "Olympiad",
      amountPaise: order.amount,
      currency: order.currency || "INR",
      receipt,
      metadata: { appliedOffer, appliedCoupon }
    });

    return {
      completed: false,
      orderId: order.orderId,
      amount: order.amount,
      currency: order.currency,
      key: process.env.RAZORPAY_KEY_ID,
      eventType: "olympiad",
      eventId: id, 
      eventTitle: olympiad.title,
      originalPrice: basePrice,
      discountedPrice: amountToCharge,
    };
  }

  throw new ApiError(400, "Invalid paymentMethod. Use: free, wallet, or razorpay.");
};

export const completeOlympiadRegistration = async (id, studentId, paymentData) => {
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = paymentData;
  const olympiad = await OlympiadTest.findById(id).populate("testId");
  if (!olympiad || !olympiad.testId) throw new ApiError(404, "Olympiad not found");

  const isValid = verifyPaymentSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature);
  if (!isValid) throw new ApiError(400, "Payment verification failed");

  const intent = await razorpayOrderIntentRepository.findByOrderId(razorpayOrderId);
  if (!intent) throw new ApiError(400, "Invalid order or payment already used");
  if (intent.studentId?.toString() !== studentId.toString()) throw new ApiError(403, "Payment made by a different user");
  if (intent.type !== "Olympiads" || intent.entityId?.toString() !== id.toString()) throw new ApiError(400, "Payment does not match this olympiad");

  const reg = await EventRegistration.create({
    student: studentId,
    eventType: "olympiad",
    eventId: id,
    eventModel: "Olympiad",
    status: "registered",
    paymentStatus: "completed",
    paymentId: razorpayPaymentId,
    paymentMethod: "razorpay",
    amountPaid: intent.amountPaise / 100,
    appliedOffer: intent.metadata?.appliedOffer || undefined,
    appliedCoupon: intent.metadata?.appliedCoupon || undefined,
  });

  await razorpayOrderIntentRepository.markReconciled(razorpayOrderId, razorpayPaymentId);
  await OlympiadTest.findByIdAndUpdate(id, { $inc: { purchaseCount: 1 } });

  (async () => {
    try {
      const student = await studentRepository.findById(studentId);
      if (student) await sendEventRegistrationEmail("olympiad", student.email, student.name, olympiad.title, intent.amountPaise / 100, new Date());
    } catch (err) {
      console.error("Error sending olympiad registration email:", err);
    }
  })();

  return reg;
};

export const getMyOlympiads = async (studentId) => {
  const registrations = await EventRegistration.find({
    student: studentId,
    eventType: "olympiad",
    paymentStatus: "completed",
  })
    .populate({
      path: "eventId",
      populate: [
        { path: "testId", select: "durationMinutes price" },
        { path: "categoryId", select: "name" }
      ]
    })
    .sort({ registeredAt: -1 })
    .lean();

  const now = Date.now();
  const upcoming = [];
  const live = [];
  const past = [];

  for (const reg of registrations) {
    if (!reg.eventId) continue;
    
    // We append session states logic if needed, simplify for now
    const o = reg.eventId;
    let currentStatus = "closed";
    if (o.startTime && now < new Date(o.startTime).getTime()) {
        currentStatus = "upcoming";
        upcoming.push(reg);
    }
    else if (o.startTime && o.endTime && now >= new Date(o.startTime).getTime() && now <= new Date(o.endTime).getTime()) {
        currentStatus = "live";
        live.push(reg);
    }
    else {
        currentStatus = "completed";
        past.push(reg);
    }
    reg.eventId.computedStatus = currentStatus;
  }

  return { upcoming, live, past };
};

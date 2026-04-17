import RazorpayWebhookEvent from "../models/RazorpayWebhookEvent.js";
import { verifyWebhookSignature } from "../utils/razorpayUtils.js";
import razorpayOrderIntentRepository from "../repository/razorpayOrderIntent.repository.js";
import orderRepository from "../repository/order.repository.js";
import courseRepository from "../repository/course.repository.js";
import testRepository from "../repository/test.repository.js";
import pointsService from "./points.service.js";
import eventRegistrationRepository from "../repository/eventRegistration.repository.js";
import walletService from "./wallet.service.js";
import categoryPurchaseService from "./categoryPurchase.service.js";

const LOG_PREFIX = "[Razorpay Webhook]";

function parsePayload(rawBody) {
  if (typeof rawBody === "string") return JSON.parse(rawBody);
  return JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : String(rawBody));
}

function extractPaymentDetails(payload) {
  const event = payload.event || "";
  const payment =
    payload.payload?.payment?.entity ?? payload.payload?.payment ?? {};
  const orderId = payment.order_id || null;
  const paymentId = payment.id || null;
  const amount = payment.amount != null ? payment.amount : null;
  const currency = payment.currency || null;
  const status = payment.status || null;
  return {
    eventId: payload.id || null,
    event,
    entity: payload.entity || "event",
    paymentId,
    orderId,
    amount,
    currency,
    status,
    errorCode: payment.error_code || null,
    errorDescription: payment.error_description || null,
    errorReason: payment.error_reason || null,
    errorSource: payment.error_source || null,
    errorStep: payment.error_step || null,
    method: payment.method || null,
    receipt: payment.receipt || null,
    payload,
  };
}

async function persistEvent(details) {
  const eventId = details.eventId || `evt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  await RazorpayWebhookEvent.create({
    eventId,
    ...details,
  });
}

async function reconcilePaymentCaptured(orderId, paymentId, amountPaise) {
  const intent = await razorpayOrderIntentRepository.findByOrderId(orderId);
  if (!intent) return { reconciled: false, reason: "no_intent" };
  if (intent.amountPaise !== amountPaise) {
    console.warn(
      `${LOG_PREFIX} amount mismatch orderId=${orderId} intent=${intent.amountPaise} payload=${amountPaise}`
    );
    return { reconciled: false, reason: "amount_mismatch" };
  }

  const studentId = intent.studentId;
  const entityId = intent.entityId;
  const type = intent.type;

  if (type === "course") {
    const existing = await orderRepository.findCoursePurchase({
      student: studentId,
      course: entityId,
      paymentStatus: "completed",
    });
    if (existing) {
      await razorpayOrderIntentRepository.markReconciled(orderId, paymentId);
      return { reconciled: true, reason: "already_purchased" };
    }
    const course = await courseRepository.findById(entityId);
    if (!course || !course.isPublished) {
      return { reconciled: false, reason: "course_not_found" };
    }
    await orderRepository.createCoursePurchase({
      student: studentId,
      course: entityId,
      purchasePrice: course.price,
      paymentId,
      paymentStatus: "completed",
    });
    try {
      await pointsService.awardCoursePurchasePoints(
        studentId,
        entityId,
        course.title || "Course"
      );
    } catch (e) {
      console.error(`${LOG_PREFIX} points award failed:`, e.message);
    }
  } else if (type === "test") {
    const existing = await orderRepository.findTestPurchase({
      student: studentId,
      test: entityId,
      paymentStatus: "completed",
    });
    if (existing) {
      await razorpayOrderIntentRepository.markReconciled(orderId, paymentId);
      return { reconciled: true, reason: "already_purchased" };
    }
    const test = await testRepository.findTestById(entityId);
    if (!test || !test.isPublished) {
      return { reconciled: false, reason: "test_not_found" };
    }
    await orderRepository.createTestPurchase({
      student: studentId,
      test: entityId,
      purchasePrice: test.price,
      paymentId,
      paymentStatus: "completed",
    });
  } else if (type === "bundle") {
    const existing = await orderRepository.findTestPurchase({
      student: studentId,
      testBundle: entityId,
      paymentStatus: "completed",
    });
    if (existing) {
      await razorpayOrderIntentRepository.markReconciled(orderId, paymentId);
      return { reconciled: true, reason: "already_purchased" };
    }
    const bundle = await testRepository.findBundleById(entityId);
    if (!bundle || !bundle.isActive) {
      return { reconciled: false, reason: "bundle_not_found" };
    }
    await orderRepository.createTestPurchase({
      student: studentId,
      testBundle: entityId,
      purchasePrice: bundle.price,
      paymentId,
      paymentStatus: "completed",
    });
  } else if (type === "tournament" || type === "workshop") {
    const existing = await eventRegistrationRepository.findOne({
      student: studentId,
      eventType: type,
      eventId: entityId,
    });
    if (existing) {
      await razorpayOrderIntentRepository.markReconciled(orderId, paymentId);
      return { reconciled: true, reason: "already_registered" };
    }
    const entityModel = type === "tournament" ? "Tournament" : "Workshop";
    await eventRegistrationRepository.create({
      student: studentId,
      eventType: type,
      eventId: entityId,
      eventModel: entityModel,
      status: "registered",
      paymentStatus: "completed",
      paymentId,
    });
  } else if (type === "wallet") {
    const amountRupees = Math.round(amountPaise / 100);
    await walletService.addMonetaryBalance(studentId, amountRupees, paymentId, "User");
  } else if (type === "categoryNode" || ["Olympiads", "School", "Competitive", "Skill Development"].includes(type)) {
    try {
      const purchaseResult = await categoryPurchaseService.reconcileWebhookPurchase(entityId, studentId, {
        amountPaise,
        paymentId,
        couponId: intent.couponId
      });
      if (purchaseResult.reconciled) {
        await razorpayOrderIntentRepository.markReconciled(orderId, paymentId);
        return { reconciled: true, reason: purchaseResult.reason };
      }
    } catch (e) {
      console.error(`${LOG_PREFIX} categoryPurchase error:`, e.message);
      return { reconciled: false, reason: "category_purchase_failed" };
    }
  } else {
    return { reconciled: false, reason: "unknown_type" };
  }

  await razorpayOrderIntentRepository.markReconciled(orderId, paymentId);
  return { reconciled: true, reason: "created", type };
}

/**
 * Process Razorpay webhook: verify signature, persist event, optionally reconcile.
 * Returns { ok, invalidSignature, invalidBody, duplicate, reconciled? }.
 */
export async function processRazorpayWebhook(rawBody, signature, eventIdHeader) {
  if (!signature || (Buffer.isBuffer(rawBody) && rawBody.length === 0)) {
    return { ok: false, invalidBody: true };
  }

  if (!verifyWebhookSignature(rawBody, signature)) {
    return { ok: false, invalidSignature: true };
  }

  let payload;
  try {
    payload = parsePayload(rawBody);
  } catch (e) {
    console.error(`${LOG_PREFIX} Invalid JSON:`, e.message);
    return { ok: false, invalidBody: true };
  }

  const eventId = eventIdHeader || payload.id || payload.event_id || `evt_${Date.now()}`;
  const existing = await RazorpayWebhookEvent.findOne({ eventId });
  if (existing) {
    return { ok: true, duplicate: true };
  }

  const details = extractPaymentDetails(payload);
  await persistEvent(details);

  if (details.event === "payment.failed") {
    console.warn(
      `${LOG_PREFIX} payment.failed paymentId=${details.paymentId} orderId=${details.orderId} error=${details.errorDescription || details.errorReason}`
    );
  }

  let reconciled = null;
  if (details.event === "payment.captured" && details.orderId && details.paymentId) {
    try {
      reconciled = await reconcilePaymentCaptured(
        details.orderId,
        details.paymentId,
        details.amount
      );
      if (reconciled?.reconciled && reconciled.reason === "created") {
        console.info(
          `${LOG_PREFIX} reconciled orderId=${details.orderId} type=${reconciled.type ?? "?"}`
        );
      }
    } catch (e) {
      console.error(`${LOG_PREFIX} reconcile error:`, e.message);
      reconciled = { reconciled: false, reason: "error", error: e.message };
    }
  }

  return {
    ok: true,
    duplicate: false,
    reconciled: reconciled?.reconciled ?? undefined,
    reconcileReason: reconciled?.reason,
  };
}

export default { processRazorpayWebhook };

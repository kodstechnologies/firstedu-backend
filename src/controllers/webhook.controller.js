import razorpayWebhookService from "../services/razorpayWebhook.service.js";

/**
 * Razorpay webhook endpoint.
 * - Must receive raw body (use express.raw middleware on this route).
 * - Verifies X-Razorpay-Signature, persists event, reconciles payment.captured.
 * - Returns 200 quickly so Razorpay does not retry; 4xx/5xx only on bad request or server error.
 */
export async function handleRazorpayWebhook(req, res) {
  if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
    return res.status(503).json({
      success: false,
      message: "Webhook not configured",
    });
  }

  const signature = req.headers["x-razorpay-signature"];
  const eventId = req.headers["x-razorpay-event-id"];
  const rawBody = req.body;

  if (!signature) {
    return res.status(400).json({
      success: false,
      message: "Missing X-Razorpay-Signature header",
    });
  }

  if (!rawBody || (Buffer.isBuffer(rawBody) && rawBody.length === 0)) {
    return res.status(400).json({
      success: false,
      message: "Empty body",
    });
  }

  let result;
  try {
    result = await razorpayWebhookService.processRazorpayWebhook(
      rawBody,
      signature,
      eventId
    );
  } catch (err) {
    console.error("[Razorpay Webhook] Processing error:", err);
    return res.status(500).json({
      success: false,
      message: "Webhook processing failed",
    });
  }

  if (result.invalidSignature) {
    return res.status(403).json({
      success: false,
      message: "Invalid signature",
    });
  }

  if (result.invalidBody) {
    return res.status(400).json({
      success: false,
      message: "Invalid payload",
    });
  }

  return res.status(200).json({
    success: true,
    message: "Webhook received",
    duplicate: result.duplicate ?? false,
    reconciled: result.reconciled,
  });
}

export default { handleRazorpayWebhook };

import crypto from "crypto";
import dotenv from "dotenv";
import razorpayInstance from "../config/razorpay.js";

dotenv.config();

const getRazorpaySecret = () => {
  const razorpaySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!razorpaySecret) {
    throw new Error("RAZORPAY_KEY_SECRET is not configured");
  }
  return razorpaySecret;
};

/**
 * Create a Razorpay order for checkout
 * @param {number} amountInRupees - Amount in INR (will be converted to paise)
 * @param {string} receipt - Unique receipt id for your reference (max 40 chars)
 * @param {string} [currency="INR"]
 * @returns {Promise<{ orderId: string, amount: number, currency: string }>}
 */
export const createRazorpayOrder = async (
  amountInRupees,
  receipt,
  currency = "INR"
) => {
  const amountPaise = Math.round(amountInRupees * 100);
  if (amountPaise < 100) {
    throw new Error("Amount must be at least INR 1.00");
  }
  const order = await razorpayInstance.orders.create({
    amount: amountPaise,
    currency,
    receipt: receipt.substring(0, 40),
  });
  return {
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
  };
};

/**
 * Verify Razorpay payment signature for orders
 * @param {string} orderId - Razorpay order ID
 * @param {string} paymentId - Razorpay payment ID
 * @param {string} signature - Razorpay signature
 * @returns {boolean} - True if signature is valid
 */
export const verifyPaymentSignature = (orderId, paymentId, signature) => {
  try {
    const razorpaySecret = getRazorpaySecret();

    // Create the expected signature
    const payload = `${orderId}|${paymentId}`;
    const expectedSignature = crypto
      .createHmac("sha256", razorpaySecret)
      .update(payload)
      .digest("hex");

    // Compare signatures using constant-time comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    console.error("Error verifying payment signature:", error);
    return false;
  }
};

/** Webhook secret (from Razorpay Dashboard > Webhooks), different from API key secret */
const getWebhookSecret = () => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("RAZORPAY_WEBHOOK_SECRET is not configured");
  }
  return secret;
};

/**
 * Verify Razorpay webhook signature (HMAC SHA256 of raw body).
 * Uses constant-time comparison; safe against invalid/missing signature.
 * @param {Buffer|string} rawBody - Raw request body (must not be parsed before verification)
 * @param {string} signature - X-Razorpay-Signature header value
 * @returns {boolean} - True if signature is valid
 */
export const verifyWebhookSignature = (rawBody, signature) => {
  try {
    const secret = getWebhookSecret();
    const body =
      Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), "utf8");
    const expected = crypto
      .createHmac("sha256", secret)
      .update(body)
      .digest("hex");
    const received = String(signature || "");
    if (received.length !== expected.length) {
      return false;
    }
    return crypto.timingSafeEqual(
      Buffer.from(received, "utf8"),
      Buffer.from(expected, "utf8")
    );
  } catch (error) {
    console.error("[Razorpay Webhook] Signature verification error:", error.message);
    return false;
  }
};
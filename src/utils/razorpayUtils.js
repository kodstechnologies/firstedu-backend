import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

const getRazorpaySecret = () => {
  const razorpaySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!razorpaySecret) {
    throw new Error("RAZORPAY_KEY_SECRET is not configured");
  }
  return razorpaySecret;
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
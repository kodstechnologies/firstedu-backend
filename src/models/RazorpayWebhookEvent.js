import mongoose from "mongoose";

const razorpayWebhookEventSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    event: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    entity: {
      type: String,
      trim: true,
    },
    paymentId: { type: String, trim: true, index: true },
    orderId: { type: String, trim: true, index: true },
    amount: { type: Number },
    currency: { type: String, trim: true },
    status: { type: String, trim: true, index: true },
    errorCode: { type: String, trim: true },
    errorDescription: { type: String, trim: true },
    errorReason: { type: String, trim: true },
    errorSource: { type: String, trim: true },
    errorStep: { type: String, trim: true },
    method: { type: String, trim: true },
    receipt: { type: String, trim: true },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    processedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

razorpayWebhookEventSchema.index({ createdAt: -1 });
razorpayWebhookEventSchema.index({ event: 1, status: 1 });

export default mongoose.models.RazorpayWebhookEvent ||
  mongoose.model("RazorpayWebhookEvent", razorpayWebhookEventSchema);

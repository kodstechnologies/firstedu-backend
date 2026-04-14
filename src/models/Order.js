import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      required: true,
      unique: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    items: [
      {
        itemType: {
          type: String,
          enum: ["course","Olympiads", "test", "testBundle", "merchandise",  "School","Competitive","Skill Development",],
          required: true,
        },
        itemId: {
          type: mongoose.Schema.Types.ObjectId,
          required: true,
        },
        itemName: {
          type: String,
          required: true,
        },
        quantity: {
          type: Number,
          default: 1,
          min: 1,
        },
        price: {
          type: Number,
          required: true,
          min: 0,
        },
      },
    ],
    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
    discount: {
      type: Number,
      default: 0,
      min: 0,
    },
    coupon: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Coupon",
    },
    total: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentMethod: {
      type: String,
      enum: ["wallet", "gateway", "points"],
      required: true,
    },
    paymentId: {
      type: String,
      trim: true,
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "completed", "failed", "refunded"],
      default: "pending",
    },
    orderStatus: {
      type: String,
      enum: ["pending", "confirmed", "processing", "completed", "cancelled"],
      default: "pending",
    },
    pointsEarned: {
      type: Number,
      default: 0,
      min: 0,
    },
    pointsUsed: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Index for querying orders
orderSchema.index({ student: 1, createdAt: -1 });
// orderNumber already has unique: true which creates an index automatically
orderSchema.index({ paymentStatus: 1, orderStatus: 1 });

// Generate order number before save
orderSchema.pre("save", async function (next) {
  if (!this.orderNumber) {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    this.orderNumber = `ORD-${timestamp}-${random}`;
  }
  next();
});

export default mongoose.models.Order ||
  mongoose.model("Order", orderSchema);


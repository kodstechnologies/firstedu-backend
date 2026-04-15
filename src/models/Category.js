import mongoose from "mongoose";

/**
 * Base Category Schema: Structural hierarchy only (Pillars & folders).
 * No business data — purely organizational.
 */
const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    parent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
    },
    order: {
      type: Number,
      default: 0,
      min: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
    isPredefined: {
      type: Boolean,
      default: false,
    },
    rootType: {
      type: String,
      enum: ["School Management", "Competitive Management", "Olympiads", "Skill Development", "custom"],
      default: "custom",
    },
  },
  {
    timestamps: true,
    discriminatorKey: "kind",
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

categorySchema.index({ parent: 1, order: 1 });
categorySchema.index({ name: 1 });
categorySchema.index({ createdBy: 1, createdAt: -1 });
categorySchema.index({ rootType: 1, isPredefined: 1 });
categorySchema.index({ isPredefined: 1 });

const Category = mongoose.models.Category || mongoose.model("Category", categorySchema);

/**
 * Subcategory Schema: Purchasable Product nodes inside the taxonomy.
 * Extends the base Category via Mongoose Discriminator.
 * All product fields are optional — context depends on the Pillar.
 */
const subcategorySchema = new mongoose.Schema(
  {
    // ─── Content & Media ────────────────────────────────
    bannerImg:           { type: String, trim: true, default: null },
    description:         { type: String, trim: true, default: null },
    about:               { type: String, trim: true, default: null },
    syllabus:            { type: String, trim: true, default: null },
    markingScheme:       { type: String, trim: true, default: null },
    rankingCriteria:     { type: String, trim: true, default: null },
    examDatesAndDetails: { type: String, trim: true, default: null },
    awards:              { type: String, trim: true, default: null },
    rules:               { type: String, trim: true, default: null },

    // ─── Classification ─────────────────────────────────
    subjects: { type: [String], default: [] },
    tags:     { type: [String], default: [] },

    // ─── Capacity ────────────────────────────────────────
    capacity: { type: Number, default: null, min: 1 },

    // ─── Pricing ─────────────────────────────────────────
    price:           { type: Number, default: 0, min: 0 },
    discountedPrice: { type: Number, default: null, min: 0 },
    isFree:          { type: Boolean, default: false },

    // ─── Publishing ──────────────────────────────────────
    status: { type: String, enum: ["Draft", "Public"], default: "Draft" },

    // ─── Offer / Coupon Policy ───────────────────────────────
    offerPolicy: {
      type: String,
      enum: ["inherit", "none"],
      default: "inherit",
    },
    couponPolicy: {
      type: String,
      enum: ["inherit", "none"],
      default: "inherit",
    },
    offerOverrideId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Offer",
      default: null,
    },

    // ─── Engagement ──────────────────────────────────────
    purchaseCount: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

subcategorySchema.index({ status: 1 });

subcategorySchema.virtual("effectivePrice").get(function () {
  if (this.isFree) return 0;
  return this.discountedPrice !== null && this.discountedPrice !== undefined
    ? this.discountedPrice
    : this.price;
});

subcategorySchema.virtual("hasPurchase").get(function () {
  return this.purchaseCount > 0;
});

export const Subcategory =
  Category.discriminators?.Subcategory ||
  Category.discriminator("Subcategory", subcategorySchema);

export default Category;

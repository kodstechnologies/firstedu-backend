import mongoose from "mongoose";
import Category from "./Category.js";

const gamificationLevelSchema = new mongoose.Schema(
  {
    level: { type: Number, required: true },
    // We can expand this later to include specific testId, unlock requirements, etc.
  },
  { _id: false }
);

const gamificationNodeSchema = new mongoose.Schema(
  {
    // Specific fields for Gamification nodes that don't exist in standard categories
    gamificationType: {
      type: String,
      enum: ["challenge_yourself", "challenge_your_friend", "base_pillar"],
      required: false,
    },
    gamificationRules: {
      type: Object,
      default: undefined,
    },
    maxLevels: {
      type: Number,
      default: undefined,
    },
    /**
     * Dynamic configuration for this specific stage (subcategory).
     * The subcategory's name acts as the stage name (e.g., "Bronze").
     */
    totalLevels: {
      type: Number,
      default: undefined,
    },
    levels: {
      type: [gamificationLevelSchema],
      default: undefined,
    },
  },
  { _id: false }
);

// Register it as a discriminator on the single Category collection
const GamificationNode =
  Category.discriminators?.GamificationNode ||
  Category.discriminator("GamificationNode", gamificationNodeSchema);

export default GamificationNode;

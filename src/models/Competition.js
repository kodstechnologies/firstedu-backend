import mongoose from "mongoose";

const testSchema = new mongoose.Schema(
  {
    testId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Test",
    },
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
    },
  },
  { timestamps: true },
);

const competitionSchema = new mongoose.Schema({
  competitionSectorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "CompetitionSector",
  },
  title: { type: String, required: true },
  description: { type: String, required: true },
  status: {
    type: String,
    enum: ["Draft", "Public"],
    default: "Public",
  },
  tests: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "CompetitionTest",
  }],
}, { timestamps: true });

export const Test= mongoose.models.CompetitionTest|| mongoose.model("CompetitionTest", testSchema);
export const Competition= mongoose.models.Competition|| mongoose.model("Competition", competitionSchema);


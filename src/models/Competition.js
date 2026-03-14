import mongoose from "mongoose";

const testSchema = new mongoose.Schema(
  {
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
  tests: [testSchema],
}, { timestamps: true });

export default mongoose.model("Competition", competitionSchema);


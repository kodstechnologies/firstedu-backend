import mongoose from "mongoose";

const competitionSectorSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description:{
      type:String
    },
     icon:{
     type:String
   },
    status:{
      type: String,
      enum: ["Draft", "Public"],
      default: "Public",
    },
    competitions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Competition",
      },
    ],
  },
);

competitionSectorSchema.index({ title: 1 });
competitionSectorSchema.index({ status: 1, createdAt: -1 });

export default mongoose.models.CompetitionSector ||
  mongoose.model("CompetitionSector", competitionSectorSchema);
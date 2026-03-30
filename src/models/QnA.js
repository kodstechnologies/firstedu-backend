import mongoose from "mongoose";

const qnaSchema = new mongoose.Schema(
  {
    question: {
      type: String,
      required: [true, "Question is required"],
      trim: true,
    },

    answer: {
      type: String
    },

    subject: {
      type: String,
      required: [true, "Subject is required"],
      trim: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "creatorModel",
    },

    creatorModel: {
      type: String,
      required: true,
      enum: ["User", "Admin"],
    },

    status: {
      type: String,
      enum: ["pending", "approved"],
      default: "pending",
      index: true
    },
     priority: {
      type: Number,
      default: 0,
      index: true
    }
  },
  { timestamps: true }
);

// 🔥 PRIORITY MAP
const priorityMap = {
  pending: 0,
  approved: 1
};
// 🔥 AUTO STATUS LOGIC
qnaSchema.pre("save", function (next) {
  if (this.isNew) {
    if (this.creatorModel === "Admin") {
      this.status = "approved";
    } else if (this.creatorModel === "User") {
      this.status = "pending";
    }
  }
  this.priority = priorityMap[this.status];
  next();
});


// 🔥 UPDATE: sync priority when status changes
// qnaSchema.pre("findByIdAndUpdate", function (next) {

//   const update = this.getUpdate();

//   if (update.status) {
//     update.priority = priorityMap[update.status];
//   }

//   next();
// });

export default mongoose.models.Qna || mongoose.model("QnA", qnaSchema);
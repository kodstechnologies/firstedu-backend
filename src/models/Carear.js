import mongoose from "mongoose";

const carearSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
    },
    description: {
      type: String,
      required: [true, "Description is required"],
    },
    skills: {
      type: [String],
      default: [],
    },
    experience: {
      type: String,
      trim: true,
      default: "",
    },
    salary: {
      min: { type: String, default: "" },
      max: { type: String, default: "" },
    },
    location: {
      type: String,
      trim: true,
      default: "",
    },
    redirectLink: {
      type: String,
      trim: true,
      default: "",
    },
    category: {
      type: String,
      enum: ["iscorre", "general"],
      required: [true, "Category is required"],
    },
    type: {
      type: String,
      trim: true,
      default: "", // e.g., Full-time, Part-time, Internship
    },
    mode: {
      type: String,
      trim: true,
      default: "", // e.g., Remote, On-site, Hybrid
    },
    openings: {
      type: Number,
      default: 1,
      min: 1,
    },
    applicantCount:{
      type:Number,
      default:0
    },
    deadline: {
      type: Date,
      default: null,
    },
    company: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { timestamps: true }
);

// Middleware to conditionally remove redirectLink if category is iScorre
carearSchema.pre("save", function (next) {
  if (this.category === "iScorre") {
    this.redirectLink = "";
  }
  next();
});

carearSchema.pre("findOneAndUpdate", function (next) {
  const update = this.getUpdate();
  if (update.category === "iscorre" || (update.$set && update.$set.category === "iscorre")) {
    if (update.$set) {
      update.$set.redirectLink = "";
    } else {
      update.redirectLink = "";
    }
  }
  next();
});

export default mongoose.models.Carear || mongoose.model("Carear", carearSchema);

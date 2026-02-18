import mongoose from "mongoose";

const successStorySchema = new mongoose.Schema(
    {
        studentName: {
            type: String,
            required: [true, "Student name is required"],
            trim: true,
        },
        rankTitle: {
            type: String,
            required: [true, "Rank title is required"],
            trim: true,
        },
        examCategory: {
            type: String,
            required: [true, "Exam category is required"],
            trim: true,
        },
        storyType: {
            type: String,
            enum: {
                values: ["VIDEO", "PHOTO"],
                message: "Story type must be either VIDEO or PHOTO",
            },
            required: [true, "Story type is required"],
        },
        mediaUrl: {
            type: String,
            required: [true, "Media URL is required"],
            trim: true,
        },
        thumbnailUrl: {
            type: String,
            trim: true,
            default: null,
            // Required for VIDEO type, validated at service layer
        },
        description: {
            type: String,
            required: [true, "Description is required"],
            trim: true,
        },
        status: {
            type: String,
            enum: {
                values: ["DRAFT", "PUBLISHED"],
                message: "Status must be either DRAFT or PUBLISHED",
            },
            default: "DRAFT",
        },
        isFeatured: {
            type: Boolean,
            default: false,
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Admin",
            required: true,
        },
    },
    {
        timestamps: true,
    }
);

// Indexes for efficient queries
successStorySchema.index({ status: 1, isFeatured: -1, createdAt: -1 });
successStorySchema.index({ status: 1, examCategory: 1, createdAt: -1 });

export default mongoose.models.SuccessStory ||
    mongoose.model("SuccessStory", successStorySchema);

import mongoose from 'mongoose';

const freeMaterialSchema = new mongoose.Schema(
  {
    fileType: {
      type: String,
      enum: ['pdf', 'video', 'image', 'link', 'audio', 'document', 'archive', 'other'],
      required: true,
    },
    fileUrl: {
      type: String,
      required: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
    },
    subCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model('FreeMaterial', freeMaterialSchema);

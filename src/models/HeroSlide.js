import mongoose from 'mongoose';

const heroSlideSchema = new mongoose.Schema(
  {
    mediaUrl: {
      type: String,
      required: [true, 'Media URL is required'],
    },
    mediaType: {
      type: String,
      enum: {
        values: ['image', 'video'],
        message: 'Media type must be either image or video',
      },
      required: [true, 'Media type is required'],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    order: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

const HeroSlide = mongoose.model('HeroSlide', heroSlideSchema);

export default HeroSlide;

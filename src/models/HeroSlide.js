import mongoose from 'mongoose';

const heroSlideSchema = new mongoose.Schema(
  {
    mediaUrl: {
      type: String,
      default: '',
    },
    mediaType: {
      type: String,
      enum: {
        values: ['image', 'video', 'link-only'],
        message: 'Media type must be image, video, or link-only',
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    order: {
      type: Number,
      default: 0,
    },
    link: {
      type: String,
      default: '',
    },
    title: {
      type: String,
      default: '',
      maxlength: 80,
    },
    tag: {
      type: String,
      default: '',
      maxlength: 60,
    },
    description: {
      type: String,
      default: '',
      maxlength: 220,
    },
  },
  {
    timestamps: true,
  }
);

const HeroSlide = mongoose.model('HeroSlide', heroSlideSchema);

export default HeroSlide;

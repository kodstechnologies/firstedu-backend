import HeroSlide from '../models/HeroSlide.js';
import { uploadImageToCloudinary, uploadVideoToCloudinary, deleteFileFromCloudinary } from '../utils/s3Upload.js';

// ADMIN API: Create a new hero slide
export const createHeroSlide = async (req, res) => {
  try {
    const { isActive, order } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ success: false, message: 'Media file is required' });
    }

    let mediaType = 'image';
    if (file.mimetype.startsWith('video/')) {
      mediaType = 'video';
    }

    let mediaUrl = '';
    if (mediaType === 'video') {
      mediaUrl = await uploadVideoToCloudinary(file.buffer, file.originalname, 'hero-slides');
    } else {
      mediaUrl = await uploadImageToCloudinary(file.buffer, file.originalname, 'hero-slides');
    }

    const newSlide = await HeroSlide.create({
      mediaUrl,
      mediaType,
      isActive: isActive !== undefined ? isActive === 'true' || isActive === true : true,
      order: parseInt(order, 10) || 0,
    });

    res.status(201).json({ success: true, data: newSlide });
  } catch (error) {
    console.error('Error creating hero slide:', error);
    res.status(500).json({ success: false, message: 'Server error creating hero slide' });
  }
};

// ADMIN API: Get all hero slides
export const getHeroSlidesAdmin = async (req, res) => {
  try {
    const slides = await HeroSlide.find().sort({ order: 1, createdAt: -1 });
    res.status(200).json({ success: true, data: slides });
  } catch (error) {
    console.error('Error fetching hero slides:', error);
    res.status(500).json({ success: false, message: 'Server error fetching hero slides' });
  }
};

// ADMIN API: Update a hero slide
export const updateHeroSlide = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive, order } = req.body;
    const file = req.file;

    const slide = await HeroSlide.findById(id);
    if (!slide) {
      return res.status(404).json({ success: false, message: 'Slide not found' });
    }

    if (file) {
      // Delete old file
      if (slide.mediaUrl) {
        await deleteFileFromCloudinary(slide.mediaUrl);
      }

      let mediaType = 'image';
      if (file.mimetype.startsWith('video/')) {
        mediaType = 'video';
      }

      let mediaUrl = '';
      if (mediaType === 'video') {
        mediaUrl = await uploadVideoToCloudinary(file.buffer, file.originalname, 'hero-slides');
      } else {
        mediaUrl = await uploadImageToCloudinary(file.buffer, file.originalname, 'hero-slides');
      }

      slide.mediaUrl = mediaUrl;
      slide.mediaType = mediaType;
    }

    if (isActive !== undefined) slide.isActive = isActive === 'true' || isActive === true;
    if (order !== undefined) slide.order = parseInt(order, 10);

    await slide.save();

    res.status(200).json({ success: true, data: slide });
  } catch (error) {
    console.error('Error updating hero slide:', error);
    res.status(500).json({ success: false, message: 'Server error updating hero slide' });
  }
};

// ADMIN API: Delete a hero slide
export const deleteHeroSlide = async (req, res) => {
  try {
    const { id } = req.params;
    const slide = await HeroSlide.findById(id);
    if (!slide) {
      return res.status(404).json({ success: false, message: 'Slide not found' });
    }

    if (slide.mediaUrl) {
      await deleteFileFromCloudinary(slide.mediaUrl);
    }

    await HeroSlide.findByIdAndDelete(id);

    res.status(200).json({ success: true, message: 'Slide deleted successfully' });
  } catch (error) {
    console.error('Error deleting hero slide:', error);
    res.status(500).json({ success: false, message: 'Server error deleting hero slide' });
  }
};

// PUBLIC API: Get active hero slides for landing page
export const getActiveHeroSlides = async (req, res) => {
  try {
    const slides = await HeroSlide.find({ isActive: true })
      .sort({ order: 1, createdAt: -1 })
      .limit(2); // strictly limited to 2 as requested

    res.status(200).json({ success: true, data: slides });
  } catch (error) {
    console.error('Error fetching active hero slides:', error);
    res.status(500).json({ success: false, message: 'Server error fetching active hero slides' });
  }
};

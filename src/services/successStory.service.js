import successStoryRepository from '../repository/successStory.repository.js';
import ApiError from '../utils/ApiError.js';
import {
  uploadImageToCloudinary,
  uploadVideoToCloudinary,
  deleteFileFromCloudinary,
} from '../utils/s3Upload.js';

const VIDEO_MIMETYPES = [
  'video/mp4',
  'video/mpeg',
  'video/quicktime',
  'video/x-msvideo',
  'video/webm',
  'video/x-ms-wmv',
  'video/3gpp',
];
const IMAGE_MIMETYPES = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];

/**
 * Create a new success story (Admin) - media = video only, thumbnail = image only
 */
const createSuccessStory = async (data, files, adminId) => {
  if (!files?.media?.[0]) {
    throw new ApiError(400, 'Media (video) file is required');
  }
  if (!files?.thumbnail?.[0]) {
    throw new ApiError(400, 'Thumbnail (image) file is required');
  }

  const mediaFile = files.media[0];
  const thumbFile = files.thumbnail[0];

  if (!VIDEO_MIMETYPES.includes(mediaFile.mimetype)) {
    throw new ApiError(400, 'Media must be a video file (MP4, MOV, WEBM, etc.)');
  }
  if (!IMAGE_MIMETYPES.includes(thumbFile.mimetype)) {
    throw new ApiError(400, 'Thumbnail must be an image file (JPEG, PNG, WEBP)');
  }

  let mediaUrl;
  let thumbnailUrl;

  try {
    mediaUrl = await uploadVideoToCloudinary(
      mediaFile.buffer,
      mediaFile.originalname,
      'success-stories/videos',
    );
    thumbnailUrl = await uploadImageToCloudinary(
      thumbFile.buffer,
      thumbFile.originalname,
      'success-stories/thumbnails',
    );

    const storyData = {
      name: data.name,
      description: data.description,
      achievement: data.achievement,
      achieveIn: data.achieveIn,
      mediaUrl,
      thumbnailUrl,
      status: data.status ?? 'DRAFT',
      createdBy: adminId,
    };

    return await successStoryRepository.createSuccessStory(storyData);
  } catch (error) {
    if (mediaUrl) await deleteFileFromCloudinary(mediaUrl);
    if (thumbnailUrl) await deleteFileFromCloudinary(thumbnailUrl);
    throw error;
  }
};

/**
 * Get all success stories (Admin - includes drafts)
 */
const getAllStories = async (filters = {}, options = {}) => {
  return await successStoryRepository.findSuccessStories(filters, options);
};

/**
 * Get success story by ID (Admin)
 */
const getStoryById = async (id) => {
  const story = await successStoryRepository.findById(id);
  if (!story) {
    throw new ApiError(404, 'Success story not found');
  }
  return story;
};

/**
 * Update success story (Admin) - optional new video/image
 */
const updateSuccessStory = async (id, data, files) => {
  const story = await successStoryRepository.findById(id);
  if (!story) {
    throw new ApiError(404, 'Success story not found');
  }

  const updateData = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.achievement !== undefined) updateData.achievement = data.achievement;
  if (data.achieveIn !== undefined) updateData.achieveIn = data.achieveIn;

  const oldMediaUrl = story.mediaUrl;
  const oldThumbnailUrl = story.thumbnailUrl;

  try {
    if (files?.media?.[0]) {
      const mediaFile = files.media[0];
      if (!VIDEO_MIMETYPES.includes(mediaFile.mimetype)) {
        throw new ApiError(400, 'Media must be a video file (MP4, MOV, WEBM, etc.)');
      }
      updateData.mediaUrl = await uploadVideoToCloudinary(
        mediaFile.buffer,
        mediaFile.originalname,
        'success-stories/videos',
      );
    }
    if (files?.thumbnail?.[0]) {
      const thumbFile = files.thumbnail[0];
      if (!IMAGE_MIMETYPES.includes(thumbFile.mimetype)) {
        throw new ApiError(400, 'Thumbnail must be an image file (JPEG, PNG, WEBP)');
      }
      updateData.thumbnailUrl = await uploadImageToCloudinary(
        thumbFile.buffer,
        thumbFile.originalname,
        'success-stories/thumbnails',
      );
    }

    const updatedStory = await successStoryRepository.updateById(id, updateData);

    if (updateData.mediaUrl && oldMediaUrl) {
      await deleteFileFromCloudinary(oldMediaUrl);
    }
    if (updateData.thumbnailUrl && oldThumbnailUrl) {
      await deleteFileFromCloudinary(oldThumbnailUrl);
    }

    return updatedStory;
  } catch (error) {
    if (updateData.mediaUrl) {
      await deleteFileFromCloudinary(updateData.mediaUrl);
    }
    if (updateData.thumbnailUrl) {
      await deleteFileFromCloudinary(updateData.thumbnailUrl);
    }
    throw error;
  }
};

/**
 * Update story status (Admin)
 */
const updateStoryStatus = async (id, status) => {
  const story = await successStoryRepository.findById(id);
  if (!story) {
    throw new ApiError(404, 'Success story not found');
  }
  return await successStoryRepository.updateById(id, { status });
};

/**
 * Delete success story (Admin)
 */
const deleteSuccessStory = async (id) => {
  const story = await successStoryRepository.findById(id);
  if (!story) {
    throw new ApiError(404, 'Success story not found');
  }
  if (story.mediaUrl) await deleteFileFromCloudinary(story.mediaUrl);
  if (story.thumbnailUrl) await deleteFileFromCloudinary(story.thumbnailUrl);
  return await successStoryRepository.deleteById(id);
};

/**
 * Get featured published stories (Student) - returns latest N published
 */
const getFeaturedStories = async (limit = 3) => {
  return await successStoryRepository.getFeaturedPublishedStories(limit);
};

/**
 * Get all published stories (Student)
 */
const getAllPublishedStories = async (filters) => {
  return await successStoryRepository.findSuccessStories({
    ...filters,
    status: 'PUBLISHED',
  });
};

/**
 * Get published story by ID (Student)
 */
const getPublishedStoryById = async (id) => {
  const story = await successStoryRepository.findById(id);
  if (!story) {
    throw new ApiError(404, 'Success story not found');
  }
  if (story.status !== 'PUBLISHED') {
    throw new ApiError(404, 'Success story not found');
  }
  return story;
};

export default {
  createSuccessStory,
  getAllStories,
  getStoryById,
  updateSuccessStory,
  updateStoryStatus,
  deleteSuccessStory,
  getFeaturedStories,
  getAllPublishedStories,
  getPublishedStoryById,
};

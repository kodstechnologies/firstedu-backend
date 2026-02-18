import successStoryRepository from '../repository/successStory.repository.js';
import ApiError from '../utils/ApiError.js';
import {
  uploadImageToCloudinary,
  uploadVideoToCloudinary,
  deleteFileFromCloudinary,
} from '../utils/cloudinaryUpload.js';

/**
 * Create a new success story (Admin)
 */
const createSuccessStory = async (data, files, adminId) => {
  const { storyType } = data;

  // Validate media files based on storyType
  if (storyType === 'VIDEO') {
    if (!files?.media?.[0]) {
      throw new ApiError(400, 'Video file is required for VIDEO type story');
    }
    if (!files?.thumbnail?.[0]) {
      throw new ApiError(400, 'Thumbnail is required for VIDEO type story');
    }
  } else if (storyType === 'PHOTO') {
    if (!files?.media?.[0]) {
      throw new ApiError(400, 'Photo file is required for PHOTO type story');
    }
  }

  // Upload media to Cloudinary
  let mediaUrl;
  let thumbnailUrl = null;

  try {
    if (storyType === 'VIDEO') {
      // Upload video
      mediaUrl = await uploadVideoToCloudinary(
        files.media[0].buffer,
        files.media[0].originalname,
        'success-stories/videos',
      );

      // Upload thumbnail
      thumbnailUrl = await uploadImageToCloudinary(
        files.thumbnail[0].buffer,
        files.thumbnail[0].originalname,
        'success-stories/thumbnails',
      );
    } else {
      // Upload photo
      mediaUrl = await uploadImageToCloudinary(
        files.media[0].buffer,
        files.media[0].originalname,
        'success-stories/photos',
      );
    }

    // Create success story
    const storyData = {
      ...data,
      mediaUrl,
      thumbnailUrl,
      createdBy: adminId,
      status: data.status ?? 'DRAFT', // allow override
      isFeatured: data.isFeatured ?? false,
    };

    return await successStoryRepository.createSuccessStory(storyData);
  } catch (error) {
    // Cleanup uploaded files if story creation fails
    if (mediaUrl) {
      await deleteFileFromCloudinary(mediaUrl);
    }
    if (thumbnailUrl) {
      await deleteFileFromCloudinary(thumbnailUrl);
    }
    throw error;
  }
};

/**
 * Get all success stories (Admin - includes drafts)
 */
const getAllStories = async (filters) => {
  return await successStoryRepository.findSuccessStories(filters);
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
 * Update success story (Admin)
 */
const updateSuccessStory = async (id, data, files) => {
  const story = await successStoryRepository.findById(id);

  if (!story) {
    throw new ApiError(404, 'Success story not found');
  }

  const updateData = { ...data };
  const oldMediaUrl = story.mediaUrl;
  const oldThumbnailUrl = story.thumbnailUrl;

  try {
    // Handle media replacement if new files provided
    if (files?.media?.[0]) {
      if (story.storyType === 'VIDEO') {
        // Upload new video
        updateData.mediaUrl = await uploadVideoToCloudinary(
          files.media[0].buffer,
          files.media[0].originalname,
          'success-stories/videos',
        );
      } else {
        // Upload new photo
        updateData.mediaUrl = await uploadImageToCloudinary(
          files.media[0].buffer,
          files.media[0].originalname,
          'success-stories/photos',
        );
      }
    }

    // Handle thumbnail replacement for video stories
    if (files?.thumbnail?.[0] && story.storyType === 'VIDEO') {
      updateData.thumbnailUrl = await uploadImageToCloudinary(
        files.thumbnail[0].buffer,
        files.thumbnail[0].originalname,
        'success-stories/thumbnails',
      );
    }

    // Update the story
    const updatedStory = await successStoryRepository.updateById(
      id,
      updateData,
    );

    // Delete old media files if they were replaced
    if (updateData.mediaUrl && oldMediaUrl) {
      await deleteFileFromCloudinary(oldMediaUrl);
    }
    if (updateData.thumbnailUrl && oldThumbnailUrl) {
      await deleteFileFromCloudinary(oldThumbnailUrl);
    }

    return updatedStory;
  } catch (error) {
    // Cleanup newly uploaded files if update fails
    if (updateData.mediaUrl && updateData.mediaUrl !== oldMediaUrl) {
      await deleteFileFromCloudinary(updateData.mediaUrl);
    }
    if (
      updateData.thumbnailUrl &&
      updateData.thumbnailUrl !== oldThumbnailUrl
    ) {
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

  // Delete media files from Cloudinary
  if (story.mediaUrl) {
    await deleteFileFromCloudinary(story.mediaUrl);
  }
  if (story.thumbnailUrl) {
    await deleteFileFromCloudinary(story.thumbnailUrl);
  }

  // Delete story from database
  return await successStoryRepository.deleteById(id);
};

/**
 * Get featured published stories (Student)
 */
const getFeaturedStories = async (limit = 3) => {
  return await successStoryRepository.getFeaturedPublishedStories(limit);
};

/**
 * Get all published stories (Student)
 */
const getAllPublishedStories = async (filters) => {
  const queryFilters = {
    ...filters,
    status: 'PUBLISHED', // Only published stories for students
  };

  return await successStoryRepository.findSuccessStories(queryFilters);
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

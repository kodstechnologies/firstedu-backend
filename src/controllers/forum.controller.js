import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import forumService from "../services/forum.service.js";
import forumValidator from "../validation/forum.validator.js";

// ==================== STUDENT CONTROLLERS ====================

// Create Forum
export const createForum = asyncHandler(async (req, res) => {
  const { error, value } = forumValidator.createForum.validate(req.body);

  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }

  const forum = await forumService.createForum(value, req.user._id);
  return res.status(201).json(
    ApiResponse.success(forum, "Forum created successfully")
  );
});

// Get All Forums
export const getForums = asyncHandler(async (req, res) => {
  const forums = await forumService.getForums();
  return res.status(200).json(
    ApiResponse.success(forums || [], "Forums fetched successfully")
  );
});

// Get Forum by ID
export const getForumById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const forum = await forumService.getForumById(id);
  return res.status(200).json(
    ApiResponse.success(forum, "Forum fetched successfully")
  );
});

// Update Forum (only by creator)
export const updateForum = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { error, value } = forumValidator.updateForum.validate(req.body);

  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }

  const forum = await forumService.updateForum(id, value, req.user._id);
  return res.status(200).json(
    ApiResponse.success(forum, "Forum updated successfully")
  );
});

// Delete Forum (only by creator)
export const deleteForum = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await forumService.deleteForum(id, req.user._id);
  return res.status(200).json(
    ApiResponse.success(null, "Forum deleted successfully")
  );
});

export const createForumThread = asyncHandler(async (req, res) => {
  const { forumId } = req.params;
  const { error, value } = forumValidator.createForumThread.validate(req.body);

  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }

  const forum = await forumService.createForumThread(forumId, value, req.user._id);
  return res.status(201).json(
    ApiResponse.success(forum, "Thread created successfully")
  );
});

export const addPostToThread = asyncHandler(async (req, res) => {
  const { forumId, threadId } = req.params;
  const { error, value } = forumValidator.addPostToThread.validate(req.body);

  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }

  const forum = await forumService.addPostToThread(forumId, threadId, value.content, req.user._id);
  return res.status(201).json(
    ApiResponse.success(forum, "Post added successfully")
  );
});

export const replyToPost = asyncHandler(async (req, res) => {
  const { forumId, threadId, postId } = req.params;
  const { error, value } = forumValidator.replyToPost.validate(req.body);

  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }

  const forum = await forumService.replyToPost(forumId, threadId, postId, value.content, req.user._id);
  return res.status(201).json(
    ApiResponse.success(forum, "Reply added successfully")
  );
});

export const likePost = asyncHandler(async (req, res) => {
  const { forumId, threadId, postId, replyId } = req.params;
  const forum = await forumService.likePost(forumId, threadId, postId, replyId, req.user._id);
  return res.status(200).json(
    ApiResponse.success(forum, "Like toggled successfully")
  );
});

// ==================== ADMIN CONTROLLERS ====================

// Get All Forums for Admin Monitoring
export const getForumsAdmin = asyncHandler(async (req, res) => {
  const { page, limit, search } = req.query;
  const result = await forumService.getForumsForAdmin({ page, limit, search });
  return res.status(200).json(
    ApiResponse.success(result.forums, "Forums fetched successfully for admin", result.pagination)
  );
});

// Delete Post (Admin only - for moderation)
export const deletePostAdmin = asyncHandler(async (req, res) => {
  const { forumId, threadId, postId } = req.params;
  const forum = await forumService.deleteForumPost(forumId, threadId, postId);
  return res.status(200).json(
    ApiResponse.success(forum, "Post deleted successfully by admin")
  );
});

// Delete Reply (Admin only - for moderation)
export const deleteReplyAdmin = asyncHandler(async (req, res) => {
  const { forumId, threadId, postId, replyId } = req.params;
  const forum = await forumService.deleteForumReply(forumId, threadId, postId, replyId);
  return res.status(200).json(
    ApiResponse.success(forum, "Reply deleted successfully by admin")
  );
});

// Delete Thread (Admin only - for moderation)
export const deleteThreadAdmin = asyncHandler(async (req, res) => {
  const { forumId, threadId } = req.params;
  const forum = await forumService.deleteForumThread(forumId, threadId);
  return res.status(200).json(
    ApiResponse.success(forum, "Thread deleted successfully by admin")
  );
});

// Delete Forum (Admin only - for moderation)
export const deleteForumAdmin = asyncHandler(async (req, res) => {
  const { forumId } = req.params;
  await forumService.deleteForumByAdmin(forumId);
  return res.status(200).json(
    ApiResponse.success(null, "Forum deleted successfully by admin")
  );
});

export default {
  createForum,
  getForums,
  getForumById,
  updateForum,
  deleteForum,
  createForumThread,
  addPostToThread,
  replyToPost,
  likePost,
  // Admin functions
  getForumsAdmin,
  deletePostAdmin,
  deleteReplyAdmin,
  deleteThreadAdmin,
  deleteForumAdmin,
};


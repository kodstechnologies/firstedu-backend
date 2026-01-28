import { ApiError } from "../utils/ApiError.js";
import forumRepository from "../repository/forum.repository.js";

export const createForum = async (data, userId) => {
  const { name, description } = data;

  if (!name) {
    throw new ApiError(400, "Forum name is required");
  }

  return await forumRepository.create({
    name,
    description,
    threads: [],
    createdBy: userId,
  });
};

export const getForums = async () => {
  return await forumRepository.find({}, {
    populate: [
      { path: "createdBy", select: "name email" },
      { path: "threads.posts.author", select: "name email" },
      { path: "threads.posts.replies.author", select: "name email" },
    ],
    sort: { createdAt: -1 },
  });
};

export const getForumById = async (id) => {
  const forum = await forumRepository.findById(id, [
    { path: "createdBy", select: "name email" },
    { path: "threads.posts.author", select: "name email" },
    { path: "threads.posts.replies.author", select: "name email" },
  ]);

  if (!forum) {
    throw new ApiError(404, "Forum not found");
  }
  return forum;
};

export const createForumThread = async (forumId, data, userId) => {
  const { title, category, content } = data;

  if (!title || !content) {
    throw new ApiError(400, "Title and content are required");
  }

  const forum = await forumRepository.findById(forumId);
  if (!forum) {
    throw new ApiError(404, "Forum not found");
  }

  const newThread = {
    title,
    category: category || "general",
    posts: [
      {
        content,
        author: userId,
        likes: [],
        replies: [],
      },
    ],
    isPinned: false,
    isLocked: false,
  };

  forum.threads.push(newThread);
  await forum.save();

  return forum;
};

export const addPostToThread = async (forumId, threadId, content, userId) => {
  if (!content) {
    throw new ApiError(400, "Content is required");
  }

  const forum = await forumRepository.findById(forumId);
  if (!forum) {
    throw new ApiError(404, "Forum not found");
  }

  const thread = forum.threads.id(threadId);
  if (!thread) {
    throw new ApiError(404, "Thread not found");
  }

  if (thread.isLocked) {
    throw new ApiError(403, "Thread is locked");
  }

  thread.posts.push({
    content,
    author: userId,
    likes: [],
    replies: [],
  });

  await forum.save();

  return forum;
};

export const replyToPost = async (forumId, threadId, postId, content, userId) => {
  if (!content) {
    throw new ApiError(400, "Content is required");
  }

  const forum = await forumRepository.findById(forumId);
  if (!forum) {
    throw new ApiError(404, "Forum not found");
  }

  const thread = forum.threads.id(threadId);
  if (!thread) {
    throw new ApiError(404, "Thread not found");
  }

  if (thread.isLocked) {
    throw new ApiError(403, "Thread is locked");
  }

  const post = thread.posts.id(postId);
  if (!post) {
    throw new ApiError(404, "Post not found");
  }

  post.replies.push({
    content,
    author: userId,
    likes: [],
  });

  await forum.save();

  return forum;
};

export const likePost = async (forumId, threadId, postId, replyId, userId) => {
  const forum = await forumRepository.findById(forumId);
  if (!forum) {
    throw new ApiError(404, "Forum not found");
  }

  const thread = forum.threads.id(threadId);
  if (!thread) {
    throw new ApiError(404, "Thread not found");
  }

  const post = thread.posts.id(postId);
  if (!post) {
    throw new ApiError(404, "Post not found");
  }

  if (replyId) {
    // Like a reply
    const reply = post.replies.id(replyId);
    if (!reply) {
      throw new ApiError(404, "Reply not found");
    }

    const likeIndex = reply.likes.findIndex(
      (id) => id.toString() === userId.toString()
    );

    if (likeIndex > -1) {
      reply.likes.splice(likeIndex, 1);
    } else {
      reply.likes.push(userId);
    }
  } else {
    // Like a post
    const likeIndex = post.likes.findIndex(
      (id) => id.toString() === userId.toString()
    );

    if (likeIndex > -1) {
      post.likes.splice(likeIndex, 1);
    } else {
      post.likes.push(userId);
    }
  }

  await forum.save();

  return forum;
};

export const updateForum = async (id, updateData, userId) => {
  const forum = await forumRepository.findById(id);
  if (!forum) {
    throw new ApiError(404, "Forum not found");
  }

  // Check if user is the creator
  if (forum.createdBy.toString() !== userId.toString()) {
    throw new ApiError(403, "You can only update forums you created");
  }

  return await forumRepository.updateById(id, updateData);
};

export const deleteForum = async (id, userId) => {
  const forum = await forumRepository.findById(id);
  if (!forum) {
    throw new ApiError(404, "Forum not found");
  }

  // Check if user is the creator
  if (forum.createdBy.toString() !== userId.toString()) {
    throw new ApiError(403, "You can only delete forums you created");
  }

  return await forumRepository.deleteById(id);
};

// ==================== ADMIN MODERATION FUNCTIONS ====================

// Get all forums for admin monitoring
export const getForumsForAdmin = async (options = {}) => {
  const { page = 1, limit = 10, search } = options;
  
  const query = {};
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
      { "threads.title": { $regex: search, $options: "i" } },
    ];
  }

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  const [forums, total] = await Promise.all([
    forumRepository.find(query, {
      populate: [
        { path: "createdBy", select: "name email" },
        { path: "threads.posts.author", select: "name email" },
        { path: "threads.posts.replies.author", select: "name email" },
      ],
      sort: { createdAt: -1 },
      skip,
      limit: limitNum,
    }),
    forumRepository.count(query),
  ]);

  return {
    forums,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum) || 1,
    },
  };
};

// Delete a post from a thread (Admin only)
export const deleteForumPost = async (forumId, threadId, postId) => {
  const forum = await forumRepository.findById(forumId);
  if (!forum) {
    throw new ApiError(404, "Forum not found");
  }

  const thread = forum.threads.id(threadId);
  if (!thread) {
    throw new ApiError(404, "Thread not found");
  }

  const post = thread.posts.id(postId);
  if (!post) {
    throw new ApiError(404, "Post not found");
  }

  // Remove the post
  thread.posts.pull(postId);
  await forum.save();

  return forum;
};

// Delete a reply from a post (Admin only)
export const deleteForumReply = async (forumId, threadId, postId, replyId) => {
  const forum = await forumRepository.findById(forumId);
  if (!forum) {
    throw new ApiError(404, "Forum not found");
  }

  const thread = forum.threads.id(threadId);
  if (!thread) {
    throw new ApiError(404, "Thread not found");
  }

  const post = thread.posts.id(postId);
  if (!post) {
    throw new ApiError(404, "Post not found");
  }

  const reply = post.replies.id(replyId);
  if (!reply) {
    throw new ApiError(404, "Reply not found");
  }

  // Remove the reply
  post.replies.pull(replyId);
  await forum.save();

  return forum;
};

// Delete an entire thread (Admin only)
export const deleteForumThread = async (forumId, threadId) => {
  const forum = await forumRepository.findById(forumId);
  if (!forum) {
    throw new ApiError(404, "Forum not found");
  }

  const thread = forum.threads.id(threadId);
  if (!thread) {
    throw new ApiError(404, "Thread not found");
  }

  // Remove the thread
  forum.threads.pull(threadId);
  await forum.save();

  return forum;
};

// Delete entire forum (Admin only - for moderation)
export const deleteForumByAdmin = async (forumId) => {
  const forum = await forumRepository.findById(forumId);
  if (!forum) {
    throw new ApiError(404, "Forum not found");
  }

  return await forumRepository.deleteById(forumId);
};

export default {
  createForum,
  getForums,
  getForumById,
  createForumThread,
  addPostToThread,
  replyToPost,
  likePost,
  updateForum,
  deleteForum,
  // Admin functions
  getForumsForAdmin,
  deleteForumPost,
  deleteForumReply,
  deleteForumThread,
  deleteForumByAdmin,
};


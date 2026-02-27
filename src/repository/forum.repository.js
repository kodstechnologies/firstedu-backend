import Forum from "../models/Forum.js";
import { ApiError } from "../utils/ApiError.js";

const create = async (forumData) => {
  try {
    return await Forum.create(forumData);
  } catch (error) {
    throw new ApiError(500, "Failed to create forum", error.message);
  }
};

const find = async (filter = {}, options = {}) => {
  const {
    populate = [],
    sort = { createdAt: -1 },
    skip,
    limit,
  } = options;

  let query = Forum.find(filter);

  populate.forEach((pop) => {
    query = query.populate(pop.path, pop.select);
  });

  query = query.sort(sort);
  if (skip != null) query = query.skip(skip);
  if (limit != null) query = query.limit(limit);

  return query;
};

const findById = async (id, populate = []) => {
  let query = Forum.findById(id);

  populate.forEach((pop) => {
    query = query.populate(pop.path, pop.select);
  });

  return query;
};

const updateById = async (id, updateData) => {
  return Forum.findByIdAndUpdate(id, updateData, { new: true });
};

const deleteById = async (id) => {
  return Forum.findByIdAndDelete(id);
};

const count = async (filter = {}) => {
  return Forum.countDocuments(filter);
};

const getForumStats = async () => {
  try {
    const totalForums = await Forum.countDocuments();
    const forums = await Forum.find({}).select("likes comments").lean();
    let totalReplies = 0;
    let totalLikes = 0;
    forums.forEach((f) => {
      totalLikes += (f.likes && f.likes.length) || 0;
      (f.comments || []).forEach((c) => {
        totalLikes += (c.likes && c.likes.length) || 0;
        totalReplies += (c.replies && c.replies.length) || 0;
        (c.replies || []).forEach((r) => {
          totalLikes += (r.likes && r.likes.length) || 0;
        });
      });
    });
    totalReplies += forums.reduce((acc, f) => acc + (f.comments ? f.comments.length : 0), 0);
    return {
      totalForums,
      totalReplies,
      totalLikes,
    };
  } catch (error) {
    throw new ApiError(500, "Failed to fetch forum stats", error.message);
  }
};

export default {
  create,
  find,
  findById,
  updateById,
  deleteById,
  count,
  getForumStats,
};

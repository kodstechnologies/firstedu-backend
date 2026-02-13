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
  const { populate = [], sort = { createdAt: -1 } } = options;
  
  let query = Forum.find(filter);
  
  populate.forEach((pop) => {
    query = query.populate(pop.path, pop.select);
  });
  
  return query.sort(sort);
};

const findById = async (id, populate = []) => {
  let query = Forum.findById(id);
  
  populate.forEach((pop) => {
    query = query.populate(pop.path, pop.select);
  });
  
  return query;
};

const updateById = async (id, updateData) => {
  return Forum.findByIdAndUpdate(id, { $set: updateData }, { new: true });
};

const deleteById = async (id) => {
  return Forum.findByIdAndDelete(id);
};

const count = async (filter = {}) => {
  return Forum.countDocuments(filter);
};

/**
 * Get aggregate counts: totalForums, totalReplies, totalLikes
 */
const getForumStats = async () => {
  try {
    const [totalForums, statsResult] = await Promise.all([
      Forum.countDocuments(),
      Forum.aggregate([
        { $unwind: { path: "$threads", preserveNullAndEmptyArrays: true } },
        { $unwind: { path: "$threads.posts", preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: null,
            totalReplies: {
              $sum: { $size: { $ifNull: ["$threads.posts.replies", []] } },
            },
            postLikes: {
              $sum: { $size: { $ifNull: ["$threads.posts.likes", []] } },
            },
            replyLikes: {
              $sum: {
                $reduce: {
                  input: { $ifNull: ["$threads.posts.replies", []] },
                  initialValue: 0,
                  in: {
                    $add: [
                      "$$value",
                      { $size: { $ifNull: ["$$this.likes", []] } },
                    ],
                  },
                },
              },
            },
          },
        },
        {
          $project: {
            totalReplies: 1,
            totalLikes: { $add: ["$postLikes", "$replyLikes"] },
          },
        },
      ]),
    ]);

    const stats = statsResult[0] || { totalReplies: 0, totalLikes: 0 };
    return {
      totalForums,
      totalReplies: stats.totalReplies || 0,
      totalLikes: stats.totalLikes || 0,
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


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

export default {
  create,
  find,
  findById,
  updateById,
  deleteById,
  count,
};


import Challenge from "../models/Challenge.js";
import { ApiError } from "../utils/ApiError.js";

const create = async (challengeData) => {
  try {
    return await Challenge.create(challengeData);
  } catch (error) {
    throw new ApiError(500, "Failed to create challenge", error.message);
  }
};

const find = async (filter = {}, options = {}) => {
  const { populate = [], sort = { createdAt: -1 }, skip = 0, limit = 10 } = options;
  
  let query = Challenge.find(filter);
  
  populate.forEach((pop) => {
    query = query.populate(pop.path, pop.select);
  });
  
  return query.sort(sort).skip(skip).limit(limit);
};

const findOne = async (filter, populate = []) => {
  let query = Challenge.findOne(filter);
  
  populate.forEach((pop) => {
    query = query.populate(pop.path, pop.select);
  });
  
  return query;
};

const findById = async (id, populate = []) => {
  let query = Challenge.findById(id);
  
  populate.forEach((pop) => {
    query = query.populate(pop.path, pop.select);
  });
  
  return query;
};

const save = async (challenge) => {
  try {
    return await challenge.save();
  } catch (error) {
    throw new ApiError(500, "Failed to save challenge", error.message);
  }
};

const updateById = async (id, updateData) => {
  return Challenge.findByIdAndUpdate(id, { $set: updateData }, { new: true });
};

const deleteById = async (id) => {
  return Challenge.findByIdAndDelete(id);
};

const count = async (filter = {}) => {
  return Challenge.countDocuments(filter);
};

export default {
  create,
  find,
  findOne,
  findById,
  save,
  updateById,
  deleteById,
  count,
};


import Tournament from "../models/Tournament.js";
import { ApiError } from "../utils/ApiError.js";

const create = async (tournamentData) => {
  try {
    return await Tournament.create(tournamentData);
  } catch (error) {
    throw new ApiError(500, "Failed to create tournament", error.message);
  }
};

const find = async (filter = {}, options = {}) => {
  const { populate = [], sort = { createdAt: -1 }, skip = 0, limit = 10 } = options;
  
  let query = Tournament.find(filter);
  
  populate.forEach((pop) => {
    query = query.populate(pop.path, pop.select);
  });
  
  return query.sort(sort).skip(skip).limit(limit);
};

const findOne = async (filter, populate = []) => {
  let query = Tournament.findOne(filter);
  
  populate.forEach((pop) => {
    query = query.populate(pop.path, pop.select);
  });
  
  return query;
};

const findById = async (id, populate = []) => {
  let query = Tournament.findById(id);
  
  populate.forEach((pop) => {
    query = query.populate(pop.path, pop.select);
  });
  
  return query;
};

const updateById = async (id, updateData) => {
  return Tournament.findByIdAndUpdate(id, { $set: updateData }, { new: true });
};

const deleteById = async (id) => {
  return Tournament.findByIdAndDelete(id);
};

const count = async (filter = {}) => {
  return Tournament.countDocuments(filter);
};

export default {
  create,
  find,
  findOne,
  findById,
  updateById,
  deleteById,
  count,
};


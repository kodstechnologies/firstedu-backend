import HallOfFame from "../models/HallOfFame.js";
import { ApiError } from "../utils/ApiError.js";

const create = async (hallOfFameData) => {
  try {
    return await HallOfFame.create(hallOfFameData);
  } catch (error) {
    throw new ApiError(500, "Failed to create hall of fame entry", error.message);
  }
};

const find = async (filter = {}, options = {}) => {
  const { populate = [], sort = { eventDate: -1 }, skip = 0, limit = 10 } = options;
  
  let query = HallOfFame.find(filter);
  
  populate.forEach((pop) => {
    query = query.populate(pop.path, pop.select);
  });
  
  return query.sort(sort).skip(skip).limit(limit);
};

const findById = async (id, populate = []) => {
  let query = HallOfFame.findById(id);
  
  populate.forEach((pop) => {
    query = query.populate(pop.path, pop.select);
  });
  
  return query;
};

const findOne = async (filter, populate = []) => {
  let query = HallOfFame.findOne(filter);
  
  populate.forEach((pop) => {
    query = query.populate(pop.path, pop.select);
  });
  
  return query;
};

const updateById = async (id, updateData) => {
  return HallOfFame.findByIdAndUpdate(id, { $set: updateData }, { new: true });
};

const deleteById = async (id) => {
  return HallOfFame.findByIdAndDelete(id);
};

const count = async (filter = {}) => {
  return HallOfFame.countDocuments(filter);
};

export default {
  create,
  find,
  findById,
  findOne,
  updateById,
  deleteById,
  count,
};


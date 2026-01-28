import Workshop from "../models/Workshop.js";
import { ApiError } from "../utils/ApiError.js";

const create = async (workshopData) => {
  try {
    return await Workshop.create(workshopData);
  } catch (error) {
    throw new ApiError(500, "Failed to create workshop", error.message);
  }
};

const find = async (filter = {}, options = {}) => {
  const { populate = [], sort = { createdAt: -1 }, skip = 0, limit = 10 } = options;
  
  let query = Workshop.find(filter);
  
  populate.forEach((pop) => {
    query = query.populate(pop.path, pop.select);
  });
  
  return query.sort(sort).skip(skip).limit(limit);
};

const findOne = async (filter, populate = []) => {
  let query = Workshop.findOne(filter);
  
  populate.forEach((pop) => {
    query = query.populate(pop.path, pop.select);
  });
  
  return query;
};

const findById = async (id, populate = []) => {
  let query = Workshop.findById(id);
  
  populate.forEach((pop) => {
    query = query.populate(pop.path, pop.select);
  });
  
  return query;
};

const updateById = async (id, updateData) => {
  return Workshop.findByIdAndUpdate(id, { $set: updateData }, { new: true });
};

const deleteById = async (id) => {
  return Workshop.findByIdAndDelete(id);
};

const count = async (filter = {}) => {
  return Workshop.countDocuments(filter);
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


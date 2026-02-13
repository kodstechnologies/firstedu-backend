import Olympiad from "../models/Olympiad.js";
import { ApiError } from "../utils/ApiError.js";

const create = async (olympiadData) => {
  try {
    return await Olympiad.create(olympiadData);
  } catch (error) {
    throw new ApiError(500, "Failed to create olympiad", error.message);
  }
};

const find = async (filter = {}, options = {}) => {
  const { populate = [], sort = { createdAt: -1 }, skip = 0, limit = 10 } = options;
  
  let query = Olympiad.find(filter);
  
  populate.forEach((pop) => {
    query = query.populate(pop.populate ? pop : { path: pop.path, select: pop.select });
  });

  return query.sort(sort).skip(skip).limit(limit);
};

const findOne = async (filter, populate = []) => {
  let query = Olympiad.findOne(filter);
  
  populate.forEach((pop) => {
    query = query.populate(pop.populate ? pop : { path: pop.path, select: pop.select });
  });

  return query;
};

const findById = async (id, populate = []) => {
  let query = Olympiad.findById(id);

  populate.forEach((pop) => {
    query = query.populate(pop.populate ? pop : { path: pop.path, select: pop.select });
  });
  
  return query;
};

const updateById = async (id, updateData) => {
  return Olympiad.findByIdAndUpdate(id, { $set: updateData }, { new: true });
};

const deleteById = async (id) => {
  return Olympiad.findByIdAndDelete(id);
};

const count = async (filter = {}) => {
  return Olympiad.countDocuments(filter);
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


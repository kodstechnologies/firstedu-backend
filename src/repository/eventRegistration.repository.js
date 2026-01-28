import EventRegistration from "../models/EventRegistration.js";
import { ApiError } from "../utils/ApiError.js";

const create = async (registrationData) => {
  try {
    return await EventRegistration.create(registrationData);
  } catch (error) {
    throw new ApiError(500, "Failed to create event registration", error.message);
  }
};

const find = async (filter = {}, options = {}) => {
  const { populate = [], sort = { registeredAt: -1 }, skip = 0, limit = 10 } = options;
  
  let query = EventRegistration.find(filter);
  
  populate.forEach((pop) => {
    query = query.populate(pop.path, pop.select);
  });
  
  return query.sort(sort).skip(skip).limit(limit);
};

const findById = async (id, populate = []) => {
  let query = EventRegistration.findById(id);
  
  populate.forEach((pop) => {
    query = query.populate(pop.path, pop.select);
  });
  
  return query;
};

const findOne = async (filter, populate = []) => {
  let query = EventRegistration.findOne(filter);
  
  populate.forEach((pop) => {
    query = query.populate(pop.path, pop.select);
  });
  
  return query;
};

const updateById = async (id, updateData) => {
  return EventRegistration.findByIdAndUpdate(id, { $set: updateData }, { new: true });
};

const deleteById = async (id) => {
  return EventRegistration.findByIdAndDelete(id);
};

const count = async (filter = {}) => {
  return EventRegistration.countDocuments(filter);
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


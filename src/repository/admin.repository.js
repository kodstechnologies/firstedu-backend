import Admin from "../models/Admin.js";
import { ApiError } from "../utils/ApiError.js";

const create = async (adminData) => {
  try {
    if (await Admin.findOne({ email: adminData.email })) {
      throw new ApiError(409, "Admin with this email already exists");
    }
    return await Admin.create(adminData);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Failed to create admin", error.message);
  }
};

const find = async (filter) => {
  return Admin.find(filter).select("-password -refreshToken").sort({ createdAt: -1 });
};

const findOne = async (filter, includePassword = false) => {
  let query = Admin.findOne(filter);
  if (!includePassword) {
    query = query.select("-password -refreshToken");
  }
  return await query;
};

const findById = async (id) => {
  return Admin.findById(id).select("-password -refreshToken");
};

const updateById = async (id, updateData) => {
  return Admin.findByIdAndUpdate(id, { $set: updateData }, { new: true }).select("-password -refreshToken");
};

const save = async (admin) => {
  return await admin.save();
};

const deleteById = async (id) => {
  return Admin.findByIdAndDelete(id);
};

export default {
  create,
  find,
  findOne,
  findById,
  updateById,
  save,
  deleteById,
};
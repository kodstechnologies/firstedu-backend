import { ApiError } from "../utils/ApiError.js";
import classTypeRepository from "../repository/classType.repository.js";

export const createClassType = async (data, createdBy) => {
  const payload = { ...data, createdBy };
  return await classTypeRepository.create(payload);
};

export const getClassTypes = async (options = {}) => {
  return await classTypeRepository.findAll({}, options);
};

export const getClassTypeById = async (id) => {
  const item = await classTypeRepository.findById(id);
  if (!item) throw new ApiError(404, "Class type not found");
  return item;
};

export const updateClassType = async (id, updateData) => {
  const existing = await classTypeRepository.findById(id);
  if (!existing) throw new ApiError(404, "Class type not found");
  return await classTypeRepository.updateById(id, updateData);
};

export const deleteClassType = async (id) => {
  const existing = await classTypeRepository.findById(id);
  if (!existing) throw new ApiError(404, "Class type not found");
  return await classTypeRepository.deleteById(id);
};

export default {
  createClassType,
  getClassTypes,
  getClassTypeById,
  updateClassType,
  deleteClassType,
};

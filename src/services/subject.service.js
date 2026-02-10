import { ApiError } from "../utils/ApiError.js";
import subjectRepository from "../repository/subject.repository.js";
import classTypeRepository from "../repository/classType.repository.js";

export const createSubject = async (data, createdBy) => {
  const classType = await classTypeRepository.findById(data.classType);
  if (!classType) throw new ApiError(404, "Class type not found");
  const payload = { ...data, createdBy };
  return await subjectRepository.create(payload);
};

export const getSubjects = async (options = {}) => {
  return await subjectRepository.findAll({}, options);
};

export const getSubjectsByClassType = async (classTypeId) => {
  const classType = await classTypeRepository.findById(classTypeId);
  if (!classType) throw new ApiError(404, "Class type not found");
  return await subjectRepository.findByClassType(classTypeId);
};

export const getSubjectById = async (id) => {
  const item = await subjectRepository.findById(id);
  if (!item) throw new ApiError(404, "Subject not found");
  return item;
};

export const updateSubject = async (id, updateData) => {
  const existing = await subjectRepository.findById(id);
  if (!existing) throw new ApiError(404, "Subject not found");
  if (updateData.classType) {
    const ct = await classTypeRepository.findById(updateData.classType);
    if (!ct) throw new ApiError(404, "Class type not found");
  }
  return await subjectRepository.updateById(id, updateData);
};

export const deleteSubject = async (id) => {
  const existing = await subjectRepository.findById(id);
  if (!existing) throw new ApiError(404, "Subject not found");
  return await subjectRepository.deleteById(id);
};

export default {
  createSubject,
  getSubjects,
  getSubjectsByClassType,
  getSubjectById,
  updateSubject,
  deleteSubject,
};

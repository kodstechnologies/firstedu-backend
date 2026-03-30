import { ApiError } from "../utils/ApiError.js";
import qnaRepository from "../repository/qna.repository.js";

export const createQnA = async (qnaData, createdBy) => {
  // Add creator info
  qnaData.createdBy = createdBy;
  qnaData.creatorModel = "Admin"; // Since this is the admin route
  qnaData.status = "approved"; // Admin created QnAs are approved by default

  const qna = await qnaRepository.create(qnaData);
  return await qnaRepository.findById(qna._id);
};

export const getAllQnAs = async (filterOptions) => {
  const result = await qnaRepository.findAll({}, filterOptions);
  return result;
};

export const getQnAById = async (id) => {
  const qna = await qnaRepository.findById(id);

  if (!qna) {
    throw new ApiError(404, "QnA not found");
  }

  return qna;
};

export const selfQnAs = async (id) => {
  const qna = await qnaRepository.selfQnAs(id);

  if (!qna) {
    throw new ApiError(404, "QnA not found");
  }

  return qna;
};

export const updateQnA = async (id, updateData) => {
  const existingQnA = await qnaRepository.findById(id);
  if (!existingQnA) {
    throw new ApiError(404, "QnA not found");
  }

  const updatedQnA = await qnaRepository.updateById(id, updateData);
  return updatedQnA;
};

export const approveQnA = async (id) => {
  const existingQnA = await qnaRepository.findById(id);
  if (!existingQnA) {
    throw new ApiError(404, "QnA not found");
  }
  return await qnaRepository.approveQnA(id);
  
};

export const deleteQnA = async (id) => {
  const qna = await qnaRepository.findById(id);
  if (!qna) {
    throw new ApiError(404, "QnA not found");
  }

  await qnaRepository.deleteById(id);
  return true;
};

export default {
  createQnA,
  approveQnA,
  selfQnAs,
  getAllQnAs,
  getQnAById,
  updateQnA,
  deleteQnA,
};

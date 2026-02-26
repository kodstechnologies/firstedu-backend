import qnaRepository from "../repository/qna.repository.js";
import ApiError from "../utils/ApiError.js";

const createQnA = async (data, adminId) => {
  return await qnaRepository.create({
    ...data,
    createdBy: adminId,
  });
};

const getAllQnA = async (filters = {}) => {
  return await qnaRepository.findAll(filters);
};

const getAllQnAPaginated = async (filters = {}, options = {}) => {
  return await qnaRepository.findAllPaginated(filters, options);
};

const getQnAById = async (id) => {
  const qna = await qnaRepository.findById(id);
  if (!qna) {
    throw new ApiError(404, "Q&A not found");
  }
  return qna;
};

const updateQnA = async (id, data) => {
  const qna = await qnaRepository.findById(id);
  if (!qna) {
    throw new ApiError(404, "Q&A not found");
  }
  return await qnaRepository.updateById(id, data);
};

const deleteQnA = async (id) => {
  const qna = await qnaRepository.findById(id);
  if (!qna) {
    throw new ApiError(404, "Q&A not found");
  }
  return await qnaRepository.deleteById(id);
};

export default {
  createQnA,
  getAllQnA,
  getAllQnAPaginated,
  getQnAById,
  updateQnA,
  deleteQnA,
};

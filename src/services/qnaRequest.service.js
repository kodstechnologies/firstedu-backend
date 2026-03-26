import qnaRequestRepository from "../repository/qnaRequest.repository.js";
import ApiError from "../utils/ApiError.js";

const submitQnARequest = async (data, userId) => {
  return await qnaRequestRepository.create({
    ...data,
    requestedBy: userId,
    status: "pending",
  });
};

const getAllQnARequests = async (filters = {}, options = {}) => {
  return await qnaRequestRepository.findAll(filters, options);
};

const getQnARequestById = async (id) => {
  const request = await qnaRequestRepository.findById(id);
  if (!request) {
    throw new ApiError(404, "Q&A request not found");
  }
  return request;
};

const getMyQnARequests = async (userId) => {
  return await qnaRequestRepository.findAll({ requestedBy: userId });
};

export default {
  submitQnARequest,
  getAllQnARequests,
  getQnARequestById,
  getMyQnARequests,
};

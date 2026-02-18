import supportRepository from "../repository/contactSupport.repositiory.js";
import ApiError from "../utils/ApiError.js";

/**
 * Submit support message
 */
 const submitSupportMessage = async (data) => {
  return await supportRepository.createSupportMessage({
    ...data,
    status: "pending",
  });
};

/**
 * Get all support messages (admin)
 */
const getAllSupportMessages = async (filters) => {
  return await supportRepository.findSupportMessages(filters);
};

/**
 * Reply and resolve
 */
const replyAndResolve = async (id, adminReply) => {
  const supportMessage = await supportRepository.findById(id);

  if (!supportMessage) {
    throw new ApiError(404, "Support message not found");
  }

  return await supportRepository.updateById(id, {
    adminReply,
    status: "resolved",
    resolvedAt: new Date(),
  });
};



export default {
  submitSupportMessage,
  getAllSupportMessages,
  replyAndResolve,
};
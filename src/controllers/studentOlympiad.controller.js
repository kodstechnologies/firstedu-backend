import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import {
  getOlympiads,
  getOlympiadById,
  initiateOlympiadRegistration,
  completeOlympiadRegistration,
  getMyOlympiads
} from "../services/studentOlympiad.service.js";
import studentOlympiadValidator from "../validation/studentOlympiad.validator.js";

export const listOlympiads = asyncHandler(async (req, res) => {
  const { page, limit, search, status, categoryId } = req.query;
  const studentId = req.user ? req.user._id : null;
  const result = await getOlympiads({ page, limit, search, status, categoryId, studentId });
  return res.status(200).json(
    ApiResponse.success(result.olympiads, "Olympiads fetched successfully", result.pagination)
  );
});

export const getOlympiadDetails = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const studentId = req.user ? req.user._id : null;
  const result = await getOlympiadById(id, studentId);
  return res.status(200).json(
    ApiResponse.success(result, "Olympiad details fetched successfully")
  );
});

export const initiateRegistration = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const studentId = req.user._id;

  const { error, value } = studentOlympiadValidator.initiateOlympiadPayment.validate(req.body);
  if (error) {
    throw new ApiError(400, "Validation Error", error.details.map((x) => x.message));
  }

  const result = await initiateOlympiadRegistration(id, studentId, value);
  
  if (result.completed) {
    return res.status(201).json(ApiResponse.success(result, "Successfully registered for Olympiad"));
  }

  return res.status(200).json(ApiResponse.success(result, "Payment order created. Complete payment and call register API."));
});

export const completeRegistration = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const studentId = req.user._id;

  const { error, value } = studentOlympiadValidator.completeOlympiadRegistration.validate(req.body);
  if (error) {
    throw new ApiError(400, "Validation Error", error.details.map((x) => x.message));
  }

  const result = await completeOlympiadRegistration(id, studentId, value);
  return res.status(201).json(ApiResponse.success(result, "Successfully registered for Olympiad"));
});

export const getMyRegistrations = asyncHandler(async (req, res) => {
  const studentId = req.user._id;
  const result = await getMyOlympiads(studentId);
  return res.status(200).json(
    ApiResponse.success(result, "My Olympiad registrations fetched successfully")
  );
});

export default {
  listOlympiads,
  getOlympiadDetails,
  initiateRegistration,
  completeRegistration,
  getMyRegistrations
};

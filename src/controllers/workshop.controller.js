import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { getEventStatus, withEventStatus } from "../utils/eventStatus.js";
import workshopService from "../services/workshop.service.js";
import eventRegistrationService from "../services/eventRegistration.service.js";
import workshopValidator from "../validation/workshop.validator.js";

// ==================== ADMIN CONTROLLERS ====================

export const createWorkshop = asyncHandler(async (req, res) => {
  const { error, value } = workshopValidator.createWorkshop.validate(req.body);

  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }

  const workshop = await workshopService.createWorkshop(value, req.user._id);
  return res.status(201).json(
    ApiResponse.success(workshop, "Workshop created successfully")
  );
});

export const getWorkshops = asyncHandler(async (req, res) => {
  const { page, limit, search, isPublished, eventType, teacherId } = req.query;
  const result = await workshopService.getWorkshops({
    page,
    limit,
    search,
    isPublished,
    eventType,
    teacherId,
  });

  const workshopsWithStatus = (result.workshops || []).map((w) => ({
    ...(w?.toObject ? w.toObject() : w),
    status: getEventStatus(w),
  }));
  return res.status(200).json(
    ApiResponse.success(workshopsWithStatus, "Workshops fetched successfully", result.pagination)
  );
});

export const getWorkshopById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const workshop = await workshopService.getWorkshopById(id);
  return res.status(200).json(
    ApiResponse.success(
      { ...(workshop?.toObject ? workshop.toObject() : workshop), status: getEventStatus(workshop) },
      "Workshop fetched successfully"
    )
  );
});

export const updateWorkshop = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { error, value } = workshopValidator.updateWorkshop.validate(req.body);

  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }

  const workshop = await workshopService.updateWorkshop(id, value);
  return res.status(200).json(
    ApiResponse.success(workshop, "Workshop updated successfully")
  );
});

export const deleteWorkshop = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await workshopService.deleteWorkshop(id);
  return res.status(200).json(
    ApiResponse.success(null, "Workshop deleted successfully")
  );
});

// ==================== STUDENT CONTROLLERS ====================

export const getPublishedWorkshops = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, search, eventType } = req.query;

  const result = await workshopService.getWorkshops({
    page,
    limit,
    search,
    isPublished: true,
    eventType,
  });

  const workshopsWithStatus = await Promise.all(
    result.workshops.map(async (workshop) => {
      const registration = await eventRegistrationService.getRegistrationByEvent(
        "workshop",
        workshop._id,
        req.user._id
      );
      const obj = withEventStatus(workshop, !!registration);
      const canJoin = obj.canJoin;
      return {
        ...obj,
        isRegistered: !!registration,
        meetingLink: canJoin ? workshop.meetingLink : undefined,
        meetingPassword: canJoin ? workshop.meetingPassword : undefined,
      };
    })
  );

  return res.status(200).json(
    ApiResponse.success(workshopsWithStatus, "Workshops fetched successfully", result.pagination)
  );
});

export const getWorkshopDetails = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const workshop = await workshopService.getWorkshopById(id);
  if (!workshop.isPublished) {
    throw new ApiError(404, "Workshop not found");
  }

  const registration = await eventRegistrationService.getRegistrationByEvent(
    "workshop",
    workshop._id,
    req.user._id
  );
  const obj = withEventStatus(workshop, !!registration);
  const canJoin = obj.canJoin;
  return res.status(200).json(
    ApiResponse.success(
      {
        ...obj,
        isRegistered: !!registration,
        meetingLink: canJoin ? workshop.meetingLink : undefined,
        meetingPassword: canJoin ? workshop.meetingPassword : undefined,
      },
      "Workshop details fetched successfully"
    )
  );
});

export const registerForWorkshop = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { error, value } = workshopValidator.registerForWorkshop.validate(req.body);

  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }
  
  const registration = await eventRegistrationService.registerForEvent(
    "workshop",
    id,
    req.user._id,
    {
      paymentStatus: "completed",
      paymentId: value.paymentId,
      paymentMethod: value.paymentMethod,
    }
  );

  return res.status(201).json(
    ApiResponse.success(registration, "Successfully registered for workshop")
  );
});

export const initiateWorkshopPayment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const data = await eventRegistrationService.initiateEventPayment(
    "workshop",
    id,
    req.user._id
  );
  return res.status(200).json(
    ApiResponse.success(data, "Payment order created. Complete payment to register.")
  );
});

export default {
  createWorkshop,
  getWorkshops,
  getWorkshopById,
  updateWorkshop,
  deleteWorkshop,
  getPublishedWorkshops,
  getWorkshopDetails,
  registerForWorkshop,
  initiateWorkshopPayment,
};


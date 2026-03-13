import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { getEventStatus, getGoesLiveAt, withEventStatus } from "../utils/eventStatus.js";
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

  const workshop = await workshopService.createWorkshop(value, req.user._id, req.file);
  return res.status(201).json(
    ApiResponse.success(workshop, "Workshop created successfully")
  );
});

export const getWorkshops = asyncHandler(async (req, res) => {
  const { page, limit, search, isPublished, eventType, teacherId, status } = req.query;
  const result = await workshopService.getWorkshops({
    page,
    limit,
    search,
    isPublished,
    eventType,
    teacherId,
    status,
  });

  const workshopsWithStatus = (result.workshops || []).map((w) => ({
    ...(w?.toObject ? w.toObject() : w),
    status: getEventStatus(w),
    goesLiveAt: getGoesLiveAt(w),
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
      {
        ...(workshop?.toObject ? workshop.toObject() : workshop),
        status: getEventStatus(workshop),
        goesLiveAt: getGoesLiveAt(workshop),
      },
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

  const workshop = await workshopService.updateWorkshop(id, value, req.file);
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
  const { page = 1, limit = 10, search, eventType, status } = req.query;

  const result = await workshopService.getWorkshops({
    page,
    limit,
    search,
    isPublished: true,
    eventType,
    status,
  });

  const workshopsWithStatus = await Promise.all(
    result.workshops.map(async (workshop) => {
      const registration = await eventRegistrationService.getRegistrationByEvent(
        "workshop",
        workshop._id,
        req.user._id
      );
      const hasPurchased = registration?.paymentStatus === "completed";
      const obj = withEventStatus(workshop, !!registration);
      const showMeetingDetails = hasPurchased && obj.isEventLive;
      const item = { ...obj, isRegistered: !!registration };
      if (showMeetingDetails) {
        item.meetingLink = workshop.meetingLink;
        item.meetingPassword = workshop.meetingPassword;
      } else {
        delete item.meetingLink;
        delete item.meetingPassword;
      }
      return item;
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
  const hasPurchased = registration?.paymentStatus === "completed";
  const obj = withEventStatus(workshop, !!registration);
  const showMeetingDetails = hasPurchased && obj.isEventLive;
  const response = { ...obj, isRegistered: !!registration };
  if (showMeetingDetails) {
    response.meetingLink = workshop.meetingLink;
    response.meetingPassword = workshop.meetingPassword;
  } else {
    delete response.meetingLink;
    delete response.meetingPassword;
  }
  return res.status(200).json(
    ApiResponse.success(response, "Workshop details fetched successfully")
  );
});

export const initiateWorkshopPayment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { error, value } = workshopValidator.initiateWorkshopPayment.validate(req.body);

  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }

  const result = await eventRegistrationService.initiateEventRegistration(
    "workshop",
    id,
    req.user._id,
    value.paymentMethod,
    { couponCode: value?.couponCode }
  );

  if (result.completed) {
    return res.status(201).json(
      ApiResponse.success(result.registration, "Successfully registered for workshop")
    );
  }

  return res.status(200).json(
    ApiResponse.success(result, "Payment order created. Complete payment and call register API.")
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
      paymentMethod: "gateway",
      razorpayOrderId: value.razorpayOrderId,
      razorpayPaymentId: value.razorpayPaymentId,
      razorpaySignature: value.razorpaySignature,
    }
  );

  return res.status(201).json(
    ApiResponse.success(registration, "Successfully registered for workshop")
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


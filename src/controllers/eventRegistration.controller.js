import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import eventRegistrationService from "../services/eventRegistration.service.js";

export const getMyEventsDashboard = asyncHandler(async (req, res) => {
  const dashboard = await eventRegistrationService.getMyEventsDashboard(req.user._id);
  return res.status(200).json(
    ApiResponse.success(dashboard, "Events dashboard fetched successfully")
  );
});

export default {
  getMyEventsDashboard,
};


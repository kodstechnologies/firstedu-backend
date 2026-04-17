import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import upgradeService from "../services/upgrade.service.js";

export const getUpgradeCost = asyncHandler(async (req, res) => {
  const { categoryId } = req.params;
  const result = await upgradeService.calculateUpgradeCost(req.user._id, categoryId);
  return res.status(200).json(ApiResponse.success(result, "Upgrade cost fetched"));
});

export const processUpgrade = asyncHandler(async (req, res) => {
  const { categoryId } = req.params;
  const { paymentMethod } = req.body;
  const result = await upgradeService.processUpgrade(req.user._id, categoryId, paymentMethod);
  return res.status(200).json(ApiResponse.success(result, "Upgrade processed"));
});

export const confirmUpgrade = asyncHandler(async (req, res) => {
  // const result = await upgradeService.confirmUpgrade(req.user._id, req.body);
  return res.status(200).json(ApiResponse.success(null, "Upgrade confirmed"));
});

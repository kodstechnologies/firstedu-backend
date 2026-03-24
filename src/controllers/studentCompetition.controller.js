import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import studentCompetitionService from "../services/studentCompetition.service.js";
import marketplaceValidator from "../validation/marketplace.validator.js";

// ==================== STUDENT COMPETITION SECTORS ====================

export const getStudentCompetitionSectors = asyncHandler(async (req, res) => {
  const sectors = await studentCompetitionService.getStudentCompetitionSectors();
  return res
    .status(200)
    .json(ApiResponse.success(sectors, "Competition Sectors fetched successfully"));
});

// ==================== COMPETITION TEST PURCHASE ====================

export const initiateTestPayment = asyncHandler(async (req, res) => {
  const { testId } = req.params;
  const studentId = req.user._id;

  const { error, value } = marketplaceValidator.initiateTestPayment.validate(
    req.body,
  );
  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message),
    );
  }

  const result = await studentCompetitionService.initiateTestPayment(
    testId,
    studentId,
    value.paymentMethod,
    { couponCode: value?.couponCode },
  );

  if (result.completed) {
    return res
      .status(201)
      .json(
        ApiResponse.success(result.purchase, "Competition test purchased successfully"),
      );
  }

  return res
    .status(200)
    .json(
      ApiResponse.success(
        result,
        "Payment order created. Complete payment and call purchase API.",
      ),
    );
});

export const purchaseTest = asyncHandler(async (req, res) => {
  const { testId } = req.params;
  const studentId = req.user._id;

  const { error, value } = marketplaceValidator.purchaseTest.validate(req.body);
  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message),
    );
  }

  const purchaseData = await studentCompetitionService.purchaseTest(
    testId,
    studentId,
    value,
  );

  return res
    .status(201)
    .json(ApiResponse.success(purchaseData, "Competition test purchased successfully"));
});

export default {
    getStudentCompetitionSectors,
    initiateTestPayment,
    purchaseTest
};

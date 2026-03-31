import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import studentCompetitionService from "../services/studentCompetition.service.js";
import marketplaceValidator from "../validation/marketplace.validator.js";

// ==================== STUDENT COMPETITION SECTORS ====================

export const getStudentCompetitionSectors = asyncHandler(async (req, res) => {
  const sectors =
    await studentCompetitionService.getStudentCompetitionSectors();
  return res
    .status(200)
    .json(
      ApiResponse.success(sectors, "Competition Sectors fetched successfully"),
    );
});

export const getCompetitions = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user?._id;
  const categories = await studentCompetitionService.getCompetitionsBySector(
    id,
    userId,
  );
  return res
    .status(200)
    .json(ApiResponse.success(categories, "Categories fetched successfully"));
});

export const getSingleCompetition = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user?._id;
  const category =
    await studentCompetitionService.getSingleCompetitionWithTests(id, userId);
  return res
    .status(200)
    .json(ApiResponse.success(category, "Category fetched successfully"));
});

// ==================== COMPETITION TEST PURCHASE ====================

// export const initiateTestPayment = asyncHandler(async (req, res) => {
//   const { testId } = req.params;
//   const studentId = req.user._id;

//   const { error, value } = marketplaceValidator.initiateTestPayment.validate(
//     req.body,
//   );
//   if (error) {
//     throw new ApiError(
//       400,
//       "Validation Error",
//       error.details.map((x) => x.message),
//     );
//   }

//   const result = await studentCompetitionService.initiateTestPayment(
//     testId,
//     studentId,
//     value.paymentMethod,
//     { couponCode: value?.couponCode },
//   );

//   if (result.completed) {
//     return res
//       .status(201)
//       .json(
//         ApiResponse.success(result.purchase, "Competition test purchased successfully"),
//       );
//   }

//   return res
//     .status(200)
//     .json(
//       ApiResponse.success(
//         result,
//         "Payment order created. Complete payment and call purchase API.",
//       ),
//     );
// });

// export const purchaseTest = asyncHandler(async (req, res) => {
//   const { testId } = req.params;
//   const studentId = req.user._id;

//   const { error, value } = marketplaceValidator.purchaseTest.validate(req.body);
//   if (error) {
//     throw new ApiError(
//       400,
//       "Validation Error",
//       error.details.map((x) => x.message),
//     );
//   }

//   const purchaseData = await studentCompetitionService.purchaseTest(
//     testId,
//     studentId,
//     value,
//   );

//   return res
//     .status(201)
//     .json(ApiResponse.success(purchaseData, "Competition test purchased successfully"));
// });

// ==================== COMPETITION CATEGORY (BUNDLE) PURCHASE ====================

export const initiateCategoryPayment = asyncHandler(async (req, res) => {
  const { categoryId } = req.params;
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

  const result = await studentCompetitionService.initiateCategoryPayment(
    categoryId,
    studentId,
    value.paymentMethod,
    { couponCode: value?.couponCode },
  );

  if (result.completed) {
    return res
      .status(201)
      .json(
        ApiResponse.success(result.purchase, "Category purchased successfully"),
      );
  }

  return res
    .status(200)
    .json(ApiResponse.success(result, "Payment order created for category"));
});

export const purchaseCategory = asyncHandler(async (req, res) => {
  const { categoryId } = req.params;
  const studentId = req.user._id;

  const { error, value } = marketplaceValidator.purchaseTest.validate(req.body);
  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message),
    );
  }

  const purchaseData = await studentCompetitionService.purchaseCategory(
    categoryId,
    studentId,
    value,
  );

  return res
    .status(201)
    .json(
      ApiResponse.success(
        purchaseData,
        "Category purchase completed successfully",
      ),
    );
});

export default {
  getStudentCompetitionSectors,
  getCompetitions,
  getSingleCompetition,
  // initiateTestPayment,
  // purchaseTest,
  initiateCategoryPayment,
  purchaseCategory,
};

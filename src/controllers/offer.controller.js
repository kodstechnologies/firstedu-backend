import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import offerRepository from "../repository/offer.repository.js";

// Create Offer
export const createOffer = asyncHandler(async (req, res) => {
    const { offerName, applicableOn, discountType, discountValue, validTill, status, description } = req.body;

    if (!offerName || !applicableOn || !discountType || discountValue === undefined) {
        throw new ApiError(400, "Missing required fields: offerName, applicableOn, discountType, discountValue");
    }

    // Basic Validation
    const VALID_APPLICABLE_ON = ["all", "Test", "TestSeries", "Course", "Olympiads", "Tournament", "Workshop", "Ecommerce", "CompetitionCategory", "LiveCompetition", "School", "Competitive", "Skill Development"];
    if (!VALID_APPLICABLE_ON.includes(applicableOn)) {
        throw new ApiError(400, `applicableOn must be one of: ${VALID_APPLICABLE_ON.join(", ")}`);
    }
    if (!["percentage", "fixed"].includes(discountType)) {
        throw new ApiError(400, "discountType must be either 'percentage' or 'fixed'");
    }
    if (discountValue < 0) {
        throw new ApiError(400, "discountValue must be non-negative");
    }

    const offerData = {
        offerName,
        applicableOn,
        discountType,
        discountValue,
        validTill: validTill || null,
        status: status || "inactive",
        description
    };

    // If validTill is provided, ensure it is at least tomorrow
    if (validTill) {
        const startOfTodayUTC = new Date();
        startOfTodayUTC.setUTCHours(0, 0, 0, 0);
        if (new Date(validTill) <= startOfTodayUTC) {
            throw new ApiError(400, "Valid Till date must be at least tomorrow, not today or earlier");
        }
    }

    const offer = await offerRepository.createOffer(offerData);

    return res.status(201).json(ApiResponse.success(offer, "Offer created successfully"));
});

// Get All Offers (Admin)
export const getOffers = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, applicableOn, status, search } = req.query;

    const query = {};
    if (applicableOn) query.applicableOn = applicableOn;
    if (status) query.status = status;
    if (search) {
        query.offerName = { $regex: search, $options: "i" };
    }

    const result = await offerRepository.getAllOffers(query, { page, limit });

    return res.status(200).json(
        ApiResponse.success(result.offers, "Offers fetched successfully", result.pagination)
    );
});

// Get Offer By ID
export const getOfferById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const offer = await offerRepository.getOfferById(id);

    if (!offer) {
        throw new ApiError(404, "Offer not found");
    }

    return res.status(200).json(ApiResponse.success(offer, "Offer fetched successfully"));
});

// Update Offer
export const updateOffer = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updateData = req.body;

    const updatedOffer = await offerRepository.updateOffer(id, updateData);

    if (!updatedOffer) {
        throw new ApiError(404, "Offer not found");
    }

    return res.status(200).json(ApiResponse.success(updatedOffer, "Offer updated successfully"));
});

// Delete Offer
export const deleteOffer = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const deletedOffer = await offerRepository.deleteOffer(id);

    if (!deletedOffer) {
        throw new ApiError(404, "Offer not found");
    }

    return res.status(200).json(ApiResponse.success(null, "Offer deleted successfully"));
});

export default {
    createOffer,
    getOffers,
    getOfferById,
    updateOffer,
    deleteOffer
};

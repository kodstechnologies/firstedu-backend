import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import competitionService from "../services/competition.service.js";
import competitionValidator from "../validation/competition.validator.js";

// ── Create Competition ─────────────────────────────────────────────────────────
export const createCompetition = asyncHandler(async (req, res) => {
    const { error, value } = competitionValidator.createCompetition.validate(req.body, {
        abortEarly: false,
    });

    if (error) {
        throw new ApiError(
            400,
            "Validation Error",
            error.details.map((x) => x.message)
        );
    }

    const competition = await competitionService.createCompetition(value);
    return res
        .status(201)
        .json(ApiResponse.success(competition, "Competition created successfully"));
});

// ── Get All Competitions ───────────────────────────────────────────────────────
export const getCompetitions = asyncHandler(async (req, res) => {
    const { page, limit, search, status } = req.query;
    const result = await competitionService.getCompetitions({ page, limit, search, status });

    return res
        .status(200)
        .json(
            ApiResponse.success(
                result.competitions,
                "Competitions fetched successfully",
                result.pagination
            )
        );
});

// ── Get Competition by ID or Slug ─────────────────────────────────────────────
export const getCompetitionByIdOrSlug = asyncHandler(async (req, res) => {
    const { idOrSlug } = req.params;
    const competition = await competitionService.getCompetitionByIdOrSlug(idOrSlug);

    return res
        .status(200)
        .json(ApiResponse.success(competition, "Competition fetched successfully"));
});

// ── Update Competition ─────────────────────────────────────────────────────────
export const updateCompetition = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { error, value } = competitionValidator.updateCompetition.validate(req.body, {
        abortEarly: false,
    });

    if (error) {
        throw new ApiError(
            400,
            "Validation Error",
            error.details.map((x) => x.message)
        );
    }

    const competition = await competitionService.updateCompetition(id, value);
    return res
        .status(200)
        .json(ApiResponse.success(competition, "Competition updated successfully"));
});

// ── Delete Competition ─────────────────────────────────────────────────────────
export const deleteCompetition = asyncHandler(async (req, res) => {
    const { id } = req.params;
    await competitionService.deleteCompetition(id);

    return res
        .status(200)
        .json(ApiResponse.success(null, "Competition deleted successfully"));
});

export default {
    createCompetition,
    getCompetitions,
    getCompetitionByIdOrSlug,
    updateCompetition,
    deleteCompetition,
};

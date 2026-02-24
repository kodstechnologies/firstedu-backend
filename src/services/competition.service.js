import { ApiError } from "../utils/ApiError.js";
import competitionRepository from "../repository/competition.repository.js";

// Utility: generate a URL-safe slug from a string
const generateSlug = (text) =>
    text
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-");

// ── Create ─────────────────────────────────────────────────────────────────────
export const createCompetition = async (data) => {
    // Auto-generate slug from label if not provided
    const slug = data.slug ? data.slug : generateSlug(data.label);

    // Check slug uniqueness
    const existing = await competitionRepository.findBySlug(slug);
    if (existing) {
        throw new ApiError(409, `Competition with slug "${slug}" already exists`);
    }

    return competitionRepository.create({ ...data, slug });
};

// ── Get All (paginated) ────────────────────────────────────────────────────────
export const getCompetitions = async (options = {}) => {
    const { page = 1, limit = 10, search, status } = options;

    const query = {};

    if (search) {
        query.$or = [
            { label: { $regex: search, $options: "i" } },
            { category: { $regex: search, $options: "i" } },
            { slug: { $regex: search, $options: "i" } },
        ];
    }

    if (status) {
        query.status = status;
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const [competitions, total] = await Promise.all([
        competitionRepository.find(query, {
            sort: { createdAt: -1 },
            skip,
            limit: limitNum,
        }),
        competitionRepository.count(query),
    ]);

    return {
        competitions,
        pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            pages: Math.ceil(total / limitNum) || 1,
        },
    };
};

// ── Get by ID or Slug ──────────────────────────────────────────────────────────
export const getCompetitionByIdOrSlug = async (idOrSlug) => {
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(idOrSlug);

    const competition = isObjectId
        ? await competitionRepository.findById(idOrSlug)
        : await competitionRepository.findBySlug(idOrSlug);

    if (!competition) {
        throw new ApiError(404, "Competition not found");
    }

    return competition;
};

// ── Update ─────────────────────────────────────────────────────────────────────
export const updateCompetition = async (id, updateData) => {
    const competition = await competitionRepository.findById(id);
    if (!competition) {
        throw new ApiError(404, "Competition not found");
    }

    // If slug is being updated check uniqueness against other documents
    if (updateData.slug && updateData.slug !== competition.slug) {
        const existing = await competitionRepository.findBySlug(updateData.slug);
        if (existing && existing._id.toString() !== id) {
            throw new ApiError(
                409,
                `Competition with slug "${updateData.slug}" already exists`
            );
        }
    }

    return competitionRepository.updateById(id, updateData);
};

// ── Delete ─────────────────────────────────────────────────────────────────────
export const deleteCompetition = async (id) => {
    const competition = await competitionRepository.findById(id);
    if (!competition) {
        throw new ApiError(404, "Competition not found");
    }
    return competitionRepository.deleteById(id);
};

export default {
    createCompetition,
    getCompetitions,
    getCompetitionByIdOrSlug,
    updateCompetition,
    deleteCompetition,
};

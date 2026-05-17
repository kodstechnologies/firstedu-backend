import Offer from "../models/Offer.js";
import { ApiError } from "../utils/ApiError.js";

const createOffer = async (offerData) => {
    try {
        // If creating an active offer, deactivate conflicting active offers:
        // - If this offer is "all", deactivate ALL active offers (global replaces everything)
        // - If this is specific, deactivate any active offer for the same module AND any active "all" offer
        if (offerData.status === "active") {
            const entityId = offerData.entityId || null;
            let deactivateQuery;
            if (offerData.applicableOn === "all") {
                // A new "all" offer supersedes every active offer
                deactivateQuery = { status: "active", entityId };
            } else {
                // A specific offer supersedes same-module AND "all" offers
                deactivateQuery = {
                    applicableOn: { $in: [offerData.applicableOn, "all"] },
                    status: "active",
                    entityId,
                };
            }
            await Offer.updateMany(deactivateQuery, { $set: { status: "inactive" } });
        }
        return await Offer.create(offerData);
    } catch (error) {
        if (error.code === 11000) {
            throw new ApiError(400, "An active offer already exists for this module.");
        }
        throw new ApiError(500, "Failed to create offer", error.message);
    }
};

const getActiveOffer = async (moduleType) => {
    try {
        const now = new Date();
        const validityFilter = { $or: [{ validTill: null }, { validTill: { $gte: now } }] };

        // 1. Try to find a specific active offer for this exact moduleType first
        const specificOffer = await Offer.findOne({
            applicableOn: moduleType,
            status: "active",
            entityId: null,
            ...validityFilter,
        });
        if (specificOffer) return specificOffer;

        // 2. Fall back to an active "all" offer (global discount)
        return await Offer.findOne({
            applicableOn: "all",
            status: "active",
            entityId: null,
            ...validityFilter,
        });
    } catch (error) {
        throw new ApiError(500, "Failed to fetch active offer", error.message);
    }
};

const getAllOffers = async (query = {}, options = {}) => {
    try {
        const { page = 1, limit = 10, sortBy = "createdAt", sortOrder = "desc" } = options;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;
        const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

        const [offers, total] = await Promise.all([
            Offer.find(query).sort(sort).skip(skip).limit(limitNum),
            Offer.countDocuments(query),
        ]);

        return {
            offers,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                pages: Math.ceil(total / limitNum) || 1,
            },
        };
    } catch (error) {
        throw new ApiError(500, "Failed to fetch offers", error.message);
    }
};

const updateOffer = async (id, updateData) => {
    try {
        // If updating status to active, handle conflicts
        if (updateData.status === "active") {
            const offer = await Offer.findById(id);
            if (offer) {
                const applicableOn = updateData.applicableOn || offer.applicableOn;
                let deactivateQuery;
                if (applicableOn === "all") {
                    // Activating an "all" offer → deactivate every other active offer
                    deactivateQuery = { status: "active", _id: { $ne: id } };
                } else {
                    // Activating a specific offer → deactivate same-module AND any "all" offer
                    deactivateQuery = {
                        applicableOn: { $in: [applicableOn, "all"] },
                        status: "active",
                        _id: { $ne: id },
                    };
                }
                await Offer.updateMany(deactivateQuery, { $set: { status: "inactive" } });
            }
        }

        return await Offer.findByIdAndUpdate(id, updateData, { new: true });
    } catch (error) {
        throw new ApiError(500, "Failed to update offer", error.message);
    }
};

const deleteOffer = async (id) => {
    try {
        return await Offer.findByIdAndDelete(id);
    } catch (error) {
        throw new ApiError(500, "Failed to delete offer", error.message);
    }
};

const getOfferById = async (id) => {
    try {
        return await Offer.findById(id);
    } catch (error) {
        throw new ApiError(500, "Failed to fetch offer", error.message);
    }
};

export default {
    createOffer,
    getActiveOffer,
    getAllOffers,
    updateOffer,
    deleteOffer,
    getOfferById
};

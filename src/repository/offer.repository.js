import Offer from "../models/Offer.js";
import { ApiError } from "../utils/ApiError.js";

const createOffer = async (offerData) => {
    try {
        // If creating an active offer, deactivate any existing active offer for the same module
        if (offerData.status === "active") {
            await Offer.updateMany(
                { applicableOn: offerData.applicableOn, status: "active" },
                { $set: { status: "inactive" } }
            );
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
        // Find active offer that is either not expired (validTill >= now) or has no expiry (validTill is null)
        return await Offer.findOne({
            applicableOn: moduleType,
            status: "active",
            $or: [{ validTill: null }, { validTill: { $gte: new Date() } }],
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
                // Enforce same module type logic if applicableOn is not in updateData
                const applicableOn = updateData.applicableOn || offer.applicableOn;

                await Offer.updateMany(
                    {
                        applicableOn: applicableOn,
                        status: "active",
                        _id: { $ne: id }
                    },
                    { $set: { status: "inactive" } }
                );
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

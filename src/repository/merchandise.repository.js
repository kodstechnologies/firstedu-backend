import Merchandise from "../models/Merchandise.js";
import MerchandiseClaim from "../models/MerchandiseClaim.js";
import { ApiError } from "../utils/ApiError.js";

const findMerchandiseById = async (id) => {
  try {
    return await Merchandise.findById(id);
  } catch (error) {
    throw new ApiError(500, "Failed to fetch merchandise", error.message);
  }
};

const findMerchandise = async (query, options = {}) => {
  try {
    const { page = 1, limit = 10, sort = { createdAt: -1 } } = options;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const [items, total] = await Promise.all([
      Merchandise.find(query).sort(sort).skip(skip).limit(limitNum),
      Merchandise.countDocuments(query),
    ]);

    return {
      items,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    };
  } catch (error) {
    throw new ApiError(500, "Failed to fetch merchandise items", error.message);
  }
};

const createMerchandise = async (merchandiseData) => {
  try {
    const payload = {
      name: merchandiseData.name,
      pointsRequired: merchandiseData.pointsRequired,
      description: merchandiseData.description || undefined,
      imageUrl: merchandiseData.imageUrl || undefined,
      category: merchandiseData.category ?? "general",
      isPhysical: merchandiseData.isPhysical ?? false,
      isActive: merchandiseData.isActive ?? true,
      stockQuantity: merchandiseData.stockQuantity ?? null,
    };
    return await Merchandise.create(payload);
  } catch (error) {
    const message = error.name === "ValidationError" ? error.message : "Failed to create merchandise";
    const statusCode = error.name === "ValidationError" ? 400 : 500;
    throw new ApiError(statusCode, message);
  }
};

const updateMerchandise = async (id, updateData) => {
  try {
    return await Merchandise.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });
  } catch (error) {
    throw new ApiError(500, "Failed to update merchandise", error.message);
  }
};

const deleteMerchandise = async (id) => {
  try {
    return await Merchandise.findByIdAndDelete(id);
  } catch (error) {
    throw new ApiError(500, "Failed to delete merchandise", error.message);
  }
};

const createMerchandiseClaim = async (claimData) => {
  try {
    return await MerchandiseClaim.create(claimData);
  } catch (error) {
    throw new ApiError(500, "Failed to create merchandise claim", error.message);
  }
};

const findMerchandiseClaimById = async (id) => {
  try {
    return await MerchandiseClaim.findById(id)
      .populate("merchandise", "name description imageUrl pointsRequired isPhysical")
      .populate("student", "name email phone");
  } catch (error) {
    throw new ApiError(500, "Failed to fetch merchandise claim", error.message);
  }
};

const findMerchandiseClaims = async (query, options = {}) => {
  try {
    const { page = 1, limit = 10, sort = { claimedAt: -1 } } = options;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const [claims, total] = await Promise.all([
      MerchandiseClaim.find(query)
        .populate("merchandise", "name description imageUrl pointsRequired isPhysical")
        .populate("student", "name email phone")
        .sort(sort)
        .skip(skip)
        .limit(limitNum),
      MerchandiseClaim.countDocuments(query),
    ]);

    return {
      claims,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    };
  } catch (error) {
    throw new ApiError(500, "Failed to fetch merchandise claims", error.message);
  }
};

const updateMerchandiseClaim = async (id, updateData) => {
  try {
    return await MerchandiseClaim.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    })
      .populate("merchandise", "name description imageUrl pointsRequired")
      .populate("student", "name email phone");
  } catch (error) {
    throw new ApiError(500, "Failed to update merchandise claim", error.message);
  }
};

export default {
  findMerchandiseById,
  findMerchandise,
  createMerchandise,
  updateMerchandise,
  deleteMerchandise,
  createMerchandiseClaim,
  findMerchandiseClaimById,
  findMerchandiseClaims,
  updateMerchandiseClaim,
};


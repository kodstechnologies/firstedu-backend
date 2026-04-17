import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import categoryValidator from "../validation/category.validator.js";
import offerRepository from "../repository/offer.repository.js";
import couponRepository from "../repository/coupon.repository.js";
import categoryRepository from "../repository/category.repository.js";
import categoryService from "../services/category.service.js";
import { uploadImageToCloudinary } from "../utils/s3Upload.js";
import Coupon from "../models/Coupon.js";

export const createCategory = asyncHandler(async (req, res) => {
  const { error, value } = categoryValidator.createCategory.validate(req.body);
  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }
  const created = await categoryService.createCategory(value, req.user._id);
  return res
    .status(201)
    .json(ApiResponse.success(created, "Category created successfully"));
});

export const getCategories = asyncHandler(async (req, res) => {
  const { page, limit, search, parent, isActive, sortBy, sortOrder } =
    req.query;
  const result = await categoryService.getCategories({
    page,
    limit,
    search,
    parent,
    isActive,
    sortBy,
    sortOrder,
  });
  return res.status(200).json(
      ApiResponse.success(
        result.items,
        "Categories fetched successfully",
      result.pagination
    )
    );
});

export const getCategoryTree = asyncHandler(async (req, res) => {
  const { rootType } = req.query;
  const filter = rootType ? { rootType } : {};
  const tree = await categoryService.getCategoryTree(filter);
  return res
    .status(200)
    .json(ApiResponse.success(tree, "Category tree fetched successfully"));
});

/**
 * Student-facing: Get all categories (tree or flat) with optional filter.
 * Query: linkedTo=all|questionBank|test|testBundle|both|olympiad|tournament, format=tree|flat
 * - all: union of test + testBundle + olympiad + tournament
 * - questionBank: categories on any question bank
 * - test: only categories used by published tests
 * - testBundle: only categories used by tests inside active test bundles
 * - both: union of test + testBundle
 * - olympiad: categories used by published olympiads (via their test's question bank)
 * - tournament: categories used by published tournaments (via stage tests' question banks)
 */
export const getCategoriesForStudent = asyncHandler(async (req, res) => {
  const { linkedTo, format = "tree", rootType } = req.query;
  const studentId = req.user?._id;

  const validLinkedTo = ["all", "questionBank", "test", "testBundle", "both", "olympiad", "tournament", "examhall"].includes(linkedTo)
    ? linkedTo
    : null;
  const validFormat = ["tree", "flat"].includes(format) ? format : "tree";

  const result = await categoryService.getCategoriesForStudent({
    linkedTo: validLinkedTo,
    format: validFormat,
    rootType,
    studentId,
  });

  return res.status(200).json(
      ApiResponse.success(
        result,
        validLinkedTo && validLinkedTo !== "all"
          ? `Categories filtered by ${validLinkedTo} fetched successfully`
        : "Categories fetched successfully"
    )
    );
});

export const getCategoryById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const item = await categoryService.getCategoryById(id);
  return res
    .status(200)
    .json(ApiResponse.success(item, "Category fetched successfully"));
});

export const getCategoryDetailForStudent = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const item = await categoryService.getCategoryById(id);
  return res
    .status(200)
    .json(ApiResponse.success(item, "Category details fetched successfully"));
});

export const getCategoryChildren = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const parentId = id === "root" || id === "null" || !id ? null : id;
  const children = await categoryService.getChildren(parentId);
  return res.status(200).json(
    ApiResponse.success(children, "Child categories fetched successfully")
    );
});

export const updateCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existing = await categoryService.getCategoryById(id);
  if (existing.isPredefined) {
    throw new ApiError(403, "Cannot modify name of predefined category. Use pricing endpoint for prices.");
  }
  const { error, value } = categoryValidator.updateCategory.validate(req.body);
  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }
  const updated = await categoryService.updateCategory(id, value);
  return res
    .status(200)
    .json(ApiResponse.success(updated, "Category updated successfully"));
});

export const deleteCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existing = await categoryService.getCategoryById(id);
  if (existing.isPredefined) {
    throw new ApiError(403, "Cannot delete predefined categories.");
  }
  await categoryService.deleteCategory(id);
  return res
    .status(200)
    .json(ApiResponse.success(null, "Category deleted successfully"));
});

export const updateCategoryPricing = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const existing = await categoryService.getCategoryById(id);
  if (existing.isPredefined) {
    throw new ApiError(403, "Cannot modify pricing or discounts for top-level pillar categories.");
  }
  
  if (existing.rootType === 'Olympiads') {
    throw new ApiError(403, "Pricing and purchases are not supported for Olympiad subcategories.");
  }
  
  // Handle file upload if present
  if (req.file) {
    const imageUrl = await uploadImageToCloudinary(
      req.file.buffer,
      req.file.originalname,
      "categories/banners",
      req.file.mimetype
    );
    req.body.bannerImg = imageUrl;
  }

  // Parse types from multipart/form-data
  if (req.body.isFree === "true") req.body.isFree = true;
  if (req.body.isFree === "false") req.body.isFree = false;
  if (req.body.price) req.body.price = Number(req.body.price);
  if (req.body.capacity) req.body.capacity = Number(req.body.capacity);
  if (req.body.discountedPrice) req.body.discountedPrice = Number(req.body.discountedPrice);
  if (req.body.subjects) {
    if (typeof req.body.subjects === 'string') {
      try { req.body.subjects = JSON.parse(req.body.subjects); } catch (e) { req.body.subjects = [req.body.subjects]; }
    }
  }
  if (req.body.tags) {
    if (typeof req.body.tags === 'string') {
      try { req.body.tags = JSON.parse(req.body.tags); } catch (e) { req.body.tags = [req.body.tags]; }
    }
  }

  const { error, value } = categoryValidator.updateCategoryPricing.validate(req.body);
  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }
  const updated = await categoryService.updateCategoryPricing(id, value);
  return res
    .status(200)
    .json(ApiResponse.success(updated, "Category pricing updated successfully"));
});

// Category Specific Offers
export const createCategoryOffer = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { offerName, discountType, discountValue, validTill, description } = req.body;

  const category = await categoryService.getCategoryById(id);
  if (!category) throw new ApiError(404, "Category not found");
  if (category.rootType === 'Olympiads') {
    throw new ApiError(403, "Offers are not supported for Olympiad subcategories.");
  }

  const offerData = {
    offerName,
    applicableOn: category.rootType || "CompetitionCategory", // dummy, validation requirement
    discountType,
    discountValue,
    validTill: validTill || null,
    status: "active",
    description
  };

  const offer = await offerRepository.createOffer(offerData);
  // 'custom' policy means this category has its own override; global pillar offer is blocked
  await categoryRepository.updateById(id, { offerOverrideId: offer._id, offerPolicy: "custom" });
  
  return res.status(201).json(ApiResponse.success(offer, "Subcategory offer created"));
});

export const removeCategoryOffer = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const category = await categoryService.getCategoryById(id);
  if (!category) throw new ApiError(404, "Category not found");
  if (category.rootType === 'Olympiads') {
    throw new ApiError(403, "Offers are not supported for Olympiad subcategories.");
  }

  if (category.offerOverrideId) {
    await offerRepository.deleteOffer(category.offerOverrideId);
    // Reset back to inherit so global pillar offer applies again
    await categoryRepository.updateById(id, { offerOverrideId: null, offerPolicy: "inherit" });
  }

  return res.status(200).json(ApiResponse.success(null, "Offer removed successfully"));
});

// Category Specific Coupons
export const createCategoryCoupon = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { code, description, discountType, discountValue, validFrom, validUntil, usageLimit, isActive } = req.body;

  const category = await categoryService.getCategoryById(id);
  if (!category) throw new ApiError(404, "Category not found");
  if (category.rootType === 'Olympiads') {
    throw new ApiError(403, "Coupons are not supported for Olympiad subcategories.");
  }

  const couponData = {
    code, description, discountType, discountValue, validFrom, validUntil, usageLimit, isActive,
    applicableTo: "all",
    applicableCategoryId: id
  };

  const coupon = await couponRepository.createCoupon(couponData);

  return res.status(201).json(ApiResponse.success(coupon, "Subcategory coupon created"));
});

export const getCategoryCoupons = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const coupons = await Coupon.find({ applicableCategoryId: id }).sort({ createdAt: -1 });
  return res.status(200).json(ApiResponse.success(coupons, "Coupons fetched"));
});

export const deleteCategoryCoupon = asyncHandler(async (req, res) => {
  const { couponId } = req.params;
  await couponRepository.deleteCoupon(couponId);
  return res.status(200).json(ApiResponse.success(null, "Coupon removed"));
});

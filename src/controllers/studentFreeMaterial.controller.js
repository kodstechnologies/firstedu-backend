import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import FreeMaterial from "../models/FreeMaterial.js";
import Category from "../models/Category.js";

// ==================== STUDENT CONTROLLERS ====================

// @desc    Get the 4 pillar categories and their 1st level subcategories for Free Materials
// @route   GET /api/v1/user/free-materials/categories
export const getCategories = asyncHandler(async (req, res) => {
  // The 4 pillar category names requested by the user
  const pillarNames = ['Olympiads', 'School', 'Skill Development', 'Competitive'];

  // 1. Find the parent categories that match these names exactly
  const pillars = await Category.find({
    name: { $in: pillarNames },
    isActive: true,
  }).select('_id name slug image');

  const result = [];

  // 2. For each pillar, fetch its direct children (1st level subcategories)
  for (const pillar of pillars) {
    const children = await Category.find({
      parentCategory: pillar._id,
      isActive: true,
    }).select('_id name slug image').sort({ order: 1, name: 1 });

    result.push({
      _id: pillar._id,
      name: pillar.name,
      slug: pillar.slug,
      image: pillar.image,
      children: children,
    });
  }

  // Optional: Sort the result array to match the requested order
  result.sort((a, b) => pillarNames.indexOf(a.name) - pillarNames.indexOf(b.name));

  return res.status(200).json(
    ApiResponse.success(result, "Free material categories fetched successfully")
  );
});

// @desc    Get free materials based on category/subCategory
// @route   GET /api/v1/user/free-materials
export const getMaterials = asyncHandler(async (req, res) => {
  const { category, subCategory } = req.query;

  const filter = {};
  if (category) filter.category = category;
  if (subCategory) filter.subCategory = subCategory;

  const materials = await FreeMaterial.find(filter)
    .populate('category', 'name slug')
    .populate('subCategory', 'name slug')
    .sort({ createdAt: -1 });

  return res.status(200).json(
    ApiResponse.success(materials, "Free materials fetched successfully")
  );
});

export default {
  getCategories,
  getMaterials,
};

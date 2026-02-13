import { ApiError } from "../utils/ApiError.js";
import categoryRepository from "../repository/category.repository.js";

export const createCategory = async (data, createdBy) => {
  if (data.parent) {
    const parent = await categoryRepository.findById(data.parent);
    if (!parent) throw new ApiError(404, "Parent category not found");
  }
  const payload = {
    name: data.name,
    parent: data.parent || null,
    order: data.order ?? 0,
    createdBy,
  };
  return await categoryRepository.create(payload);
};

/**
 * Create a category with sub-categories and options in one call.
 * Structure: Category (e.g. School) -> Sub-categories (e.g. Classes, Subjects) -> Options (e.g. Class 1, Physics)
 */
export const createCategoryWithSubcategories = async (data, createdBy) => {
  const root = await categoryRepository.create({
    name: data.name,
    parent: null,
    order: 0,
    createdBy,
  });

  const result = {
    category: root,
    subCategories: [],
  };

  let subOrder = 0;
  for (const sub of data.subCategories) {
    const subCategory = await categoryRepository.create({
      name: sub.name,
      parent: root._id,
      order: subOrder++,
      createdBy,
    });
    result.subCategories.push({
      subCategory,
      options: [],
    });

    let optionOrder = 0;
    for (const optionName of sub.options) {
      const option = await categoryRepository.create({
        name: optionName,
        parent: subCategory._id,
        order: optionOrder++,
        createdBy,
      });
      result.subCategories[result.subCategories.length - 1].options.push(option);
    }
  }

  return result;
}

export const getCategories = async (options = {}) => {
  return await categoryRepository.findAll({}, options);
};

export const getCategoryTree = async () => {
  return await categoryRepository.findTree({});
};

export const getCategoryById = async (id) => {
  const item = await categoryRepository.findById(id);
  if (!item) throw new ApiError(404, "Category not found");
  return item;
};

export const getChildren = async (parentId) => {
  return await categoryRepository.findChildren(parentId);
};

export const updateCategory = async (id, updateData) => {
  const existing = await categoryRepository.findById(id);
  if (!existing) throw new ApiError(404, "Category not found");
  if (updateData.parent) {
    if (updateData.parent === id) {
      throw new ApiError(400, "Category cannot be its own parent");
    }
    const parent = await categoryRepository.findById(updateData.parent);
    if (!parent) throw new ApiError(404, "Parent category not found");
  }
  return await categoryRepository.updateById(id, updateData);
};

export const deleteCategory = async (id, cascade = true) => {
  const existing = await categoryRepository.findById(id);
  if (!existing) throw new ApiError(404, "Category not found");
  if (cascade) {
    return await categoryRepository.deleteByIdCascade(id);
  }
  const hasChild = await categoryRepository.hasChildren(id);
  if (hasChild) {
    throw new ApiError(
      400,
      "Cannot delete category with subcategories. Use cascade delete or delete children first."
    );
  }
  return await categoryRepository.deleteById(id);
};

export default {
  createCategory,
  createCategoryWithSubcategories,
  getCategories,
  getCategoryTree,
  getCategoryById,
  getChildren,
  updateCategory,
  deleteCategory,
};

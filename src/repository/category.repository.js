import Category from "../models/Category.js";
import { ApiError } from "../utils/ApiError.js";

const create = async (data) => {
  try {
    return await Category.create(data);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Failed to create category", error.message);
  }
};

const findById = async (id, populate = true) => {
  try {
    let q = Category.findById(id);
    if (populate) {
      q = q.populate("parent", "name order");
    }
    return await q;
  } catch (error) {
    throw new ApiError(500, "Failed to fetch category", error.message);
  }
};

const findAll = async (filter = {}, options = {}) => {
  try {
    const {
      page = 1,
      limit = 50,
      sortBy = "order",
      sortOrder = "asc",
      search,
      parent,
      isActive,
    } = options;

    const query = { ...filter };
    if (parent !== undefined) {
      query.parent = parent === "null" || parent === "" ? null : parent;
    }
    if (typeof isActive !== "undefined") {
      query.isActive = isActive === "true" || isActive === true;
    }
    if (search) {
      query.name = { $regex: search, $options: "i" };
    }

    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit) || 50, 100);
    const skip = (pageNum - 1) * limitNum;
    const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

    const [items, total] = await Promise.all([
      Category.find(query)
        .populate("parent", "name order")
        .sort(sort)
        .skip(skip)
        .limit(limitNum),
      Category.countDocuments(query),
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
    throw new ApiError(500, "Failed to fetch categories", error.message);
  }
};

const findTree = async (filter = {}) => {
  try {
    const all = await Category.find({ ...filter, isActive: true })
      .sort({ order: 1, createdAt: 1 })
      .populate("parent", "name order")
      .lean();

    const byId = new Map();
    all.forEach((c) => {
      byId.set(c._id.toString(), { ...c, children: [] });
    });

    const roots = [];
    all.forEach((c) => {
      const node = byId.get(c._id.toString());
      if (!c.parent) {
        roots.push(node);
      } else {
        const parentId = c.parent._id?.toString?.() || c.parent?.toString?.();
        const parent = byId.get(parentId);
        if (parent) {
          parent.children.push(node);
        } else {
          roots.push(node);
        }
      }
    });

    return roots;
  } catch (error) {
    throw new ApiError(500, "Failed to fetch category tree", error.message);
  }
};

const findChildren = async (parentId) => {
  try {
    const query = parentId ? { parent: parentId } : { parent: null };
    return await Category.find(query)
      .populate("parent", "name order")
      .sort({ order: 1, createdAt: 1 })
      .lean();
  } catch (error) {
    throw new ApiError(500, "Failed to fetch child categories", error.message);
  }
};

const updateById = async (id, updateData) => {
  try {
    return await Category.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    ).populate("parent", "name order");
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Failed to update category", error.message);
  }
};

const deleteById = async (id) => {
  try {
    const deleted = await Category.findByIdAndDelete(id);
    if (!deleted) throw new ApiError(404, "Category not found");
    return deleted;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Failed to delete category", error.message);
  }
};

/** Recursively delete category and all its descendants */
const deleteByIdCascade = async (id) => {
  try {
    const category = await Category.findById(id);
    if (!category) throw new ApiError(404, "Category not found");

    const children = await Category.find({ parent: id }).select("_id");
    for (const child of children) {
      await deleteByIdCascade(child._id);
    }
    await Category.findByIdAndDelete(id);
    return { deleted: true, id };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Failed to delete category", error.message);
  }
};

const hasChildren = async (id) => {
  const count = await Category.countDocuments({ parent: id });
  return count > 0;
};

export default {
  create,
  findById,
  findAll,
  findTree,
  findChildren,
  updateById,
  deleteById,
  deleteByIdCascade,
  hasChildren,
};

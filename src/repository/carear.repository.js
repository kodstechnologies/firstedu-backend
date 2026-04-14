import Carear from "../models/Carear.js";

const create = async (data) => {
  return await Carear.create(data);
};

const findAllPaginated = async (filters = {}, options = {}) => {
  const { page = 1, limit = 10, search } = options;
  const matchQuery = { ...filters };

  if (search) {
    const regex = { $regex: search, $options: "i" };
    matchQuery.$or = [
      { title: regex },
      { description: regex },
      { skills: regex },
      { company: regex },
      { location: regex },
      { category: regex },
    ];
  }

  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10));
  const skip = (pageNum - 1) * limitNum;

  const [list, total] = await Promise.all([
    Carear.find(matchQuery)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    Carear.countDocuments(matchQuery),
  ]);

  return {
    list,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum) || 1,
    },
  };
};

const findById = async (id) => {
  return await Carear.findById(id);
};

const updateById = async (id, updateData) => {
  // Use findOneAndUpdate to trigger the pre('findOneAndUpdate') hook
  return await Carear.findOneAndUpdate({ _id: id }, updateData, {
    new: true,
    runValidators: true,
  });
};

const deleteById = async (id) => {
  return await Carear.findByIdAndDelete(id);
};

export default {
  create,
  findAllPaginated,
  findById,
  updateById,
  deleteById,
};

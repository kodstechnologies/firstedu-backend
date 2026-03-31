import CompetitionSector from "../models/CompetitionSector.js";
import CompetitionCategory from "../models/CompetitionCategory.js";
import { ApiError } from "../utils/ApiError.js";

// ========== Student Competition Repository ==========

const findAllSectorsWithPopulate = async () => {
  try {
    // Step 1: fetch all public sectors
    const sectors = await CompetitionSector.find({ status: "Public" })
      .sort({ createdAt: -1 })
      .lean();

    if (!sectors.length) return [];

    // Step 2: for each sector fetch its public categories with their tests
    const sectorIds = sectors.map((s) => s._id);

    const categories = await CompetitionCategory.find({
      sectorId: { $in: sectorIds },
      status: "Public",
    })
      .populate({
        path: "tests",
        populate: { path: "testId" },
      })
      .sort({ createdAt: -1 })
      .lean();

    // Step 3: group categories by sectorId and attach to sectors
    const categoryMap = {};
    categories.forEach((cat) => {
      const key = cat.sectorId.toString();
      if (!categoryMap[key]) categoryMap[key] = [];
      categoryMap[key].push(cat);
    });

    return sectors.map((sector) => ({
      ...sector,
      competitions: categoryMap[sector._id.toString()] || [],
    }));
  } catch (error) {
    throw new ApiError(500, "Failed to fetch competition sectors", error.message);
  }
};

export default {
  findAllSectorsWithPopulate,
};

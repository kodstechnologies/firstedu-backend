import CompetitionSector from "../models/CompetitionSector.js";
import { ApiError } from "../utils/ApiError.js";

// ========== Student Competition Repository ==========

const findAllSectorsWithPopulate = async () => {
  try {
    return await CompetitionSector.find({ status: "Public" })
      .populate({
        path: "competitions",
        match: { status: "Public" },
        populate: {
          path: "tests",
          // Add any specific selections if needed, e.g., select: 'title description'
        },
      })
      .sort({ createdAt: -1 });
  } catch (error) {
    throw new ApiError(500, "Failed to fetch competition sectors", error.message);
  }
};

export default {
  findAllSectorsWithPopulate,
};

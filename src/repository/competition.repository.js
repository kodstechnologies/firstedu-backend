import Competition from "../models/Competition.js";
import CompetitionSector from "../models/CompetitionSector.js";
import { ApiError } from "../utils/ApiError.js";

// ========== Competition Repository ==========

const createCompetition = async (data) => {
  try {
    const res=await Competition.create(data);
    await CompetitionSector.updateOne({_id:data.competitionSectorId},{$set:{competitions:res._id}})
    return res
  } catch (error) {
    throw new ApiError(500, "Failed to create competition", error.message);
  }
};

const findCompetitionById = async (id) => {
  try {
   
    return await Competition.findById(id);
  } catch (error) {
    throw new ApiError(500, "Failed to fetch competition", error.message);
  }
};

const findSectorById = async (id, populateOptions = {}) => {
  try {
  
    return await Competition.find({competitionSectorId:id})
  } catch (error) {
    throw new ApiError(500, "Failed to fetch competition sector", error.message);
  }
};

const findAllCompetitions = async (filter = {}) => {
  try {
    return await Competition.find(filter);
  } catch (error) {
    throw new ApiError(500, "Failed to fetch competitions", error.message);
  }
};

const updateCompetitionById = async (id, data) => {
  try {
    return await Competition.findByIdAndUpdate(id, { $set: data }, { new: true });
  } catch (error) {
    throw new ApiError(500, "Failed to update competition", error.message);
  }
};

const deleteCompetitionById = async (id) => {
  try {
    return await Competition.findByIdAndDelete(id);
  } catch (error) {
    throw new ApiError(500, "Failed to delete competition", error.message);
  }
};

// ========== CompetitionSector Repository ==========

const createSector = async (data) => {
  try {
    return await CompetitionSector.create(data);
  } catch (error) {
    throw new ApiError(500, "Failed to create competition sector", error.message);
  }
};



const findAllSectors = async () => {
  try {
    return await CompetitionSector.find().sort({ createdAt: -1 });
  } catch (error) {
    throw new ApiError(500, "Failed to fetch competition sectors", error.message);
  }
};

const updateSectorById = async (id, data) => {
  try {
    return await CompetitionSector.findByIdAndUpdate(id, { $set: data }, { new: true });
  } catch (error) {
    throw new ApiError(500, "Failed to update competition sector", error.message);
  }
};

const deleteSectorById = async (id) => {
  try {
    return await CompetitionSector.findByIdAndDelete(id);
  } catch (error) {
    throw new ApiError(500, "Failed to delete competition sector", error.message);
  }
};

const updateSectorPushCompetition = async (sectorId, competitionId) => {
  try {
    return await CompetitionSector.findByIdAndUpdate(sectorId, {
      $push: { competitions: competitionId },
    });
  } catch (error) {
    throw new ApiError(500, "Failed to link competition to sector", error.message);
  }
};

const updateSectorPullCompetition = async (sectorId, competitionId) => {
  try {
    return await CompetitionSector.findByIdAndUpdate(sectorId, {
      $pull: { competitions: competitionId },
    });
  } catch (error) {
    throw new ApiError(500, "Failed to unlink competition from sector", error.message);
  }
};

export default {
  createCompetition,
  findCompetitionById,
  findAllCompetitions,
  updateCompetitionById,
  deleteCompetitionById,
  createSector,
  findSectorById,
  findAllSectors,
  updateSectorById,
  deleteSectorById,
  updateSectorPushCompetition,
  updateSectorPullCompetition,
};

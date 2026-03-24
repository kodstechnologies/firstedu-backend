import {Competition,Test} from "../models/Competition.js";
import CompetitionSector from "../models/CompetitionSector.js";
import { ApiError } from "../utils/ApiError.js";
import orderRepository from "./order.repository.js";
import examSessionRepository from "./examSession.repository.js";

// ========== Competition Repository ==========

const createCompetition = async (data) => {
  try {
    const res = await Competition.create(data);
    return res;
  } catch (error) {
    throw new ApiError(500, "Failed to create competition", error.message);
  }
};

const findCompetitionById = async (id) => {
  try {
   
    return await Competition.findById(id).sort({createdAt:-1});;
  } catch (error) {
    throw new ApiError(500, "Failed to fetch competition", error.message);
  }
};

const findCompetitionWithTestsById = async (id, userId) => {
  try {
    const competition = await Competition.findById(id).populate({
      path: "tests",
      populate: {
        path: "testId"
      }
    }).lean();

    if (!competition) return null;

    // Filter out unpublished tests
    competition.tests = (competition.tests || []).filter(
      (testEntry) => testEntry.testId && testEntry.testId.isPublished === true
    );

    // Inject isPurchased per student natively by checking the Order collection
    if (userId && competition.tests) {
      // Find all test purchases for this user
      const userPurchases = await orderRepository.findTestPurchases(userId);
      const purchasedTestIds = userPurchases.map(p => p.test?._id?.toString() || p.test?.toString());

      // Find all session statuses for this user
      const testIdsForSessionCheck = competition.tests.map(t => t.testId?._id).filter(Boolean);
      const sessionStatusMap = await examSessionRepository.getSessionStatusMapByStudent(userId, testIdsForSessionCheck);

      competition.tests = competition.tests.map(testEntry => {
        if (testEntry.testId) {
          const testStrId = testEntry.testId._id.toString();
          const isPurchased = purchasedTestIds.includes(testStrId);
          const sessionInfo = sessionStatusMap[testStrId] || { status: "not_started", sessionId: null };

          testEntry.testId = {
            ...testEntry.testId,
            isPurchased,
            sessionStatus: sessionInfo.status,
            sessionId: sessionInfo.sessionId,
          };
        }
        return testEntry;
      });
    }

    return competition;
  } catch (error) {
    throw new ApiError(500, "Failed to fetch competition with tests", error.message);
  }
};

const findSectorById = async (id, populateOptions = {}) => {
  try {
  
    // return await Competition.find({competitionSectorId:id})
    // .populate("tests")
    // .populate("competitionSectorId")
    return await CompetitionSector.findById(id)
    .populate({path:"competitions",
      populate:{
        path:"tests",
        populate: { path: "testId" }
      }
    })
    
    // .select('title description  competitions')
  } catch (error) {
    throw new ApiError(500, "Failed to fetch competition sector", error.message);
  }
};

const findAllCompetitions = async (filter = {}) => {
  try {
    return await Competition.find(filter).sort({createdAt:-1});
   
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
     const res= await Competition.findByIdAndDelete(id);
  await CompetitionSector.updateOne({_id:res.competitionSectorId},{$Pull:{competitions:id}})
    return res
  } catch (error) {
    throw new ApiError(500, "Failed to update competition", error.message);
  }
};

 const createTest = async (id, data) => {
  try {
    const testData=await Test.create(data)
   await Competition.updateOne({_id:id},{$addToSet:{tests:testData._id}})
   return testData
  } catch (error) {
    throw new ApiError(500, "Failed to update competition", error.message);
  }
};

const updateTest = async (id, data) => {
  try {
    return await Test.findByIdAndUpdate(id, { $set: data }, { new: true });
  } catch (error) {
    throw new ApiError(500, "Failed to update competition", error.message);
  }
};

const deleteTest = async (id,compitition_id) => {
  try {
    await Competition.updateOne({_id:compitition_id},{$pull:{tests:id}})
    return await Test.deleteOne({_id:id});
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
  findCompetitionWithTestsById,
  findAllCompetitions,
  updateCompetitionById,
  deleteCompetitionById,
  createTest,
  updateTest,
  deleteTest,
  createSector,
  findSectorById,
  findAllSectors,
  updateSectorById,
  deleteSectorById,
  updateSectorPushCompetition,
  updateSectorPullCompetition,
};

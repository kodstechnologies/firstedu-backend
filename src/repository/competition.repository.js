import CompetitionCategory from "../models/CompetitionCategory.js";
import CompetitionTest from "../models/CompetitionTest.js";
import CompetitionSector from "../models/CompetitionSector.js";
import { ApiError } from "../utils/ApiError.js";
import orderRepository from "./order.repository.js";
import examSessionRepository from "./examSession.repository.js";

// ========== CompetitionCategory Repository ==========

const createCompetition = async (data) => {
  try {
    return await CompetitionCategory.create(data);
  } catch (error) {
    if (error.code === 11000) {
      throw new ApiError(409, "A category with this title already exists in this sector");
    }
    throw new ApiError(500, "Failed to create competition category", error.message);
  }
};

const findCompetitionById = async (id) => {
  try {
    return await CompetitionCategory.findById(id);
  } catch (error) {
    throw new ApiError(500, "Failed to fetch competition category", error.message);
  }
};

const findCompetitionWithTestsById = async (id, userId) => {
  try {
    const category = await CompetitionCategory.findById(id)
      .populate({
        path: "tests",
        populate: { path: "testId" },
      })
      .lean();

    if (!category) return null;

    // Filter out tests whose linked Test is unpublished
    category.tests = (category.tests || []).filter(
      (entry) => entry.testId && entry.testId.isPublished === true
    );

    // Inject isPurchased + sessionStatus per student
    if (userId && category.tests.length > 0) {
      const userPurchases = await orderRepository.findTestPurchases(userId);
      const purchasedTestIds = userPurchases.map(
        (p) => p.test?._id?.toString() || p.test?.toString()
      );

      const testIdsForSession = category.tests.map((t) => t.testId?._id).filter(Boolean);
      const sessionStatusMap = await examSessionRepository.getSessionStatusMapByStudent(
        userId,
        testIdsForSession
      );

      category.tests = category.tests.map((entry) => {
        if (entry.testId) {
          const testStrId = entry.testId._id.toString();
          const isPurchased = purchasedTestIds.includes(testStrId);
          const sessionInfo = sessionStatusMap[testStrId] || {
            status: "not_started",
            sessionId: null,
          };
          entry.testId = { ...entry.testId, isPurchased, ...sessionInfo };
        }
        return entry;
      });
    }

    return category;
  } catch (error) {
    throw new ApiError(500, "Failed to fetch competition category with tests", error.message);
  }
};

// Returns all categories for a sector (replaces old findSectorById)
const findCategoriesBySectorId = async (sectorId) => {
  try {
    return await CompetitionCategory.find({ sectorId })
      .populate("tests")
      .sort({ createdAt: -1 });
  } catch (error) {
    throw new ApiError(500, "Failed to fetch categories for sector", error.message);
  }
};

const updateCompetitionById = async (id, data) => {
  try {
    return await CompetitionCategory.findByIdAndUpdate(id, { $set: data }, { new: true });
  } catch (error) {
    throw new ApiError(500, "Failed to update competition category", error.message);
  }
};

const deleteCompetitionById = async (id) => {
  try {
    return await CompetitionCategory.findByIdAndDelete(id);
  } catch (error) {
    throw new ApiError(500, "Failed to delete competition category", error.message);
  }
};

// ========== CompetitionTest Repository ==========

const createTest = async (categoryId, data) => {
  try {
    const category = await CompetitionCategory.findById(categoryId);
    if (!category) throw new ApiError(404, "Competition category not found");

    if (category.purchaseCount > 0) {
      throw new ApiError(403, "Cannot add new tests — this category has already been purchased by students");
    }

    const testEntry = await CompetitionTest.create({
      categoryId,
      title: data.title,
      description: data.description || "",
      testId: data.testId,
    });

    // Link test into the category's tests array
    await CompetitionCategory.findByIdAndUpdate(categoryId, {
      $addToSet: { tests: testEntry._id },
    });

    return testEntry;
  } catch (error) {
    if (error.code === 11000) {
      const key = error.keyPattern;
      if (key?.testId) throw new ApiError(409, "This test is already added to this category");
      if (key?.title) throw new ApiError(409, "A test with this title already exists in this category");
    }
    throw new ApiError(500, "Failed to create competition test", error.message);
  }
};

const findTestById = async (id) => {
  try {
    return await CompetitionTest.findById(id);
  } catch (error) {
    throw new ApiError(500, "Failed to fetch competition test", error.message);
  }
};

const findCompetitionTestsByTestId = async (testId) => {
  try {
    return await CompetitionTest.find({ testId });
  } catch (error) {
    throw new ApiError(500, "Failed to find competition test mappings", error.message);
  }
};

const updateTest = async (id, data) => {
  try {
    const existing = await CompetitionTest.findById(id);
    if (!existing) return null;

    if (existing.purchaseCount > 0) {
      throw new ApiError(403, "Cannot edit this test — it has already been purchased by students");
    }

    return await CompetitionTest.findByIdAndUpdate(
      id,
      { $set: { title: data.title, description: data.description } },
      { new: true }
    );
  } catch (error) {
    if (error.code === 11000) {
      throw new ApiError(409, "A test with this title already exists in this category");
    }
    throw new ApiError(500, "Failed to update competition test", error.message);
  }
};

const deleteTest = async (id) => {
  try {
    const testEntry = await CompetitionTest.findById(id);
    if (!testEntry) return null;

    // Guard: block delete if purchased
    if (testEntry.purchaseCount > 0) {
      throw new ApiError(
        403,
        "Cannot delete this test — it has been purchased by students"
      );
    }

    await CompetitionTest.findByIdAndDelete(id);

    // Unlink from category
    await CompetitionCategory.findByIdAndUpdate(testEntry.categoryId, {
      $pull: { tests: id },
    });

    return testEntry;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Failed to delete competition test", error.message);
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

export default {
  // Category (was Competition)
  createCompetition,
  findCompetitionById,
  findCompetitionWithTestsById,
  findCategoriesBySectorId,
  updateCompetitionById,
  deleteCompetitionById,
  // Test
  createTest,
  findTestById,
  findCompetitionTestsByTestId,
  updateTest,
  deleteTest,
  // Sector
  createSector,
  findAllSectors,
  updateSectorById,
  deleteSectorById,
};

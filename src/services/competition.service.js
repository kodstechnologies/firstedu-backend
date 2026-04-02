import competitionRepository from "../repository/competition.repository.js";
import { ApiError } from "../utils/ApiError.js";
import { attachOfferToList, attachOfferToItem } from "../utils/offerUtils.js";

// ==================== COMPETITION CATEGORIES (was Competitions) ====================

const createCompetition = async (data) => {
  if (!data.sectorId || !data.title) {
    throw new ApiError(400, "sectorId and title are required");
  }
  return await competitionRepository.createCompetition(data);
};

const getSingleCompetitionWithTests = async (id, userId) => {
  const category = await competitionRepository.findCompetitionWithTestsById(id, userId);
  if (!category) throw new ApiError(404, "Competition category not found");
  return await attachOfferToItem(category, "CompetitionCategory", "price");
};

const getCompetitionsBySector = async (sectorId) => {
  if (!sectorId) throw new ApiError(400, "sectorId is required");
  const categoriesRaw = await competitionRepository.findCategoriesBySectorId(sectorId);
  return await attachOfferToList(categoriesRaw, "CompetitionCategory", "price");
};

const updateCompetition = async (id, data) => {
  const existing = await competitionRepository.findCompetitionById(id);
  if (!existing) throw new ApiError(404, "Competition category not found");

  // Block price change if any student has purchased this category
  const isPriceChanging =
    data.price !== undefined && Number(data.price) !== Number(existing.price);
  const isDiscountChanging =
    data.discountedPrice !== undefined &&
    Number(data.discountedPrice) !== Number(existing.discountedPrice);

  if (existing.purchaseCount > 0 && (isPriceChanging || isDiscountChanging)) {
    throw new ApiError(
      403,
      "Cannot change price — this category has already been purchased by students"
    );
  }

  // Strip price fields from update if blocked (extra safety)
  const safeData = { ...data };
  if (existing.purchaseCount > 0) {
    delete safeData.price;
    delete safeData.discountedPrice;
    delete safeData.isFree;
  }

  return await competitionRepository.updateCompetitionById(id, safeData);
};

const deleteCompetition = async (id) => {
  const category = await competitionRepository.findCompetitionById(id);
  if (!category) throw new ApiError(404, "Competition category not found");

  if (category.purchaseCount > 0) {
    throw new ApiError(
      403,
      "Cannot delete this category — it has been purchased by students"
    );
  }

  await competitionRepository.deleteCompetitionById(id);
  return true;
};

// ==================== COMPETITION TESTS ====================

const createTest = async (categoryId, data) => {
  if (!categoryId) throw new ApiError(400, "categoryId is required");
  if (!data.title) throw new ApiError(400, "title is required");
  if (!data.testId) throw new ApiError(400, "testId is required");

  // Verify the parent category exists
  const category = await competitionRepository.findCompetitionById(categoryId);
  if (!category) throw new ApiError(404, "Competition category not found");

  return await competitionRepository.createTest(categoryId, data);
};

const updateTest = async (id, data) => {
  const existing = await competitionRepository.findTestById(id);
  if (!existing) throw new ApiError(404, "Competition test not found");

  // Only title and description are editable
  const allowedUpdate = {};
  if (data.title !== undefined) allowedUpdate.title = data.title;
  if (data.description !== undefined) allowedUpdate.description = data.description;

  return await competitionRepository.updateTest(id, allowedUpdate);
};

const deleteTest = async (id) => {
  // Guard (purchaseCount > 0) is enforced inside the repository
  const result = await competitionRepository.deleteTest(id);
  if (!result) throw new ApiError(404, "Competition test not found");
  return true;
};

// ==================== COMPETITION SECTORS ====================

const createSector = async (data) => {
  if (!data.title) throw new ApiError(400, "Title is required");
  return await competitionRepository.createSector(data);
};

const listSectors = async () => {
  return await competitionRepository.findAllSectors();
};

const updateSector = async (id, data) => {
  const sector = await competitionRepository.updateSectorById(id, data);
  if (!sector) throw new ApiError(404, "Competition Sector not found");
  return sector;
};

const deleteSector = async (id) => {
  // Check if any category under this sector has purchaseCount > 0
  const categoriesRaw = await competitionRepository.findCategoriesBySectorId(id);
  const hasPurchasedCategory = categoriesRaw.some((cat) => cat.purchaseCount > 0);

  if (hasPurchasedCategory) {
    throw new ApiError(
      403,
      "Cannot delete this sector minimum one test has been purchased by a student"
    );
  }

  const sector = await competitionRepository.deleteSectorById(id);
  if (!sector) throw new ApiError(404, "Competition Sector not found");
  return true;
};

export default {
  createCompetition,
  getSingleCompetitionWithTests,
  getCompetitionsBySector,
  updateCompetition,
  deleteCompetition,
  createTest,
  updateTest,
  deleteTest,
  createSector,
  listSectors,
  updateSector,
  deleteSector,
};

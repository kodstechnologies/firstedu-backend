import competitionRepository from "../repository/competition.repository.js";
import { ApiError } from "../utils/ApiError.js";

// ==================== COMPETITIONS ====================

const createCompetition = async (data) => {
  if (!data.title || !data.description || !data.competitionSectorId) {
    throw new ApiError(
      400,
      "Title, description, and competitionSectorId are required",
    );
  }

  const competition = await competitionRepository.createCompetition(data);

  // Link to Sector
  await competitionRepository.updateSectorPushCompetition(
    data.competitionSectorId,
    competition._id,
  );

  return competition;
};

const getSingleCompetitionWithTests = async (id, userId) => {
  const comp = await competitionRepository.findCompetitionWithTestsById(id, userId);
  if (!comp) throw new ApiError(404, "Competition not found");
  return comp;
};

const getCompetitionsBySector = async (sectorId) => {
  const sector = await competitionRepository.findSectorById(sectorId, {
    competitions: true,
  });
  if (!sector) {
    throw new ApiError(404, "Competition Sector not found");
  }
  return sector;
};

const updateCompetition = async (id, data) => {
  const existing = await competitionRepository.findCompetitionById(id);
  if (!existing) throw new ApiError(404, "Competition not found");

  return await competitionRepository.updateCompetitionById(id, data);
};

const deleteCompetition = async (id) => {
  const competition = await competitionRepository.findCompetitionById(id);
  if (!competition) throw new ApiError(404, "Competition not found");

  await competitionRepository.deleteCompetitionById(id);

  // Unlink from Sector
  if (competition.competitionSectorId) {
    await competitionRepository.updateSectorPullCompetition(
      competition.competitionSectorId,
      id,
    );
  }

  return true;
};

const createTest = async (competition_id,data) => {

  if (!data.title || !data.description) {
    throw new ApiError(
      400,
      "Title, description, and competitionSectorId are required",
    );
  }

  const testData = await competitionRepository.createTest(competition_id,data);

  return testData;
};

const updateTest = async (id, data) => {
  const existing = await competitionRepository.updateTest(id);
  if (!existing) throw new ApiError(404, "Test not found");

  return await competitionRepository.updateTest(id, data);
};

const deleteTest = async (id) => {
  const competition = await competitionRepository.deleteTest(id);
  if (!competition) throw new ApiError(404, "Test not found");

  await competitionRepository.deleteTest(id);

  return true;
};

// ==================== COMPETITION SECTORS ====================

const createSector = async (data) => {
  if (!data.title) {
    throw new ApiError(400, "Title is required");
  }
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
  createSector,
  createTest,
  updateTest,
  deleteTest,
  listSectors,
  updateSector,
  deleteSector,
};

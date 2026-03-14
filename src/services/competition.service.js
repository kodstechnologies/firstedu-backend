import competitionRepository from "../repository/competition.repository.js";
import { ApiError } from "../utils/ApiError.js";

// ==================== COMPETITIONS ====================

const createCompetition = async (data) => {
  if (!data.title || !data.description || !data.competitionSectorId) {
    throw new ApiError(400, "Title, description, and competitionSectorId are required");
  }

  const competition = await competitionRepository.createCompetition(data);

  // Link to Sector
  await competitionRepository.updateSectorPushCompetition(
    data.competitionSectorId,
    competition._id
  );

  return competition;
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
      id
    );
  }

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
  getCompetitionsBySector,
  updateCompetition,
  deleteCompetition,
  createSector,
  listSectors,
  updateSector,
  deleteSector,
};

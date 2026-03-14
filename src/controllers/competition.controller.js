import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import competitionService from "../services/competition.service.js";

// ==================== COMPETITIONS ====================

export const createCompetition = asyncHandler(async (req, res) => {
  const competition = await competitionService.createCompetition(req.body);
  return res
    .status(201)
    .json(ApiResponse.success(competition, "Competition created successfully"));
});

export const getCompetitions = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const sector = await competitionService.getCompetitionsBySector(id);
  return res
    .status(200)
    .json(ApiResponse.success(sector, "Competitions fetched successfully"));
});

export const updateCompetition = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updated = await competitionService.updateCompetition(id, req.body);
  return res
    .status(200)
    .json(ApiResponse.success(updated, "Competition updated successfully"));
});

export const deleteCompetition = asyncHandler(async (req, res) => {
  const { id } = req.params;
   
  await competitionService.deleteCompetition(id);

  return res
    .status(200)
    .json(ApiResponse.success(null, "Competition deleted successfully"));
});

export const createTests = asyncHandler(async (req, res) => {
  const{competition_id}=req.query
  
  const competition = await competitionService.createTest(competition_id,req.body);
  return res
    .status(201)
    .json(ApiResponse.success(competition, "Competition created successfully"));
});

export const updateTests = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updated = await competitionService.updateTest(id, req.body);
  return res
    .status(200)
    .json(ApiResponse.success(updated, "Competition updated successfully"));
});

export const deleteTests = asyncHandler(async (req, res) => {
  const { id } = req.params;
   
  await competitionService.deleteTest(id);

  return res
    .status(200)
    .json(ApiResponse.success(null, "Competition deleted successfully"));
});
// ==================== COMPETITION SECTORS ====================

export const createCompetitionSector = asyncHandler(async (req, res) => {
  const sector = await competitionService.createSector(req.body);
  return res
    .status(201)
    .json(ApiResponse.success(sector, "Competition Sector created successfully"));
});

export const listCompetitionSectors = asyncHandler(async (req, res) => {
  const sectors = await competitionService.listSectors();
  return res
    .status(200)
    .json(ApiResponse.success(sectors, "Competition Sectors fetched successfully"));
});

export const updateCompetitionSector = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updated = await competitionService.updateSector(id, req.body);
  return res
    .status(200)
    .json(ApiResponse.success(updated, "Competition Sector updated successfully"));
});

export const deleteCompetitionSector = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await competitionService.deleteSector(id);
  return res
    .status(200)
    .json(ApiResponse.success(null, "Competition Sector deleted successfully"));
});

export default {
  createCompetition,
  getCompetitions,
  updateCompetition,
  deleteCompetition,
  createTests,
  updateTests,
  deleteTests,
  createCompetitionSector,
  listCompetitionSectors,
  updateCompetitionSector,
  deleteCompetitionSector,
};

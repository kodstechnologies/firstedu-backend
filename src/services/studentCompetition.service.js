import studentCompetitionRepository from "../repository/studentCompetition.repository.js";

// ==================== STUDENT COMPETITION SECTORS ====================

const getStudentCompetitionSectors = async () => {
  return await studentCompetitionRepository.findAllSectorsWithPopulate();
};

export default {
  getStudentCompetitionSectors,
};

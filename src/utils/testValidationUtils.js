import Test from "../models/Test.js";
import Tournament from "../models/Tournament.js";
import OlympiadTest from "../models/OlympiadTest.js";
import CompetitiveTest from "../models/CompetitiveTest.js";
import SchoolTest from "../models/SchoolTest.js";
import SkillTest from "../models/SkillTest.js";
import TestBundle from "../models/TestBundle.js";
import LiveCompetition from "../models/LiveCompetition.js";
import { ApiError } from "./ApiError.js";

export const ensureUniqueTestTitle = async (title, excludeId = null, excludeModelName = null) => {
  if (!title) return;

  // We do case-insensitive checks
  const regexTitle = new RegExp(`^${title.trim()}$`, "i");

  const queries = [
    { model: Test, field: "title", modelName: "Test" },
    { model: Tournament, field: "title", modelName: "Tournament" },
    { model: OlympiadTest, field: "title", modelName: "OlympiadTest" },
    { model: CompetitiveTest, field: "title", modelName: "CompetitiveTest" },
    { model: SchoolTest, field: "title", modelName: "SchoolTest" },
    { model: SkillTest, field: "title", modelName: "SkillTest" },
    { model: TestBundle, field: "name", modelName: "TestBundle" },
    { model: LiveCompetition, field: "title", modelName: "LiveCompetition" }
  ];

  for (const { model, field, modelName } of queries) {
    const query = { [field]: regexTitle };
    if (excludeId && excludeModelName === modelName) {
      query._id = { $ne: excludeId };
    }

    const exists = await model.exists(query);
    if (exists) {
      throw new ApiError(
        400,
        `A test, bundle, tournament, olympiad, or gamification challenge with the name "${title}" already exists. Please choose a unique name.`
      );
    }
  }
};

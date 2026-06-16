import { ApiError } from "./ApiError.js";
import Test from "../models/Test.js";

export const assertAiBankNotInUse = async (bankId, action = "delete") => {
  const tests = await Test.find({ aiQuestionBank: bankId }).select("title").lean();
  if (tests.length === 0) return;

  const testNames = tests.map((t) => `"${t.title}"`).join(", ");
  const verb = action === "delete" ? "delete" : "edit";

  throw new ApiError(
    400,
    `Cannot ${verb} this AI question bank because it is used in ${tests.length} test(s): ${testNames}. Please delete those tests first.`
  );
};

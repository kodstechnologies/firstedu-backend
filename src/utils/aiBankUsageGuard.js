import { ApiError } from "./ApiError.js";
import Test from "../models/Test.js";

export const assertAiBankNotInUse = async (bankId, action = "delete") => {
  const tests = await Test.find({ aiQuestionBank: bankId }).select("title _id").lean();
  if (tests.length === 0) return;

  const testNames = tests.map((t) => `"${t.title}"`).join(", ");

  if (action === "delete") {
    throw new ApiError(
      400,
      `Cannot delete this AI question bank because it is used in ${tests.length} test(s): ${testNames}. Please delete those tests first.`
    );
  }

  // action === "edit"
  const mongoose = await import("mongoose");
  const ExamSession = mongoose.default.model("ExamSession");
  
  const testIds = tests.map(t => t._id);
  const sessionCount = await ExamSession.countDocuments({ test: { $in: testIds } });

  if (sessionCount > 0) {
    throw new ApiError(
      400,
      `Cannot edit this AI question bank because it is used in ${tests.length} test(s): ${testNames}, and students have already attempted it. Please delete the tests or create a new AI question bank.`
    );
  }
};

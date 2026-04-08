import { ApiError } from "../utils/ApiError.js";
import testRepository from "../repository/test.repository.js";
import questionBankRepository from "../repository/questionBank.repository.js";
import orderRepository from "../repository/order.repository.js";
import olympiadRepository from "../repository/olympiad.repository.js";
import TestPurchase from "../models/TestPurchase.js";
import {
  uploadImageToCloudinary,
  deleteFileFromCloudinary,
} from "../utils/s3Upload.js";

const TESTS_IMAGE_FOLDER = "tests";

// ------- Tests / Test Builder -------

export const createTest = async (data, adminId, file) => {
  const bank = await questionBankRepository.findById(data.questionBank);
  if (!bank) throw new ApiError(404, "Question bank not found");

  let imageUrl = null;
  if (file) {
    imageUrl = await uploadImageToCloudinary(
      file.buffer,
      file.originalname,
      TESTS_IMAGE_FOLDER,
      file.mimetype
    );
  }

  const test = await testRepository.createTest({
    ...data,
    imageUrl,
    createdBy: adminId,
  });
  await enrichTestsWithBankStats(test);
  return test;
};

const enrichTestsWithBankStats = async (tests) => {
  const items = Array.isArray(tests) ? tests : [tests];
  const bankIds = items
    .map((t) => t?.questionBank?._id)
    .filter(Boolean)
    .map((id) => id.toString());
  const uniqueIds = [...new Set(bankIds)];
  const statsMap = await questionBankRepository.getBanksStatsBatch(uniqueIds);

  items.forEach((t) => {
    if (t?.questionBank?._id) {
      const key = t.questionBank._id.toString();
      const stats = statsMap.get(key) || { totalQuestions: 0, totalMarks: 0 };
      t.questionBank.totalQuestions = stats.totalQuestions;
      t.questionBank.totalMarks = stats.totalMarks;
    }
  });

  return tests;
};

export const getTests = async (options = {}) => {
  const query = {};
  if (options.applicableFor) {
    query.applicableFor = options.applicableFor;
  }

  if (options.excludeAssigned === 'true' || options.excludeAssigned === true) {
    if (options.applicableFor === 'olympiad') {
      const olympiads = await olympiadRepository.find({}, { limit: 10000 });
      let usedIds = olympiads.map((o) => o.test?._id?.toString() || o.test?.toString()).filter(Boolean);
      if (options.includeTestId) {
        usedIds = usedIds.filter((id) => id !== options.includeTestId.toString());
      }
      if (usedIds.length > 0) {
        query._id = { $nin: usedIds };
      }
    } else if (options.applicableFor === 'testBundle') {
      const usedIds = await testRepository.findAllUsedBundleTestIds(options.includeBundleId);
      if (usedIds.length > 0) {
        query._id = { $nin: usedIds };
      }
    }
  }
  const result = await testRepository.findAllTests(query, options);
  await enrichTestsWithBankStats(result.tests);

  // Batch-check: attach isPurchased (boolean) to each test — no count needed
  if (result.tests && result.tests.length > 0) {
    const testIds = result.tests.map((t) => t?._id).filter(Boolean);
    const purchasedIds = await TestPurchase.distinct("test", {
      test: { $in: testIds },
      paymentStatus: "completed",
    });
    const purchasedSet = new Set(purchasedIds.map((id) => id.toString()));
    result.tests.forEach((t) => {
      const isPurchased = purchasedSet.has(t._id?.toString());
      t.isPurchased = isPurchased;
      if (t._doc) t._doc.isPurchased = isPurchased;
    });
  }

  return result;
};

export const getTestById = async (id) => {
  const test = await testRepository.findTestById(id, {
    questionBank: "name categories",
  });
  if (!test) {
    throw new ApiError(404, "Test not found");
  }
  await enrichTestsWithBankStats(test);
  return test;
};

export const updateTest = async (id, data, file) => {
  const existing = await testRepository.findTestById(id);
  if (!existing) throw new ApiError(404, "Test not found");

  // Restrict changing applicableFor once a standalone test ("test") has purchases
  if (
    Object.prototype.hasOwnProperty.call(data, "applicableFor") &&
    data.applicableFor !== existing.applicableFor
  ) {
    if (existing.applicableFor === "test") {
      const purchase = await orderRepository.findTestPurchase({
        test: id,
        paymentStatus: "completed",
      });
      if (purchase) {
        throw new ApiError(
          400,
          "Cannot change applicableFor: this standalone test has already been purchased by at least one user"
        );
      }
    }
  }

  if (data.questionBank) {
    const bank = await questionBankRepository.findById(data.questionBank);
    if (!bank) throw new ApiError(404, "Question bank not found");
  }

  if (file) {
    if (existing.imageUrl) {
      await deleteFileFromCloudinary(existing.imageUrl);
    }
    data.imageUrl = await uploadImageToCloudinary(
      file.buffer,
      file.originalname,
      TESTS_IMAGE_FOLDER,
      file.mimetype
    );
  }

  const updated = await testRepository.updateTestById(id, data);
  if (updated) await enrichTestsWithBankStats(updated);
  return updated;
};

export const deleteTest = async (id) => {
  const existing = await testRepository.findTestById(id);
  if (!existing) throw new ApiError(404, "Test not found");

  // Block deletion if any student has purchased this test
  const purchaseExists = await TestPurchase.exists({
    test: id,
    paymentStatus: "completed",
  });
  if (purchaseExists) {
    throw new ApiError(
      400,
      "Cannot delete this test: it has already been purchased by one or more students."
    );
  }

  if (existing.imageUrl) {
    await deleteFileFromCloudinary(existing.imageUrl);
  }
  const deleted = await testRepository.deleteTestById(id);
  if (!deleted) {
    throw new ApiError(404, "Test not found");
  }
  return true;
};

// ------- Bundles -------

const BUNDLES_IMAGE_FOLDER = "test-bundles";

const enrichBundlesTests = async (bundles) => {
  const items = Array.isArray(bundles) ? bundles : [bundles];
  for (const bundle of items) {
    if (bundle?.tests?.length) {
      await enrichTestsWithBankStats(bundle.tests);
    }
  }
};

export const createBundle = async (data, adminId, file) => {
  let imageUrl = null;
  if (file) {
    imageUrl = await uploadImageToCloudinary(
      file.buffer,
      file.originalname,
      BUNDLES_IMAGE_FOLDER,
      file.mimetype
    );
  }
  const bundle = await testRepository.createBundle({
    ...data,
    imageUrl,
    createdBy: adminId,
  });
  await enrichBundlesTests(bundle);
  return bundle;
};

export const getBundles = async (options = {}) => {
  const result = await testRepository.findAllBundles({}, options);
  await enrichBundlesTests(result.bundles);
  return result;
};

export const getBundleById = async (id) => {
  const bundle = await testRepository.findBundleById(id, {
    tests: "title durationMinutes questionBank",
  });
  if (!bundle) {
    throw new ApiError(404, "Bundle not found");
  }
  await enrichBundlesTests(bundle);
  return bundle;
};

export const updateBundle = async (id, data, file) => {
  const existing = await testRepository.findBundleById(id);
  if (!existing) throw new ApiError(404, "Bundle not found");
  if (file) {
    if (existing.imageUrl) {
      await deleteFileFromCloudinary(existing.imageUrl);
    }
    data.imageUrl = await uploadImageToCloudinary(
      file.buffer,
      file.originalname,
      BUNDLES_IMAGE_FOLDER,
      file.mimetype
    );
  }
  const updated = await testRepository.updateBundleById(id, data);
  if (!updated) {
    throw new ApiError(404, "Bundle not found");
  }
  await enrichBundlesTests(updated);
  return updated;
};

export const deleteBundle = async (id) => {
  const existing = await testRepository.findBundleById(id);
  if (!existing) throw new ApiError(404, "Bundle not found");
  if (existing.imageUrl) {
    await deleteFileFromCloudinary(existing.imageUrl);
  }
  const deleted = await testRepository.deleteBundleById(id);
  if (!deleted) {
    throw new ApiError(404, "Bundle not found");
  }
  return true;
};

export default {
  createTest,
  getTests,
  getTestById,
  updateTest,
  deleteTest,
  createBundle,
  getBundles,
  getBundleById,
  updateBundle,
  deleteBundle,
};



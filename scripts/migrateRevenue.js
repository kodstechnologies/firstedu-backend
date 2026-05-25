import mongoose from 'mongoose';
import dotenv from 'dotenv';
import CoursePurchase from '../src/models/CoursePurchase.js';
import TestPurchase from '../src/models/TestPurchase.js';
import EventRegistration from '../src/models/EventRegistration.js';
import CategoryPurchase from '../src/models/CategoryPurchase.js';
import RevenueTransaction from '../src/models/RevenueTransaction.js';

dotenv.config();

const categorySourceType = {
  School: 'school',
  Competitive: 'competitive',
  'Skill Development': 'skill_development',
  Olympiads: 'olympiads',
};

// Ensure other populated models are loaded
import "../src/models/Test.js";
import "../src/models/TestBundle.js";
import "../src/models/Category.js";
import "../src/models/Course.js";

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.DB_NAME });
    console.log('Connected to DB');

    // Fetch all completed purchases directly
    const [courses, tests, events, categoryPurchases] = await Promise.all([
      CoursePurchase.find({ paymentStatus: 'completed' }).populate('course').lean(),
      TestPurchase.find({ paymentStatus: 'completed' }).populate('test').populate('testBundle').populate('competitionCategory').lean(),
      EventRegistration.find({ paymentStatus: 'completed' }).lean(),
      CategoryPurchase.find({ paymentStatus: 'completed' }).populate('categoryId').lean()
    ]);

    console.log(`Found ${courses.length} courses, ${tests.length} tests, ${events.length} events, ${categoryPurchases.length} category purchases`);

    const Category = mongoose.model('Category');
    const docsToInsert = [];

    for (const c of courses) {
      if (!c.course) continue;
      const catId = (c.course.categoryIds && c.course.categoryIds.length > 0) ? c.course.categoryIds[0] : null;
      let cat = null;
      let parentCat = null;
      if (catId) {
        cat = await Category.findById(catId).lean();
        if (cat && cat.parent) {
          parentCat = await Category.findById(cat.parent).lean();
        }
      }
      
      docsToInsert.push({
        paymentId: c.paymentId || 'wallet_c_' + c._id,
        amount: c.purchasePrice,
        sourceType: 'course',
        itemId: c.course._id,
        itemName: c.course.title || 'Unknown Course',
        student: c.student,
        categoryId: cat ? cat._id : null,
        categoryName: parentCat ? parentCat.name : (cat ? cat.name : null),
        subCategoryName: cat ? cat.name : null,
        paymentStatus: 'completed',
        purchasedAt: c.purchaseDate || c.createdAt
      });
    }

    for (const t of tests) {
      let itemName = 'Unknown Test';
      let itemId = t._id; // Fallback
      let catId = null;
      let type = 'test';

      if (t.test) {
        itemName = t.test.title;
        itemId = t.test._id;
        catId = t.test.categoryId;
      } else if (t.testBundle) {
        itemName = t.testBundle.name;
        itemId = t.testBundle._id;
        catId = null;
        type = 'test_bundle';
      } else if (t.competitionCategory) {
        itemName = 'Competition Category'; 
        itemId = t.competitionCategory._id;
        type = 'competition_category';
      }

      let cat = null;
      let parentCat = null;
      if (catId) {
        cat = await Category.findById(catId).lean();
        if (cat && cat.parent) {
          parentCat = await Category.findById(cat.parent).lean();
        }
      }

      docsToInsert.push({
        paymentId: t.paymentId || 'wallet_t_' + t._id,
        amount: t.purchasePrice,
        sourceType: type,
        itemId: itemId,
        itemName: itemName,
        student: t.student,
        categoryId: cat ? cat._id : null,
        categoryName: parentCat ? parentCat.name : (cat ? cat.name : null),
        subCategoryName: cat ? cat.name : null,
        paymentStatus: 'completed',
        purchasedAt: t.purchaseDate || t.createdAt
      });
    }

    for (const e of events) {
      let srcType = e.eventType;
      if (srcType === 'olympiad') srcType = 'olympiads';

      docsToInsert.push({
        paymentId: e.paymentId || 'wallet_e_' + e._id,
        amount: e.amountPaid,
        sourceType: srcType,
        itemId: e.eventId || e._id, // Fallback
        itemName: 'Event/Workshop/Tournament', 
        student: e.student,
        categoryId: null,
        categoryName: null,
        subCategoryName: null,
        paymentStatus: 'completed',
        purchasedAt: e.registeredAt || e.createdAt
      });
    }

    for (const purchase of categoryPurchases) {
      if (!purchase.categoryId) continue;
      docsToInsert.push({
        paymentId: purchase.paymentId || `category_${purchase._id}`,
        amount: purchase.purchasePrice,
        sourceType: categorySourceType[purchase.pillarType] || 'competition_category',
        itemId: purchase.categoryId._id,
        itemName: purchase.categoryId.name || 'Category',
        student: purchase.student,
        categoryId: purchase.categoryId._id,
        categoryName: purchase.pillarType || purchase.categoryId.rootType || null,
        subCategoryName: purchase.categoryId.name || null,
        paymentStatus: 'completed',
        purchasedAt: purchase.createdAt
      });
    }

    await RevenueTransaction.deleteMany({});
    await RevenueTransaction.insertMany(docsToInsert);

    console.log(`Successfully migrated ${docsToInsert.length} records into RevenueTransaction.`);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();

import mongoose from 'mongoose';
import 'dotenv/config';

async function seedGamificationCategories() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to DB');

    // Mongoose Models
    const Category = mongoose.models.Category || mongoose.model('Category', new mongoose.Schema({
      name: String,
      isPredefined: Boolean,
      parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
      order: { type: Number, default: 0 },
      isGamificationSub: { type: Boolean, default: false },
    }, { timestamps: true }));

    // 1. Ensure Gamification root exists
    let gamificationRoot = await Category.findOne({ name: 'Gamification', parent: null });
    if (!gamificationRoot) {
      console.log('Creating Gamification root...');
      gamificationRoot = await Category.create({
        name: 'Gamification',
        isPredefined: true,
        order: 99
      });
    } else {
      console.log('Gamification root already exists');
    }

    // 2. Ensure Everyday Challenge exists under Gamification
    const everyday = await Category.findOne({ name: 'Everyday Challenge', parent: gamificationRoot._id });
    if (!everyday) {
      console.log('Creating Everyday Challenge subcategory...');
      await Category.create({
        name: 'Everyday Challenge',
        isPredefined: false,
        parent: gamificationRoot._id,
        order: 0,
        isGamificationSub: true
      });
    } else {
      console.log('Everyday Challenge already exists');
    }

    // 3. Ensure Tournaments exists under Gamification
    const tournaments = await Category.findOne({ name: 'Tournaments', parent: gamificationRoot._id });
    if (!tournaments) {
      console.log('Creating Tournaments subcategory...');
      await Category.create({
        name: 'Tournaments',
        isPredefined: false,
        parent: gamificationRoot._id,
        order: 1,
        isGamificationSub: true
      });
    } else {
      console.log('Tournaments already exists');
    }

    console.log('Successfully seeded gamification categories!');
    process.exit(0);
  } catch (err) {
    console.error('Error seeding categories:', err);
    process.exit(1);
  }
}

seedGamificationCategories();

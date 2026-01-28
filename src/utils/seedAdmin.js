// seedAdmin.js
import Admin from '../models/Admin.js'; // Adjust path as per your structure

export const seedAdmin = async () => {
  try {
    const existingAdmin = await Admin.findOne({ email: 'mohantysoumyan13@gmail.com' });
    if (!existingAdmin) {
      const newAdmin = new Admin({
        name: 'Super Admin',
        email: 'mohantysoumyan13@gmail.com',
        password: 'admin@123',  // Will be auto-hashed due to pre-save hook
        userType: 'Admin',
      });

      await newAdmin.save();
      console.log('✅ Default Admin created: mohantysoumyan13@gmail.com / admin@123');
    } else {
      console.log('ℹ️ Admin already exists, skipping seeding.');
    }
  } catch (error) {
    console.error('❌ Error seeding admin:', error.message);
  }
};
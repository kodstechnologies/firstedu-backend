// seedAdmin.js
import Admin from '../models/Admin.js'; // Adjust path as per your structure

export const seedAdmin = async () => {
  try {
    const existingAdmin = await Admin.findOne({ email: 'iscorre2026@gmail.com' });
    if (!existingAdmin) {
      const newAdmin = new Admin({
        name: 'Super Admin',
        email: 'iscorre2026@gmail.com',
        password: 'Iscorre2026@321', 
        userType: 'Admin',
      });

      await newAdmin.save();
      console.log('✅ Default Admin created: iscorre2026@gmail.com / Iscorre2026@321');
    } else {
      console.log('ℹ️ Admin already exists, skipping seeding.');
    }
  } catch (error) {
    console.error('❌ Error seeding admin:', error.message);
  }
};
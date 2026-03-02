import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { seedAdmin } from '../utils/seedAdmin.js';
// Ensure models are registered at startup (required for StudentSession collection)
import '../models/StudentSession.js';

dotenv.config();

const connectDB = async () => {
  try {
    const connectionInstance = await mongoose.connect(process.env.MONGODB_URI, {
      dbName: process.env.DB_NAME,
    });
    console.log(`MongoDB connected! DB Host: ${connectionInstance.connection.host}`);

    // ✅ Run seeding after connection
    await seedAdmin();

  } catch (error) {
    console.error('MongoDB connection failed:', error);
    process.exit(1);
  }
};

export default connectDB;

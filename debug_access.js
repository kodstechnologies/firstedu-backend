import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import { resolveAccessStatus } from './src/utils/categoryAccessUtils.js';

async function test() {
  const uri = process.env.MONGODB_URI + process.env.DB_NAME + '?retryWrites=true&w=majority';
  await mongoose.connect(uri);
  
  const studentId = '69b4fb119859be14e6e6f5ae'; // From the purchase object in user's prompt
  const categoryId = '69dddf40736a72d23c75a6e9'; // History subcategory ID
  
  console.log("Checking access status for student:", studentId, "category:", categoryId);
  const status = await resolveAccessStatus(studentId, categoryId);
  console.log(JSON.stringify(status, null, 2));
  
  process.exit(0);
}

test().catch(console.error);

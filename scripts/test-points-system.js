import connectDB from '../src/config/db.js';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import studentService from '../src/services/student.service.js';
import Student from '../src/models/Student.js'; // Assuming Student model exists at this path
import Wallet from '../src/models/Wallet.js';
import PointsTransaction from '../src/models/PointsTransaction.js';

dotenv.config();

const run = async () => {
    try {
        await connectDB();
        console.log("Connected to DB");

        // 1. Create Dummy Users
        // Helper to generate unique email/phone
        const uniqueId = Date.now();
        const referrer = await Student.create({
            name: "Referrer Test",
            email: `referrer_${uniqueId}@test.com`,
            password: "password123",
            mobileNumber: `90${uniqueId.toString().slice(-8)}`,
            role: "student" // Assuming role field exists or defaults
        });

        const newStudent = await Student.create({
            name: "New Student Test",
            email: `newstudent_${uniqueId}@test.com`,
            password: "password123",
            mobileNumber: `91${uniqueId.toString().slice(-8)}`,
            role: "student"
        });

        console.log(`Created users: Referrer(${referrer._id}), NewStudent(${newStudent._id})`);

        // Ensure wallet for referrer (usually happens on signup)
        await studentService.ensureWalletExists(referrer._id, "User");

        // 2. Test Referral Reward
        console.log("\n--- Testing Referral Reward ---");
        // We simulate that newStudent signed up using referrer's code
        // and now we process the reward.
        await studentService.processReferralReward(referrer._id, newStudent._id);

        let wallet = await Wallet.findOne({ user: referrer._id });
        console.log(`Referrer Wallet Points (Expected 50): ${wallet.rewardPoints}`);

        const transaction = await PointsTransaction.findOne({
            student: referrer._id,
            source: 'referral_reward'
        }).sort({ createdAt: -1 });

        if (transaction) {
            console.log("✅ Referral Transaction FOUND");
            if (transaction.referenceId && transaction.referenceId.toString() === newStudent._id.toString() && transaction.referenceType === 'User') {
                console.log("✅ Referral Transaction Details VALID (Correct Reference)");
            } else {
                console.log("❌ Referral Transaction Details INVALID (Reference Check Code)");
                console.log(`Expected RefId: ${newStudent._id}, Actual: ${transaction.referenceId}`);
                console.log(`Expected RefType: User, Actual: ${transaction.referenceType}`);
            }
        } else {
            console.log("❌ Referral Transaction NOT FOUND");
        }

        // 3. Test Conversion
        console.log("\n--- Testing Conversion (50 points -> 5 money) ---");
        // We have 50 points (assuming reward worked).
        try {
            await studentService.convertPointsToMoney(referrer._id, 50);
            console.log("Conversion function executed successfully.");
        } catch (e) {
            console.error("Conversion function failed:", e.message);
        }

        wallet = await Wallet.findOne({ user: referrer._id });
        console.log(`Referrer Wallet After Conversion: Points=${wallet.rewardPoints}, Money=${wallet.monetaryBalance}`);

        if (wallet.rewardPoints === 0 && wallet.monetaryBalance === 5) {
            console.log("✅ Wallet Balance Update VALID");
        } else {
            console.log("❌ Wallet Balance Update INVALID");
        }

        // Verify NO NEW transaction for conversion
        // We expect only 1 transaction (the referral reward)
        const allTransactions = await PointsTransaction.find({
            student: referrer._id
        }).sort({ createdAt: -1 });

        console.log(`Total Transactions Found: ${allTransactions.length}`);

        const conversionTx = allTransactions.find(t => t.type === 'spent' || t.type === 'debit');

        if (!conversionTx) {
            console.log("✅ Conversion Transaction Logging VALID (No log found)");
        } else {
            console.log("❌ Conversion Transaction Logging INVALID (Log found!)", conversionTx);
        }

        // Cleanup
        console.log("\n--- Cleanup ---");
        await Student.deleteOne({ _id: referrer._id });
        await Student.deleteOne({ _id: newStudent._id });
        await Wallet.deleteOne({ user: referrer._id });
        await PointsTransaction.deleteMany({ student: referrer._id });
        console.log("Cleanup done.");

    } catch (error) {
        console.error("Test execution failed:", error);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
};

run();

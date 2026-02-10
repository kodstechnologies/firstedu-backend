import mongoose from "mongoose";
import { config } from "dotenv";
import { resolve } from "path";
import studentService from "../src/services/student.service.js";
import walletService from "../src/services/wallet.service.js";
import studentRepository from "../src/repository/student.repository.js";
import walletRepository from "../src/repository/wallet.repository.js";
import Wallet from "../src/models/Wallet.js";
import PointsTransaction from "../src/models/PointsTransaction.js";

// Load environment variables
config({ path: resolve(process.cwd(), ".env") });

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/firstedu-backend";

const cleanup = async (email1, email2) => {
    const s1 = await studentRepository.findOne({ email: email1 });
    const s2 = await studentRepository.findOne({ email: email2 });

    if (s1) {
        await Wallet.deleteOne({ user: s1._id });
        await PointsTransaction.deleteMany({ student: s1._id });
        await studentRepository.delete(s1._id);
    }
    if (s2) {
        await Wallet.deleteOne({ user: s2._id });
        await PointsTransaction.deleteMany({ student: s2._id });
        await studentRepository.delete(s2._id);
    }
};

const runTest = async () => {
    console.log("Starting Points System Workflow Test (Earn-Only Mode)...");

    try {
        await mongoose.connect(MONGODB_URI);
        console.log("Connected to MongoDB");

        const referrerEmail = "referrer@test.com";

        // Cleanup previous runs
        await cleanup(referrerEmail, "dummy@test.com");

        // 1. Create Referrer
        console.log("\n1. creating Referrer...");
        const referrer = await studentRepository.create({
            email: referrerEmail,
            password: "password123",
            name: "Referrer User",
            occupation: "Student",
            phone: "9999999999",
            referralCode: await studentService.generateReferralCode("Referrer User")
        });

        // Ensure wallet exists for referrer
        await studentService.ensureWalletExists(referrer._id, "User");
        console.log("Referrer created:", referrer._id);

        // 2. Simulate Referral Reward (triggered by new user signup)
        console.log("\n2. Processing Referral Reward...");
        await studentService.processReferralReward(referrer._id);

        let wallet = await walletService.getWalletBalance(referrer._id);
        console.log("Referrer Wallet Balance:", wallet);

        if (wallet.rewardPoints !== 50) throw new Error("Referral reward not credited correctly");

        // Verify Transaction Log
        let transactions = await walletService.getPointsHistory(referrer._id);
        let latestTx = transactions.transactions[0];
        if (latestTx.type !== 'earned' || latestTx.source !== 'referral_reward') {
            throw new Error(`Invalid Transaction Log: ${JSON.stringify(latestTx)}`);
        }
        console.log("Referral Transaction verified:", latestTx.description);

        // 3. Add Reward Points (Generic)
        console.log("\n3. Adding Generic Reward Points...");
        await walletService.addRewardPoints(referrer._id, 100, "admin_adjustment", "Bonus Points");

        wallet = await walletService.getWalletBalance(referrer._id);
        console.log("Updated Wallet Balance:", wallet);

        if (wallet.rewardPoints !== 150) throw new Error("Points addition failed");

        latestTx = (await walletService.getPointsHistory(referrer._id)).transactions[0];
        if (latestTx.amount !== 100 || latestTx.source !== 'admin_adjustment') {
            throw new Error("Add Points Transaction failed");
        }
        console.log("Add Points Transaction verified");


        // 4. Deduct Reward Points (Spend)
        console.log("\n4. Deducting Reward Points...");
        let txCountBefore = (await walletService.getPointsHistory(referrer._id)).transactions.length;

        await walletService.deductRewardPoints(referrer._id, 30, "merchandise_redemption", "Bought Sticker");

        wallet = await walletService.getWalletBalance(referrer._id);
        console.log("Updated Wallet Balance:", wallet);

        if (wallet.rewardPoints !== 120) throw new Error("Points deduction failed");

        let txCountAfter = (await walletService.getPointsHistory(referrer._id)).transactions.length;
        if (txCountAfter !== txCountBefore) {
            throw new Error("Deduct Points Transaction SHOULD NOT be created (Earn-Only Mode)");
        }
        console.log("Deduct Points Transaction verified (No Log Created)");

        // 5. Convert Points to Money
        console.log("\n5. Converting Points to Money...");
        // Convert 50 points -> 5 monetary units
        txCountBefore = (await walletService.getPointsHistory(referrer._id)).transactions.length;

        await studentService.convertPointsToMoney(referrer._id, 50);

        wallet = await walletService.getWalletBalance(referrer._id);
        console.log("Final Wallet Balance:", wallet);

        if (wallet.rewardPoints !== 70 || wallet.monetaryBalance !== 5) {
            throw new Error(`Conversion failed. Expected 70 points, 5 money. Got: ${JSON.stringify(wallet)}`);
        }

        txCountAfter = (await walletService.getPointsHistory(referrer._id)).transactions.length;
        if (txCountAfter !== txCountBefore) {
            throw new Error(`Conversion Transaction SHOULD NOT be created (Earn-Only Mode)`);
        }
        console.log("Conversion Transaction verified (No Log Created)");

        console.log("\n✅ ALL TESTS PASSED SUCCESSFULLY");

        // Final Cleanup
        await cleanup(referrerEmail, "dummy@test.com");
        console.log("Cleanup done.");

    } catch (error) {
        console.error("\n❌ TEST FAILED:", error);
    } finally {
        await mongoose.connection.close();
    }
};

runTest();

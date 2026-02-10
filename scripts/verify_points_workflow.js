import mongoose from 'mongoose';
import dotenv from 'dotenv';
import connectDB from '../src/config/db.js';
import walletService from '../src/services/wallet.service.js';
import PointsTransaction from '../src/models/PointsTransaction.js';

dotenv.config();

const runVerification = async () => {
    try {
        await connectDB();
        console.log("✅ DB Connected");

        // 1. Create a dummy user ID (random ObjectId)
        const userId = new mongoose.Types.ObjectId();
        console.log(`Testing with User ID: ${userId}`);

        // =========================================================
        // TEST 1: POINTS EARNED (Workflow 1)
        // =========================================================
        console.log("\n--- TEST 1: EARN POINTS ---");
        const earnAmount = 100;
        await walletService.addRewardPoints(
            userId,
            earnAmount,
            "admin_adjustment",
            "Test Earn",
            null,
            "User"
        );

        const walletAfterEarn = await walletService.getOrCreateWallet(userId);
        console.log(`Wallet Points: ${walletAfterEarn.rewardPoints} (Expected: 100)`);

        const earnTx = await PointsTransaction.findOne({
            student: userId,
            type: 'earned',
            amount: earnAmount
        });

        if (earnTx) {
            console.log("✅ Earn Transaction Found:", earnTx._id);
            console.log(`   Source: ${earnTx.source}`);
            console.log(`   BalanceAfter: ${earnTx.balanceAfter}`);
        } else {
            console.error("❌ Earn Transaction NOT Found!");
        }

        // =========================================================
        // TEST 2: POINTS SPENT (Workflow 2)
        // =========================================================
        console.log("\n--- TEST 2: SPEND POINTS ---");
        const spendAmount = 30;
        await walletService.deductRewardPoints(
            userId,
            spendAmount,
            "points_spent",
            "Test Spend",
            null,
            "User" // Assuming referenceType can be User, or maybe null
        );

        const walletAfterSpend = await walletService.getOrCreateWallet(userId);
        console.log(`Wallet Points: ${walletAfterSpend.rewardPoints} (Expected: 70)`);

        const spendTx = await PointsTransaction.findOne({
            student: userId,
            type: 'spent',
            amount: spendAmount
        });

        if (spendTx) {
            console.log("✅ Spend Transaction Found:", spendTx._id);
            console.log(`   Source: ${spendTx.source}`);
        } else {
            console.error("❌ Spend Transaction NOT Found!");
        }

        // =========================================================
        // TEST 3: POINTS CONVERSION (Workflow 3)
        // =========================================================
        console.log("\n--- TEST 3: CONVERT POINTS ---");
        const convertAmount = 20; // 20 points -> 2 monetary units
        await walletService.convertPointsToMoney(userId, convertAmount);

        const walletAfterConvert = await walletService.getOrCreateWallet(userId);
        console.log(`Wallet Points: ${walletAfterConvert.rewardPoints} (Expected: 50)`);
        console.log(`Monetary Balance: ${walletAfterConvert.monetaryBalance} (Expected: 2)`);

        // VERIFY NO TRANSACTION LOG
        // We expect NO transaction with type 'debit' or 'spent' for this conversion amount RECENTLY
        // Actually our previous implementation *did* create a 'spent' transaction for actual spending.
        // Conversion should NOT create one.

        // Let's check if a transaction exists with amount 20 and type 'spent' or 'debit' created just now.
        // The strict rule is "Conversion must NOT create transaction log".
        // We searched for 'spent' transaction for 30 earlier.

        const convertTx = await PointsTransaction.findOne({
            student: userId,
            amount: convertAmount,
            $or: [{ type: 'spent' }, { type: 'debit' }]
        });

        if (!convertTx) {
            console.log("✅ NO Transaction found for conversion (Correct behavior)");
        } else {
            console.error("❌ Transaction FOUND for conversion (Incorrect behavior):", convertTx._id);
        }

        console.log("\n--- VERIFICATION COMPLETE ---");

    } catch (error) {
        console.error("❌ Error during verification:", error);
    } finally {
        await mongoose.connection.close();
        process.exit(0);
    }
};

runVerification();

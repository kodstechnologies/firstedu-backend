import crypto from 'crypto';
import Student from '../models/Student.js';
import Wallet from '../models/Wallet.js';
import walletRepository from '../repository/wallet.repository.js';

/**
 * Generate a unique referral code based on the user's name.
 * Format: First 3 chars of name (uppercase) + 4 random alphanumeric chars.
 * Example: AMI7QK2
 * @param {string} name - The user's name
 * @returns {Promise<string>} - The generated unique referral code
 */
export const generateReferralCode = async (name) => {
    const prefix = name ? name.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X') : 'USR';

    // Ensure we have 3 chars for prefix if name is short
    const cleanPrefix = prefix.length < 3 ? (prefix + 'XXX').substring(0, 3) : prefix;

    let referralCode;
    let isUnique = false;

    while (!isUnique) {
        const randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase().substring(0, 4);
        referralCode = `${cleanPrefix}${randomSuffix}`;

        // Ensure uniqueness
        const existingUser = await Student.findOne({ referralCode });
        if (!existingUser) {
            isUnique = true;
        }
    }

    return referralCode;
};

/**
 * Process a referral code: validate it and return the referrer's ID.
 * @param {string} referralCode - The referral code provided by the new user
 * @returns {Promise<string|null>} - The referrer's ID if valid, null otherwise
 */
export const validateAndGetReferrerId = async (referralCode) => {
    if (!referralCode) return null;

    const referrer = await Student.findOne({ referralCode });
    if (!referrer) {
        return null; // Invalid code, return null (graceful failure)
    }

    return referrer._id;
};

/**
 * Add the new user to the referrer's history.
 * Should be called after the new user is successfully created.
 * @param {string} referrerId - The ID of the referrer
 * @param {string} newUserId - The ID of the newly created user
 */
export const addReferralHistory = async (referrerId, newUserId) => {
    if (!referrerId || !newUserId) return;

    try {
        await Student.findByIdAndUpdate(referrerId, {
            $addToSet: { referralHistory: newUserId }
        });
    } catch (error) {
        console.error(`Failed to update referral history for referrer ${referrerId}:`, error);
        // Suppress error so signup flow isn't interrupted
    }
};

/**
 * Ensure a wallet exists for the user.
 * @param {string} userId - The user's ID
 * @param {string} userType - The user type (default: "User")
 */
export const ensureWalletExists = async (userId, userType = "User") => {
    try {
        const existingWallet = await walletRepository.findWallet(userId, userType);
        if (!existingWallet) {
            await walletRepository.createWallet({
                user: userId,
                userType,
                monetaryBalance: 0,
                rewardPoints: 0
            });
            console.log(`Wallet created for ${userType} ${userId}`);
        }
    } catch (error) {
        console.error(`Error ensuring wallet exists for ${userId}:`, error);
        throw error; // Re-throw to be caught by caller
    }
};

/**
 * Process referral reward for the referrer.
 * Adds 50 reward points.
 * @param {string} referrerId - The referrer's ID
 */
export const processReferralReward = async (referrerId) => {
    try {
        const rewardAmount = 50;
        const wallet = await walletRepository.findWallet(referrerId, "User");

        if (wallet) {
            wallet.rewardPoints += rewardAmount;
            await wallet.save();

            // Log transaction (optional but good practice, assuming repository has this)
            await walletRepository.createPointsTransaction({
                student: referrerId,
                amount: rewardAmount,
                type: 'credit',
                description: 'Referral Reward',
                balanceAfter: wallet.rewardPoints
            });

            console.log(`Referral reward of ${rewardAmount} points added to ${referrerId}`);
        } else {
            console.warn(`Referrer ${referrerId} does not have a wallet. Creating one now.`);
            // Create wallet with the reward points directly? 
            // Or create empty and then add? Let's create with reward.
            await walletRepository.createWallet({
                user: referrerId,
                userType: "User",
                monetaryBalance: 0,
                rewardPoints: rewardAmount
            });
            // Also log transaction for the new wallet
            await walletRepository.createPointsTransaction({
                student: referrerId,
                amount: rewardAmount,
                type: 'credit',
                description: 'Referral Reward',
                balanceAfter: rewardAmount
            });
            console.log(`Wallet created and referral reward added for ${referrerId}`);
        }
    } catch (error) {
        console.error(`Error processing referral reward for ${referrerId}:`, error);
        // Don't throw, just log. We don't want to fail everything if this fails.
    }
};

/**
 * Handle all post-signup wallet logic.
 * 1. Ensure wallet for new student.
 * 2. If referred, give reward to referrer.
 * @param {string} newStudentId 
 * @param {string} referrerId (optional)
 */
export const handlePostSignupWalletRewards = async (newStudentId, referrerId) => {
    // 1. Ensure new student has a wallet (non-blocking in theory but we await to ensure it happens)
    try {
        await ensureWalletExists(newStudentId, "User");
    } catch (err) {
        console.error("Failed to create wallet for new student:", err);
    }

    // 2. Process referrer reward
    if (referrerId) {
        // We don't await this if we want it completely background, 
        // but robust systems usually await or queue it. 
        // Given existing code uses .catch for background, we can do similar or just await inside this async function 
        // which is called without await in controller?
        // The plan said "calls processReferralReward".
        await processReferralReward(referrerId);
    }
};

/**
 * Convert reward points to monetary balance.
 * Conversion Rule: 10 Points = 1 Monetary Unit.
 * @param {string} userId - The user's ID
 * @param {number} pointsToConvert - Points to convert (must be multiple of 10)
 * @returns {Promise<Object>} - The updated wallet
 */
export const convertPointsToMoney = async (userId, pointsToConvert) => {
    // 1. Validate input
    if (!pointsToConvert || pointsToConvert <= 0) {
        throw new Error("Points to convert must be greater than 0");
    }
    if (pointsToConvert % 10 !== 0) {
        throw new Error("Points must be in multiples of 10");
    }

    // 2. Fetch wallet to check balance (Pre-check for better error message)
    const wallet = await walletRepository.findWallet(userId, "User");
    if (!wallet) {
        throw new Error("Wallet not found");
    }

    if (wallet.rewardPoints < pointsToConvert) {
        throw new Error("Insufficient reward points");
    }

    // 3. Calculate conversion
    const monetaryToAdd = pointsToConvert / 10;

    // 4. Atomic Update
    const updatedWallet = await walletRepository.convertRewardPoints(userId, "User", pointsToConvert, monetaryToAdd);

    if (!updatedWallet) {
        // Should not happen if pre-check passed, unless race condition
        throw new Error("Transaction failed: Insufficient points or concurrent update");
    }

    // 5. Log Transaction
    try {
        await walletRepository.createPointsTransaction({
            student: userId,
            amount: pointsToConvert,
            type: 'debit',
            description: `Converted to ${monetaryToAdd} monetary balance`,
            balanceAfter: updatedWallet.rewardPoints
        });
    } catch (logError) {
        console.error("Failed to log points transaction:", logError);
        // Don't fail the request since conversion succeeded
    }

    return updatedWallet;
};

const studentService = {
    generateReferralCode,
    validateAndGetReferrerId,
    addReferralHistory,
    generateReferralCode, // Exporting original individual exports as well if needed by object
    ensureWalletExists,
    processReferralReward,
    processReferralReward,
    handlePostSignupWalletRewards,
    convertPointsToMoney
};

export default studentService;

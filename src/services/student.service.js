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
  const prefix = name
    ? name
        .substring(0, 3)
        .toUpperCase()
        .replace(/[^A-Z]/g, 'X')
    : 'USR';

  // Ensure we have 3 chars for prefix if name is short
  const cleanPrefix =
    prefix.length < 3 ? (prefix + 'XXX').substring(0, 3) : prefix;

  let referralCode;
  let isUnique = false;

  while (!isUnique) {
    const randomSuffix = crypto
      .randomBytes(3)
      .toString('hex')
      .toUpperCase()
      .substring(0, 4);
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
      $addToSet: { referralHistory: newUserId },
    });
  } catch (error) {
    console.error(
      `Failed to update referral history for referrer ${referrerId}:`,
      error,
    );
    // Suppress error so signup flow isn't interrupted
  }
};

/**
 * Ensure a wallet exists for the user.
 * @param {string} userId - The user's ID
 * @param {string} userType - The user type (default: "User")
 */
export const ensureWalletExists = async (userId, userType = 'User') => {
  try {
    const existingWallet = await walletRepository.findWallet(userId, userType);
    if (!existingWallet) {
      await walletRepository.createWallet({
        user: userId,
        userType,
        monetaryBalance: 0,
        rewardPoints: 0,
      });
      console.log(`Wallet created for ${userType} ${userId}`);
    }
  } catch (error) {
    console.error(`Error ensuring wallet exists for ${userId}:`, error);
    throw error; // Re-throw to be caught by caller
  }
};

/** Points awarded to referrer when a referred user signs up successfully */
export const REFERRAL_REWARD_POINTS = 100;

/**
 * Process referral reward for the referrer.
 * Adds 100 reward points after successful referral signup.
 * @param {string} referrerId - The referrer's ID
 * @param {string} referredUserId - The referred user's ID
 */
export const processReferralReward = async (referrerId, referredUserId) => {
  try {
    const rewardAmount = REFERRAL_REWARD_POINTS;
    const wallet = await walletRepository.findWallet(referrerId, 'User');

    if (wallet) {
      wallet.rewardPoints += rewardAmount;
      await wallet.save();

      await walletRepository.createPointsTransaction({
        student: referrerId,
        amount: rewardAmount,
        type: 'earned', // ✅ correct enum
        source: 'referral', // ✅ correct enum
        description: 'Refer & Earn: Successful referral signup',
        referenceId: referredUserId,
        referenceType: 'Referral',
        balanceAfter: wallet.rewardPoints,
      });

      console.log(`Referral reward added to ${referrerId}`);
    } else {
      await walletRepository.createWallet({
        user: referrerId,
        userType: 'User',
        monetaryBalance: 0,
        rewardPoints: rewardAmount,
      });

      await walletRepository.createPointsTransaction({
        student: referrerId,
        amount: rewardAmount,
        type: 'earned',
        source: 'referral',
        description: 'Refer & Earn: Successful referral signup',
        referenceId: referredUserId,
        referenceType: 'Referral',
        balanceAfter: rewardAmount,
      });

      console.log(`Wallet created and referral reward added for ${referrerId}`);
    }
  } catch (error) {
    console.error(`Error processing referral reward for ${referrerId}:`, error);
  }
};

/**
 * Handle all post-signup wallet logic.
 * 1. Ensure wallet for new student.
 * 2. If referred, give reward to referrer.
 * @param {string} newStudentId
 * @param {string} referrerId (optional)
 */
export const handlePostSignupWalletRewards = async (
  newStudentId,
  referrerId,
) => {
  // 1. Ensure new student has a wallet (non-blocking in theory but we await to ensure it happens)
  try {
    await ensureWalletExists(newStudentId, 'User');
  } catch (err) {
    console.error('Failed to create wallet for new student:', err);
  }

  // 2. Process referrer reward
  if (referrerId) {
    // We don't await this if we want it completely background,
    // but robust systems usually await or queue it.
    // Given existing code uses .catch for background, we can do similar or just await inside this async function
    // which is called without await in controller?
    // The plan said "calls processReferralReward".
    await processReferralReward(referrerId, newStudentId);
  }
};

/**
 * Convert reward points to monetary balance.
 * Conversion Rule: 100 Points = 10 Balance. Minimum 100 points required to convert.
 * @param {string} userId - The user's ID
 * @param {number} pointsToConvert - Points to convert (min 100, any amount above)
 * @returns {Promise<Object>} - The updated wallet
 */
export const convertPointsToMoney = async (userId, pointsToConvert) => {
  // 1. Validate input
  if (!pointsToConvert || pointsToConvert <= 0) {
    throw new Error('Points to convert must be greater than 0');
  }

  if (pointsToConvert < 100) {
    throw new Error('Minimum 100 points required to convert to balance');
  }

  // 2. Fetch wallet
  const wallet = await walletRepository.findWallet(userId, 'User');

  if (!wallet) {
    throw new Error('Wallet not found');
  }

  if (wallet.rewardPoints < pointsToConvert) {
    throw new Error('Insufficient reward points');
  }

  // 3. Calculate conversion: 100 points = 10 balance
  const monetaryToAdd = (pointsToConvert / 100) * 10;

  // 4. Atomic update
  const updatedWallet = await walletRepository.convertRewardPoints(
    userId,
    'User',
    pointsToConvert,
    monetaryToAdd,
  );

  if (!updatedWallet) {
    throw new Error(
      'Transaction failed: Insufficient points or concurrent update',
    );
  }

  return updatedWallet;
};

/**
 * Get refer-earn info for the logged-in student: referral code, share link, points per referral, and total referrals count.
 * @param {string} studentId - The student's ID
 * @returns {Promise<Object>} - { referralCode, shareLink, pointsPerReferral, totalReferrals }
 */
export const getReferralInfo = async (studentId) => {
  const student = await Student.findById(studentId)
    .select('referralCode referralHistory')
    .lean();
  if (!student) return null;

  const totalReferrals = Array.isArray(student.referralHistory)
    ? student.referralHistory.length
    : 0;
  const baseUrl = process.env.STUDENT_APP_URL || process.env.FRONTEND_URL || '';
  const shareLink = baseUrl
    ? `${baseUrl.replace(/\/$/, '')}/signup?ref=${student.referralCode || ''}`
    : null;

  return {
    referralCode: student.referralCode || null,
    shareLink,
    pointsPerReferral: REFERRAL_REWARD_POINTS,
    totalReferrals,
    message: `Earn ${REFERRAL_REWARD_POINTS} points for every friend who signs up using your referral.`,
  };
};

/**
 * Get list of users referred by this student (for refer-earn dashboard).
 * @param {string} studentId - The referrer's ID
 * @param {Object} options - { page, limit }
 * @returns {Promise<Object>} - { referrals, pagination }
 */
export const getMyReferrals = async (studentId, options = {}) => {
  const { page = 1, limit = 20 } = options;
  const student = await Student.findById(studentId).select('referralHistory').lean();
  if (!student || !Array.isArray(student.referralHistory) || student.referralHistory.length === 0) {
    return {
      referrals: [],
      pagination: { page: 1, limit, total: 0, pages: 1 },
    };
  }

  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10)));
  const skip = (pageNum - 1) * limitNum;
  const ids = student.referralHistory;

  const [referrals, total] = await Promise.all([
    Student.find({ _id: { $in: ids } })
      .select('name email createdAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    Student.countDocuments({ _id: { $in: ids } }),
  ]);

  return {
    referrals: referrals.map((r) => ({
      _id: r._id,
      name: r.name,
      email: r.email ? `${r.email.slice(0, 3)}***@***` : null,
      joinedAt: r.createdAt,
    })),
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum) || 1,
    },
  };
};

const studentService = {
  generateReferralCode,
  validateAndGetReferrerId,
  addReferralHistory,
  ensureWalletExists,
  processReferralReward,
  handlePostSignupWalletRewards,
  convertPointsToMoney,
  getReferralInfo,
  getMyReferrals,
  REFERRAL_REWARD_POINTS,
};

export default studentService;

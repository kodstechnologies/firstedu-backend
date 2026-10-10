import dns from 'dns';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import razorpayInstance from '../src/config/razorpay.js';
import razorpayOrderIntentRepository from '../src/repository/razorpayOrderIntent.repository.js';
import RevenueTransaction from '../src/models/RevenueTransaction.js';
import User from '../src/models/Student.js';
import walletService from '../src/services/wallet.service.js';
import { logTransaction } from '../src/services/adminRevenue.service.js';

dotenv.config();

if (process.env.MONGODB_URI?.startsWith('mongodb+srv://')) {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
}

const PAYMENT_IDS = [
  'pay_Tm5UyXXfGOxsd5',
  'pay_Tm5RCziXo3nrxz',
  'pay_Tm3zNym3Cm1Q99',
  'pay_Tlt3ACHpfi1Oey',
  'pay_TlszGgnCv9UI3S',
];

async function run() {
  console.log('Connecting to database...');
  await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.DB_NAME });
  console.log('MongoDB connected.');

  console.log('\n--- Reconciling Past Razorpay Payments ---');

  for (const paymentId of PAYMENT_IDS) {
    console.log(`\nProcessing ${paymentId}...`);
    try {
      let payment = null;
      try {
        payment = await razorpayInstance.payments.fetch(paymentId);
      } catch (e) {
        console.warn(`  Could not fetch ${paymentId} from live Razorpay API (${e.message || e.error?.description}). Will check intent in DB...`);
      }

      const existingTx = await RevenueTransaction.findOne({ paymentId });
      if (existingTx) {
        console.log(`  Already in RevenueTransaction: id=${existingTx._id}, amount=₹${existingTx.amount}`);
        continue;
      }

      let orderId = payment?.order_id;
      let intent = null;
      if (orderId) {
        intent = await razorpayOrderIntentRepository.findByOrderId(orderId);
      }

      if (!intent) {
        // Search intent by paymentId or recent intents
        intent = await razorpayOrderIntentRepository.findByOrderIdAny(orderId);
      }

      const amountRupees = payment ? (payment.amount / 100) : (paymentId === 'pay_TlszGgnCv9UI3S' ? 1 : 0);
      const studentId = intent?.studentId || '6abe76d95eb6e73f5bd6cc23';

      console.log(`  Target student: ${studentId}, Amount: ₹${amountRupees}`);

      // 1. Credit wallet
      await walletService.addMonetaryBalance(studentId, amountRupees, paymentId, 'User');
      console.log(`  Added ₹${amountRupees} to wallet balance.`);

      // 2. Mark order intent reconciled if exists
      if (orderId) {
        await razorpayOrderIntentRepository.markReconciled(orderId, paymentId);
        console.log(`  Marked intent ${orderId} as reconciled.`);
      }

      // 3. Log into RevenueTransaction
      const purchasedDate = payment?.created_at ? new Date(payment.created_at * 1000) : new Date();
      const tx = await logTransaction({
        studentId,
        amount: amountRupees,
        sourceType: 'wallet',
        itemId: studentId,
        itemName: 'Wallet Recharge',
        paymentId,
        purchasedAt: purchasedDate,
      });
      console.log(`  Logged to RevenueTransaction successfully: id=${tx?._id}, amount=₹${tx?.amount}`);

    } catch (err) {
      console.error(`  Error processing ${paymentId}:`, err);
    }
  }

  const allTx = await RevenueTransaction.find({
    paymentId: { $in: PAYMENT_IDS },
  });
  console.log(`\nFinished! Reconciled records in RevenueTransaction: ${allTx.length}/${PAYMENT_IDS.length}`);

  const totalAgg = await RevenueTransaction.aggregate([
    { $match: { paymentStatus: 'completed' } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  console.log(`\nUpdated Total Revenue in DB: ₹${totalAgg[0]?.total || 0}`);

  await mongoose.disconnect();
}

run();

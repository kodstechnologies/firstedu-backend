import admin from "firebase-admin";
import dotenv from "dotenv";

dotenv.config();

// Initialize Firebase Admin SDK
let firebaseApp;

try {
  // Check if Firebase is already initialized
  if (admin.apps.length === 0) {
    if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT environment variable is required");
    }

    let serviceAccount;
    try {
      // Try parsing the JSON string
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } catch (parseError) {
      console.error("❌ Failed to parse FIREBASE_SERVICE_ACCOUNT JSON:", parseError.message);
      console.error("📝 Make sure your .env file has valid JSON. Example format:");
      console.error('FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"...","private_key":"...","client_email":"..."}');
      throw new Error("Invalid JSON in FIREBASE_SERVICE_ACCOUNT. Check your .env file.");
    }

    // Validate required fields
    if (!serviceAccount.project_id || !serviceAccount.private_key || !serviceAccount.client_email) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT is missing required fields: project_id, private_key, or client_email");
    }

    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    console.log("✅ Firebase Admin SDK initialized successfully");
  } else {
    firebaseApp = admin.app();
  }
} catch (error) {
  console.error("❌ Firebase Admin SDK initialization error:", error.message);
  console.warn(
    "⚠️  Push notifications will not work. Please configure FIREBASE_SERVICE_ACCOUNT in your .env file."
  );
  console.warn(
    "💡 Tip: If your JSON contains quotes, make sure to escape them properly or use single quotes around the entire JSON string."
  );
}

export default firebaseApp;
export { admin };


import admin from "firebase-admin";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to service account JSON (in config folder)
const SERVICE_ACCOUNT_PATH = join(__dirname, "firebase-service-account.json");

// Initialize Firebase Admin SDK
let firebaseApp;

try {
  if (admin.apps.length === 0) {
    if (!existsSync(SERVICE_ACCOUNT_PATH)) {
      throw new Error(
        `Firebase service account file not found at: ${SERVICE_ACCOUNT_PATH}. ` +
        "Create firebase-service-account.json in src/config (see firebase-service-account.json)."
      );
    }

    const serviceAccount = JSON.parse(
      readFileSync(SERVICE_ACCOUNT_PATH, "utf8")
    );

    if (!serviceAccount.project_id || !serviceAccount.private_key || !serviceAccount.client_email) {
      throw new Error(
        "Service account JSON is missing required fields: project_id, private_key, or client_email"
      );
    }

    // Fix private key newlines if stored as literal \n (e.g. from copy-paste)
    if (typeof serviceAccount.private_key === "string") {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
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
    "⚠️  Push notifications will not work. Add firebase-service-account.json in src/config (see firebase-service-account.json)."
  );
}

export default firebaseApp;
export { admin };

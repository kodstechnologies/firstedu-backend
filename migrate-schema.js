import mongoose from "mongoose";
import * as dotenv from "dotenv";
import { resolve } from "path";

dotenv.config({ path: resolve(process.cwd(), ".env") });

async function migrateDiscriminators() {
  try {
    console.log("Connecting to Database...");
    await mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log("Connected.");
    
    // We get the base Category model directly without triggering strict validators yet.
    const db = mongoose.connection.collection("categories");

    console.log("\n--- Setting 'kind' Discriminator Key ---");
    
    // Update Pillars (Base Category)
    const pillarsRes = await db.updateMany(
      { isPredefined: true },
      { 
        $set: { kind: "Category" },
        // Unset any stray metadata from the base pillars to strictly clean the schema
        $unset: { 
          price: "", discountedPrice: "", isFree: "", status: "",
          about: "", syllabus: "", markingScheme: "", rankingCriteria: "",
          examDatesAndDetails: "", awards: "", purchaseCount: "", description: ""
        }
      }
    );
    console.log(`Pillars (Base Category): updated ${pillarsRes.modifiedCount} docs`);

    // Update Subcategories (Discriminator)
    const subRes = await db.updateMany(
      { isPredefined: { $ne: true } },
      { $set: { kind: "Subcategory" } }
    );
    console.log(`Subcategories (Products): updated ${subRes.modifiedCount} docs`);

    console.log("\nMigration completed successfully.");
    process.exit(0);

  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  }
}

migrateDiscriminators();

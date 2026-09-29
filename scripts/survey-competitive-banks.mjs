import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

const uri = process.env.MONGODB_URI;
const dbName = process.env.DB_NAME || "FirstEdu";
await mongoose.connect(uri, { dbName });
const db = mongoose.connection.db;
const cols = [
  "jeemaincompetitivepapers",
  "jeemaincompetitivequestions",
  "jeeadvancedcompetitivepapers",
  "jeeadvancedcompetitivequestions",
  "neetcompetitivepapers",
  "neetcompetitivequestions",
  "clatcompetitivepapers",
  "clatcompetitivequestions",
  "ibpscompetitivepapers",
  "ibpscompetitivequestions",
  "gmatcompetitivepapers",
  "gmatcompetitivequestions",
  "catcompetitivepapers",
  "catcompetitivequestions",
  "ssccgltier1competitivepapers",
  "ssccgltier1competitivequestions",
  "ssccgltier2competitivepapers",
  "ssccgltier2competitivequestions",
  "upsccompetitivepapers",
  "upsccompetitivequestions",
];
for (const c of cols) {
  const n = await db.collection(c).countDocuments();
  console.log(c, n);
}
const cats = await db
  .collection("categories")
  .find({ rootType: "Competitive", isActive: { $ne: false } })
  .project({ name: 1, parent: 1 })
  .toArray();
console.log("competitive categories", cats.length);
const byParent = new Map();
for (const c of cats) {
  const p = c.parent ? String(c.parent) : "root";
  if (!byParent.has(p)) byParent.set(p, []);
  byParent.get(p).push(c);
}
const walk = (parent, depth) => {
  const kids = byParent.get(parent) || [];
  for (const k of kids.sort((a, b) => a.name.localeCompare(b.name))) {
    console.log(`${"  ".repeat(depth)}${k.name} ${k._id}`);
    if (depth < 2) walk(String(k._id), depth + 1);
  }
};
walk("root", 0);
const sample = await db.collection("jeemaincompetitivequestions").findOne({});
if (sample) {
  console.log("jee keys", Object.keys(sample).join(","));
  console.log(
    "jee options",
    Array.isArray(sample.options) ? sample.options.length : 0,
    "section",
    sample.section,
    "type",
    sample.questionType,
    "subject",
    sample.subject,
    "explLen",
    String(sample.explanation || "").length
  );
  console.log(
    "jee option shape",
    JSON.stringify(sample.options?.[0] || null)
  );
}
const noOpt = await db.collection("jeemaincompetitivequestions").countDocuments({
  $or: [{ options: { $size: 0 } }, { options: { $exists: false } }],
});
console.log("jee questions without options", noOpt);
const clat = await db
  .collection("clatcompetitivequestions")
  .findOne({ passage: { $nin: [null, ""] } });
console.log(
  "clat passage",
  Boolean(clat),
  clat
    ? {
        type: clat.questionType,
        opt: clat.options?.length,
        passageLen: (clat.passage || "").length,
      }
    : null
);
const admins = await db
  .collection("admins")
  .find({})
  .project({ email: 1 })
  .limit(5)
  .toArray();
console.log(
  "admins",
  admins.map((a) => `${a.email} ${a._id}`).join(" | ")
);
console.log("questionbanks", await db.collection("questionbanks").countDocuments());
console.log("questions", await db.collection("questions").countDocuments());
await mongoose.disconnect();

import dotenv from "dotenv";
dotenv.config();

const key = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";

if (!key) {
  console.error("OPENAI_API_KEY not set in .env");
  process.exit(1);
}

console.log(`Model: ${model}`);
console.log(`Key prefix: ${key.slice(0, 12)}…`);

const res = await fetch("https://api.openai.com/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model,
    messages: [{ role: "user", content: 'Reply with JSON only: {"ok":true}' }],
    max_tokens: 30,
  }),
});

const body = await res.json().catch(async () => ({ raw: await res.text() }));
console.log(`HTTP status: ${res.status}`);

if (body.error) {
  console.log("OpenAI error type:", body.error.type);
  console.log("OpenAI error code:", body.error.code);
  console.log("OpenAI error message:", body.error.message);
  process.exit(1);
}

console.log("OpenAI reply:", body.choices?.[0]?.message?.content);
console.log("Usage:", JSON.stringify(body.usage));
console.log("OK — OpenAI credits/key working.");

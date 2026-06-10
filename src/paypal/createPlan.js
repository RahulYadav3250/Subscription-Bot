// src/paypal/createPlan.js
// Run ONCE to create all 4 PayPal billing plans.
// Usage: node src/paypal/createPlan.js
// Then copy the printed PLAN IDs into your .env file.

import "dotenv/config";
import { createProduct, createBillingPlan } from "./client.js";
import { PLANS } from "../config/plans.js";

console.log("🔧  Creating PayPal product…");
const product = await createProduct(
  "Telegram Channel Subscription",
  "Subscription plans for private Telegram channel access"
);
console.log("✅  Product created:", product.id);
console.log("\n─────────────────────────────────────────────────────");
console.log("Creating 4 billing plans…\n");

const results = [];
for (const plan of PLANS) {
  console.log(`🔧  Creating plan: ${plan.label}…`);
  try {
    const created = await createBillingPlan(product.id, plan);
    results.push({ key: plan.envKey, id: created.id, label: plan.label });
    console.log(`✅  Done: ${created.id}`);
  } catch (err) {
    console.error(`❌  Failed for ${plan.id}:`, err.response?.data ?? err.message);
  }
}

console.log("\n─────────────────────────────────────────────────────");
console.log("Add these to your .env file:\n");
for (const r of results) {
  console.log(`${r.key}=${r.id}`);
}
console.log("─────────────────────────────────────────────────────\n");

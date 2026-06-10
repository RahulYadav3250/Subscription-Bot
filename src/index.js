// src/index.js
import "dotenv/config";
import express from "express";
import { Bot, webhookCallback } from "grammy";

import {
  handleStart,
  handleSubscribe,
  handleStatus,
  handleCancel,
  handleHelp,
  handlePlanCallback,
} from "./handlers/commands.js";
import {
  handlePayPalWebhook,
  handlePayPalReturn,
  handlePayPalCancel,
} from "./handlers/webhooks.js";
import { startJobs } from "./jobs/scheduler.js";

// ── Validate required env vars ─────────────────────────────────────────────────
const REQUIRED = [
  "BOT_TOKEN", "CHANNEL_ID",
  "PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET",
  "PAYPAL_PLAN_ID_MONTHLY", "PAYPAL_PLAN_ID_QUARTERLY",
  "PAYPAL_PLAN_ID_BIANNUAL", "PAYPAL_PLAN_ID_ANNUAL",
  "WEBHOOK_DOMAIN", "WEBHOOK_SECRET",
];
const missing = REQUIRED.filter((k) => !process.env[k]);
if (missing.length) {
  console.error("❌ Missing required environment variables:\n  " + missing.join("\n  "));
  process.exit(1);
}

// ── Grammy bot ─────────────────────────────────────────────────────────────────
const bot = new Bot(process.env.BOT_TOKEN);

bot.command("start",     handleStart);
bot.command("subscribe", handleSubscribe);
bot.command("status",    handleStatus);
bot.command("cancel",    handleCancel);
bot.command("help",      handleHelp);

bot.callbackQuery(/^plan:/, handlePlanCallback);

bot.on("message", (ctx) => ctx.reply("Use /help to see available commands."));
bot.catch((err) => console.error("[grammy] Unhandled error:", err.message));

// ── Express server ─────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

app.get("/",       (_req, res) => res.json({ status: "ok", ts: new Date().toISOString() }));
app.get("/health", (_req, res) => res.json({ status: "ok" }));

// Telegram webhook
app.use(`/bot/${process.env.WEBHOOK_SECRET}`, webhookCallback(bot, "express"));

// PayPal webhook — respond 200 immediately, then process
app.post("/paypal/webhook", async (req, res) => {
  res.sendStatus(200);
  try { await handlePayPalWebhook(bot, req.body); }
  catch (err) { console.error("[paypal-webhook] Error:", err.message); }
});

// PayPal redirect after user approves
app.get("/paypal/success", async (req, res) => {
  const telegramId = parseInt(req.query.telegram_id);
  if (telegramId) await handlePayPalReturn(bot, telegramId);
  res.send(page("✅ Payment Approved!", "Return to Telegram — your invite link is on its way!"));
});

// PayPal redirect if user cancels
app.get("/paypal/cancel", async (req, res) => {
  const telegramId = parseInt(req.query.telegram_id);
  if (telegramId) await handlePayPalCancel(bot, telegramId);
  res.send(page("❌ Payment Cancelled", "No charge was made. Return to Telegram and use /subscribe to try again."));
});

// ── Start ──────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`🚀 Server on port ${PORT}`);
  const webhookUrl = `${process.env.WEBHOOK_DOMAIN}/bot/${process.env.WEBHOOK_SECRET}`;
  await bot.api.setWebhook(webhookUrl);
  console.log(`🤖 Telegram webhook: ${webhookUrl}`);
  startJobs(bot);
  console.log("✅ Bot is live!");
});

function page(title, message) {
  return `<!DOCTYPE html><html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;
min-height:100vh;margin:0;background:#f0f4f8;}
.card{background:#fff;border-radius:16px;padding:40px 32px;text-align:center;
box-shadow:0 4px 24px rgba(0,0,0,.08);max-width:400px;}
h1{font-size:1.5rem;margin:0 0 12px;}p{color:#555;line-height:1.6;margin:0;}</style>
</head><body><div class="card"><h1>${title}</h1><p>${message}</p></div></body></html>`;
}

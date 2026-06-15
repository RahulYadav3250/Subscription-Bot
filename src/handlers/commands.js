// src/handlers/commands.js
import {
  upsertUser,
  createPendingSubscription,
  getActiveSubscription,
  updateSubscriptionStatus,
} from "../db/database.js";
import { createSubscription, cancelSubscription } from "../paypal/client.js";
import { removeUserFromChannel } from "../utils/channel.js";
import { PLANS, getPlanById } from "../config/plans.js";

const DOMAIN = process.env.WEBHOOK_DOMAIN;

// ── /start ────────────────────────────────────────────────────────────────────
export async function handleStart(ctx) {
  const { id, username, first_name } = ctx.from;
  await upsertUser({ telegram_id: id, username, first_name });

  await ctx.reply(
    `👋 *Welcome${first_name ? `, ${first_name}` : ""}!*\n\n` +
    `Get exclusive access to our private channel.\n\n` +
    `Use /subscribe to see all plans and get started.\n` +
    `Use /help to see all available commands.`,
    { parse_mode: "Markdown" }
  );
}

// ── /subscribe — step 1: show plans ──────────────────────────────────────────
export async function handleSubscribe(ctx) {
  const { id, username, first_name } = ctx.from;
  await upsertUser({ telegram_id: id, username, first_name });

  const existing = await getActiveSubscription(id);
  if (existing) {
    const emoji = existing.status === "trialing" ? "🎁" : "✅";
    return ctx.reply(
      `${emoji} You already have an active subscription (status: *${existing.status}*).\n\n` +
      `Use /status to view details or /cancel to cancel.`,
      { parse_mode: "Markdown" }
    );
  }

  const description = PLANS.map((p) =>
    `${p.label}  •  ${p.badge}${p.hasTrial ? `  •  ${p.trialDays}-Day Free Trial` : ""}`
  ).join("\n");

  const keyboard = PLANS.map((p) => [
    { text: p.buttonText, callback_data: `plan:${p.id}` },
  ]);

  await ctx.reply(
    `💳 *Choose a Subscription Plan*\n\n${description}`,
    {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: keyboard },
    }
  );
}

// ── Callback: plan selected ───────────────────────────────────────────────────
export async function handlePlanCallback(ctx) {
  await ctx.answerCallbackQuery();
  const planId     = ctx.callbackQuery.data.split(":")[1];
  const telegramId = ctx.from.id;
  const plan       = getPlanById(planId);

  if (!plan) return ctx.reply("❌ Invalid plan. Please use /subscribe again.");

  const existing = await getActiveSubscription(telegramId);
  if (existing) {
    return ctx.reply("✅ You already have an active subscription.\n\nUse /status to view it.");
  }

  const planEnvId = process.env[plan.envKey];
  if (!planEnvId) {
    console.error(`[plan-callback] Missing env var: ${plan.envKey}`);
    return ctx.reply("❌ This plan is not configured yet. Please contact support.");
  }

  await createPendingSubscription(telegramId, planId, "paypal");

  const trialNote = plan.hasTrial
    ? `\n🎁 *${plan.trialDays}-day FREE trial* — no charge today!`
    : "";

  try {
    const returnUrl = `${DOMAIN}/paypal/success?telegram_id=${telegramId}&plan_id=${planId}`;
    const cancelUrl = `${DOMAIN}/paypal/cancel?telegram_id=${telegramId}`;
    const { approveUrl } = await createSubscription(telegramId, planId, planEnvId, returnUrl, cancelUrl);

    await ctx.reply(
      `💳 *Complete Your Payment*\n\n` +
      `Plan: *${plan.label}*${trialNote}\n\n` +
      `Tap the button below to pay via PayPal:`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [[{ text: "🔗 Pay via PayPal", url: approveUrl }]],
        },
      }
    );
  } catch (err) {
    console.error("[plan-callback] PayPal error:", err.response?.data ?? err.message);
    await ctx.reply("❌ Could not create a payment link right now. Please try again.");
  }
}

// ── /status ───────────────────────────────────────────────────────────────────
export async function handleStatus(ctx) {
  const sub = await getActiveSubscription(ctx.from.id);

  if (!sub) {
    return ctx.reply("❌ You don't have an active subscription.\n\nUse /subscribe to get started.");
  }

  const statusEmoji = { trialing: "🎁", active: "✅", cancelled: "🚫", expired: "⌛", suspended: "⏸" };
  const emoji = statusEmoji[sub.status] ?? "ℹ️";
  const plan  = getPlanById(sub.plan_id);

  const trialLine = sub.status === "trialing" && sub.trial_end
    ? `\n⏳ Trial ends: *${fmtDate(sub.trial_end)}*`
    : "";

  const renewalLine = sub.current_period_end
    ? `\n📅 Next auto-pay: *${fmtDate(sub.current_period_end)}*`
    : "";

  await ctx.reply(
    `${emoji} *Your Subscription*\n\n` +
    `Plan: *${plan?.label ?? sub.plan_id}*\n` +
    `Status: *${sub.status}*\n` +
    `🔄 Auto-pay: *ON*${trialLine}${renewalLine}\n\n` +
    `Use /cancel to cancel your subscription.`,
    { parse_mode: "Markdown" }
  );
}

// ── /cancel ───────────────────────────────────────────────────────────────────
export async function handleCancel(ctx) {
  const sub = await getActiveSubscription(ctx.from.id);

  if (!sub || !sub.paypal_sub_id) {
    return ctx.reply("❌ No active subscription found.");
  }

  try {
    await cancelSubscription(sub.paypal_sub_id);
    await updateSubscriptionStatus({
      paypal_sub_id: sub.paypal_sub_id,
      status: "cancelled",
      current_period_end: null,
      next_charge_at: null,
    });
    await removeUserFromChannel(ctx, ctx.from.id);

    await ctx.reply(
      "✅ Your subscription has been *cancelled*.\n\n" +
      "You have been removed from the channel. We hope to see you again! 👋",
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    console.error("[cancel] Error:", err.response?.data ?? err.message);
    await ctx.reply("❌ Failed to cancel. Please contact support.");
  }
}

// ── /help ─────────────────────────────────────────────────────────────────────
export async function handleHelp(ctx) {
  await ctx.reply(
    `*Available Commands*\n\n` +
    `/subscribe — Browse plans & subscribe\n` +
    `/status    — Check subscription & next auto-pay\n` +
    `/cancel    — Cancel auto-pay & leave channel\n` +
    `/help      — Show this message`,
    { parse_mode: "Markdown" }
  );
}

function fmtDate(date) {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });
}

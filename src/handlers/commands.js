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
  upsertUser({ telegram_id: id, username, first_name });

  await ctx.reply(
    `👋 *Welcome${first_name ? `, ${first_name}` : ""}!*\n\n` +
    `Get exclusive access to our private channel.\n\n` +
    `Choose from 4 flexible plans — including a *7-day free trial* on monthly & quarterly plans.\n\n` +
    `Use /subscribe to see all plans and get started.`,
    { parse_mode: "Markdown" }
  );
}

// ── /subscribe — show plan picker directly ────────────────────────────────────
export async function handleSubscribe(ctx) {
  const { id, username, first_name } = ctx.from;
  upsertUser({ telegram_id: id, username, first_name });

  const existing = getActiveSubscription(id);
  if (existing) {
    const emoji = existing.status === "trialing" ? "🎁" : "✅";
    return ctx.reply(
      `${emoji} You already have an active subscription (status: *${existing.status}*).\n\n` +
      `Use /status to view details or /cancel to cancel.`,
      { parse_mode: "Markdown" }
    );
  }

  const keyboard = PLANS.map((p) => [
    { text: p.buttonText, callback_data: `plan:${p.id}` },
  ]);

  await ctx.reply(
    `💳 *Choose Your Plan*\n\n` +
    PLANS.map((p) =>
      `${p.label}  •  ${p.badge}${p.hasTrial ? `  •  ${p.trialDays}-Day Free Trial` : ""}`
    ).join("\n") +
    `\n\n_All plans include auto-pay — cancel anytime with /cancel_`,
    {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: keyboard },
    }
  );
}

// ── Callback: plan button tapped → create PayPal subscription link ────────────
export async function handlePlanCallback(ctx) {
  await ctx.answerCallbackQuery();
  const planId     = ctx.callbackQuery.data.split(":")[1];
  const telegramId = ctx.from.id;
  const plan       = getPlanById(planId);

  if (!plan) return ctx.reply("❌ Invalid plan. Please use /subscribe again.");

  // Race-condition guard
  if (getActiveSubscription(telegramId)) {
    return ctx.reply("✅ You already have an active subscription. Use /status to view it.");
  }

  const planEnvId = process.env[plan.envKey];
  if (!planEnvId) {
    console.error(`[plan-callback] Missing env var: ${plan.envKey}`);
    return ctx.reply("❌ This plan isn't configured yet. Please contact support.");
  }

  createPendingSubscription(telegramId, planId, "paypal");

  try {
    const returnUrl = `${DOMAIN}/paypal/success?telegram_id=${telegramId}&plan_id=${planId}`;
    const cancelUrl = `${DOMAIN}/paypal/cancel?telegram_id=${telegramId}`;
    const { approveUrl } = await createSubscription(telegramId, planId, planEnvId, returnUrl, cancelUrl);

    const trialNote = plan.hasTrial
      ? `\n🎁 *${plan.trialDays}-day FREE trial* — no charge today!`
      : "";

    await ctx.reply(
      `💳 *Complete Your Subscription*\n\n` +
      `Plan: *${plan.label}*${trialNote}\n` +
      `🔄 Auto-pay enabled — renews automatically, cancel anytime.\n\n` +
      `Tap below to pay securely via PayPal:`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [[
            { text: "🔗 Pay with PayPal", url: approveUrl },
          ]],
        },
      }
    );
  } catch (err) {
    console.error("[plan-callback] PayPal error:", err.response?.data ?? err.message);
    await ctx.reply("❌ Could not create a payment link right now. Please try again in a moment.");
  }
}

// ── /status ───────────────────────────────────────────────────────────────────
export async function handleStatus(ctx) {
  const sub = getActiveSubscription(ctx.from.id);

  if (!sub) {
    return ctx.reply("❌ You don't have an active subscription.\n\nUse /subscribe to get started.");
  }

  const statusEmoji = { trialing: "🎁", active: "✅", cancelled: "🚫", expired: "⌛", suspended: "⏸" };
  const plan        = getPlanById(sub.plan_id);

  const trialLine = sub.status === "trialing" && sub.trial_end
    ? `\n⏳ Trial ends: *${fmtDate(sub.trial_end)}*`
    : "";
  const renewalLine = sub.current_period_end
    ? `\n📅 Next auto-pay: *${fmtDate(sub.current_period_end)}*`
    : "";

  await ctx.reply(
    `${statusEmoji[sub.status] ?? "ℹ️"} *Your Subscription*\n\n` +
    `Plan: *${plan?.label ?? sub.plan_id}*\n` +
    `Status: *${sub.status}*\n` +
    `Payment: 🌍 PayPal${trialLine}${renewalLine}\n\n` +
    `🔄 Auto-pay is ON — no action needed to keep access.\n` +
    `Use /cancel to turn off auto-pay and leave the channel.`,
    { parse_mode: "Markdown" }
  );
}

// ── /cancel ───────────────────────────────────────────────────────────────────
export async function handleCancel(ctx) {
  const sub = getActiveSubscription(ctx.from.id);

  if (!sub || !sub.paypal_sub_id) {
    return ctx.reply("❌ No active subscription found.");
  }

  try {
    await cancelSubscription(sub.paypal_sub_id);
    updateSubscriptionStatus({
      paypal_sub_id:      sub.paypal_sub_id,
      status:             "cancelled",
      current_period_end: null,
    });
    await removeUserFromChannel(ctx, ctx.from.id);

    await ctx.reply(
      "✅ *Subscription Cancelled*\n\n" +
      "Auto-pay has been turned off and you've been removed from the channel.\n\n" +
      "Use /subscribe to resubscribe anytime. 👋",
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    console.error("[cancel] Error:", err.response?.data ?? err.message);
    await ctx.reply("❌ Failed to cancel. Please try again or contact support.");
  }
}

// ── /help ─────────────────────────────────────────────────────────────────────
export async function handleHelp(ctx) {
  await ctx.reply(
    `*Available Commands*\n\n` +
    `/subscribe — See plans & start your subscription\n` +
    `/status    — Check subscription status & next payment\n` +
    `/cancel    — Cancel auto-pay & leave channel\n` +
    `/help      — Show this message`,
    { parse_mode: "Markdown" }
  );
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });
}

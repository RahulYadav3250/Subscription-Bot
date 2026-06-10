// src/handlers/webhooks.js
// Handles PayPal subscription lifecycle webhook events.
// PayPal manages autopay natively — we just listen and keep our DB in sync.

import {
  getSubscriptionByPaypalId,
  activateSubscription,
  updateSubscriptionStatus,
  isEventProcessed,
  recordEvent,
} from "../db/database.js";
import { getSubscription } from "../paypal/client.js";
import { getPlanById } from "../config/plans.js";
import { addUserToChannel, removeUserFromChannel, createInviteLink } from "../utils/channel.js";

export async function handlePayPalWebhook(bot, payload) {
  const eventId   = payload.id;
  const eventType = payload.event_type;

  if (isEventProcessed(eventId)) {
    console.log(`[paypal-webhook] Duplicate ignored: ${eventId}`);
    return;
  }
  recordEvent(eventId, eventType, payload, "paypal");

  const resource       = payload.resource ?? {};
  const subscriptionId = resource.id ?? resource.billing_agreement_id;
  console.log(`[paypal-webhook] ${eventType} — sub: ${subscriptionId}`);

  switch (eventType) {
    case "BILLING.SUBSCRIPTION.ACTIVATED":
      await onActivated(bot, subscriptionId);
      break;
    // PayPal fires PAYMENT.SALE.COMPLETED on every successful charge (trial end + every renewal)
    case "PAYMENT.SALE.COMPLETED":
    case "BILLING.SUBSCRIPTION.RENEWED":
      await onPaymentSuccess(bot, subscriptionId, resource);
      break;
    case "BILLING.SUBSCRIPTION.PAYMENT.FAILED":
      await onPaymentFailed(bot, subscriptionId);
      break;
    case "BILLING.SUBSCRIPTION.SUSPENDED":
      await onSuspended(bot, subscriptionId);
      break;
    case "BILLING.SUBSCRIPTION.CANCELLED":
      await onCancelled(bot, subscriptionId);
      break;
    case "BILLING.SUBSCRIPTION.EXPIRED":
      await onExpired(bot, subscriptionId);
      break;
    default:
      console.log(`[paypal-webhook] Unhandled: ${eventType}`);
  }
}

// ── Return / Cancel redirect handlers ────────────────────────────────────────
export async function handlePayPalReturn(bot, telegramId) {
  try {
    await bot.api.sendMessage(
      telegramId,
      "🎉 *Payment Approved!*\n\n" +
      "PayPal is confirming your subscription. You'll receive your channel invite link in a few seconds.\n\n" +
      "🔄 *Auto-pay is ON* — your subscription will renew automatically. No action needed!\n\n" +
      "Use /status to check anytime.",
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    console.error("[paypal-return] Notify failed:", err.message);
  }
}

export async function handlePayPalCancel(bot, telegramId) {
  try {
    await bot.api.sendMessage(
      telegramId,
      "❌ Payment was *cancelled*.\n\nNo charge was made. Use /subscribe to try again.",
      { parse_mode: "Markdown" }
    );
  } catch (_) {}
}

// ── Event handlers ─────────────────────────────────────────────────────────────

async function onActivated(bot, subscriptionId) {
  let detail;
  try {
    detail = await getSubscription(subscriptionId);
  } catch (err) {
    console.error("[onActivated] Fetch failed:", err.message);
    return;
  }

  // custom_id = "telegramId:planId"
  const [rawId, planId = "monthly"] = (detail.custom_id ?? "").split(":");
  const telegramId = parseInt(rawId);
  if (!telegramId) return console.error("[onActivated] No custom_id on subscription");

  const plan = getPlanById(planId, false);
  const now  = new Date();

  const trialEnd  = plan?.hasTrial ? new Date(now.getTime() + plan.trialDays * 86400000) : null;
  const periodEnd = detail.billing_info?.next_billing_time
    ? new Date(detail.billing_info.next_billing_time)
    : new Date(now.getTime() + (plan?.periodDays ?? 30) * 86400000);

  const status = plan?.hasTrial ? "trialing" : "active";

  activateSubscription({
    paypal_sub_id:      subscriptionId,
    telegram_id:        telegramId,
    trial_end:          trialEnd?.toISOString() ?? null,
    current_period_end: periodEnd.toISOString(),
    next_charge_at:     periodEnd.toISOString(), // PayPal charges at next_billing_time
    status,
  });

  await addUserToChannel(bot, telegramId);

  try {
    const inviteLink = await createInviteLink(bot, telegramId);
    const trialLine = plan?.hasTrial
      ? `🎁 *${plan.trialDays}-day free trial* started — no charge today!\n📅 First charge: *${fmtDate(trialEnd)}*\n\n`
      : `📅 Active until: *${fmtDate(periodEnd)}* — renews automatically\n\n`;

    await bot.api.sendMessage(
      telegramId,
      `✅ *Subscription Active!*\n\n` +
      `Plan: *${plan?.label ?? planId}*\n` +
      `🔄 *Auto-pay is ON* — renews automatically, nothing to do!\n\n` +
      trialLine +
      `Here is your private channel invite link (single-use):\n${inviteLink}`,
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    console.error("[onActivated] Send invite failed:", err.message);
  }
}

async function onPaymentSuccess(bot, subscriptionId, resource) {
  const sub = getSubscriptionByPaypalId(subscriptionId);
  if (!sub) return console.warn("[onPaymentSuccess] Unknown subscription:", subscriptionId);

  const plan    = getPlanById(sub.plan_id, false);
  // Use PayPal's next_billing_time if available in resource, otherwise estimate
  const nextEnd = resource?.billing_info?.next_billing_time
    ? new Date(resource.billing_info.next_billing_time)
    : new Date(Date.now() + (plan?.periodDays ?? 30) * 86400000);

  updateSubscriptionStatus({
    paypal_sub_id:      subscriptionId,
    status:             "active",
    current_period_end: nextEnd.toISOString(),
    next_charge_at:     nextEnd.toISOString(),
  });

  // Re-add user in case they were briefly removed
  await addUserToChannel(bot, sub.telegram_id);

  try {
    await bot.api.sendMessage(
      sub.telegram_id,
      `✅ *Auto-Pay Successful!*\n\n` +
      `Your *${plan?.label ?? "subscription"}* has been automatically renewed via PayPal.\n` +
      `📅 Next auto-pay: *${fmtDate(nextEnd)}*\n\n` +
      `Your channel access continues uninterrupted. 🔄`,
      { parse_mode: "Markdown" }
    );
  } catch (_) {}
}

async function onPaymentFailed(bot, subscriptionId) {
  const sub = getSubscriptionByPaypalId(subscriptionId);
  if (!sub) return;

  try {
    await bot.api.sendMessage(
      sub.telegram_id,
      `⚠️ *Auto-Pay Failed*\n\n` +
      `PayPal couldn't charge your payment method for renewal.\n\n` +
      `PayPal will automatically retry. Please check your PayPal payment method to avoid losing access.\n\n` +
      `Use /cancel if you wish to cancel.`,
      { parse_mode: "Markdown" }
    );
  } catch (_) {}
}

async function onSuspended(bot, subscriptionId) {
  const sub = getSubscriptionByPaypalId(subscriptionId);
  if (!sub) return;

  updateSubscriptionStatus({ paypal_sub_id: subscriptionId, status: "suspended", current_period_end: null, next_charge_at: null });
  await removeUserFromChannel(bot, sub.telegram_id);

  try {
    await bot.api.sendMessage(
      sub.telegram_id,
      `🚫 *Subscription Suspended*\n\n` +
      `After multiple failed auto-pay attempts, your subscription was suspended and you've been removed from the channel.\n\n` +
      `Use /subscribe to start a new subscription.`,
      { parse_mode: "Markdown" }
    );
  } catch (_) {}
}

async function onCancelled(bot, subscriptionId) {
  const sub = getSubscriptionByPaypalId(subscriptionId);
  if (!sub) return;

  updateSubscriptionStatus({ paypal_sub_id: subscriptionId, status: "cancelled", current_period_end: null, next_charge_at: null });
  await removeUserFromChannel(bot, sub.telegram_id);

  try {
    await bot.api.sendMessage(
      sub.telegram_id,
      `🚫 *Subscription Cancelled*\n\n` +
      `Auto-pay has been turned off and you've been removed from the channel.\n\n` +
      `Use /subscribe to resubscribe anytime.`,
      { parse_mode: "Markdown" }
    );
  } catch (_) {}
}

async function onExpired(bot, subscriptionId) {
  const sub = getSubscriptionByPaypalId(subscriptionId);
  if (!sub) return;

  updateSubscriptionStatus({ paypal_sub_id: subscriptionId, status: "expired", current_period_end: null, next_charge_at: null });
  await removeUserFromChannel(bot, sub.telegram_id);

  try {
    await bot.api.sendMessage(
      sub.telegram_id,
      `⌛ *Subscription Expired*\n\n` +
      `Your subscription has expired and you've been removed from the channel.\n\n` +
      `Use /subscribe to renew.`,
      { parse_mode: "Markdown" }
    );
  } catch (_) {}
}

function fmtDate(date) {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });
}

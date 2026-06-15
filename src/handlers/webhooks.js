// src/handlers/webhooks.js
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

  if (await isEventProcessed(eventId)) {
    console.log(`[paypal-webhook] Duplicate ignored: ${eventId}`);
    return;
  }
  await recordEvent(eventId, eventType, payload, "paypal");

  const resource       = payload.resource ?? {};
  const subscriptionId = resource.id ?? resource.billing_agreement_id;
  console.log(`[paypal-webhook] ${eventType} — sub: ${subscriptionId}`);

  switch (eventType) {
    case "BILLING.SUBSCRIPTION.ACTIVATED":
      await onActivated(bot, subscriptionId);
      break;
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

export async function handlePayPalReturn(bot, telegramId) {
  try {
    await bot.api.sendMessage(
      telegramId,
      "🎉 *Payment Approved!*\n\n" +
      "PayPal is confirming your subscription. Your channel invite link will arrive in a few seconds.\n\n" +
      "🔄 *Auto-pay is ON* — renews automatically, nothing to do!\n\n" +
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

  const [rawId, planId = "monthly"] = (detail.custom_id ?? "").split(":");
  const telegramId = parseInt(rawId);
  if (!telegramId) return console.error("[onActivated] No custom_id on subscription");

  const plan = getPlanById(planId);
  const now  = new Date();

  const trialEnd  = plan?.hasTrial ? new Date(now.getTime() + plan.trialDays * 86400000) : null;
  const periodEnd = detail.billing_info?.next_billing_time
    ? new Date(detail.billing_info.next_billing_time)
    : new Date(now.getTime() + (plan?.periodDays ?? 30) * 86400000);

  const status = plan?.hasTrial ? "trialing" : "active";

  await activateSubscription({
    paypal_sub_id:      subscriptionId,
    telegram_id:        telegramId,
    trial_end:          trialEnd?.toISOString() ?? null,
    current_period_end: periodEnd.toISOString(),
    next_charge_at:     periodEnd.toISOString(),
    status,
  });

  await addUserToChannel(bot, telegramId);

  try {
    const inviteLink = await createInviteLink(bot, telegramId);
    const trialLine  = plan?.hasTrial
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
  const sub = await getSubscriptionByPaypalId(subscriptionId);
  if (!sub) return console.warn("[onPaymentSuccess] Unknown subscription:", subscriptionId);

  const plan    = getPlanById(sub.plan_id);
  const nextEnd = resource?.billing_info?.next_billing_time
    ? new Date(resource.billing_info.next_billing_time)
    : new Date(Date.now() + (plan?.periodDays ?? 30) * 86400000);

  await updateSubscriptionStatus({
    paypal_sub_id:      subscriptionId,
    status:             "active",
    current_period_end: nextEnd.toISOString(),
    next_charge_at:     nextEnd.toISOString(),
  });

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
  const sub = await getSubscriptionByPaypalId(subscriptionId);
  if (!sub) return;

  try {
    await bot.api.sendMessage(
      sub.telegram_id,
      `⚠️ *Auto-Pay Failed*\n\n` +
      `PayPal couldn't charge your payment method.\n\n` +
      `PayPal will retry automatically — please check your PayPal payment method.\n\n` +
      `Use /cancel if you wish to cancel.`,
      { parse_mode: "Markdown" }
    );
  } catch (_) {}
}

async function onSuspended(bot, subscriptionId) {
  const sub = await getSubscriptionByPaypalId(subscriptionId);
  if (!sub) return;

  await updateSubscriptionStatus({ paypal_sub_id: subscriptionId, status: "suspended", current_period_end: null, next_charge_at: null });
  await removeUserFromChannel(bot, sub.telegram_id);

  try {
    await bot.api.sendMessage(
      sub.telegram_id,
      `🚫 *Subscription Suspended*\n\nAfter repeated payment failures, you've been removed from the channel.\n\nUse /subscribe to resubscribe.`,
      { parse_mode: "Markdown" }
    );
  } catch (_) {}
}

async function onCancelled(bot, subscriptionId) {
  const sub = await getSubscriptionByPaypalId(subscriptionId);
  if (!sub) return;

  await updateSubscriptionStatus({ paypal_sub_id: subscriptionId, status: "cancelled", current_period_end: null, next_charge_at: null });
  await removeUserFromChannel(bot, sub.telegram_id);

  try {
    await bot.api.sendMessage(
      sub.telegram_id,
      `🚫 *Subscription Cancelled*\n\nYou've been removed from the channel.\n\nUse /subscribe to resubscribe anytime.`,
      { parse_mode: "Markdown" }
    );
  } catch (_) {}
}

async function onExpired(bot, subscriptionId) {
  const sub = await getSubscriptionByPaypalId(subscriptionId);
  if (!sub) return;

  await updateSubscriptionStatus({ paypal_sub_id: subscriptionId, status: "expired", current_period_end: null, next_charge_at: null });
  await removeUserFromChannel(bot, sub.telegram_id);

  try {
    await bot.api.sendMessage(
      sub.telegram_id,
      `⌛ *Subscription Expired*\n\nYour subscription has expired and you've been removed from the channel.\n\nUse /subscribe to renew.`,
      { parse_mode: "Markdown" }
    );
  } catch (_) {}
}

function fmtDate(date) {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });
}

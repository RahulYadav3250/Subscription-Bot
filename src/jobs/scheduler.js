// src/jobs/scheduler.js
import cron from "node-cron";
import {
  getExpiredSubscriptions,
  getTrialsEndingSoon,
  updateSubscriptionStatus,
} from "../db/database.js";
import { removeUserFromChannel } from "../utils/channel.js";
import { getPlanById } from "../config/plans.js";

export function startJobs(bot) {

  // ── Daily expiry sweep — 01:00 UTC ────────────────────────────────────────
  // Safety net: catches any subscriptions whose period ended but whose
  // CANCELLED/EXPIRED PayPal webhook was missed or delayed.
  cron.schedule("0 1 * * *", async () => {
    console.log("[cron] Running expiry sweep…");
    const expired = getExpiredSubscriptions();

    for (const sub of expired) {
      updateSubscriptionStatus({
        paypal_sub_id:      sub.paypal_sub_id,
        status:             "expired",
        current_period_end: null,
      });
      await removeUserFromChannel(bot, sub.telegram_id);
      try {
        await bot.api.sendMessage(
          sub.telegram_id,
          "⌛ *Subscription Expired*\n\n" +
          "Your subscription has ended and you've been removed from the channel.\n\n" +
          "Use /subscribe to renew and re-enable auto-pay.",
          { parse_mode: "Markdown" }
        );
      } catch (_) {}
    }
    if (expired.length) console.log(`[cron] Expired ${expired.length} subscription(s).`);
  });

  // ── Trial ending soon reminder — 10:00 UTC ────────────────────────────────
  // Warns users 24 h before their free trial ends so they can cancel if needed.
  cron.schedule("0 10 * * *", async () => {
    console.log("[cron] Checking trials ending soon…");
    const trials = getTrialsEndingSoon();

    for (const sub of trials) {
      const plan = getPlanById(sub.plan_id);
      try {
        await bot.api.sendMessage(
          sub.telegram_id,
          `⏰ *Trial Ends Tomorrow!*\n\n` +
          `Hi ${sub.first_name ?? "there"}! Your free trial for *${plan?.label ?? "your plan"}* ends in less than 24 hours.\n\n` +
          `💳 *$${plan?.price ?? "—"} USD* will be charged automatically via PayPal.\n\n` +
          `🔄 No action needed — auto-pay keeps your access going.\n` +
          `To cancel before being charged, use /cancel.`,
          { parse_mode: "Markdown" }
        );
      } catch (_) {}
    }
    if (trials.length) console.log(`[cron] Notified ${trials.length} trial(s) ending soon.`);
  });

  console.log("[cron] Scheduler started ✅  (Expiry sweep: daily 01:00 UTC | Trial reminder: daily 10:00 UTC)");
}

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
  cron.schedule("0 1 * * *", async () => {
    console.log("[cron] Running expired subscription sweep…");
    const expired = await getExpiredSubscriptions();

    for (const sub of expired) {
      console.log(`[cron] Expiring sub telegram_id=${sub.telegram_id} plan=${sub.plan_id}`);

      await updateSubscriptionStatus({
        paypal_sub_id:      sub.paypal_sub_id,
        status:             "expired",
        current_period_end: null,
        next_charge_at:     null,
      });

      await removeUserFromChannel(bot, sub.telegram_id);

      try {
        await bot.api.sendMessage(
          sub.telegram_id,
          "⌛ *Subscription Expired*\n\n" +
          "Your subscription has ended and you've been removed from the channel.\n\n" +
          "Use /subscribe to renew your access.",
          { parse_mode: "Markdown" }
        );
      } catch (_) {}
    }

    console.log(`[cron] Expired ${expired.length} subscription(s).`);
  });

  // ── Trial ending soon — 10:00 UTC ─────────────────────────────────────────
  cron.schedule("0 10 * * *", async () => {
    console.log("[cron] Checking trials ending soon…");
    const trials = await getTrialsEndingSoon();

    for (const sub of trials) {
      const plan = getPlanById(sub.plan_id);

      try {
        await bot.api.sendMessage(
          sub.telegram_id,
          `⏰ *Trial Ends Tomorrow!*\n\n` +
          `Hi ${sub.first_name ?? "there"}! Your free trial for *${plan?.label ?? "your plan"}* ends in less than 24 hours.\n\n` +
          `💳 PayPal will charge *$${plan?.price ?? "—"} USD* automatically.\n\n` +
          `🔄 Auto-pay is ON — no action needed to continue.\n` +
          `To cancel before being charged, use /cancel.`,
          { parse_mode: "Markdown" }
        );
      } catch (_) {}
    }

    console.log(`[cron] Notified ${trials.length} trial(s) ending soon.`);
  });

  console.log("[cron] Jobs scheduled ✅  (Expiry: daily 01:00 | Trial reminder: daily 10:00)");
}

// src/config/plans.js
// Single source of truth for all subscription plans.
// All users pay via PayPal regardless of location.
// Run `node src/paypal/createPlan.js` once to create plans, then copy IDs to .env

export const PLANS = [
  {
    id: "monthly",
    label: "💎 $2.99/month",
    badge: "Most Popular 🔥",
    buttonText: "💎 $2.99/month  •  Most Popular 🔥  •  7-Day Free Trial",
    price: "2.99",
    currency: "USD",
    intervalUnit: "MONTH",
    intervalCount: 1,
    periodDays: 30,
    trialDays: 7,
    hasTrial: true,
    envKey: "PAYPAL_PLAN_ID_MONTHLY",
  },
  {
    id: "quarterly",
    label: "📦 $7.99/3 months",
    badge: "10% Off 🎉",
    buttonText: "📦 $7.99/3 months  •  10% Off 🎉  •  7-Day Free Trial",
    price: "7.99",
    currency: "USD",
    intervalUnit: "MONTH",
    intervalCount: 3,
    periodDays: 90,
    trialDays: 7,
    hasTrial: true,
    envKey: "PAYPAL_PLAN_ID_QUARTERLY",
  },
  {
    id: "biannual",
    label: "🏷️ $13.99/6 months",
    badge: "20% Off 💰",
    buttonText: "🏷️ $13.99/6 months  •  20% Off 💰",
    price: "13.99",
    currency: "USD",
    intervalUnit: "MONTH",
    intervalCount: 6,
    periodDays: 180,
    trialDays: 0,
    hasTrial: false,
    envKey: "PAYPAL_PLAN_ID_BIANNUAL",
  },
  {
    id: "annual",
    label: "🏆 $24.99/year",
    badge: "Best Value — 30% Off 🥇",
    buttonText: "🏆 $24.99/year  •  Best Value — 30% Off 🥇",
    price: "24.99",
    currency: "USD",
    intervalUnit: "YEAR",
    intervalCount: 1,
    periodDays: 365,
    trialDays: 0,
    hasTrial: false,
    envKey: "PAYPAL_PLAN_ID_ANNUAL",
  },
];

export function getPlanById(planId) {
  return PLANS.find((p) => p.id === planId) ?? null;
}

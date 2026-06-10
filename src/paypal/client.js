// src/paypal/client.js
import axios from "axios";

const BASE =
  process.env.PAYPAL_MODE === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

let _token = null;
let _tokenExpiry = 0;

export async function getAccessToken() {
  if (_token && Date.now() < _tokenExpiry) return _token;
  const res = await axios.post(
    `${BASE}/v1/oauth2/token`,
    "grant_type=client_credentials",
    {
      auth: { username: process.env.PAYPAL_CLIENT_ID, password: process.env.PAYPAL_CLIENT_SECRET },
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    }
  );
  _token = res.data.access_token;
  _tokenExpiry = Date.now() + (res.data.expires_in - 60) * 1000;
  return _token;
}

async function api(method, path, data = null) {
  const token = await getAccessToken();
  const res = await axios({
    method,
    url: `${BASE}${path}`,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    data,
  });
  return res.data;
}

export async function createProduct(name, description) {
  return api("POST", "/v1/catalogs/products", {
    name, description, type: "SERVICE", category: "SOFTWARE",
  });
}

/**
 * Create one PayPal billing plan for the given plan config object.
 * plan = { price, currency, intervalUnit, intervalCount, trialDays, hasTrial }
 */
export async function createBillingPlan(productId, plan) {
  const billingCycles = [];

  // Trial cycle (only if hasTrial)
  if (plan.hasTrial && plan.trialDays > 0) {
    billingCycles.push({
      frequency: { interval_unit: "DAY", interval_count: plan.trialDays },
      tenure_type: "TRIAL",
      sequence: 1,
      total_cycles: 1,
      pricing_scheme: {
        fixed_price: { value: "0", currency_code: plan.currency },
      },
    });
  }

  // Regular billing cycle
  billingCycles.push({
    frequency: { interval_unit: plan.intervalUnit, interval_count: plan.intervalCount },
    tenure_type: "REGULAR",
    sequence: plan.hasTrial ? 2 : 1,
    total_cycles: 0,
    pricing_scheme: {
      fixed_price: { value: String(plan.price), currency_code: plan.currency },
    },
  });

  return api("POST", "/v1/billing/plans", {
    product_id: productId,
    name: plan.label,
    description: plan.buttonText,
    status: "ACTIVE",
    billing_cycles: billingCycles,
    payment_preferences: {
      auto_bill_outstanding: true,
      setup_fee: { value: "0", currency_code: plan.currency },
      setup_fee_failure_action: "CONTINUE",
      payment_failure_threshold: 3,
    },
  });
}

/**
 * Generate a PayPal subscription approval URL.
 * customId encodes telegramId:planId so we can match on webhook.
 */
export async function createSubscription(telegramId, planId, planEnvId, returnUrl, cancelUrl) {
  const data = await api("POST", "/v1/billing/subscriptions", {
    plan_id: planEnvId,
    custom_id: `${telegramId}:${planId}`,
    application_context: {
      brand_name: process.env.BOT_USERNAME || "SubscriptionBot",
      locale: "en-US",
      shipping_preference: "NO_SHIPPING",
      user_action: "SUBSCRIBE_NOW",
      return_url: returnUrl,
      cancel_url: cancelUrl,
    },
  });
  const approveLink = data.links.find((l) => l.rel === "approve")?.href;
  return { subscriptionId: data.id, approveUrl: approveLink };
}

export async function getSubscription(subscriptionId) {
  return api("GET", `/v1/billing/subscriptions/${subscriptionId}`);
}

export async function cancelSubscription(subscriptionId, reason = "User requested cancellation") {
  await api("POST", `/v1/billing/subscriptions/${subscriptionId}/cancel`, { reason });
}

export async function suspendSubscription(subscriptionId) {
  await api("POST", `/v1/billing/subscriptions/${subscriptionId}/suspend`, { reason: "Payment failed" });
}

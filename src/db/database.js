// src/db/database.js
// Uses PostgreSQL via the 'pg' package.
// Database is hosted on Supabase (free tier) — persistent across all redeploys.
// Connection string comes from DATABASE_URL environment variable.

import pg from "pg";
const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL is not set. Add it to your .env file.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Required for Supabase
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Test connection on startup
pool.connect((err, client, release) => {
  if (err) {
    console.error("❌ Failed to connect to PostgreSQL:", err.message);
    process.exit(1);
  }
  release();
  console.log("✅ Connected to Supabase PostgreSQL");
});

/** Run a query and return all rows. */
async function query(sql, params = []) {
  const res = await pool.query(sql, params);
  return res.rows;
}

/** Run a query and return the first row only, or undefined. */
async function queryOne(sql, params = []) {
  const res = await pool.query(sql, params);
  return res.rows[0];
}

/** Run a query that doesn't return rows (INSERT, UPDATE, DELETE). */
async function run(sql, params = []) {
  await pool.query(sql, params);
}

// ── Schema — runs on every boot, safe to repeat ───────────────────────────────
await run(`
  CREATE TABLE IF NOT EXISTS users (
    telegram_id     BIGINT PRIMARY KEY,
    username        TEXT,
    first_name      TEXT,
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_in_channel   BOOLEAN     NOT NULL DEFAULT FALSE
  );

  CREATE TABLE IF NOT EXISTS subscriptions (
    id                  SERIAL PRIMARY KEY,
    telegram_id         BIGINT  NOT NULL REFERENCES users(telegram_id),
    plan_id             TEXT    NOT NULL DEFAULT 'monthly',
    payment_provider    TEXT    NOT NULL DEFAULT 'paypal',

    paypal_sub_id       TEXT    UNIQUE,

    status              TEXT    NOT NULL DEFAULT 'pending',
    -- status: pending | trialing | active | cancelled | expired | suspended

    trial_start         TIMESTAMPTZ,
    trial_end           TIMESTAMPTZ,
    current_period_end  TIMESTAMPTZ,
    next_charge_at      TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS webhook_events (
    id          SERIAL PRIMARY KEY,
    event_id    TEXT        UNIQUE,
    event_type  TEXT,
    provider    TEXT        DEFAULT 'paypal',
    payload     JSONB,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_subs_telegram ON subscriptions(telegram_id);
  CREATE INDEX IF NOT EXISTS idx_subs_paypal   ON subscriptions(paypal_sub_id);
  CREATE INDEX IF NOT EXISTS idx_subs_status   ON subscriptions(status);
`);

console.log("[db] Schema ready ✅");

// ── User helpers ──────────────────────────────────────────────────────────────
export async function upsertUser({ telegram_id, username, first_name }) {
  await run(
    `INSERT INTO users (telegram_id, username, first_name)
     VALUES ($1, $2, $3)
     ON CONFLICT (telegram_id) DO UPDATE SET
       username   = EXCLUDED.username,
       first_name = EXCLUDED.first_name`,
    [telegram_id, username ?? null, first_name ?? null]
  );
}

export async function setUserInChannel(telegram_id, flag) {
  await run(
    `UPDATE users SET is_in_channel = $1 WHERE telegram_id = $2`,
    [flag, telegram_id]
  );
}

export async function getUser(telegram_id) {
  return queryOne(`SELECT * FROM users WHERE telegram_id = $1`, [telegram_id]);
}

// ── Subscription helpers ──────────────────────────────────────────────────────
export async function createPendingSubscription(telegram_id, plan_id, payment_provider) {
  await run(
    `INSERT INTO subscriptions (telegram_id, plan_id, payment_provider, status)
     VALUES ($1, $2, $3, 'pending')`,
    [telegram_id, plan_id, payment_provider]
  );
}

export async function getActiveSubscription(telegram_id) {
  return queryOne(
    `SELECT * FROM subscriptions
     WHERE telegram_id = $1
       AND status IN ('trialing', 'active')
     ORDER BY id DESC LIMIT 1`,
    [telegram_id]
  );
}

export async function getSubscriptionByPaypalId(paypal_sub_id) {
  return queryOne(
    `SELECT * FROM subscriptions WHERE paypal_sub_id = $1`,
    [paypal_sub_id]
  );
}

export async function activateSubscription({
  paypal_sub_id, telegram_id, trial_end, current_period_end, next_charge_at, status,
}) {
  await run(
    `UPDATE subscriptions SET
       paypal_sub_id      = $1,
       status             = $2,
       trial_start        = NOW(),
       trial_end          = $3,
       current_period_end = $4,
       next_charge_at     = $5,
       updated_at         = NOW()
     WHERE telegram_id = $6 AND status = 'pending'`,
    [
      paypal_sub_id      ?? null,
      status,
      trial_end          ?? null,
      current_period_end ?? null,
      next_charge_at     ?? null,
      telegram_id,
    ]
  );
}

export async function updateSubscriptionStatus({
  paypal_sub_id, status, current_period_end, next_charge_at,
}) {
  await run(
    `UPDATE subscriptions SET
       status             = $1,
       current_period_end = COALESCE($2, current_period_end),
       next_charge_at     = $3,
       updated_at         = NOW()
     WHERE paypal_sub_id = $4`,
    [
      status,
      current_period_end ?? null,
      next_charge_at     ?? null,
      paypal_sub_id,
    ]
  );
}

export async function getExpiredSubscriptions() {
  return query(
    `SELECT s.*, u.username, u.first_name
     FROM subscriptions s
     JOIN users u ON u.telegram_id = s.telegram_id
     WHERE s.status IN ('trialing', 'active')
       AND s.current_period_end < NOW()`
  );
}

export async function getTrialsEndingSoon() {
  return query(
    `SELECT s.*, u.username, u.first_name
     FROM subscriptions s
     JOIN users u ON u.telegram_id = s.telegram_id
     WHERE s.status = 'trialing'
       AND s.trial_end BETWEEN NOW() AND NOW() + INTERVAL '1 day'`
  );
}

// ── Webhook dedup ─────────────────────────────────────────────────────────────
export async function isEventProcessed(event_id) {
  const row = await queryOne(
    `SELECT 1 FROM webhook_events WHERE event_id = $1`,
    [event_id]
  );
  return !!row;
}

export async function recordEvent(event_id, event_type, payload, provider = "paypal") {
  await run(
    `INSERT INTO webhook_events (event_id, event_type, provider, payload)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (event_id) DO NOTHING`,
    [event_id, event_type, provider, JSON.stringify(payload)]
  );
}

export default pool;

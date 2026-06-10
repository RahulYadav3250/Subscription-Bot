// src/db/database.js
// Uses sql.js — a pure JavaScript SQLite port (no native compilation needed).
// The DB is loaded into memory on startup and saved to disk after every write.

import initSqlJs from "sql.js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH   = path.resolve(process.env.DB_PATH || "./data/subscriptions.db");

// Ensure data directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

// ── Bootstrap ─────────────────────────────────────────────────────────────────
const SQL  = await initSqlJs();
const db   = fs.existsSync(DB_PATH)
  ? new SQL.Database(fs.readFileSync(DB_PATH))
  : new SQL.Database();

/** Persist in-memory DB to disk after every write. */
function save() {
  fs.writeFileSync(DB_PATH, db.export());
}

/** Run a statement that doesn't return rows (CREATE, INSERT, UPDATE, DELETE). */
function run(sql, params = {}) {
  db.run(sql, params);
  save();
}

/** Return the first matching row, or undefined. */
function get(sql, params = {}) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const row = stmt.step() ? stmt.getAsObject() : undefined;
  stmt.free();
  return row;
}

/** Return all matching rows as an array of objects. */
function all(sql, params = {}) {
  const stmt  = db.prepare(sql);
  stmt.bind(params);
  const rows  = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

/** Execute raw SQL (schema creation, migrations — no params). */
function exec(sql) {
  db.exec(sql);
  save();
}

// ── Schema ────────────────────────────────────────────────────────────────────
exec(`
  CREATE TABLE IF NOT EXISTS users (
    telegram_id     INTEGER PRIMARY KEY,
    username        TEXT,
    first_name      TEXT,
    joined_at       TEXT    NOT NULL DEFAULT (datetime('now')),
    is_in_channel   INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS subscriptions (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id         INTEGER NOT NULL,
    plan_id             TEXT    NOT NULL DEFAULT 'monthly',
    payment_provider    TEXT    NOT NULL DEFAULT 'paypal',

    paypal_sub_id       TEXT    UNIQUE,

    status              TEXT    NOT NULL DEFAULT 'pending',

    trial_start         TEXT,
    trial_end           TEXT,
    current_period_end  TEXT,
    next_charge_at      TEXT,
    created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS webhook_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id    TEXT    UNIQUE,
    event_type  TEXT,
    provider    TEXT    DEFAULT 'paypal',
    payload     TEXT,
    received_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`);

// ── Safe migrations (add columns if missing) ──────────────────────────────────
function columnExists(table, col) {
  const rows = all(`PRAGMA table_info(${table})`);
  return rows.some((r) => r.name === col);
}
if (!columnExists("subscriptions", "next_charge_at")) {
  exec(`ALTER TABLE subscriptions ADD COLUMN next_charge_at TEXT`);
  console.log("[db] Migrated: added next_charge_at");
}

// ── User helpers ──────────────────────────────────────────────────────────────
export function upsertUser({ telegram_id, username, first_name }) {
  run(
    `INSERT INTO users (telegram_id, username, first_name)
     VALUES ($tid, $username, $first_name)
     ON CONFLICT(telegram_id) DO UPDATE SET
       username   = excluded.username,
       first_name = excluded.first_name`,
    { $tid: telegram_id, $username: username ?? null, $first_name: first_name ?? null }
  );
}

export function setUserInChannel(telegram_id, flag) {
  run(
    `UPDATE users SET is_in_channel = $flag WHERE telegram_id = $tid`,
    { $flag: flag ? 1 : 0, $tid: telegram_id }
  );
}

export function getUser(telegram_id) {
  return get(`SELECT * FROM users WHERE telegram_id = $tid`, { $tid: telegram_id });
}

// ── Subscription helpers ──────────────────────────────────────────────────────
export function createPendingSubscription(telegram_id, plan_id, payment_provider) {
  run(
    `INSERT INTO subscriptions (telegram_id, plan_id, payment_provider, status)
     VALUES ($tid, $plan, $provider, 'pending')`,
    { $tid: telegram_id, $plan: plan_id, $provider: payment_provider }
  );
}

export function getActiveSubscription(telegram_id) {
  return get(
    `SELECT * FROM subscriptions
     WHERE telegram_id = $tid
       AND status IN ('trialing', 'active')
     ORDER BY id DESC LIMIT 1`,
    { $tid: telegram_id }
  );
}

export function getSubscriptionByPaypalId(paypal_sub_id) {
  return get(
    `SELECT * FROM subscriptions WHERE paypal_sub_id = $id`,
    { $id: paypal_sub_id }
  );
}

export function activateSubscription({
  paypal_sub_id, telegram_id, trial_end, current_period_end, next_charge_at, status,
}) {
  run(
    `UPDATE subscriptions SET
       paypal_sub_id      = $paypal_sub_id,
       status             = $status,
       trial_start        = datetime('now'),
       trial_end          = $trial_end,
       current_period_end = $current_period_end,
       next_charge_at     = $next_charge_at,
       updated_at         = datetime('now')
     WHERE telegram_id = $tid AND status = 'pending'`,
    {
      $paypal_sub_id:      paypal_sub_id      ?? null,
      $status:             status,
      $trial_end:          trial_end          ?? null,
      $current_period_end: current_period_end ?? null,
      $next_charge_at:     next_charge_at     ?? null,
      $tid:                telegram_id,
    }
  );
}

export function updateSubscriptionStatus({
  paypal_sub_id, status, current_period_end, next_charge_at,
}) {
  run(
    `UPDATE subscriptions SET
       status             = $status,
       current_period_end = COALESCE($current_period_end, current_period_end),
       next_charge_at     = $next_charge_at,
       updated_at         = datetime('now')
     WHERE paypal_sub_id = $id`,
    {
      $id:                 paypal_sub_id,
      $status:             status,
      $current_period_end: current_period_end ?? null,
      $next_charge_at:     next_charge_at     ?? null,
    }
  );
}

export function getExpiredSubscriptions() {
  return all(
    `SELECT s.*, u.telegram_id, u.username, u.first_name
     FROM subscriptions s
     JOIN users u ON u.telegram_id = s.telegram_id
     WHERE s.status IN ('trialing', 'active')
       AND s.current_period_end < datetime('now')`
  );
}

export function getTrialsEndingSoon() {
  return all(
    `SELECT s.*, u.telegram_id, u.username, u.first_name
     FROM subscriptions s
     JOIN users u ON u.telegram_id = s.telegram_id
     WHERE s.status = 'trialing'
       AND s.trial_end BETWEEN datetime('now') AND datetime('now', '+1 day')`
  );
}

// ── Webhook dedup ─────────────────────────────────────────────────────────────
export function isEventProcessed(event_id) {
  return !!get(`SELECT 1 FROM webhook_events WHERE event_id = $id`, { $id: event_id });
}

export function recordEvent(event_id, event_type, payload, provider = "paypal") {
  run(
    `INSERT OR IGNORE INTO webhook_events (event_id, event_type, provider, payload)
     VALUES ($eid, $etype, $provider, $payload)`,
    {
      $eid:      event_id,
      $etype:    event_type,
      $provider: provider,
      $payload:  JSON.stringify(payload),
    }
  );
}

export default db;

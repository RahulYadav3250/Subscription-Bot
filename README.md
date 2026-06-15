# 🤖 Telegram Subscription Bot

Deployed on **Railway** (free via GitHub Student Pack or ~$1-2/month) with **Supabase** (free PostgreSQL database, no credit card). Auto-deploys from GitHub on every push.

---

## 📋 Subscription Plans

| Plan | Price | Free Trial | Button in bot |
|------|-------|------------|---------------|
| Monthly | $2.99/month | ✅ 7 days | 💎 $2.99/month  •  Most Popular 🔥  •  7-Day Free Trial |
| Quarterly | $7.99/3 months | ✅ 7 days | 📦 $7.99/3 months  •  10% Off 🎉  •  7-Day Free Trial |
| 6 Months | $13.99/6 months | ❌ None | 🏷️ $13.99/6 months  •  20% Off 💰 |
| Annual | $24.99/year | ❌ None | 🏆 $24.99/year  •  Best Value — 30% Off 🥇 |

---

## 🗂️ Project Structure

```
telegram-subscription-bot/
├── src/
│   ├── index.js              # Entry point
│   ├── config/plans.js       # All plan definitions
│   ├── db/database.js        # PostgreSQL via Supabase
│   ├── paypal/
│   │   ├── client.js         # PayPal REST API wrapper
│   │   └── createPlan.js     # One-time plan creation script
│   ├── handlers/
│   │   ├── commands.js       # Bot commands
│   │   └── webhooks.js       # PayPal webhook handlers
│   ├── jobs/scheduler.js     # Daily cron jobs
│   └── utils/channel.js      # Channel access management
├── .env.example
└── README.md
```

---

# 🚀 Step-by-Step Deployment Guide

---

## STEP 1 — Create Your Telegram Bot

1. Open Telegram → search **@BotFather** → send `/newbot`
2. Enter a display name, then a username ending in `bot`
3. Copy the token (e.g. `7123456789:AAF...`) → save as **`BOT_TOKEN`**

Set the command menu — send `/setcommands` to BotFather, select your bot, paste exactly:
```
start - Welcome & intro
subscribe - See plans & subscribe
status - Check subscription & next payment
cancel - Cancel auto-pay & leave channel
help - Show all commands
```

---

## STEP 2 — Create the Private Channel

1. Telegram → pencil icon → **New Channel** → name it → set **Private** → Create
2. Add your bot as Administrator:
   - Open channel → tap channel name → **Administrators** → **Add Admin**
   - Search your bot → enable: ✅ Add Members  ✅ Ban Users  ✅ Invite Users via Link → Save
3. Get Channel ID:
   - Forward any message from the channel to **@userinfobot**
   - It replies with `Chat ID: -1001234567890` → save as **`CHANNEL_ID`**

---

## STEP 3 — Set Up PayPal

1. Go to [developer.paypal.com](https://developer.paypal.com) — log in with your **Business** account
2. **Dashboard → My Apps & Credentials → Sandbox tab → Create App**
3. Name it anything → Create App → copy **Client ID** and **Secret**

> Personal PayPal accounts cannot use the Subscriptions API. Upgrade free at paypal.com.

---

## STEP 4 — Set Up Supabase (Free Database, No Credit Card)

### 4a. Create account
1. Go to [supabase.com](https://supabase.com) → **Start for free**
2. Sign up with GitHub or email — **no credit card required**

### 4b. Create a project
1. Click **New Project**
2. Fill in:
   - **Name:** `subscription-bot`
   - **Database Password:** create a strong password → **save it**
   - **Region:** pick the one closest to your users
3. Click **Create new project** — takes about 1 minute

### 4c. Get your connection string
1. Left sidebar → **Project Settings** (gear icon) → **Database**
2. Scroll to **Connection string** → select the **URI** tab
3. Copy the string — looks like:
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.xxxxxxxxxxxx.supabase.co:5432/postgres
   ```
4. Replace `[YOUR-PASSWORD]` with the password from step 4b
5. Save this as **`DATABASE_URL`**

> You do NOT need to create any tables. The bot creates everything automatically on first startup.

---

## STEP 5 — Set Up Railway

### Option A — GitHub Student Pack (no credit card)
1. Go to [education.github.com](https://education.github.com) → **Get Student Benefits**
2. Verify your student status (takes a few minutes to a few days)
3. Once approved, go to [railway.app](https://railway.app) → **Login with GitHub**
4. Railway automatically applies your $13/month free credit — no card ever needed

### Option B — Regular account (~$1-2/month)
1. Go to [railway.app](https://railway.app) → **Login with GitHub**
2. Add a credit/debit card under **Account → Billing**
3. Usage for this bot will be well under $2/month

---

## STEP 6 — Push Code to GitHub

1. Create a **private** repository at [github.com](https://github.com) named `telegram-subscription-bot`
2. In your local project folder run:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/telegram-subscription-bot.git
git push -u origin main
```

> `.env` is already in `.gitignore` — never commit it. Your secrets stay local only.

---

## STEP 7 — Create PayPal Billing Plans (run once locally)

Make sure your `.env` is filled in with at least `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_MODE=sandbox`, and `DATABASE_URL`, then run:

```bash
npm install
node src/paypal/createPlan.js
```

Output will look like:
```
✅ Connected to Supabase PostgreSQL
✅ Product created: PROD-XXXXXXXXXXXX
✅ Plan created: P-1AB...  (monthly)
✅ Plan created: P-2CD...  (quarterly)
✅ Plan created: P-3EF...  (biannual)
✅ Plan created: P-4GH...  (annual)

Add these to your .env:
PAYPAL_PLAN_ID_MONTHLY=P-1AB...
PAYPAL_PLAN_ID_QUARTERLY=P-2CD...
PAYPAL_PLAN_ID_BIANNUAL=P-3EF...
PAYPAL_PLAN_ID_ANNUAL=P-4GH...
```

Paste the 4 plan IDs into your `.env`. You'll add them to Railway in the next step.

---

## STEP 8 — Deploy to Railway

### 8a. Create a new project
1. Go to [railway.app](https://railway.app) → **New Project**
2. Select **Deploy from GitHub repo**
3. Select your `telegram-subscription-bot` repository
4. Railway detects Node.js automatically and starts the first deploy

### 8b. Add environment variables
1. Click on your service inside the project
2. Go to the **Variables** tab
3. Click **Add Variable** and add every key from your `.env`:

| Key | Value |
|-----|-------|
| `BOT_TOKEN` | Your bot token from BotFather |
| `CHANNEL_ID` | Your channel ID (e.g. `-1001234567890`) |
| `BOT_USERNAME` | Bot username without @ |
| `PAYPAL_CLIENT_ID` | From Step 3 |
| `PAYPAL_CLIENT_SECRET` | From Step 3 |
| `PAYPAL_MODE` | `sandbox` |
| `PAYPAL_PLAN_ID_MONTHLY` | From Step 7 |
| `PAYPAL_PLAN_ID_QUARTERLY` | From Step 7 |
| `PAYPAL_PLAN_ID_BIANNUAL` | From Step 7 |
| `PAYPAL_PLAN_ID_ANNUAL` | From Step 7 |
| `DATABASE_URL` | From Step 4c |
| `WEBHOOK_SECRET` | Any random 32-character string |
| `WEBHOOK_DOMAIN` | Leave blank for now — fill after step 8c |
| `PORT` | `3000` |

Railway redeploys automatically after saving variables.

### 8c. Get your public URL and set WEBHOOK_DOMAIN
1. In your service → **Settings** tab → **Networking** → **Generate Domain**
2. Railway gives you a URL like `https://subscription-bot-production-xxxx.up.railway.app`
3. Copy it
4. Go back to **Variables** → set `WEBHOOK_DOMAIN` = that URL
5. Railway redeploys automatically

---

## STEP 9 — Register the PayPal Webhook

1. Go to [developer.paypal.com](https://developer.paypal.com) → **Dashboard → Webhooks → Sandbox tab**
2. Click **Add Webhook**
3. URL: `https://your-app.up.railway.app/paypal/webhook`
4. Select all 7 events:
   - ✅ `BILLING.SUBSCRIPTION.ACTIVATED`
   - ✅ `BILLING.SUBSCRIPTION.CANCELLED`
   - ✅ `BILLING.SUBSCRIPTION.EXPIRED`
   - ✅ `BILLING.SUBSCRIPTION.PAYMENT.FAILED`
   - ✅ `BILLING.SUBSCRIPTION.RENEWED`
   - ✅ `BILLING.SUBSCRIPTION.SUSPENDED`
   - ✅ `PAYMENT.SALE.COMPLETED`
5. Click **Save**

---

## STEP 10 — Test with PayPal Sandbox

1. Go to [developer.paypal.com → Sandbox → Accounts](https://developer.paypal.com/dashboard/accounts)
2. Find the pre-created buyer account → three dots → **View/Edit** → note email + password
3. Open your bot in Telegram → `/subscribe` → pick any plan → tap the PayPal button
4. Log in with sandbox credentials → approve the subscription

**Verify all of this happens:**
- [ ] Bot sends "Subscription Active" message in Telegram
- [ ] Bot sends a single-use channel invite link
- [ ] You can join the channel using that link
- [ ] `/status` shows correct plan and next auto-pay date
- [ ] `/cancel` removes you from the channel

---

## STEP 11 — Go Live with Real Payments

### 11a. Get live PayPal credentials
- [developer.paypal.com](https://developer.paypal.com) → **Live tab** → Create App → copy Client ID + Secret

### 11b. Re-create billing plans for Live
```bash
# Update your local .env:
PAYPAL_CLIENT_ID=<live client id>
PAYPAL_CLIENT_SECRET=<live secret>
PAYPAL_MODE=live

node src/paypal/createPlan.js
```
Copy the 4 new live plan IDs.

### 11c. Update Railway environment variables
In Railway → **Variables**, update:
- `PAYPAL_CLIENT_ID` → live client ID
- `PAYPAL_CLIENT_SECRET` → live secret
- `PAYPAL_MODE` → `live`
- All 4 `PAYPAL_PLAN_ID_*` → new live plan IDs

### 11d. Register Live webhook
- PayPal Developer → **Live tab** → Webhooks → Add same URL + same 7 events

Railway redeploys automatically after saving.

**Go-live checklist:**
- [ ] `PAYPAL_MODE=live`
- [ ] Live Client ID + Secret set in Railway
- [ ] `createPlan.js` re-run with live credentials → 4 new plan IDs in Railway
- [ ] Live PayPal webhook registered
- [ ] Test with a real card

---

## 🔄 Deploying Updates

Push to GitHub → Railway redeploys automatically. Nothing else needed.

```bash
git add .
git commit -m "describe your change"
git push
```

---

## ⚠️ Troubleshooting

**Bot doesn't respond**
→ Railway → your service → **Deployments** → click the latest deploy → **View Logs**. Look for startup errors. Verify `BOT_TOKEN` and `WEBHOOK_DOMAIN` are set correctly.

**Database connection error on startup**
→ Verify `DATABASE_URL` is correct and your Supabase password is in the URL (not the placeholder `[YOUR-PASSWORD]`). Check your Supabase project is not paused — free projects pause after 7 days of inactivity. Go to [supabase.com](https://supabase.com) → your project → click **Restore**.

**"Plan not configured" error in bot**
→ You haven't run `node src/paypal/createPlan.js` or forgot to add the 4 plan IDs to Railway's Variables tab.

**PayPal webhooks not arriving**
→ Verify the webhook URL in PayPal matches your Railway URL exactly. Test it in your browser: `https://your-app.up.railway.app/health` should return `{"status":"ok"}`.

**Sandbox works but live payments fail**
→ You're using sandbox plan IDs with live credentials. Re-run `node src/paypal/createPlan.js` with `PAYPAL_MODE=live` and update all 4 plan IDs in Railway Variables.

**Railway charges more than expected**
→ Railway bills by actual usage. This bot uses roughly 50-100 MB RAM and minimal CPU — well within $1-2/month. Check **Usage** tab in Railway dashboard to see exact consumption.

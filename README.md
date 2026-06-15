# 🤖 Telegram Subscription Bot

Deployed on **Koyeb** (free hosting, always on) with **Supabase** (free PostgreSQL database, persistent forever). No credit card required for either.

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
3. Copy the token → save as **`BOT_TOKEN`**

Set the command menu — send `/setcommands` to BotFather, select your bot, paste:
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
   - Search your bot → enable: ✅ Add Members ✅ Ban Users ✅ Invite Users via Link → Save
3. Get Channel ID — forward any message from the channel to **@userinfobot**
   - It replies with `Chat ID: -1001234567890` → save as **`CHANNEL_ID`**

---

## STEP 3 — Set Up PayPal

1. Go to [developer.paypal.com](https://developer.paypal.com) — log in with your **Business** account
2. **Dashboard → My Apps & Credentials → Sandbox tab → Create App**
3. Name it → Create App → copy **Client ID** and **Secret**

> Personal PayPal accounts cannot use the Subscriptions API. Upgrade free at paypal.com.

---

## STEP 4 — Set Up Supabase (Free Database)

Supabase gives you a free hosted PostgreSQL database — no credit card needed.

### 4a. Create account
1. Go to [supabase.com](https://supabase.com) → **Start for free**
2. Sign up with GitHub or email — no credit card required

### 4b. Create a project
1. Click **New Project**
2. Fill in:
   - **Name:** `subscription-bot`
   - **Database Password:** create a strong password → **save it somewhere safe**
   - **Region:** pick closest to your users
3. Click **Create new project** — takes about 1 minute to provision

### 4c. Get the connection string
1. In your project → left sidebar → **Project Settings** (gear icon)
2. Click **Database**
3. Scroll down to **Connection string** → select **URI** tab
4. Copy the string — it looks like:
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.xxxxxxxxxxxx.supabase.co:5432/postgres
   ```
5. Replace `[YOUR-PASSWORD]` with the password you created in step 4b
6. Save this as **`DATABASE_URL`**

> You do NOT need to create any tables manually. The bot creates all tables automatically on first startup.

---

## STEP 5 — Push Code to GitHub

1. Create a new repository at [github.com](https://github.com) — name it `telegram-subscription-bot`
2. Make sure it is **Private** (your code contains sensitive references)
3. In your local project folder run:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/telegram-subscription-bot.git
git push -u origin main
```

> `.env` is in `.gitignore` — never commit it. Your secrets stay local.

---

## STEP 6 — Configure Environment Variables Locally

```bash
cp .env.example .env
```

Open `.env` and fill in all values:
```env
BOT_TOKEN=7123456789:AAF...
CHANNEL_ID=-1001234567890
BOT_USERNAME=mychannelsubbot

PAYPAL_CLIENT_ID=AaBbCcDd...
PAYPAL_CLIENT_SECRET=EeFfGgHh...
PAYPAL_MODE=sandbox

PAYPAL_PLAN_ID_MONTHLY=       ← fill after step 7
PAYPAL_PLAN_ID_QUARTERLY=     ← fill after step 7
PAYPAL_PLAN_ID_BIANNUAL=      ← fill after step 7
PAYPAL_PLAN_ID_ANNUAL=        ← fill after step 7

DATABASE_URL=postgresql://postgres:yourpassword@db.xxxx.supabase.co:5432/postgres

PORT=3000
WEBHOOK_DOMAIN=https://your-app.koyeb.app   ← fill after step 8
WEBHOOK_SECRET=any-random-32-character-string
```

---

## STEP 7 — Create PayPal Billing Plans

Run this once on your local machine (with `.env` filled in):

```bash
npm install
node src/paypal/createPlan.js
```

Output:
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

Paste the 4 plan IDs into your `.env`, then push to GitHub:
```bash
git add .
git commit -m "Add PayPal plan IDs"
git push
```

---

## STEP 8 — Deploy to Koyeb

Koyeb is free with no credit card required — just an email signup.

### 8a. Create account
1. Go to [koyeb.com](https://koyeb.com) → **Get Started Free**
2. Sign up with GitHub or email — no credit card

### 8b. Create a new App
1. In Koyeb dashboard → **Create App**
2. Select **GitHub** as the source
3. Connect your GitHub account if not already
4. Select your `telegram-subscription-bot` repository
5. Select branch: `main`

### 8c. Configure the service
- **Service name:** `subscription-bot`
- **Instance type:** Free
- **Region:** pick any (Frankfurt or Washington are reliable)
- **Build command:** `npm install`
- **Run command:** `node src/index.js`
- **Port:** `3000`

### 8d. Add environment variables
In the **Environment variables** section, add every variable from your `.env`:

| Key | Value |
|-----|-------|
| `BOT_TOKEN` | Your bot token |
| `CHANNEL_ID` | Your channel ID |
| `BOT_USERNAME` | Bot username without @ |
| `PAYPAL_CLIENT_ID` | From Step 3 |
| `PAYPAL_CLIENT_SECRET` | From Step 3 |
| `PAYPAL_MODE` | `sandbox` |
| `PAYPAL_PLAN_ID_MONTHLY` | From Step 7 |
| `PAYPAL_PLAN_ID_QUARTERLY` | From Step 7 |
| `PAYPAL_PLAN_ID_BIANNUAL` | From Step 7 |
| `PAYPAL_PLAN_ID_ANNUAL` | From Step 7 |
| `DATABASE_URL` | From Step 4c |
| `WEBHOOK_SECRET` | Your random string |
| `WEBHOOK_DOMAIN` | Leave blank for now — fill after first deploy |
| `PORT` | `3000` |

### 8e. Deploy
Click **Deploy**. First deploy takes 2-3 minutes.

### 8f. Get your public URL and update WEBHOOK_DOMAIN
1. After deploy finishes, Koyeb shows your URL at the top — looks like `https://subscription-bot-yourname.koyeb.app`
2. Copy it
3. In Koyeb → your service → **Settings → Environment variables**
4. Set `WEBHOOK_DOMAIN` = `https://subscription-bot-yourname.koyeb.app`
5. Click **Save** — Koyeb redeploys automatically

---

## STEP 9 — Register the PayPal Webhook

1. Go to [developer.paypal.com](https://developer.paypal.com) → **Dashboard → Webhooks → Sandbox tab**
2. Click **Add Webhook**
3. URL: `https://your-app.koyeb.app/paypal/webhook`
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
3. Open your bot → `/subscribe` → pick a plan → tap PayPal button
4. Log in with sandbox buyer credentials → approve

**Verify all of this works:**
- [ ] Bot sends "Subscription Active" message
- [ ] Bot sends a channel invite link
- [ ] You can join the channel
- [ ] `/status` shows plan + next payment date
- [ ] `/cancel` removes you from channel

---

## STEP 11 — Go Live with Real Payments

### 11a. Get live PayPal credentials
- [developer.paypal.com](https://developer.paypal.com) → **Live tab** → Create App → copy Client ID + Secret

### 11b. Re-create billing plans for Live
```bash
# Update your local .env temporarily:
PAYPAL_CLIENT_ID=<live client id>
PAYPAL_CLIENT_SECRET=<live secret>
PAYPAL_MODE=live

node src/paypal/createPlan.js
```
Copy the 4 new live plan IDs.

### 11c. Update Koyeb environment variables
In Koyeb → your service → **Settings → Environment variables**, update:
- `PAYPAL_CLIENT_ID` → live client ID
- `PAYPAL_CLIENT_SECRET` → live secret
- `PAYPAL_MODE` → `live`
- All 4 `PAYPAL_PLAN_ID_*` → new live plan IDs

### 11d. Register Live webhook
- PayPal Developer → **Live tab** → Webhooks → Add same URL + same 7 events

Koyeb redeploys automatically after saving env changes.

**Go-live checklist:**
- [ ] `PAYPAL_MODE=live`
- [ ] Live Client ID + Secret set in Koyeb
- [ ] `createPlan.js` re-run on live → 4 new plan IDs in Koyeb
- [ ] Live PayPal webhook registered
- [ ] Test with a real card

---

## 🔄 Deploying Updates

Push to GitHub → Koyeb redeploys automatically. That's it.

```bash
git add .
git commit -m "your change"
git push
```

---

## 🛠️ Troubleshooting

**Bot doesn't respond**
→ Check Koyeb logs (your service → **Deployments → View logs**). Verify `BOT_TOKEN` and `WEBHOOK_DOMAIN` are correctly set.

**Database connection error on startup**
→ Verify `DATABASE_URL` is correct and includes your actual password (not `[YOUR-PASSWORD]`). Check Supabase project is not paused (free projects pause after 1 week of inactivity — unpause in Supabase dashboard).

**"Plan not configured" error**
→ You haven't run `node src/paypal/createPlan.js` or forgot to add the 4 plan IDs to Koyeb's environment variables.

**PayPal webhooks not arriving**
→ Verify the webhook URL in PayPal matches your Koyeb URL exactly. Test it: open `https://your-app.koyeb.app/health` in your browser — should return `{"status":"ok"}`.

**Supabase project paused**
→ Free Supabase projects pause after 7 days of no activity. Go to [supabase.com](https://supabase.com) → your project → click **Restore**. The bot will resume working immediately. To avoid this, the bot's daily cron job keeps the DB active automatically.

**Sandbox works but live payments fail**
→ You're using sandbox plan IDs with live credentials. Re-run `node src/paypal/createPlan.js` with `PAYPAL_MODE=live` and update all 4 plan IDs in Koyeb.

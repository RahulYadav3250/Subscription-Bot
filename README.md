# 🤖 Telegram Subscription Bot — Complete Setup Guide

A production-ready Telegram bot that manages **PayPal recurring subscriptions** with automatic channel access management. Users subscribe via PayPal, get added to your private channel instantly, and auto-pay handles every renewal — no manual work needed.

---

## 📋 Subscription Plans

All users pay via PayPal in USD, regardless of location.

| Plan | Price | Free Trial | Button shown in bot |
|------|-------|------------|---------------------|
| Monthly | $2.99/month | ✅ 7 days | 💎 $2.99/month  •  Most Popular 🔥  •  7-Day Free Trial |
| Quarterly | $7.99/3 months | ✅ 7 days | 📦 $7.99/3 months  •  10% Off 🎉  •  7-Day Free Trial |
| 6 Months | $13.99/6 months | ❌ None | 🏷️ $13.99/6 months  •  20% Off 💰 |
| Annual | $24.99/year | ❌ None | 🏆 $24.99/year  •  Best Value — 30% Off 🥇 |

---

## 🗂️ Project Structure

```
src/
├── index.js              # Entry point — Grammy bot + Express server
├── config/
│   └── plans.js          # All plan definitions (single source of truth)
├── db/
│   └── database.js       # SQLite schema & query helpers
├── paypal/
│   ├── client.js         # PayPal REST API wrapper
│   └── createPlan.js     # One-time plan creation script (run once)
├── handlers/
│   ├── commands.js       # Bot commands + inline keyboard callbacks
│   └── webhooks.js       # PayPal webhook event handlers
├── jobs/
│   └── scheduler.js      # Daily cron: expiry sweep + trial reminders
└── utils/
    └── channel.js        # Add/remove users, generate invite links
```

---

## 🔄 How Auto-Pay Works

PayPal manages the entire billing schedule. Once a user approves their subscription, PayPal charges them automatically on every renewal date. Your bot just listens to webhooks and keeps the database and channel access in sync.

```
User taps /subscribe
        │
        ▼
Bot shows 4 plan buttons
        │
        ▼  (user picks a plan)
PayPal approval link sent
        │
        ▼  (user approves on PayPal)
BILLING.SUBSCRIPTION.ACTIVATED webhook
        ├── DB updated (status = trialing or active)
        ├── User added to channel
        └── Single-use invite link sent to user
        │
        ▼  (PayPal charges automatically on renewal date)
PAYMENT.SALE.COMPLETED webhook
        ├── DB updated (period extended)
        └── "Auto-Pay Successful" message sent to user
        │
        ▼  (on cancellation or failure)
BILLING.SUBSCRIPTION.CANCELLED / SUSPENDED
        ├── DB updated
        ├── User removed from channel
        └── Notification sent
```

---

# 🚀 Step-by-Step Deployment Guide

Follow every step in order. Do not skip ahead.

---

## STEP 1 — Create Your Telegram Bot

1. Open Telegram and search for **@BotFather**
2. Send `/newbot`
3. Enter a display name (e.g. `My Channel Bot`)
4. Enter a username ending in `bot` (e.g. `mychannelsubbot`)
5. BotFather gives you a token like `7123456789:AAF...` — **save this as `BOT_TOKEN`**

### Set the command menu
Send `/setcommands` to BotFather, select your bot, then paste this exactly:
```
start - Welcome & intro
subscribe - See plans & subscribe
status - Check subscription & next payment
cancel - Cancel auto-pay & leave channel
help - Show all commands
```

---

## STEP 2 — Create & Configure the Private Channel

1. In Telegram: pencil icon → **New Channel** → give it a name → set to **Private** → Create
2. Add your bot as an **Administrator**:
   - Open channel → tap channel name → **Administrators** → **Add Admin**
   - Search for your bot username and select it
   - Enable exactly these three permissions:
     - ✅ Add Members
     - ✅ Ban Users
     - ✅ Invite Users via Link
   - Tap Save

### Get the Channel ID
1. Forward any message from your channel to **@userinfobot**
2. It replies with something like `Chat ID: -1001234567890`
3. **Save the full number including the minus sign as `CHANNEL_ID`**

---

## STEP 3 — Set Up PayPal

### 3a. Ensure you have a PayPal Business account
Personal PayPal accounts cannot use the Subscriptions API. Go to [paypal.com](https://paypal.com) and upgrade to Business if needed — it's free.

### 3b. Create a REST API App (Sandbox first)
1. Go to [developer.paypal.com](https://developer.paypal.com) and log in
2. Go to **Dashboard → My Apps & Credentials**
3. Stay on the **Sandbox** tab for now
4. Click **Create App**
5. Name it (e.g. `Telegram Subscription Bot`) → click **Create App**
6. Copy the **Client ID** and **Secret** → save as `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`

### 3c. Create a Live App (for production)
Once testing is complete, repeat step 3b on the **Live** tab to get your live credentials. You will swap these in later.

---

## STEP 4 — Install & Configure the Bot

### 4a. Get the code
```bash
git clone https://github.com/your-username/telegram-subscription-bot.git
cd telegram-subscription-bot
npm install
```

### 4b. Create your environment file
```bash
cp .env.example .env
```

Open `.env` in any text editor and fill in:
```env
# Telegram
BOT_TOKEN=7123456789:AAF...
CHANNEL_ID=-1001234567890
BOT_USERNAME=mychannelsubbot

# PayPal — use sandbox credentials first
PAYPAL_CLIENT_ID=AaBbCcDd...
PAYPAL_CLIENT_SECRET=EeFfGgHh...
PAYPAL_MODE=sandbox

# Leave these blank for now — filled in step 4c
PAYPAL_PLAN_ID_MONTHLY=
PAYPAL_PLAN_ID_QUARTERLY=
PAYPAL_PLAN_ID_BIANNUAL=
PAYPAL_PLAN_ID_ANNUAL=

# Server — fill WEBHOOK_DOMAIN after deploying in step 5
WEBHOOK_DOMAIN=https://your-app.onrender.com
WEBHOOK_SECRET=paste-any-random-32-character-string-here

# Database
DB_PATH=./data/subscriptions.db
```

### 4c. Create the PayPal Billing Plans — run this ONCE
```bash
node src/paypal/createPlan.js
```

The script creates one PayPal product and all 4 billing plans. Output looks like:
```
✅ Product created: PROD-XXXXXXXXXXXX
✅ Plan created: P-1AB23456CD789012EF345678  (monthly)
✅ Plan created: P-2CD34567EF890123GH456789  (quarterly)
✅ Plan created: P-3EF45678GH901234IJ567890  (biannual)
✅ Plan created: P-4GH56789IJ012345KL678901  (annual)

─────────────────────────────────────
Add these to your .env:
PAYPAL_PLAN_ID_MONTHLY=P-1AB23456CD789012EF345678
PAYPAL_PLAN_ID_QUARTERLY=P-2CD34567EF890123GH456789
PAYPAL_PLAN_ID_BIANNUAL=P-3EF45678GH901234IJ567890
PAYPAL_PLAN_ID_ANNUAL=P-4GH56789IJ012345KL678901
─────────────────────────────────────
```

Copy those 4 lines into your `.env` file.

> ⚠️ When you switch to live PayPal credentials later, you must re-run this script with `PAYPAL_MODE=live` and update the 4 plan IDs again — sandbox and live plan IDs are different.

---

## STEP 5 — Deploy to Render

### 5a. Push to GitHub
```bash
git add .
git commit -m "Initial bot setup"
git push origin main
```

> `.env` is already in `.gitignore` — never commit it. Your secrets stay local.

### 5b. Create a Web Service on Render
1. Go to [dashboard.render.com](https://dashboard.render.com)
2. Click **New → Web Service**
3. Connect your GitHub account and select your repository
4. Render detects `render.yaml` automatically. Confirm these settings:
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. Click **Create Web Service**

### 5c. Add a Persistent Disk for SQLite
Render's filesystem resets on every redeploy, which would wipe your database. A disk prevents this.

1. In your service dashboard → **Disks** → **Add Disk**
2. Set:
   - **Name:** `bot-data`
   - **Mount Path:** `/opt/render/project/src/data`
   - **Size:** 1 GB (sufficient, and within free tier)
3. Click **Save**
4. In **Environment**, update `DB_PATH` to:
   ```
   DB_PATH=/opt/render/project/src/data/subscriptions.db
   ```

### 5d. Set Environment Variables in Render
Go to your service → **Environment** → **Add Environment Variable** and add every key from your `.env`:

| Key | Value |
|-----|-------|
| `BOT_TOKEN` | Your bot token from BotFather |
| `CHANNEL_ID` | Your channel ID (e.g. `-1001234567890`) |
| `BOT_USERNAME` | Bot username without @ |
| `PAYPAL_CLIENT_ID` | From Step 3b |
| `PAYPAL_CLIENT_SECRET` | From Step 3b |
| `PAYPAL_MODE` | `sandbox` for now, `live` later |
| `PAYPAL_PLAN_ID_MONTHLY` | From Step 4c |
| `PAYPAL_PLAN_ID_QUARTERLY` | From Step 4c |
| `PAYPAL_PLAN_ID_BIANNUAL` | From Step 4c |
| `PAYPAL_PLAN_ID_ANNUAL` | From Step 4c |
| `WEBHOOK_DOMAIN` | Your Render URL — see step 5e |
| `WEBHOOK_SECRET` | Same random string from your `.env` |
| `DB_PATH` | `/opt/render/project/src/data/subscriptions.db` |

### 5e. Set WEBHOOK_DOMAIN
After the first deploy finishes, Render shows your public URL at the top of the service page — something like `https://telegram-subscription-bot.onrender.com`.

1. Copy that URL
2. Go to **Environment** → update `WEBHOOK_DOMAIN` to that URL
3. Click **Save Changes** → Render redeploys automatically

---

## STEP 6 — Register the PayPal Webhook

This tells PayPal where to send subscription events (payment success, cancellation, etc).

1. Go to [developer.paypal.com](https://developer.paypal.com) → **Dashboard → Webhooks**
2. Make sure you're on the **Sandbox** tab
3. Click **Add Webhook**
4. Enter the URL: `https://your-app.onrender.com/paypal/webhook`
5. Under **Event Types**, select all of these:
   - ✅ `BILLING.SUBSCRIPTION.ACTIVATED`
   - ✅ `BILLING.SUBSCRIPTION.CANCELLED`
   - ✅ `BILLING.SUBSCRIPTION.EXPIRED`
   - ✅ `BILLING.SUBSCRIPTION.PAYMENT.FAILED`
   - ✅ `BILLING.SUBSCRIPTION.RENEWED`
   - ✅ `BILLING.SUBSCRIPTION.SUSPENDED`
   - ✅ `PAYMENT.SALE.COMPLETED`
6. Click **Save**

> You will repeat this on the **Live** tab when you go to production.

---

## STEP 7 — Test with Sandbox

### 7a. Get a sandbox buyer account
1. Go to [developer.paypal.com → Sandbox → Accounts](https://developer.paypal.com/dashboard/accounts)
2. There is a pre-created buyer account listed — click the three-dot menu → **View/Edit**
3. Note the email and password

### 7b. Run a full test
1. Open your bot in Telegram
2. Send `/subscribe`
3. Choose any plan
4. Tap the PayPal button — log in with the sandbox buyer credentials
5. Approve the subscription

**Verify all of this happens:**
- [ ] You are redirected back to a success page
- [ ] The bot sends you a "Subscription Active" message in Telegram
- [ ] The bot sends a single-use channel invite link
- [ ] You can join the channel using that link
- [ ] `/status` shows the correct plan and next payment date

### 7c. Test cancellation
1. Send `/cancel` to the bot
2. Verify you receive a cancellation confirmation
3. Verify you are removed from the channel

---

## STEP 8 — Go Live

Once sandbox testing passes, follow these steps to switch to real payments.

**8a. Swap PayPal credentials**
1. In [developer.paypal.com](https://developer.paypal.com), go to the **Live** tab → create a Live app
2. Copy the live Client ID and Secret
3. In Render environment variables, update:
   - `PAYPAL_CLIENT_ID` → live client ID
   - `PAYPAL_CLIENT_SECRET` → live secret
   - `PAYPAL_MODE` → `live`

**8b. Re-create billing plans for Live**
```bash
# In your local .env, temporarily set:
PAYPAL_MODE=live
PAYPAL_CLIENT_ID=<your live client id>
PAYPAL_CLIENT_SECRET=<your live secret>

node src/paypal/createPlan.js
```
Copy the 4 new plan IDs and update them in Render environment variables:
- `PAYPAL_PLAN_ID_MONTHLY`
- `PAYPAL_PLAN_ID_QUARTERLY`
- `PAYPAL_PLAN_ID_BIANNUAL`
- `PAYPAL_PLAN_ID_ANNUAL`

**8c. Register the Live webhook**
1. In PayPal Developer Dashboard → switch to **Live** tab → **Webhooks**
2. Add the same webhook URL: `https://your-app.onrender.com/paypal/webhook`
3. Select the same 7 event types as in Step 6

**8d. Redeploy**
In Render, click **Manual Deploy → Deploy latest commit** to apply all env changes.

**Go-live checklist:**
- [ ] `PAYPAL_MODE=live`
- [ ] Live Client ID and Secret set in Render
- [ ] `createPlan.js` re-run with live credentials
- [ ] All 4 live plan IDs updated in Render
- [ ] Live webhook registered in PayPal dashboard
- [ ] Full test with a real card done

---

## STEP 9 — Alternative: Deploy to Railway

If you prefer Railway over Render:

1. Go to [railway.app](https://railway.app) → **New Project → Deploy from GitHub**
2. Select your repository
3. Add all environment variables under the **Variables** tab
4. Add a **Volume** for database persistence:
   - Mount path: `/app/data`
   - Update `DB_PATH=/app/data/subscriptions.db` in variables
5. Go to **Settings → Domains** → **Generate Domain**
6. Copy that domain and set it as `WEBHOOK_DOMAIN`

Everything else (PayPal setup, webhook registration, go-live steps) is identical to above.

---

## 🤖 Bot Commands Reference

| Command | What it does |
|---------|-------------|
| `/start` | Welcome message explaining the bot |
| `/subscribe` | Shows all 4 plan buttons → generates PayPal approval link |
| `/status` | Shows current plan, status, and next auto-pay date |
| `/cancel` | Cancels auto-pay via PayPal and removes user from channel |
| `/help` | Lists all commands |

---

## ⚠️ Troubleshooting

**Bot doesn't respond to messages**
→ Check `BOT_TOKEN` is correct. Check Render logs for startup errors. Make sure `WEBHOOK_DOMAIN` is set to your live Render URL and the service has been redeployed after setting it.

**"This plan isn't configured yet" error**
→ You haven't run `node src/paypal/createPlan.js`, or you forgot to copy the 4 plan IDs into your environment variables.

**Invite link sent but user can't join the channel**
→ The bot must be an Administrator in the channel with **Add Members** and **Invite Users via Link** permissions enabled. Double-check this in channel settings.

**PayPal webhooks not arriving (events not processing)**
→ Verify the webhook URL in PayPal dashboard exactly matches your Render URL. Check that `/health` returns 200. Ensure you selected all 7 event types when registering the webhook.

**Database is empty after a Render redeploy**
→ You haven't attached a persistent disk, or `DB_PATH` is not pointing to the disk's mount path. See Step 5c.

**Sandbox payments work but live payments don't**
→ You are likely still using sandbox plan IDs with live credentials. Re-run `node src/paypal/createPlan.js` with `PAYPAL_MODE=live` and update all 4 plan IDs in Render.

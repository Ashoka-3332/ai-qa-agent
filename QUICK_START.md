# ⚡ Quick Start Guide - 5 Minutes

## Step 1: Install & Configure (1 min)

```bash
cd qa-agent
npm install
cp .env.example .env
```

Edit `.env` and set:
```
OPENAI_API_KEY=your_key
OPENAI_BASE_URL=
OPENAI_MODEL=gemini-2.5-flash
```

## Step 2: Start Server (1 min)

```bash
npm start
```

You'll see:
```
🚀 QA Platform API running on http://localhost:3000
```

## Step 3: Open Dashboard (30 seconds)

Open browser: **`http://localhost:3000`**

## Step 4: Run Your First Test (2.5 min)

### Option A: Use Default Test
1. Dashboard loads with default URL & goal pre-filled
2. Click **"GEN PLAN"** button
3. AI generates test plan
4. Click **"RUN TEST"** button
5. Watch real-time execution!

### Option B: Custom Test

**Example 1 - Login Test:**
- URL: `https://www.saucedemo.com/`
- Goal: `Login with username 'standard_user' and password 'secret_sauce' and verify you're logged in`

**Example 2 - Search Test:**
- URL: `https://www.google.com`
- Goal: `Search for 'OpenAI' and click the first result`

**Example 3 - Form Test:**
- URL: `https://formspree.io/forms/xyzabc` (any form URL)
- Goal: `Fill in the form with name 'John Doe' and email 'test@example.com' and submit`

---

## 🎮 Live Execution Dashboard

### What You See:

**Left Panel** - Test Configuration
- URL input
- Goal textarea  
- GEN PLAN & RUN TEST buttons

**Center Panel** - Live Execution
- Real-time logs as test runs
- Action breakdown with timing
- Color-coded messages

**Right Panel** - Status & Results
- Current status (Idle/Running/Success/Failed)
- Progress bar
- Live screenshot from browser
- Duration tracking

---

## 📊 After Test Completes

1. **Review Logs** - See every thought and action
2. **Check Screenshot** - Final state of the browser
3. **View Metrics** - Each action's execution time
4. **Save as Template** - For future use

---

## 🎯 Common Test Scenarios

### Add to Cart Flow
```
URL: https://www.saucedemo.com/
Goal: Login, find backpack item, add to cart, verify cart count is 1
```

### Multi-Step Purchase
```
URL: https://example-shop.com
Goal: Search for shoes, filter by size 10, add first result to cart, go to checkout
```

### Contact Form Submission
```
URL: https://example.com/contact
Goal: Fill name as John, email as john@test.com, message as Hello, submit form
```

---

## 🐛 If Something Goes Wrong

### Logs show "Connection error"
- Verify `.env` file exists and has correct API key
- Check server is running: `npm start`
- Try refreshing browser

### Test times out
- Try simpler goal with fewer steps
- Verify target website is accessible
- Check your internet connection

### Screenshot not appearing
- Run: `npx playwright install`
- Restart server: `npm start`

---

## 📚 Next Steps

1. **View Test History** - Click "HISTORY" tab to see past runs
2. **Save Templates** - Reuse successful tests
3. **Enable Bug Reporting** - Set up Jira/Slack for auto-bug creation
4. **Check Metrics** - Analyze performance of each action

---

## 🚀 You're Ready!

That's it! The AI QA Agent is ready to test for you.

Start by running a simple test, then experiment with more complex scenarios.

**Happy Testing!** 🎯

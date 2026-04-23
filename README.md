# 🤖 AI Autonomous QA Testing Platform

A **production-grade, AI-powered QA automation platform** with real-time execution monitoring, intelligent test planning, and comprehensive bug reporting. Built with TypeScript, Playwright, and Three.js.

## ✨ Features

### 🧠 AI-Powered Testing
- **Autonomous Test Execution**: AI agent thinks and acts like a human QA engineer
- **Intelligent Planning**: Generate test plans in natural language before execution
- **Real-Time Execution**: Watch the AI execute tests step-by-step with live logs
- **Error Recovery**: Handles dynamic UI elements and adapts to page changes

### 📊 Advanced Dashboard
- **Live Execution Viewer**: See logs, screenshots, and metrics in real-time
- **3D Cyberpunk UI**: Beautiful animated 3D background with mouse tracking
- **Action Breakdown**: Detailed performance metrics for each test step
- **Test History**: Browse and analyze past test runs
- **Saved Templates**: Reuse common test scenarios

### 🐛 Bug Reporting
- **Jira Integration**: Auto-create bug tickets on test failure
- **Slack Notifications**: Send real-time test results to your team
- **Screenshot Attachments**: Automatic failure screenshots attached to reports

### ⚡ Performance Tracking
- **Action Timing**: Measure execution time for each action
- **Metrics Dashboard**: Analyze performance trends over time
- **Step-by-Step Breakdown**: See which actions are slowest

### 💾 Data Persistence
- **SQLite Database**: All test runs, metrics, and templates saved
- **Test History**: Full logs and screenshots for every execution
- **Templates Library**: Save and reuse successful test scenarios

---

## 🚀 Quick Start

### Prerequisites
- Node.js v20.10+
- npm or yarn
- Modern web browser

### Installation

```bash
cd qa-agent
npm install
```

### Configuration

Create a `.env` file:

```bash
cp .env.example .env
```

Edit `.env` with your settings:

```
# Required
OPENAI_API_KEY=your_api_key_here
OPENAI_BASE_URL=https://gpt.protium.co.in/api/v1/
OPENAI_MODEL=gemini-2.5-flash

# Optional: Jira Bug Reporting
JIRA_URL=https://your-jira.atlassian.net
JIRA_TOKEN=your_jira_api_token
JIRA_PROJECT=PROJ

# Optional: Slack Notifications
SLACK_WEBHOOK=https://hooks.slack.com/services/YOUR/WEBHOOK
```

### Running the Platform

```bash
npm start
```

The dashboard will be available at **`http://localhost:3000`**

---

## 📖 Usage Guide

### 1. **Configure Target URL & Goal**
   - Enter the target website URL
   - Describe your testing goal in natural language
   - Example: "Login with credentials and add item to cart"

### 2. **Generate Test Plan**
   - Click **"GEN PLAN"** button
   - AI creates a step-by-step test plan
   - Review and edit if needed

### 3. **Execute Test**
   - Click **"RUN TEST"** button
   - Watch real-time execution logs
   - See action breakdown and performance metrics
   - View live browser screenshots

### 4. **Review Results**
   - Check if test passed or failed
   - View total duration and step timings
   - Save as template for future use

---

## 🎮 Dashboard Tabs

### **LIVE EXECUTION** (Default)
- **Left Panel**: Test configuration and controls
- **Center Panel**: Real-time execution logs and action breakdown
- **Right Panel**: Status indicator, progress bar, and live screenshot

### **HISTORY**
- Browse all past test runs
- Sort by date, success rate
- Click to view full details

### **TEMPLATES**
- View saved test templates
- Quick-load previous configurations
- Save current test as new template

---

## 🔧 API Endpoints

### Test Execution
```
POST /api/run
Body: { url, goal, testPlan, reportBug }
Returns: { success, logs, screenshot, metrics, testRunId }
```

### Test Planning
```
POST /api/generate-plan
Body: { url, goal }
Returns: { plan }
```

### Real-Time Events
```
GET /api/test-events
Returns: Server-Sent Events (SSE) stream
```

### Test History
```
GET /api/test-history?limit=20
Returns: { data: TestRun[] }
```

### Performance Metrics
```
GET /api/performance-metrics/:testRunId
Returns: { data: Metric[] }
```

### Templates
```
GET /api/test-templates
POST /api/test-template
Body: { name, description, url, goal, testPlan }
```

---

## 📁 Project Structure

```
qa-agent/
├── agent.ts                 # AI agent core logic
├── browser.ts               # Playwright browser controller
├── database.ts              # SQLite operations
├── bug-reporter.ts          # Jira/Slack integration
├── execution-emitter.ts     # Real-time event streaming
├── server.ts                # Express API server
├── public/
│   ├── 3d-execution.html    # Live execution dashboard (main)
│   ├── 3d-dashboard.html    # Advanced features dashboard
│   └── 3d-ui.html           # Original 3D UI
├── qa-tests.db              # SQLite database (auto-created)
├── package.json
└── .env                      # Configuration (create from .env.example)
```

---

## 🎯 Advanced Features

### Enable Bug Reporting

Set environment variables and tests will auto-report failures:

```bash
JIRA_URL=https://jira.company.com
JIRA_TOKEN=your_token
JIRA_PROJECT=MYPROJ
SLACK_WEBHOOK=https://hooks.slack.com/...
```

Then enable "Report failures" checkbox in the UI before running tests.

### Save Test Templates

After creating a successful test:
1. Navigate to the TEMPLATES tab
2. Fill in template name and description
3. Click "SAVE TEMPLATE"
4. Reuse anytime from the TEMPLATES tab

### View Performance Metrics

Each test automatically tracks:
- Individual action timing
- Total test duration
- Step completion count
- Success/failure rate

Access from the History tab.

---

## 🧪 Example Test Cases

### E-commerce Flow
```
URL: https://www.saucedemo.com/
Goal: Login as standard_user, add Backpack to cart, verify cart count is 1
```

### Form Submission
```
URL: https://example.com/form
Goal: Fill out contact form with name, email, message and submit
```

### Search & Verify
```
URL: https://example.com/search
Goal: Search for 'laptop', verify results show laptops, click first result
```

---

## 🐛 Troubleshooting

### Test Times Out
- Increase `maxSteps` in `agent.ts` (default: 10)
- Check if target website loads properly
- Verify URL is accessible

### Screenshots Not Appearing
- Ensure Playwright Chromium is installed: `npx playwright install`
- Check browser controller initialization

### Real-Time Logs Not Updating
- Verify Server-Sent Events (SSE) connection
- Check browser console for connection errors
- Try refreshing the page

### Database Errors
- Delete `qa-tests.db` to reset database
- Check write permissions in project directory

---

## 📊 Database Schema

### test_runs
```sql
CREATE TABLE test_runs (
    id INTEGER PRIMARY KEY,
    timestamp TEXT,
    url TEXT,
    goal TEXT,
    testPlan TEXT,
    success INTEGER,
    duration INTEGER,
    screenshot BLOB,
    logs TEXT
);
```

### test_templates
```sql
CREATE TABLE test_templates (
    id INTEGER PRIMARY KEY,
    name TEXT UNIQUE,
    description TEXT,
    url TEXT,
    goal TEXT,
    testPlan TEXT
);
```

### performance_metrics
```sql
CREATE TABLE performance_metrics (
    id INTEGER PRIMARY KEY,
    testRunId INTEGER,
    actionName TEXT,
    duration INTEGER
);
```

---

## 🔐 Security

- API keys stored in `.env` (git-ignored)
- Passwords never logged
- Screenshots only saved locally
- No telemetry collection

---

## 📝 Logs & Debugging

View real-time server logs:
```bash
tail -f /tmp/qa-agent.log
```

Check SQLite database:
```bash
sqlite3 qa-tests.db "SELECT * FROM test_runs LIMIT 5;"
```

---

## 🚀 Performance Tips

1. **Increase maxSteps** for complex workflows
2. **Use test templates** to avoid regenerating plans
3. **Monitor metrics** to identify slow steps
4. **Save screenshots** only when needed (toggle in settings)

---

## 🤝 Contributing

This is a personal project. Feel free to fork and customize!

---

## 📄 License

MIT License - Use freely

---

## 🎓 How It Works

```
┌─────────────────────────────────────────────────────┐
│  User Input (URL + Goal)                             │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│  AI Agent: Generate Test Plan (LLM)                  │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│  Real-Time Execution Loop:                           │
│  1. Observe (Extract DOM elements)                   │
│  2. Think (LLM decides next action)                  │
│  3. Act (Playwright executes action)                 │
│  4. Measure (Track performance)                      │
│  5. Repeat until goal achieved                       │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│  Results:                                            │
│  • Full logs & screenshots                           │
│  • Performance metrics                               │
│  • Bug reports (if enabled)                          │
│  • Database storage for history                      │
└─────────────────────────────────────────────────────┘
```

---

## 🎨 Technology Stack

- **Backend**: Node.js + Express + TypeScript
- **Testing**: Playwright (Chromium automation)
- **AI**: OpenAI/Gemini API
- **Database**: SQLite3
- **Frontend**: Three.js (3D), Vanilla JavaScript
- **UI**: Tailwind CSS + Custom Cyberpunk Theme

---

**Happy Testing! 🚀**

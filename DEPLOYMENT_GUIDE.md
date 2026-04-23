# QA Agent - Production Deployment Guide

This guide covers everything needed to deploy the QA Agent to production on Render (or similar platforms).

---

## 📋 Pre-Deployment Checklist

Before deploying, ensure:

- [ ] All code changes committed and pushed to main branch
- [ ] `npm run build` completes without errors
- [ ] Environment variables prepared (see below)
- [ ] Database backup strategy planned
- [ ] Monitoring/alerting configured
- [ ] Read `PRODUCTION_CHECKLIST.md` for security details

---

## 🔐 Environment Variables

### Required Variables

Create a `.env` file in production with:

```bash
# API Configuration (MUST be set)
OPENAI_API_KEY=sk-xxxxxxxxxxxx  # Your actual API key - ROTATE THIS IMMEDIATELY
OPENAI_BASE_URL=https://gpt.protium.co.in/api/v1/
OPENAI_MODEL=gemini-2.5-flash

# Server Configuration
PORT=3000
NODE_ENV=production

# Security (STRONGLY RECOMMENDED)
ACCESS_TOKEN=your_strong_password_here  # Used for dashboard authentication

# CORS Configuration
ALLOWED_ORIGINS=https://yourdomain.com,https://app.yourdomain.com
```

### Optional Variables

```bash
# Slack Integration (for bug reporting)
SLACK_WEBHOOK=https://hooks.slack.com/services/YOUR/WEBHOOK/URL

# Jira Integration (for bug reporting)
JIRA_URL=https://your-jira-instance.atlassian.net
JIRA_TOKEN=your_jira_token_here
JIRA_PROJECT=PROJECT_KEY
```

### Setting Variables in Render

1. Go to your service settings
2. Click "Environment"
3. Add each variable:
   - Key: OPENAI_API_KEY
   - Value: [Your actual key]
   - Repeat for each variable

---

## 🚀 Deployment Steps

### Option 1: Deploy to Render (Recommended)

1. **Connect Repository**
   ```
   https://github.com/Ashoka-3332/ai-qa-agent.git
   ```

2. **Configure Build Settings**
   - Build Command: `npm install && npm run build`
   - Start Command: `npm run serve`
   - Runtime: Docker (uses Dockerfile)

3. **Set Environment Variables** (in Render dashboard)
   - Add all required variables from section above

4. **Deploy**
   - Click "Deploy"
   - Monitor logs for errors

5. **Verify Deployment**
   - Open service URL
   - Dashboard should load
   - Check logs for startup messages

### Option 2: Deploy to Your Own Server

1. **SSH to Server**
   ```bash
   ssh user@your-server.com
   ```

2. **Clone Repository**
   ```bash
   git clone https://github.com/Ashoka-3332/ai-qa-agent.git
   cd ai-qa-agent
   ```

3. **Install Dependencies**
   ```bash
   npm install
   ```

4. **Create .env File**
   ```bash
   cp .env.example .env
   # Edit .env with your actual values
   nano .env
   ```

5. **Build Project**
   ```bash
   npm run build
   ```

6. **Start Service** (with PM2)
   ```bash
   npm install -g pm2
   pm2 start dist/server.js --name qa-agent
   pm2 save
   pm2 startup
   ```

7. **Verify**
   ```bash
   curl http://localhost:3000/
   ```

---

## 🐳 Docker Deployment

The Dockerfile is already configured to:

1. Use Playwright base image (includes browsers)
2. Install build tools
3. Build sqlite3 from source (handles glibc compatibility)
4. Compile TypeScript
5. Start the app

**Key Dockerfile decisions:**
- `FROM mcr.microsoft.com/playwright:v1.40.0-jammy` - Includes browsers
- `RUN npm ci --ignore-scripts` - Skip pre-built binaries
- `RUN npm rebuild sqlite3 --build-from-source` - Build for container glibc
- `CMD ["npm", "run", "serve"]` - Run compiled JavaScript

---

## 📊 Post-Deployment Verification

After deploying, verify everything works:

### 1. Health Check

```bash
# Should return HTML dashboard
curl http://your-domain.com/

# Should return 200 OK
curl http://your-domain.com/api/test-history \
  -H "x-access-token: your_access_token"
```

### 2. Test Rate Limiting

```bash
# Trigger rate limiting (100+ requests in 15 min)
for i in {1..110}; do
  curl -s http://your-domain.com/api/test-history \
    -H "x-access-token: your_token" \
    -o /dev/null -w "Status: %{http_code}\n"
done

# Last few should show "Status: 429" (Too Many Requests)
```

### 3. Test SSRF Protection

```bash
# Should fail - SSRF blocked
curl -X POST http://your-domain.com/api/run \
  -H "x-access-token: your_token" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "http://localhost:8080/admin",
    "goal": "test"
  }'

# Should return error about internal URL
```

### 4. Test Timeout

```bash
# This test should timeout after 5 minutes (good!)
curl -X POST http://your-domain.com/api/run \
  -H "x-access-token: your_token" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "goal": "do something that takes forever"
  }'
```

### 5. Check Database

```bash
# SSH into server
ssh user@your-server.com

# Verify database exists and has tables
sqlite3 qa-tests.db ".tables"

# Should output: performance_metrics  test_runs  test_templates
```

---

## 🔄 Monitoring & Maintenance

### Monitor These Metrics

1. **Error Rate**
   - Watch for spikes in unhandled exceptions
   - Check logs for patterns

2. **Response Time**
   - LLM calls should complete in ~10-30 seconds
   - Database queries < 100ms

3. **Database Size**
   - Monitor qa-tests.db growth
   - Archive old test runs if it exceeds 1GB

4. **Memory Usage**
   - Normal: 200-300MB
   - Alert if exceeds 500MB (possible leak)

5. **Disk Space**
   - Ensure at least 1GB free for screenshots/database
   - Monitor growth rate

### Recommended Logging

Add to your monitoring service (e.g., Sentry, LogRocket):

```bash
# In server.ts, after creating the server:
if (process.env.SENTRY_DSN) {
  const Sentry = require('@sentry/node');
  Sentry.init({ dsn: process.env.SENTRY_DSN });
}
```

---

## 🔄 Updating to New Versions

To update the code in production:

```bash
# Pull latest changes
git pull origin main

# Install any new dependencies
npm install

# Build
npm run build

# If using PM2:
pm2 restart qa-agent

# If using systemd, restart service:
sudo systemctl restart qa-agent

# Verify it's running
curl http://localhost:3000/
```

---

## 🆘 Troubleshooting

### Port Already in Use

```bash
# Find what's using the port
lsof -i :3000

# Kill the process
kill -9 <PID>

# Or use different port
PORT=3001 npm run serve
```

### Database Locked

```bash
# SQLite sometimes locks the database
# Delete the lock file:
rm qa-tests.db-shm
rm qa-tests.db-wal

# This is safe - SQLite will recreate them
```

### Out of Memory

```bash
# Increase Node heap size
NODE_OPTIONS=--max-old-space-size=2048 npm run serve

# If still running out of memory:
# 1. Archive old test runs from database
# 2. Reduce screenshot quality/size
# 3. Add more server memory
```

### Tests Timing Out

Default timeout is 5 minutes per test. To change:

In `config.ts`:
```typescript
executionTimeout: 10 * 60 * 1000, // 10 minutes
```

### CORS Errors in Browser

1. Verify `ALLOWED_ORIGINS` includes your frontend domain
2. Make sure no trailing slashes in origins:
   - ✅ `https://app.example.com`
   - ❌ `https://app.example.com/`

3. Check browser console for exact error
4. Add origin to environment variables

---

## 📈 Scaling Considerations

As you grow, consider:

1. **Database Growth**
   - Archive old test runs monthly
   - Consider PostgreSQL for large datasets

2. **Storage**
   - Move screenshots to S3/GCS
   - Keep only URLs in SQLite

3. **API Rate Limits**
   - Current: 100 requests / 15 min
   - Adjust `config.ts` if needed

4. **Multiple Instances**
   - Use load balancer (Render handles this)
   - Share database connection pool

5. **Caching**
   - Cache test templates in Redis
   - Cache LLM responses (optional)

---

## 🔒 Security Reminders

- [ ] **Rotate API Key** immediately if exposed
- [ ] **Change ACCESS_TOKEN** after deployment (strong password)
- [ ] **Enable HTTPS** (Render does this automatically)
- [ ] **Monitor Access Logs** for unauthorized attempts
- [ ] **Back up Database** regularly
- [ ] **Update Dependencies** monthly (`npm audit fix`)
- [ ] **Review Logs** weekly for errors/patterns

---

## 📞 Getting Help

- Check `PRODUCTION_CHECKLIST.md` for security details
- Review logs: `pm2 logs qa-agent`
- GitHub Issues: Report bugs and feature requests
- Check Render dashboard for deployment logs

---

## 🎯 Quick Reference

**Common Commands:**

```bash
# Start development
npm start

# Build for production
npm run build

# Run production server
npm run serve

# Check build
npm run build

# View logs (PM2)
pm2 logs qa-agent

# Monitor (PM2)
pm2 monit
```

**URLs:**
- Dashboard: `http://localhost:3000/`
- API Test History: `http://localhost:3000/api/test-history`
- Database: `qa-tests.db`

**Files:**
- Main Server: `dist/server.js`
- Config: `config.ts`
- Database: `database.ts`
- Agent: `agent.ts`
- Utilities: `utils.ts`

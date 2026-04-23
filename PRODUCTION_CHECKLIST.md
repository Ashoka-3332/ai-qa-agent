# Production Deployment Checklist

This document tracks all security and stability improvements made to make the QA Agent production-ready.

## ✅ CRITICAL ISSUES (FIXED)

- [x] **Hardcoded API Key Exposure** - Removed from .env, now requires environment configuration
  - All API keys must be set via environment variables in production
  - Rotate your OPENAI_API_KEY immediately on your server
  
- [x] **Global Error Handlers** - Added handlers for unhandled rejections and exceptions
  - `process.on('unhandledRejection')` - Logs and exits gracefully
  - `process.on('uncaughtException')` - Logs and exits immediately
  
- [x] **Graceful Server Shutdown** - Implemented SIGTERM/SIGINT handlers
  - Closes all active SSE connections
  - Properly closes database before exit
  - 30-second timeout before forced shutdown

---

## ✅ HIGH PRIORITY ISSUES (FIXED)

- [x] **SSRF Prevention** - URL validation blocks internal/private networks
  - Blocks: localhost, 127.x.x.x, 192.168.x.x, 10.x.x.x, 172.16-31.x.x
  - Only allows HTTP/HTTPS protocols
  
- [x] **Input Validation** - All request parameters validated with size limits
  - goal: max 5000 characters
  - testPlan: max 10000 characters
  - URL format validation with safe parsing
  
- [x] **CORS Hardening** - Restricts to configured origins
  - Default: http://localhost:3000, http://localhost:3001
  - Configure via `ALLOWED_ORIGINS` environment variable
  
- [x] **Rate Limiting** - 100 requests per 15 minutes per IP
  - Applied to all `/api/*` endpoints
  - Prevents brute force and DoS attacks
  
- [x] **Request Timeouts** - All I/O operations have timeouts
  - API calls: 30 seconds (with AbortController)
  - Test execution: 5 minutes (with race condition)
  
- [x] **Environment Validation** - Required variables checked at startup
  - Fails fast if OPENAI_API_KEY or OPENAI_BASE_URL missing
  - Warns if optional ACCESS_TOKEN not set
  
- [x] **LLM Response Validation** - Strict schema validation for AI decisions
  - Validates action field is one of: click, type, navigate, done, fail
  - Validates targetId is positive number for click/type
  - Validates URL for navigate action
  - Validates value length for type action (max 1000 chars)
  
- [x] **Browser Resource Cleanup** - Ensures browser always closes
  - try-finally in agent.run()
  - catch block closes browser on error
  - Prevents orphaned Playwright processes

---

## ✅ MEDIUM PRIORITY ISSUES (FIXED)

- [x] **Error Message Sanitization** - Generic errors to client, detailed logs server-side
  - `sanitizeErrorForClient()` utility prevents info disclosure
  - Stack traces and database details never exposed
  
- [x] **Safe Integer Parsing** - `parseIntSafe()` prevents NaN bugs
  - Returns default value if parsing fails
  - Enforces min/max bounds
  
- [x] **SSE Memory Leak Prevention** - Proper cleanup on client disconnect
  - Removes listeners on close/error
  - Prevents accumulation of leaked event handlers
  
- [x] **Configuration Management** - Centralized config.ts module
  - All settings in one place
  - Type-safe configuration access
  - Easy to override per environment

---

## ⏳ MEDIUM PRIORITY ISSUES (RECOMMENDED)

- [ ] **Structured Logging** - Consider implementing Winston or Pino logger
  - Would provide: log levels, timestamps, JSON formatting
  - Allow shipping logs to external services
  - Better for production monitoring

- [ ] **Database Transactions** - Wrap multi-step saves in transactions
  - Prevents partial saves on failure
  - Ensures data consistency
  
- [ ] **Screenshot Storage** - Move large BLOBs to cloud storage (S3/GCS)
  - Current: Base64 screenshots stored in SQLite
  - Issue: Database grows rapidly (1-5MB per screenshot)
  - Solution: Store in S3, keep only URL in DB

---

## ⏳ LOW PRIORITY ISSUES (RECOMMENDED)

- [ ] **Console.log Removal** - Replace with structured logger
  - 15+ instances throughout codebase
  - Should use logger.info(), logger.debug()

- [ ] **TypeScript Strict Checks** - Review remaining `any` types
  - ~5 error handlers using `catch (error: any)`
  - Should use `catch (error: unknown)` with type guards

- [ ] **Database Path** - Make DB path configurable
  - Currently uses __dirname logic
  - Should use `process.env.DB_PATH` or similar

---

## 🚀 DEPLOYMENT REQUIREMENTS

### Environment Variables Required

```bash
# Required
OPENAI_API_KEY=your_api_key_here
OPENAI_BASE_URL=https://gpt.protium.co.in/api/v1/
OPENAI_MODEL=gemini-2.5-flash

# Recommended for Production
ACCESS_TOKEN=your_strong_password_here
PORT=3000
NODE_ENV=production
ALLOWED_ORIGINS=https://yourdomain.com,https://app.yourdomain.com

# Optional (for Slack/Jira integration)
SLACK_WEBHOOK=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
JIRA_URL=https://your-jira-instance.atlassian.net
JIRA_TOKEN=your_jira_token_here
JIRA_PROJECT=PROJECT_KEY
```

### Pre-Deployment Checklist

- [ ] All required environment variables set
- [ ] API keys rotated (if reusing existing ones)
- [ ] Database is writable and has space for logs/screenshots
- [ ] Port is available and not blocked by firewall
- [ ] CORS origins configured for your frontend domain
- [ ] Rate limits appropriate for your expected load
- [ ] Backup strategy in place for qa-tests.db

### Post-Deployment Verification

- [ ] Server starts without errors
- [ ] Health check: `curl -s http://localhost:3000/ -o /dev/null && echo "OK"`
- [ ] API rate limiting: Send 100+ requests, 101st should be rejected
- [ ] SSRF protection: Try to access `http://localhost:3000/api/run` with internal URL - should fail
- [ ] Error handling: Trigger an error and verify generic message returned
- [ ] Database: Verify test runs are being saved to qa-tests.db

---

## 📊 Security Improvements Summary

| Category | Issue | Status | Severity |
|----------|-------|--------|----------|
| Secrets | Hardcoded API key | ✅ Fixed | CRITICAL |
| Error Handling | No global handlers | ✅ Fixed | CRITICAL |
| Shutdown | No graceful shutdown | ✅ Fixed | CRITICAL |
| Network | SSRF vulnerability | ✅ Fixed | HIGH |
| Input | No validation | ✅ Fixed | HIGH |
| CORS | Allows all origins | ✅ Fixed | HIGH |
| DoS | No rate limiting | ✅ Fixed | HIGH |
| Timeout | No request timeouts | ✅ Fixed | HIGH |
| Config | No env validation | ✅ Fixed | HIGH |
| Injection | Unsafe JSON parsing | ✅ Fixed | HIGH |
| Leaks | Browser not closed | ✅ Fixed | HIGH |
| Info Disclosure | Error details exposed | ✅ Fixed | MEDIUM |
| Memory | SSE listener leaks | ✅ Fixed | MEDIUM |

---

## 📝 Files Modified

- `server.ts` - Added security middleware, error handlers, graceful shutdown
- `agent.ts` - Added request timeouts, response validation, proper cleanup
- `config.ts` - NEW - Centralized configuration management
- `utils.ts` - NEW - Validation and utility functions
- `package.json` - Added express-rate-limit dependency
- `.env` - Removed hardcoded API key (template only)

---

## 🔍 Monitoring Recommendations

In production, monitor:

1. **Error Rate** - Watch for spikes in `unhandledRejection` or `uncaughtException`
2. **Rate Limiting** - Monitor how many requests hit the 429 limit
3. **Test Execution** - Alert if tests timeout (5 minute limit) more than usual
4. **Database Size** - Monitor qa-tests.db growth (consider archiving old runs)
5. **Memory Usage** - Watch for leaks, especially with SSE connections
6. **API Response Times** - LLM API calls should complete within 30 seconds

---

## 🛠️ Future Improvements

1. **Implement request signing** for API authentication (currently just token-based)
2. **Add metrics/telemetry** - Count test passes/failures, track performance
3. **Implement API key rotation** - Automatic or manual rotation schedule
4. **Add webhook support** - Send test results to external systems
5. **Implement test scheduling** - Run tests on a schedule
6. **Add test result comparison** - Detect regressions automatically

---

## Questions?

For deployment issues or security concerns, refer to the PRODUCTION_CHECKLIST.md in the repository.

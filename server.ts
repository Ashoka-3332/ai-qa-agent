import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { QAAgent } from './agent';
import path from 'path';
import { db } from './database';
import { executionEmitter } from './execution-emitter';
import { validateEnvironment, config } from './config';
import { 
    validateRequestInput, 
    validateUrl, 
    validateLLMDecision,
    parseIntSafe,
    sanitizeErrorForClient,
    createTimeoutPromise 
} from './utils';

// Validate environment variables at startup
validateEnvironment();

const app = express();

// Security: Set request size limits
app.use(express.json({ limit: config.maxRequestBodySize }));

// CORS: Restrict origins
const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*';
app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins === '*' || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'x-access-token']
}));

// Rate limiting: Prevent DoS and brute force
const limiter = rateLimit({
    windowMs: config.rateLimitWindowMs,
    max: config.rateLimitMaxRequests,
    message: 'Too many requests, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
});

app.use('/api/', limiter);

// Authentication Middleware
const requireAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    // If no access token is configured on the server, allow all requests (for local dev)
    if (!config.accessToken) {
        return next();
    }

    const headerToken = req.headers['x-access-token'];
    const clientToken = (Array.isArray(headerToken) ? headerToken[0] : headerToken) 
                        || req.body?.token 
                        || req.query?.token;
    
    if (!clientToken || clientToken !== config.accessToken) {
        console.warn(`[Auth] Unauthorized access attempt from IP: ${req.ip}`);
        return res.status(401).json({ error: "Unauthorized: Invalid or missing Dashboard Password" });
    }
    
    next();
};

// Determine the root path depending on if we are running ts-node or compiled JS
const rootPath = __dirname.includes('dist') ? path.join(__dirname, '..') : __dirname;

// Serve static frontend files
app.use(express.static(path.join(rootPath, 'public')));

// Serve the 3D Dashboard as the default page
app.get('/', (req, res) => {
    res.sendFile(path.join(rootPath, 'public', 'index.html'));
});

app.post('/api/generate-plan', requireAuth, async (req, res) => {
    const { url, goal, requirement, type = 'plan' } = req.body;

    // Validate input
    const validation = validateRequestInput({ url, goal, requirement });
    if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
    }

    if (!goal && !requirement) {
        return res.status(400).json({ error: "Please provide a goal or requirement" });
    }

    try {
        let systemPrompt = "";
        let prompt = "";

        if (type === 'case') {
            console.log(`[API] Generating Test Case for: ${goal}`);
            systemPrompt = `You are a Senior QA Test Automation Engineer. Generate a detailed test case in plain text format (easy to read) with the following structure:
Test Case ID: [Generate ID like TC_001]
Title: [Test case title]
Description: [Detailed description]

Preconditions:
- [Precondition 1]
- [Precondition 2]

Test Steps:
1. [Action 1] -> Expected: [Expected Result 1]
2. [Action 2] -> Expected: [Expected Result 2]

Postconditions:
- [Postcondition 1]

Automated Goal (for AI Agent):
[A single clear sentence describing what the AI should do to execute this test]`;
            
            prompt = `Generate a test case based on this requirement:\n${goal}`;
        } else {
            console.log(`[API] Generating Test Plan for Requirement: ${requirement || goal}`);
            systemPrompt = `You are a Senior QA Test Automation Engineer. Your task is to write a detailed, step-by-step test plan based on the provided requirement. Output the plan as a simple, numbered list of actions (e.g., "1. Navigate to...", "2. Type..."). Do NOT output JSON, just plain text.`;
            
            prompt = `Requirement: ${requirement || goal}\n${url ? `Target URL (if applicable): ${url}` : ''}\n\nPlease generate the step-by-step QA Test Plan to accomplish this requirement.`;
        }

        const payload = {
            model: config.openaiModel,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: prompt }
            ],
            temperature: 0.7
        };

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), config.requestTimeout);

        try {
            const response = await fetch(`${config.openaiBaseUrl}chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${config.openaiApiKey}`
                },
                body: JSON.stringify(payload),
                signal: controller.signal
            });

            clearTimeout(timeout);

            if (!response.ok) {
                const err = await response.text();
                throw new Error(`API Error: ${response.status} - ${err}`);
            }

            const data = await response.json();
            let plan = data.choices[0].message.content || "Could not generate plan.";
            
            res.json({ plan: plan.trim() });
        } catch (fetchError: any) {
            clearTimeout(timeout);
            if (fetchError.name === 'AbortError') {
                throw new Error('Request timeout');
            }
            throw fetchError;
        }

    } catch (error: any) {
        console.error("[API] Error generating plan:", error);
        res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
});

app.post('/api/run', requireAuth, async (req, res) => {
    const { url, goal, testPlan, reportBug } = req.body;

    // Validate input
    const validation = validateRequestInput({ url, goal, testPlan });
    if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
    }

    if (!url || !goal) {
        return res.status(400).json({ error: "Please provide both 'url' and 'goal'" });
    }

    try {
        console.log(`[API] Received request for URL: ${url}`);
        const agent = new QAAgent();
        
        // Race against execution timeout
        const result = await Promise.race([
            agent.run(goal, url, testPlan, reportBug || false),
            createTimeoutPromise(config.executionTimeout, 'Test execution')
        ]);
        
        res.json(result);
    } catch (error: any) {
        console.error("[API] Error running agent:", error);
        res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
});

// Get test history
app.get('/api/test-history', requireAuth, async (req, res) => {
    try {
        const limit = parseIntSafe(req.query.limit as string, 20, 1, 100);
        const history = await db.getTestHistory(limit);
        res.json({ success: true, data: history });
    } catch (error: any) {
        console.error("[API] Error fetching test history:", error);
        res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
});

// Get specific test run
app.get('/api/test-run/:id', requireAuth, async (req, res) => {
    try {
        const id = parseIntSafe(req.params.id as string, -1, 0);
        if (id < 0) {
            return res.status(400).json({ error: 'Invalid test run ID' });
        }
        const testRun = await db.getTestRunById(id);
        if (!testRun) {
            return res.status(404).json({ error: 'Test run not found' });
        }
        res.json({ success: true, data: testRun });
    } catch (error: any) {
        console.error("[API] Error fetching test run:", error);
        res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
});

// Get performance metrics for a test
app.get('/api/performance-metrics/:testRunId', requireAuth, async (req, res) => {
    try {
        const testRunId = parseIntSafe(req.params.testRunId as string, -1, 0);
        if (testRunId < 0) {
            return res.status(400).json({ error: 'Invalid test run ID' });
        }
        const metrics = await db.getPerformanceMetrics(testRunId);
        res.json({ success: true, data: metrics });
    } catch (error: any) {
        console.error("[API] Error fetching performance metrics:", error);
        res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
});

// Get test templates
app.get('/api/test-templates', requireAuth, async (req, res) => {
    try {
        const templates = await db.getTestTemplates();
        res.json({ success: true, data: templates });
    } catch (error: any) {
        console.error("[API] Error fetching test templates:", error);
        res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
});

// Save test template
app.post('/api/test-template', requireAuth, async (req, res) => {
    const { name, description, url, goal, testPlan } = req.body;

    // Validate input
    const validation = validateRequestInput({ url, goal, testPlan });
    if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
    }

    if (!name || !url || !goal) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    if (name.length > 200) {
        return res.status(400).json({ error: 'Template name must be less than 200 characters' });
    }

    try {
        await db.saveTestTemplate(name, description, url, goal, testPlan);
        res.json({ success: true, message: 'Template saved' });
    } catch (error: any) {
        console.error("[API] Error saving test template:", error);
        res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
});

// Server-Sent Events (SSE) for real-time execution updates
// Note: We use query params for SSE because EventSource doesn't support custom headers
app.get('/api/test-events', requireAuth, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    const cleanupAndClose = () => {
        try {
            executionEmitter.removeListener('execution-event', handler);
            res.end();
        } catch (error) {
            console.error('[SSE] Error during cleanup:', error);
        }
    };

    const handler = (event: any) => {
        try {
            res.write(`data: ${JSON.stringify(event)}\n\n`);
        } catch (error) {
            console.error('[SSE] Error writing to client:', error);
            cleanupAndClose();
        }
    };

    executionEmitter.on('execution-event', handler);

    req.on('close', cleanupAndClose);
    req.on('error', (error) => {
        console.error('[SSE] Request error:', error);
        cleanupAndClose();
    });
});

// Global error handlers
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    // In production, you might want to send this to an error tracking service
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    process.exit(1);
});

// Start server with error handling
const PORT = config.port;
const server = app.listen(PORT, () => {
    console.log(`🚀 QA Platform API running on http://localhost:${PORT}`);
    console.log(`📝 Environment: ${config.nodeEnv}`);
});

server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use. Please use a different port.`);
    } else {
        console.error('❌ Server error:', err);
    }
    process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('📛 SIGTERM received, starting graceful shutdown...');
    
    server.close(async () => {
        try {
            await db.close();
            console.log('✅ Database closed');
        } catch (error) {
            console.error('❌ Error closing database:', error);
        }
        process.exit(0);
    });

    // Force shutdown after 30 seconds
    setTimeout(() => {
        console.error('❌ Forced shutdown after 30 seconds');
        process.exit(1);
    }, 30000);
});

process.on('SIGINT', async () => {
    console.log('📛 SIGINT received, starting graceful shutdown...');
    
    server.close(async () => {
        try {
            await db.close();
            console.log('✅ Database closed');
        } catch (error) {
            console.error('❌ Error closing database:', error);
        }
        process.exit(0);
    });

    // Force shutdown after 30 seconds
    setTimeout(() => {
        console.error('❌ Forced shutdown after 30 seconds');
        process.exit(1);
    }, 30000);
});

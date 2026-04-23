import express from 'express';
import cors from 'cors';
import { QAAgent } from './agent';
import * as dotenv from 'dotenv';
import path from 'path';
import { db } from './database';
import { executionEmitter } from './execution-emitter';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Serve the Live Execution Dashboard as the default page (MUST BE BEFORE static middleware)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', '3d-execution.html'));
});

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/generate-plan', async (req, res) => {
    const { url, goal, requirement, type = 'plan' } = req.body;

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
            model: process.env.OPENAI_MODEL || "gpt-4-turbo",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: prompt }
            ],
            temperature: 0.7
        };

        const response = await fetch(`${process.env.OPENAI_BASE_URL}chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`API Error: ${response.status} - ${err}`);
        }

        const data = await response.json();
        let plan = data.choices[0].message.content || "Could not generate plan.";
        
        res.json({ plan: plan.trim() });

    } catch (error: any) {
        console.error("[API] Error generating plan:", error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/run', async (req, res) => {
    const { url, goal, testPlan, reportBug } = req.body;

    if (!url || !goal) {
        return res.status(400).json({ error: "Please provide both 'url' and 'goal'" });
    }

    try {
        console.log(`[API] Received request for URL: ${url}`);
        const agent = new QAAgent();
        const result = await agent.run(goal, url, testPlan, reportBug || false);
        
        res.json(result);
    } catch (error: any) {
        console.error("[API] Error running agent:", error);
        res.status(500).json({ error: error.message });
    }
});

// Get test history
app.get('/api/test-history', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit as string) || 20;
        const history = await db.getTestHistory(limit);
        res.json({ success: true, data: history });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Get specific test run
app.get('/api/test-run/:id', async (req, res) => {
    try {
        const testRun = await db.getTestRunById(parseInt(req.params.id));
        if (!testRun) {
            return res.status(404).json({ error: 'Test run not found' });
        }
        res.json({ success: true, data: testRun });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Get performance metrics for a test
app.get('/api/performance-metrics/:testRunId', async (req, res) => {
    try {
        const metrics = await db.getPerformanceMetrics(parseInt(req.params.testRunId));
        res.json({ success: true, data: metrics });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Get test templates
app.get('/api/test-templates', async (req, res) => {
    try {
        const templates = await db.getTestTemplates();
        res.json({ success: true, data: templates });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Save test template
app.post('/api/test-template', async (req, res) => {
    const { name, description, url, goal, testPlan } = req.body;

    if (!name || !url || !goal) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        await db.saveTestTemplate(name, description, url, goal, testPlan);
        res.json({ success: true, message: 'Template saved' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Server-Sent Events (SSE) for real-time execution updates
app.get('/api/test-events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    const handler = (event: any) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    executionEmitter.on('execution-event', handler);

    req.on('close', () => {
        executionEmitter.removeListener('execution-event', handler);
        res.end();
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 QA Platform API running on http://localhost:${PORT}`);
});

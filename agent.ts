import { OpenAI } from 'openai';
import { BrowserController } from './browser';
import { db, TestRun } from './database';
import { bugReporter } from './bug-reporter';
import { executionEmitter } from './execution-emitter';
import { validateEnvironment, config } from './config';
import { validateLLMDecision, validateUrl, delay, createTimeoutPromise } from './utils';

// Validate environment at module load time
validateEnvironment();

// Define exactly what the LLM should output to ensure structured, safe actions
const systemPrompt = `You are an Autonomous QA Engineer testing a web application.
Your goal is to fulfill a given high-level instruction (e.g., "Add an item to the cart").
You are provided with a simplified view of the current webpage (a list of interactable elements with IDs, tags, text, etc.).

Based on the current webpage state and your goal, you MUST reply with a JSON object in exactly this format:
{
  "thought": "I need to click the 'Add to Cart' button to proceed.",
  "action": "click" | "type" | "navigate" | "done" | "fail",
  "targetId": 123, 
  "value": "text to type if action is 'type'",
  "url": "url to navigate to if action is 'navigate'"
}

Rules:
- If your action is 'done', it means the goal is achieved.
- If your action is 'fail', it means you cannot achieve the goal (e.g., a required button is missing).
- "targetId" must refer to an ID from the provided element list.
`;

export class QAAgent {
    private openai: OpenAI;
    private browser: BrowserController;
    private maxSteps: number = 10;
    private stepDelay: number = 2000; // milliseconds

    constructor() {
        this.openai = new OpenAI({ 
            apiKey: config.openaiApiKey,
            baseURL: config.openaiBaseUrl 
        });
        this.browser = new BrowserController();
    }

    async run(goal: string, startUrl: string, testPlan: string = "", reportBug: boolean = false): Promise<{ success: boolean; logs: string[]; screenshot?: string; message: string; metrics?: any; testRunId?: number }> {
        const logs: string[] = [];
        const log = (msg: string) => {
            console.log(msg);
            logs.push(msg);
        };

        const startTime = Date.now();
        const metrics: any[] = [];
        let testRunId: number | undefined;

        try {
            log(`🚀 Starting QA Agent: "${goal}"`);
            executionEmitter.emitLog(`🚀 Starting QA Agent: "${goal}"`);
            
            if (testPlan) {
                log(`📋 Using provided Test Plan:\n${testPlan}`);
                executionEmitter.emitLog(`📋 Using provided Test Plan`);
            }
            
            await this.browser.init();
            await this.browser.navigate(startUrl);

        let step = 0;
        let isDone = false;
        let success = false;
        let finalMessage = "";
        const history: string[] = [];
        const stepStartTimes: { [key: number]: number } = {};

        while (!isDone && step < this.maxSteps) {
            stepStartTimes[step] = Date.now();
            log(`\n--- Step ${step + 1} ---`);
            executionEmitter.emitLog(`--- Step ${step + 1} ---`);
            
            // 1. Observe
            const elements = await this.browser.getInteractableElements();
            log(`Observed ${elements.length} interactable elements.`);
            executionEmitter.emitLog(`Observed ${elements.length} interactable elements.`);

            // 2. Think (Ask LLM)
            const prompt = `
Goal: ${goal}
Current Page URL: ${this.browser.page?.url()}

Test Plan to Follow:
${testPlan ? testPlan : "No specific plan provided. Figure it out step-by-step to achieve the goal."}

Past Actions Taken:
${history.length > 0 ? history.map((h, i) => `${i + 1}. ${h}`).join('\n') : "None yet."}

Interactable Elements: 
${JSON.stringify(elements, null, 2)}

Look at the Past Actions Taken and the Test Plan. Determine the very next logical step. Do NOT repeat an action if it was successful. If a text field is already filled with the correct value, move on to the next step.

What is the next step? Ensure your reply is ONLY valid JSON.
`;

            const payload = {
                model: config.openaiModel,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: prompt }
                ]
            };

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), config.requestTimeout);

            let response;
            try {
                response = await fetch(`${config.openaiBaseUrl}chat/completions`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${config.openaiApiKey}`
                    },
                    body: JSON.stringify(payload),
                    signal: controller.signal
                });
            } finally {
                clearTimeout(timeout);
            }

            if (!response.ok) {
                const err = `API Error: ${response.status} - ${await response.text()}`;
                log(`❌ ${err}`);
                finalMessage = err;
                break;
            }

            const data = await response.json();
            
            // Extract the response, strip out any markdown code blocks if the model wrapped the JSON
            let responseText = data.choices[0].message.content || "{}";
            responseText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
            
            try {
                const decision = JSON.parse(responseText);
                
                // Validate LLM decision schema
                const validation = validateLLMDecision(decision);
                if (!validation.valid) {
                    log(`❌ Invalid LLM decision: ${validation.error}`);
                    finalMessage = "Invalid decision from LLM.";
                    break;
                }

                const validatedDecision = validation.data!;
                log(`🤔 Thought: ${validatedDecision.thought}`);
                log(`🎬 Action: ${validatedDecision.action} on Target: ${validatedDecision.targetId || 'N/A'}`);
                
                executionEmitter.emitLog(`🤔 Thought: ${validatedDecision.thought}`);
                executionEmitter.emitAction(validatedDecision.action, validatedDecision.targetId || 0, `${validatedDecision.action} on Target ${validatedDecision.targetId || 'N/A'}`, step + 1, this.maxSteps);

                // 3. Act
                const actionStartTime = Date.now();
                switch (validatedDecision.action) {
                    case 'click':
                        history.push(`Clicked element ${validatedDecision.targetId}`);
                        await this.browser.clickElement(validatedDecision.targetId!);
                        const clickDuration = Date.now() - actionStartTime;
                        metrics.push({ action: `click-${validatedDecision.targetId}`, duration: clickDuration });
                        executionEmitter.emitMetric(`click-${validatedDecision.targetId}`, clickDuration);
                        break;
                    case 'type':
                        history.push(`Typed "${validatedDecision.value}" into element ${validatedDecision.targetId}`);
                        await this.browser.typeElement(validatedDecision.targetId!, validatedDecision.value!);
                        const typeDuration = Date.now() - actionStartTime;
                        metrics.push({ action: `type-${validatedDecision.targetId}`, duration: typeDuration });
                        executionEmitter.emitMetric(`type-${validatedDecision.targetId}`, typeDuration);
                        break;
                    case 'navigate':
                        // URL already validated in validateLLMDecision
                        history.push(`Navigated to ${validatedDecision.url}`);
                        await this.browser.navigate(validatedDecision.url!);
                        const navDuration = Date.now() - actionStartTime;
                        metrics.push({ action: `navigate`, duration: navDuration });
                        executionEmitter.emitMetric(`navigate`, navDuration);
                        break;
                    case 'done':
                        log("✅ Goal Achieved successfully!");
                        executionEmitter.emitLog("✅ Goal Achieved successfully!");
                        success = true;
                        isDone = true;
                        finalMessage = "Agent successfully achieved the goal.";
                        break;
                    case 'fail':
                        log(`❌ Agent declared failure: ${validatedDecision.thought}`);
                        executionEmitter.emitLog(`❌ Agent declared failure: ${validatedDecision.thought}`);
                        isDone = true;
                        finalMessage = "Agent could not achieve the goal.";
                        break;
                }
            } catch (e: any) {
                log(`❌ Failed to parse LLM response or execute action: ${e.message}`);
                log(`Raw response: ${responseText}`);
                finalMessage = "Internal Agent Error.";
                break;
            }

            // Small delay to let the page settle
            await delay(this.stepDelay);
            step++;
        }

        if (step >= this.maxSteps) {
            log("⚠️ Agent reached max steps without completing the goal.");
            finalMessage = "Agent timed out (max steps reached).";
        }

        // 4. Capture final state for the UI
        let screenshotBase64 = undefined;
        if (this.browser.page) {
             const buffer = await this.browser.page.screenshot();
             screenshotBase64 = buffer.toString('base64');
             executionEmitter.emitScreenshot(screenshotBase64, "Final execution state");
        }

        await this.browser.close();
        log("🏁 Test Run Complete.");
        executionEmitter.emitLog("🏁 Test Run Complete.");

        const totalDuration = Date.now() - startTime;
        executionEmitter.emitComplete(success, finalMessage, totalDuration);

        // 5. Save test run to database
        try {
            const testRun: TestRun = {
                timestamp: new Date().toISOString(),
                url: startUrl,
                goal: goal,
                testPlan: testPlan,
                success: success,
                duration: totalDuration,
                screenshotBase64: screenshotBase64,
                logs: logs.join('\n')
            };
            
            testRunId = await db.saveTestRun(testRun);
            log(`✓ Test run saved with ID: ${testRunId}`);

            // Save performance metrics
            for (const metric of metrics) {
                await db.savePerformanceMetric(testRunId, metric.action, metric.duration);
            }
        } catch (dbErr: any) {
            log(`⚠️ Could not save to database: ${dbErr.message}`);
        }

        // 6. Report bug if test failed and reporting is enabled
        if (!success && reportBug) {
            try {
                const errorLog = logs.filter(l => l.includes('❌') || l.includes('Error')).join('\n');
                
                // Try Slack
                if (process.env.SLACK_WEBHOOK) {
                    await bugReporter.reportToSlack(
                        `Test Failed: ${goal.substring(0, 50)}...`,
                        bugReporter.generateBugSummary(startUrl, goal, errorLog, totalDuration, new Date().toISOString()),
                        false,
                        totalDuration,
                        logs
                    );
                    log('✓ Bug report sent to Slack');
                }

                // Try Jira
                if (process.env.JIRA_URL && process.env.JIRA_TOKEN) {
                    const jiraResult = await bugReporter.reportToJira(
                        `Test Failed: ${goal.substring(0, 50)}...`,
                        bugReporter.generateBugSummary(startUrl, goal, errorLog, totalDuration, new Date().toISOString()),
                        screenshotBase64
                    );
                    if (jiraResult.success) {
                        log(`✓ Jira issue created: ${jiraResult.issueKey}`);
                    }
                }
            } catch (reportErr: any) {
                log(`⚠️ Could not send bug report: ${reportErr.message}`);
            }
        }

            return {
                success,
                logs,
                screenshot: screenshotBase64,
                message: finalMessage,
                metrics: metrics,
                testRunId: testRunId
            };
        } catch (error: any) {
            // Ensure browser is always closed, even on error
            try {
                await this.browser.close();
            } catch (closeErr) {
                console.error('Error closing browser:', closeErr);
            }
            
            const totalDuration = Date.now() - startTime;
            const errorMessage = `Test execution failed: ${error.message}`;
            log(`❌ ${errorMessage}`);
            
            return {
                success: false,
                logs,
                message: errorMessage,
                metrics: metrics,
                testRunId: testRunId
            };
        } finally {
            // Final cleanup - ensure browser is closed
            try {
                await this.browser.close();
            } catch (error) {
                // Silently fail if already closed
            }
        }
    }
}

import { OpenAI } from 'openai';
import { BrowserController } from './browser';
import * as dotenv from 'dotenv';
import { db, TestRun } from './database';
import { bugReporter } from './bug-reporter';
import { executionEmitter } from './execution-emitter';

dotenv.config();

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

    constructor() {
        this.openai = new OpenAI({ 
            apiKey: process.env.OPENAI_API_KEY,
            baseURL: process.env.OPENAI_BASE_URL 
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
                model: process.env.OPENAI_MODEL || "gpt-4-turbo",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: prompt }
                ]
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
                log(`🤔 Thought: ${decision.thought}`);
                log(`🎬 Action: ${decision.action} on Target: ${decision.targetId || 'N/A'}`);
                
                executionEmitter.emitLog(`🤔 Thought: ${decision.thought}`);
                executionEmitter.emitAction(decision.action, decision.targetId || 0, `${decision.action} on Target ${decision.targetId || 'N/A'}`, step + 1, this.maxSteps);

                // 3. Act
                const actionStartTime = Date.now();
                switch (decision.action) {
                    case 'click':
                        history.push(`Clicked element ${decision.targetId}`);
                        await this.browser.clickElement(decision.targetId);
                        const clickDuration = Date.now() - actionStartTime;
                        metrics.push({ action: `click-${decision.targetId}`, duration: clickDuration });
                        executionEmitter.emitMetric(`click-${decision.targetId}`, clickDuration);
                        break;
                    case 'type':
                        history.push(`Typed "${decision.value}" into element ${decision.targetId}`);
                        await this.browser.typeElement(decision.targetId, decision.value);
                        const typeDuration = Date.now() - actionStartTime;
                        metrics.push({ action: `type-${decision.targetId}`, duration: typeDuration });
                        executionEmitter.emitMetric(`type-${decision.targetId}`, typeDuration);
                        break;
                    case 'navigate':
                        history.push(`Navigated to ${decision.url}`);
                        await this.browser.navigate(decision.url);
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
                        log(`❌ Agent declared failure: ${decision.thought}`);
                        executionEmitter.emitLog(`❌ Agent declared failure: ${decision.thought}`);
                        isDone = true;
                        finalMessage = "Agent could not achieve the goal.";
                        break;
                    default:
                        log(`⚠️ Unknown action received: ${decision.action}`);
                        executionEmitter.emitLog(`⚠️ Unknown action received: ${decision.action}`);
                        isDone = true;
                        finalMessage = "Agent returned an unknown action.";
                }
            } catch (e: any) {
                log(`❌ Failed to parse LLM response or execute action: ${e.message}`);
                log(`Raw response: ${responseText}`);
                finalMessage = "Internal Agent Error.";
                break;
            }

            // Small delay to let the page settle
            await new Promise(r => setTimeout(r, 2000));
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
    }
}

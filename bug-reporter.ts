import axios from 'axios';

export interface BugReportConfig {
    jiraUrl?: string;
    jiraToken?: string;
    jiraProject?: string;
    slackWebhook?: string;
}

export class BugReporter {
    private config: BugReportConfig;

    constructor(config: BugReportConfig = {}) {
        this.config = config;
    }

    /**
     * Report a test failure to Jira
     */
    async reportToJira(
        title: string,
        description: string,
        screenshotBase64?: string
    ): Promise<{ issueKey?: string; success: boolean; message: string }> {
        if (!this.config.jiraUrl || !this.config.jiraToken || !this.config.jiraProject) {
            return { success: false, message: 'Jira configuration not provided' };
        }

        try {
            const issue = {
                fields: {
                    project: { key: this.config.jiraProject },
                    summary: `[QA AGENT] ${title}`,
                    description: description,
                    issuetype: { name: 'Bug' },
                    priority: { name: 'High' }
                }
            };

            const response = await axios.post(`${this.config.jiraUrl}/rest/api/3/issues`, issue, {
                headers: {
                    Authorization: `Bearer ${this.config.jiraToken}`,
                    'Content-Type': 'application/json'
                }
            });

            const issueKey = response.data.key;

            // If screenshot provided, attach it
            if (screenshotBase64) {
                await this.attachScreenshotToJira(issueKey, screenshotBase64);
            }

            return {
                success: true,
                issueKey: issueKey,
                message: `Bug report created: ${issueKey}`
            };
        } catch (error: any) {
            return {
                success: false,
                message: `Failed to report to Jira: ${error.message}`
            };
        }
    }

    /**
     * Attach screenshot to Jira issue
     */
    private async attachScreenshotToJira(issueKey: string, screenshotBase64: string): Promise<void> {
        if (!this.config.jiraUrl || !this.config.jiraToken) return;

        try {
            const buffer = Buffer.from(screenshotBase64, 'base64');

            const formData = new FormData();
            const blob = new Blob([buffer], { type: 'image/png' });
            formData.append('file', blob, 'screenshot.png');

            await axios.post(`${this.config.jiraUrl}/rest/api/3/issue/${issueKey}/attachments`, formData, {
                headers: {
                    Authorization: `Bearer ${this.config.jiraToken}`,
                    'X-Atlassian-Token': 'no-check'
                }
            });
        } catch (error: any) {
            console.error('Failed to attach screenshot to Jira:', error.message);
        }
    }

    /**
     * Report a test failure to Slack
     */
    async reportToSlack(
        title: string,
        description: string,
        success: boolean,
        duration: number,
        logs: string[],
        screenshotUrl?: string
    ): Promise<{ success: boolean; message: string }> {
        if (!this.config.slackWebhook) {
            return { success: false, message: 'Slack webhook not configured' };
        }

        try {
            const color = success ? '#00ff88' : '#ff0000';
            const status = success ? '✅ PASSED' : '❌ FAILED';

            const payload = {
                attachments: [
                    {
                        fallback: `QA Test ${status}`,
                        color: color,
                        title: `QA Agent Test Report: ${title}`,
                        text: description,
                        fields: [
                            {
                                title: 'Status',
                                value: status,
                                short: true
                            },
                            {
                                title: 'Duration',
                                value: `${duration}ms`,
                                short: true
                            },
                            {
                                title: 'Execution Log',
                                value: logs.slice(-5).join('\n'),
                                short: false
                            }
                        ],
                        image_url: screenshotUrl,
                        footer: 'AI Autonomous QA Platform',
                        ts: Math.floor(Date.now() / 1000)
                    }
                ]
            };

            await axios.post(this.config.slackWebhook, payload);

            return {
                success: true,
                message: 'Report sent to Slack'
            };
        } catch (error: any) {
            return {
                success: false,
                message: `Failed to report to Slack: ${error.message}`
            };
        }
    }

    /**
     * Generate a full bug report summary
     */
    generateBugSummary(
        url: string,
        goal: string,
        errorLog: string,
        duration: number,
        timestamp: string
    ): string {
        return `
*Test Execution Failed*

**Target URL:** ${url}
**Goal:** ${goal}
**Timestamp:** ${timestamp}
**Duration:** ${duration}ms

*Error Details:*
${errorLog}

*Reported by:* AI Autonomous QA Agent v3.0
        `.trim();
    }
}

export const bugReporter = new BugReporter({
    jiraUrl: process.env.JIRA_URL,
    jiraToken: process.env.JIRA_TOKEN,
    jiraProject: process.env.JIRA_PROJECT,
    slackWebhook: process.env.SLACK_WEBHOOK
});

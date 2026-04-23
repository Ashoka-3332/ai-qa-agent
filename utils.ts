/**
 * Utility functions for validation, sanitization, and error handling
 */

/**
 * Validate and sanitize a URL to prevent SSRF attacks
 */
export function validateUrl(urlString: string): { valid: boolean; error?: string } {
    try {
        const url = new URL(urlString);
        
        // Only allow http and https protocols
        if (!['http:', 'https:'].includes(url.protocol)) {
            return { valid: false, error: 'Only HTTP and HTTPS protocols are allowed' };
        }

        // Prevent navigation to localhost, internal IPs, or private ranges
        const blockedHostPatterns = [
            /^localhost$/i,
            /^127\./,
            /^192\.168\./,
            /^10\./,
            /^172\.(1[6-9]|2[0-9]|3[01])\./,
            /^::1$/,
            /^0\.0\.0\.0$/,
            /^169\.254\./, // Link-local addresses
        ];

        if (blockedHostPatterns.some(pattern => pattern.test(url.hostname))) {
            return { valid: false, error: 'Internal/private network URLs are not allowed' };
        }

        return { valid: true };
    } catch (error) {
        return { valid: false, error: 'Invalid URL format' };
    }
}

/**
 * Validate request input parameters
 */
export function validateRequestInput(params: {
    url?: string;
    goal?: string;
    testPlan?: string;
    requirement?: string;
}): { valid: boolean; error?: string } {
    const { url, goal, testPlan, requirement } = params;

    if (url) {
        const urlValidation = validateUrl(url);
        if (!urlValidation.valid) {
            return { valid: false, error: urlValidation.error };
        }
    }

    if (goal && goal.length > 5000) {
        return { valid: false, error: 'Goal must be less than 5000 characters' };
    }

    if (testPlan && testPlan.length > 10000) {
        return { valid: false, error: 'Test plan must be less than 10000 characters' };
    }

    if (requirement && requirement.length > 5000) {
        return { valid: false, error: 'Requirement must be less than 5000 characters' };
    }

    return { valid: true };
}

/**
 * Sanitize error message to prevent information disclosure
 * Only return generic error to client, log detailed error internally
 */
export function sanitizeErrorForClient(error: unknown): string {
    // Log the full error internally
    console.error('Detailed error:', error);
    
    // Return generic message to client
    return 'An error occurred processing your request';
}

/**
 * Parse integer safely with validation
 */
export function parseIntSafe(value: string | undefined, defaultValue: number, min: number = 1, max: number = 1000): number {
    if (!value) return defaultValue;
    
    const parsed = parseInt(value);
    
    if (isNaN(parsed) || parsed < min || parsed > max) {
        return defaultValue;
    }
    
    return parsed;
}

/**
 * Sleep/delay helper
 */
export function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Validate JSON response from LLM
 */
export interface LLMDecision {
    thought: string;
    action: 'click' | 'type' | 'navigate' | 'done' | 'fail';
    targetId?: number;
    value?: string;
    url?: string;
}

export function validateLLMDecision(decision: unknown): { valid: boolean; data?: LLMDecision; error?: string } {
    if (!decision || typeof decision !== 'object') {
        return { valid: false, error: 'Decision must be an object' };
    }

    const d = decision as any;

    // Validate required fields
    if (!d.thought || typeof d.thought !== 'string' || d.thought.length === 0) {
        return { valid: false, error: 'Invalid thought field' };
    }

    if (!d.action || !['click', 'type', 'navigate', 'done', 'fail'].includes(d.action)) {
        return { valid: false, error: 'Invalid action field' };
    }

    // Validate optional fields based on action
    if (d.action === 'click' || d.action === 'type') {
        if (typeof d.targetId !== 'number' || d.targetId < 0) {
            return { valid: false, error: 'Invalid targetId for action' };
        }
    }

    if (d.action === 'type') {
        if (!d.value || typeof d.value !== 'string' || d.value.length > 1000) {
            return { valid: false, error: 'Invalid value for type action' };
        }
    }

    if (d.action === 'navigate') {
        if (!d.url || typeof d.url !== 'string') {
            return { valid: false, error: 'Invalid URL for navigate action' };
        }
        
        const urlValidation = validateUrl(d.url);
        if (!urlValidation.valid) {
            return { valid: false, error: urlValidation.error };
        }
    }

    return { valid: true, data: d as LLMDecision };
}

/**
 * Escape special characters for Slack/Markdown
 */
export function escapeMarkdown(text: string): string {
    return text
        .replace(/[\[\]()]/g, '\\$&')
        .replace(/[*_`~]/g, '\\$&');
}

/**
 * Create timeout promise for race conditions
 */
export function createTimeoutPromise<T>(ms: number, label: string = 'Operation'): Promise<T> {
    return new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms)
    );
}

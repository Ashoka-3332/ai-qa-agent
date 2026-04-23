import * as dotenv from 'dotenv';

dotenv.config();

/**
 * Validate required environment variables at startup
 * Fails fast if critical configuration is missing
 */
export function validateEnvironment() {
    const requiredVars = [
        'OPENAI_API_KEY',
        'OPENAI_BASE_URL',
    ];

    const missingVars = requiredVars.filter(varName => !process.env[varName]);

    if (missingVars.length > 0) {
        const errorMessage = `Missing required environment variables: ${missingVars.join(', ')}. Check your .env file.`;
        console.error(`❌ ${errorMessage}`);
        throw new Error(errorMessage);
    }

    // Warn if optional security variables are not set
    if (!process.env.ACCESS_TOKEN) {
        console.warn('⚠️  WARNING: ACCESS_TOKEN not set. All requests will be allowed (dev mode only)');
    }
}

export const config = {
    port: parseInt(process.env.PORT || '3000'),
    openaiApiKey: process.env.OPENAI_API_KEY!,
    openaiBaseUrl: process.env.OPENAI_BASE_URL?.endsWith('/') ? process.env.OPENAI_BASE_URL : `${process.env.OPENAI_BASE_URL}/`,
    openaiModel: process.env.OPENAI_MODEL || 'gpt-4-turbo',
    accessToken: process.env.ACCESS_TOKEN,
    nodeEnv: process.env.NODE_ENV || 'development',
    
    // Security limits
    maxRequestBodySize: '1mb',
    maxGoalLength: 5000,
    maxTestPlanLength: 10000,
    requestTimeout: 30000, // 30 seconds
    executionTimeout: 5 * 60 * 1000, // 5 minutes
    
    // Rate limiting
    rateLimitWindowMs: 15 * 60 * 1000, // 15 minutes
    rateLimitMaxRequests: 100,
};

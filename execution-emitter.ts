import { EventEmitter } from 'events';

export interface ExecutionEvent {
    type: 'log' | 'action' | 'screenshot' | 'complete' | 'error' | 'metric';
    timestamp: string;
    message?: string;
    action?: string;
    targetId?: number;
    screenshot?: string;
    success?: boolean;
    duration?: number;
    step?: number;
    totalSteps?: number;
}

export class ExecutionEmitter extends EventEmitter {
    private currentExecutionId: string;

    constructor() {
        super();
        this.currentExecutionId = '';
    }

    setExecutionId(id: string) {
        this.currentExecutionId = id;
    }

    emitLog(message: string) {
        const event: ExecutionEvent = {
            type: 'log',
            timestamp: new Date().toISOString(),
            message
        };
        this.emit('execution-event', event);
    }

    emitAction(action: string, targetId: number, message: string, step: number, totalSteps: number) {
        const event: ExecutionEvent = {
            type: 'action',
            timestamp: new Date().toISOString(),
            action,
            targetId,
            message,
            step,
            totalSteps
        };
        this.emit('execution-event', event);
    }

    emitScreenshot(screenshotBase64: string, message?: string) {
        const event: ExecutionEvent = {
            type: 'screenshot',
            timestamp: new Date().toISOString(),
            screenshot: screenshotBase64,
            message
        };
        this.emit('execution-event', event);
    }

    emitMetric(action: string, duration: number) {
        const event: ExecutionEvent = {
            type: 'metric',
            timestamp: new Date().toISOString(),
            action,
            duration
        };
        this.emit('execution-event', event);
    }

    emitComplete(success: boolean, message: string, duration: number) {
        const event: ExecutionEvent = {
            type: 'complete',
            timestamp: new Date().toISOString(),
            success,
            message,
            duration
        };
        this.emit('execution-event', event);
    }

    emitError(message: string) {
        const event: ExecutionEvent = {
            type: 'error',
            timestamp: new Date().toISOString(),
            message
        };
        this.emit('execution-event', event);
    }
}

export const executionEmitter = new ExecutionEmitter();

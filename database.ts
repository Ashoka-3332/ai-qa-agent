import sqlite3 from 'sqlite3';
import path from 'path';

const rootPath = __dirname.includes('dist') ? path.join(__dirname, '..') : __dirname;
const dbPath = path.join(rootPath, 'qa-tests.db');

export interface TestRun {
    id?: number;
    timestamp: string;
    url: string;
    goal: string;
    testPlan: string;
    success: boolean;
    duration: number;
    screenshotBase64?: string;
    logs: string;
}

export class Database {
    private db: sqlite3.Database;

    constructor() {
        this.db = new sqlite3.Database(dbPath);
        this.initDatabase();
    }

    private initDatabase() {
        this.db.run(`
            CREATE TABLE IF NOT EXISTS test_runs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                url TEXT NOT NULL,
                goal TEXT NOT NULL,
                testPlan TEXT,
                success INTEGER NOT NULL,
                duration INTEGER NOT NULL,
                screenshot BLOB,
                logs TEXT NOT NULL
            )
        `);

        this.db.run(`
            CREATE TABLE IF NOT EXISTS test_templates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                description TEXT,
                url TEXT NOT NULL,
                goal TEXT NOT NULL,
                testPlan TEXT
            )
        `);

        this.db.run(`
            CREATE TABLE IF NOT EXISTS performance_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                testRunId INTEGER NOT NULL,
                actionName TEXT NOT NULL,
                duration INTEGER NOT NULL,
                FOREIGN KEY(testRunId) REFERENCES test_runs(id)
            )
        `);
    }

    saveTestRun(testRun: TestRun): Promise<number> {
        return new Promise((resolve, reject) => {
            this.db.run(
                `INSERT INTO test_runs (timestamp, url, goal, testPlan, success, duration, screenshot, logs)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    testRun.timestamp,
                    testRun.url,
                    testRun.goal,
                    testRun.testPlan || '',
                    testRun.success ? 1 : 0,
                    testRun.duration,
                    testRun.screenshotBase64 ? Buffer.from(testRun.screenshotBase64, 'base64') : null,
                    testRun.logs
                ],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    }

    /**
     * Save test run with metrics in a single atomic transaction
     * Prevents partial saves if metrics fail
     */
    saveTestRunWithMetrics(testRun: TestRun, metrics: Array<{ action: string; duration: number }>): Promise<number> {
        return new Promise((resolve, reject) => {
            const db = this.db;
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');
                
                // Save test run
                db.run(
                    `INSERT INTO test_runs (timestamp, url, goal, testPlan, success, duration, screenshot, logs)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        testRun.timestamp,
                        testRun.url,
                        testRun.goal,
                        testRun.testPlan || '',
                        testRun.success ? 1 : 0,
                        testRun.duration,
                        testRun.screenshotBase64 ? Buffer.from(testRun.screenshotBase64, 'base64') : null,
                        testRun.logs
                    ],
                    function(err: any) {
                        if (err) {
                            db.run('ROLLBACK');
                            reject(err);
                            return;
                        }
                        
                        const testRunId = (this as any).lastID as number;
                        
                        // Save metrics
                        let completed = 0;
                        if (metrics.length === 0) {
                            db.run('COMMIT', (commitErr: any) => {
                                if (commitErr) reject(commitErr);
                                else resolve(testRunId);
                            });
                            return;
                        }
                        
                        metrics.forEach((metric) => {
                            db.run(
                                `INSERT INTO performance_metrics (testRunId, actionName, duration) VALUES (?, ?, ?)`,
                                [testRunId, metric.action, metric.duration],
                                (metricErr: any) => {
                                    if (metricErr) {
                                        db.run('ROLLBACK');
                                        reject(metricErr);
                                        return;
                                    }
                                    
                                    completed++;
                                    if (completed === metrics.length) {
                                        db.run('COMMIT', (commitErr: any) => {
                                            if (commitErr) reject(commitErr);
                                            else resolve(testRunId);
                                        });
                                    }
                                }
                            );
                        });
                    }
                );
            });
        });
    }

    getTestHistory(limit: number = 20): Promise<TestRun[]> {
        return new Promise((resolve, reject) => {
            this.db.all(
                `SELECT id, timestamp, url, goal, testPlan, success, duration, logs FROM test_runs 
                 ORDER BY timestamp DESC LIMIT ?`,
                [limit],
                (err, rows: any[]) => {
                    if (err) reject(err);
                    else {
                        const results = rows.map(row => ({
                            ...row,
                            success: Boolean(row.success)
                        }));
                        resolve(results);
                    }
                }
            );
        });
    }

    getTestRunById(id: number): Promise<TestRun | null> {
        return new Promise((resolve, reject) => {
            this.db.get(
                `SELECT * FROM test_runs WHERE id = ?`,
                [id],
                (err, row: any) => {
                    if (err) reject(err);
                    else if (!row) resolve(null);
                    else {
                        resolve({
                            ...row,
                            success: Boolean(row.success),
                            screenshotBase64: row.screenshot ? row.screenshot.toString('base64') : undefined
                        });
                    }
                }
            );
        });
    }

    saveTestTemplate(name: string, description: string, url: string, goal: string, testPlan: string): Promise<void> {
        return new Promise((resolve, reject) => {
            this.db.run(
                `INSERT OR REPLACE INTO test_templates (name, description, url, goal, testPlan)
                 VALUES (?, ?, ?, ?, ?)`,
                [name, description, url, goal, testPlan],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }

    getTestTemplates(): Promise<any[]> {
        return new Promise((resolve, reject) => {
            this.db.all(
                `SELECT id, name, description, url, goal, testPlan FROM test_templates ORDER BY name`,
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });
    }

    savePerformanceMetric(testRunId: number, actionName: string, duration: number): Promise<void> {
        return new Promise((resolve, reject) => {
            this.db.run(
                `INSERT INTO performance_metrics (testRunId, actionName, duration) VALUES (?, ?, ?)`,
                [testRunId, actionName, duration],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }

    getPerformanceMetrics(testRunId: number): Promise<any[]> {
        return new Promise((resolve, reject) => {
            this.db.all(
                `SELECT actionName, duration FROM performance_metrics WHERE testRunId = ? ORDER BY id ASC`,
                [testRunId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });
    }

    close(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.db.close((err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }
}

export const db = new Database();

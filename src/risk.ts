/**
 * DriftGuard Risk Analyzer
 * Calculates strictness requirements based on file "heat" (commit frequency)
 */

import { gitManager } from './git.js';

export class RiskAnalyzer {
    private static instance: RiskAnalyzer;

    private constructor() { }

    public static getInstance(): RiskAnalyzer {
        if (!RiskAnalyzer.instance) {
            RiskAnalyzer.instance = new RiskAnalyzer();
        }
        return RiskAnalyzer.instance;
    }

    /**
     * Calculate risk score (0-100) for a given path
     * High score = High churn, many authors, recent activity
     */
    public async calculateRisk(projectPath: string, targetPath: string): Promise<{ score: number, reason: string }> {
        if (!(await gitManager.isGitRepo())) {
            return { score: 0, reason: "Not a git repository" };
        }

        try {
            // Get logs for the last 30 days
            const logs = await gitManager['git'].log({
                file: targetPath,
                '--since': '30 days ago',
                '--max-count': 100
            });

            const commitCount = logs.total;
            const authors = new Set(logs.all.map(c => c.author_email)).size;

            // Heuristic for Risk Score
            // Base: 2 points per commit
            // Multiplier: 5 points per distinct author
            // Deduction: -20 if it contains "test" or "spec" (safer to edit tests)

            let score = (commitCount * 2) + (authors * 5);

            const isTest = targetPath.toLowerCase().includes('test') || targetPath.toLowerCase().includes('spec');
            if (isTest) {
                score = Math.max(0, score - 20);
            }

            // Cap at 100
            score = Math.min(100, score);

            let reason = `Low activity (${commitCount} commits)`;
            if (score > 70) reason = `🔥 CRITICAL HOTSPOT: ${commitCount} commits, ${authors} authors`;
            else if (score > 40) reason = `⚠️ High activity: ${commitCount} commits`;
            else if (score > 20) reason = `Moderate activity`;

            return { score, reason };

        } catch (error) {
            console.error('Error calculating risk:', error);
            return { score: 0, reason: "Error accessing git logs" };
        }
    }
}

export const riskAnalyzer = RiskAnalyzer.getInstance();

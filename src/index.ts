#!/usr/bin/env node
/**
 * DriftGuard MCP Server
 * A "Firewall for Intelligence" that enforces strict state machine for agentic coding
 * Phase 2: Added Intent-Action-Explanation loop and L3 Git Notes
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { stateManager } from './state.js';
import { StateTransitionError, IntentMissingError, StrictnessLevel } from './types.js';

// Create MCP Server
const server = new McpServer({
    name: 'driftguard',
    version: '2.0.0' // Phase 2
});

/**
 * Format error response for MCP
 */
function formatError(error: unknown): { content: Array<{ type: 'text'; text: string }> } {
    if (error instanceof IntentMissingError) {
        return {
            content: [{
                type: 'text',
                text: `❌ PLAN_MISSING_INTENT: ${error.message}\n\nYou must call dg_report_intent before dg_checkpoint.`
            }]
        };
    }

    if (error instanceof StateTransitionError) {
        return {
            content: [{
                type: 'text',
                text: `❌ Error: ${error.message}`
            }]
        };
    }

    if (error instanceof Error) {
        return {
            content: [{
                type: 'text',
                text: `❌ Error: ${error.message}`
            }]
        };
    }

    return {
        content: [{
            type: 'text',
            text: `❌ Unknown error occurred`
        }]
    };
}

// ==================== TOOL: dg_init ====================
server.tool(
    'dg_init',
    'Initialize DriftGuard in the project. Creates .driftguard/ directory and recommends a strictness level based on project analysis.',
    {
        projectPath: z.string().optional().describe('Optional path to the project root. Defaults to current working directory.')
    },
    async ({ projectPath }) => {
        try {
            const result = await stateManager.initialize(projectPath);

            const statusEmoji = result.status === 'created' ? '✨' : '📂';

            return {
                content: [{
                    type: 'text',
                    text: [
                        `${statusEmoji} DriftGuard ${result.status === 'created' ? 'initialized' : 'already exists'}!`,
                        '',
                        `📁 Path: ${result.path}`,
                        `📊 Recommended Strictness: L${result.recommendedStrictness}`,
                        `💡 ${result.reason}`,
                        '',
                        'Files created:',
                        '  • .driftguard/tasks.json (machine-readable state)',
                        '  • .driftguard/ACTIVE_PLAN.md (human-readable plan)',
                        '',
                        'Next: Use `dg_propose_task` to define your first task.'
                    ].join('\n')
                }]
            };
        } catch (error) {
            return formatError(error);
        }
    }
);

// ==================== TOOL: dg_propose_task ====================
server.tool(
    'dg_propose_task',
    'Propose a new task with defined scope and checklist. Transitions from IDLE to PLANNING state.',
    {
        title: z.string().describe('Short title for the task'),
        goal: z.string().describe('Clear description of what this task aims to achieve'),
        allowedScopes: z.array(z.string()).describe('Glob patterns defining allowed file paths (e.g., "src/**/*.ts")'),
        checklist: z.array(z.object({
            id: z.string().describe('Unique identifier for the checklist item'),
            text: z.string().describe('Description of the checklist item')
        })).describe('List of checklist items to complete'),
        strictness: z.number().min(1).max(5).optional().describe('Strictness level (1-5). Defaults to L2.')
    },
    async ({ title, goal, allowedScopes, checklist, strictness }) => {
        try {
            // Ensure initialized
            if (!stateManager.isInitialized()) {
                await stateManager.initialize();
            }

            const task = await stateManager.proposeTask(
                title,
                goal,
                allowedScopes,
                checklist,
                strictness as StrictnessLevel | undefined
            );

            const checklistDisplay = task.checklist
                .map(item => `  ⬜ [${item.id}] ${item.text}`)
                .join('\n');

            return {
                content: [{
                    type: 'text',
                    text: [
                        `📋 Task "${task.taskId}" proposed and locked.`,
                        '',
                        `**Title:** ${task.title}`,
                        `**Goal:** ${task.goal}`,
                        `**Strictness:** L${task.strictness}`,
                        '',
                        '**Allowed Scopes:**',
                        task.allowedScopes.map(s => `  • ${s}`).join('\n'),
                        '',
                        '**Checklist:**',
                        checklistDisplay,
                        '',
                        `State: 💤 IDLE → 📝 PLANNING`,
                        '',
                        'Next: Use `dg_begin_step` to start executing.'
                    ].join('\n')
                }]
            };
        } catch (error) {
            return formatError(error);
        }
    }
);

// ==================== TOOL: dg_begin_step ====================
server.tool(
    'dg_begin_step',
    'Begin executing a step. Transitions from PLANNING or IDLE to EXECUTING state.',
    {
        stepId: z.string().optional().describe('Optional custom step ID. Auto-generated if not provided.')
    },
    async ({ stepId }) => {
        try {
            const result = await stateManager.beginStep(stepId);

            return {
                content: [{
                    type: 'text',
                    text: [
                        `⚡ Execution started!`,
                        '',
                        `**Task ID:** ${result.taskId}`,
                        `**Step ID:** ${result.stepId}`,
                        `**State:** 📝 → ⚡ EXECUTING`,
                        '',
                        'You are now in EXECUTING state.',
                        'Use `dg_checkpoint` to save progress and return to IDLE.'
                    ].join('\n')
                }]
            };
        } catch (error) {
            return formatError(error);
        }
    }
);

// ==================== TOOL: dg_checkpoint ====================
server.tool(
    'dg_checkpoint',
    'Save progress and atomically checkpoint completed work. Transitions from EXECUTING to IDLE state.',
    {
        summary: z.string().describe('Summary of what was accomplished in this checkpoint'),
        completedChecklistIds: z.array(z.string()).describe('IDs of checklist items that were completed')
    },
    async ({ summary, completedChecklistIds }) => {
        try {
            const result = await stateManager.checkpoint(summary, completedChecklistIds);

            const progressPercent = Math.round((result.completedItems / result.totalItems) * 100);
            const progressBar = '█'.repeat(Math.round(progressPercent / 5)) +
                '░'.repeat(20 - Math.round(progressPercent / 5));

            return {
                content: [{
                    type: 'text',
                    text: [
                        `✅ Checkpoint saved!`,
                        '',
                        `**Task ID:** ${result.taskId}`,
                        `**Summary:** ${summary}`,
                        '',
                        `**Progress:** [${progressBar}] ${progressPercent}%`,
                        `**Completed:** ${result.completedItems}/${result.totalItems} items`,
                        '',
                        `State: ⚡ EXECUTING → 💤 IDLE`,
                        '',
                        result.completedItems === result.totalItems
                            ? '🎉 All items completed! Task finished.'
                            : 'Use `dg_begin_step` to continue work.'
                    ].join('\n')
                }]
            };
        } catch (error) {
            return formatError(error);
        }
    }
);

// ==================== TOOL: dg_panic ====================
server.tool(
    'dg_panic',
    'Emergency stop. Forces PANIC state and locks all write operations. Returns a help packet for debugging.',
    {
        reason: z.string().describe('Reason for triggering panic mode')
    },
    async ({ reason }) => {
        try {
            const helpPacket = await stateManager.panic(reason);

            const logsDisplay = helpPacket.lastLogs
                .map(log => `  • [${new Date(log.timestamp).toLocaleTimeString()}] ${log.action}${log.details ? `: ${log.details}` : ''}`)
                .join('\n');

            return {
                content: [{
                    type: 'text',
                    text: [
                        `🚨 PANIC MODE ACTIVATED`,
                        '',
                        `**Reason:** ${helpPacket.panicReason}`,
                        '',
                        '--- HELP PACKET ---',
                        '',
                        `**Current Task Goal:**`,
                        helpPacket.currentTaskGoal ?? '  (No active task)',
                        '',
                        `**Last 3 Logs:**`,
                        logsDisplay || '  (No recent logs)',
                        '',
                        `**Current State:** ${helpPacket.currentState}`,
                        '',
                        '---',
                        '',
                        '⚠️ All write operations are now locked.',
                        'Manual intervention required to recover.'
                    ].join('\n')
                }]
            };
        } catch (error) {
            return formatError(error);
        }
    }
);

// ==================== TOOL: dg_status ====================
server.tool(
    'dg_status',
    'Get the current DriftGuard session status without changing state.',
    {},
    async () => {
        try {
            const session = stateManager.getSession();
            const state = stateManager.getState();

            const stateEmoji: Record<string, string> = {
                IDLE: '💤',
                PLANNING: '📝',
                EXECUTING: '⚡',
                VALIDATING: '🔍',
                PANIC: '🚨'
            };

            let taskInfo = 'No active task';
            if (session.activeTaskId && state.tasks[session.activeTaskId]) {
                const task = state.tasks[session.activeTaskId];
                const done = task.checklist.filter(i => i.status === 'done').length;
                taskInfo = `${task.title} (${done}/${task.checklist.length} items)`;
            }

            return {
                content: [{
                    type: 'text',
                    text: [
                        `🛡️ DriftGuard Status`,
                        '',
                        `**State:** ${stateEmoji[session.currentState] || '❓'} ${session.currentState}`,
                        `**Active Task:** ${taskInfo}`,
                        `**Active Step:** ${session.activeStepId || 'None'}`,
                        `**Initialized:** ${stateManager.isInitialized() ? 'Yes' : 'No'}`,
                        '',
                        `**Total Tasks:** ${Object.keys(state.tasks).length}`,
                        `**Log Entries:** ${state.logs.length}`
                    ].join('\n')
                }]
            };
        } catch (error) {
            return formatError(error);
        }
    }
);

// ==================== PHASE 3 TOOLS ====================

// ==================== TOOL: dg_claim_scope ====================
server.tool(
    'dg_claim_scope',
    'Claim exclusive or shared access to a file scope. Required to prevent agent collisions.',
    {
        paths: z.array(z.string()).describe('List of glob patterns to claim (e.g. ["src/components/**"])'),
        exclusive: z.boolean().describe('If true, blocks others from claiming overlapping scopes.')
    },
    async ({ paths, exclusive }) => {
        try {
            const result = await stateManager.claimScope(paths, exclusive);

            if (result.granted) {
                return {
                    content: [{
                        type: 'text',
                        text: `✅ Scope Claimed: ${paths.join(', ')}\nMode: ${exclusive ? 'Exclusive' : 'Shared'}`
                    }]
                };
            } else {
                const conflicts = result.conflicts.map(c => `  - ${c.path} (Owned by ${c.ownerTaskId})`).join('\n');
                return {
                    isError: true,
                    content: [{
                        type: 'text',
                        text: `❌ SCOPE_CONFLICT: Could not claim scope.\n\nConflicts:\n${conflicts}\n\nResolve by waiting or requesting delegation.`
                    }]
                };
            }
        } catch (error) {
            return formatError(error);
        }
    }
);

// ==================== TOOL: dg_delegate ====================
server.tool(
    'dg_delegate',
    'Delegate a subset of your current scope to a new child task.',
    {
        subTaskTitle: z.string().describe('Title for the child task'),
        subTaskGoal: z.string().describe('Goal for the child task'),
        subScope: z.array(z.string()).describe('Subset of your current scope to delegate')
    },
    async ({ subTaskTitle, subTaskGoal, subScope }) => {
        try {
            const subTask = await stateManager.delegateTask(subTaskTitle, subTaskGoal, subScope);

            return {
                content: [{
                    type: 'text',
                    text: [
                        `🤝 Task Delegated!`,
                        '',
                        `**Child Task ID:** ${subTask.taskId}`,
                        `**Title:** ${subTask.title}`,
                        `**Scope:** ${subScope.join(', ')}`,
                        '',
                        'The agent responsible for the child task can now `dg_propose_task` (or it is auto-created) and start working.'
                    ].join('\n')
                }]
            };
        } catch (error) {
            return formatError(error);
        }
    }
);

// ==================== TOOL: dg_analyze_risk ====================
server.tool(
    'dg_analyze_risk',
    'Analyze the "Heat" of a file path based on git history to determine risk.',
    {
        path: z.string().describe('File path or Glob pattern to analyze')
    },
    async ({ path }) => {
        try {
            const result = await stateManager.analyzeRisk(path);

            let emoji = '🟢';
            if (result.score > 70) emoji = '🔥';
            else if (result.score > 40) emoji = '⚠️';

            return {
                content: [{
                    type: 'text',
                    text: [
                        `${emoji} Risk Analysis Results`,
                        '',
                        `**Target:** \`${path}\``,
                        `**Risk Score:** ${result.score}/100`,
                        `**Assessment:** ${result.reason}`,
                        '',
                        'High risk suggests using higher strictness (e.g. L3) or requesting human review.'
                    ].join('\n')
                }]
            };
        } catch (error) {
            return formatError(error);
        }
    }
);

// ==================== PHASE 2 TOOLS ====================

// ==================== TOOL: dg_report_intent ====================
server.tool(
    'dg_report_intent',
    'Report intent before making changes. Required before dg_checkpoint. Transitions to EXECUTING state.',
    {
        intent: z.string().describe('What you plan to do - a clear description of the intended changes'),
        filesToTouch: z.array(z.string()).describe('List of files you expect to modify')
    },
    async ({ intent, filesToTouch }) => {
        try {
            const result = await stateManager.reportIntent(intent, filesToTouch);

            return {
                content: [{
                    type: 'text',
                    text: [
                        `🎯 Intent recorded!`,
                        '',
                        `**Task ID:** ${result.taskId}`,
                        `**Step ID:** ${result.stepId}`,
                        '',
                        `**Intent:** ${intent}`,
                        '',
                        '**Files to touch:**',
                        filesToTouch.map(f => `  • ${f}`).join('\n') || '  (none specified)',
                        '',
                        `State: → ⚡ EXECUTING`,
                        '',
                        'You can now make changes. Use `dg_checkpoint` when done.'
                    ].join('\n')
                }]
            };
        } catch (error) {
            return formatError(error);
        }
    }
);

// ==================== TOOL: dg_verify ====================
server.tool(
    'dg_verify',
    'Run the test command to verify changes. Uses testCommand from the task contract.',
    {},
    async () => {
        try {
            const result = await stateManager.verify();

            const statusEmoji = result.success ? '✅' : '❌';
            const statusText = result.success ? 'PASSED' : 'FAILED';

            return {
                content: [{
                    type: 'text',
                    text: [
                        `${statusEmoji} Verification ${statusText}`,
                        '',
                        `**Command:** \`${result.command}\``,
                        `**Exit Code:** ${result.exitCode}`,
                        '',
                        '**stdout:**',
                        '```',
                        result.stdout.slice(0, 500) || '(empty)',
                        '```',
                        '',
                        result.stderr ? [
                            '**stderr:**',
                            '```',
                            result.stderr.slice(0, 500),
                            '```'
                        ].join('\n') : '',
                        '',
                        result.success
                            ? '✅ Verification passed. You can proceed with dg_checkpoint.'
                            : '❌ Verification failed. Fix issues before checkpoint.'
                    ].join('\n')
                }]
            };
        } catch (error) {
            return formatError(error);
        }
    }
);

// ==================== TOOL: dg_explain_change ====================
server.tool(
    'dg_explain_change',
    'Generate a 3-bullet summary comparing intent vs actual changes.',
    {},
    async () => {
        try {
            const result = await stateManager.explainChange();

            return {
                content: [{
                    type: 'text',
                    text: [
                        `📝 Change Explanation`,
                        '',
                        '### 1. Intent (What was planned)',
                        result.intent,
                        '',
                        '### 2. Changes (What was actually touched)',
                        result.changes,
                        '',
                        '### 3. Verification (How to test)',
                        result.verification,
                        '',
                        '---',
                        '',
                        '**Git Diff Summary:**',
                        '```',
                        result.diffSummary.slice(0, 1000),
                        '```'
                    ].join('\n')
                }]
            };
        } catch (error) {
            return formatError(error);
        }
    }
);

// ==================== TOOL: dg_set_test_command ====================
server.tool(
    'dg_set_test_command',
    'Set or update the test command for the active task.',
    {
        command: z.string().describe('The shell command to run for verification (e.g., "npm test")')
    },
    async ({ command }) => {
        try {
            await stateManager.setTestCommand(command);

            return {
                content: [{
                    type: 'text',
                    text: [
                        `⚙️ Test command updated!`,
                        '',
                        `**Command:** \`${command}\``,
                        '',
                        'This command will be run when you call `dg_verify`.'
                    ].join('\n')
                }]
            };
        } catch (error) {
            return formatError(error);
        }
    }
);

// ==================== PHASE 4 TOOLS ====================

// ==================== TOOL: dg_reset ====================
server.tool(
    'dg_reset',
    'Hard reset DriftGuard state (Safety Valve). Clears all tasks, claims, and history.',
    {
        confirm: z.boolean().describe('Must be set to true to confirm deletion')
    },
    async ({ confirm }) => {
        if (!confirm) {
            return { isError: true, content: [{ type: 'text', text: 'Confirmation required. Usage: dg_reset(confirm=true)' }] };
        }
        await stateManager.reset();
        return {
            content: [{ type: 'text', text: '💥 DriftGuard State Hard Reset. System is clean.' }]
        };
    }
);

// ==================== TOOL: dg_health_check ====================
server.tool(
    'dg_health_check',
    'Detect "Out-of-Band" changes (manual edits) by comparing current file hashes against the last checkpoint.',
    {},
    async () => {
        try {
            const result = await stateManager.healthCheck();

            if (result.status === 'CLEAN') {
                return {
                    content: [{ type: 'text', text: '✅ Environment Integrity: CLEAN (No unrecognized edits)' }]
                };
            } else if (result.status === 'NO_CLAIMS') {
                return {
                    content: [{ type: 'text', text: 'ℹ️ No active scope claims. Integrity check skipped.' }]
                };
            }

            return {
                isError: true, // Warn the AI
                content: [{
                    type: 'text',
                    text: `⚠️ ENVIRONMENT DIRTY: Manual edits detected!\n\nModified Files:\n${result.dirtyFiles.map(f => `  - ${f}`).join('\n')}\n\nRecommendation: Review changes, then run dg_checkpoint to accept them.`
                }]
            };
        } catch (error) {
            return formatError(error);
        }
    }
);

// ==================== TOOL: dg_generate_handoff ====================
server.tool(
    'dg_generate_handoff',
    'Generate a "Resume Packet" to reconstruct context for a new session.',
    {},
    async () => {
        try {
            const packet = await stateManager.generateHandoff();
            return {
                content: [{
                    type: 'text',
                    text: [
                        `📦 DriftGuard Resume Packet`,
                        `Task: ${packet.taskId}`,
                        `Status: ${packet.status}`,
                        `Plan: ${packet.planSummary}`,
                        `Claims: ${packet.activeClaims.join(', ') || 'None'}`,
                        `Verification: ${packet.verificationStatus}`,
                        '',
                        '**Recent Activity:**',
                        ...packet.lastSteps
                    ].join('\n')
                }]
            };
        } catch (error) {
            return formatError(error);
        }
    }
);

// ==================== TOOL: dg_get_timeline ====================
server.tool(
    'dg_get_timeline',
    'Retrieve chronological history from L3 Git Notes.',
    {
        limit: z.number().optional().describe('Metrics of history entries to retrieve (default: 10)')
    },
    async ({ limit }) => {
        try {
            const history = await stateManager.getTimeline(limit || 10);

            if (history.length === 0) {
                return { content: [{ type: 'text', text: 'No history found (L3 Git Notes empty).' }] };
            }

            const formatEntry = (h: any) => `[${h.timestamp}] ${h.intent} -> ${h.summary} (${h.filesChanged.length} files)`;

            return {
                content: [{
                    type: 'text',
                    text: [
                        `📜 Project Timeline (Last ${history.length})`,
                        ...history.map(formatEntry)
                    ].join('\n')
                }]
            };
        } catch (error) {
            return formatError(error);
        }
    }
);

// ==================== START SERVER ====================
async function main() {
    // Try to hydrate existing state on startup
    try {
        await stateManager.hydrate();
    } catch {
        // No existing state, will initialize on first dg_init call
    }

    const transport = new StdioServerTransport();
    await server.connect(transport);

    // Log to stderr so it doesn't interfere with MCP protocol
    console.error('🛡️ DriftGuard MCP Server started');
}

main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});

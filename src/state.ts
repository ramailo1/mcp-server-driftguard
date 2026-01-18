/**
 * DriftGuard State Manager
 * The "Brain" - Manages session state with L2 filesystem persistence
 * Phase 2: Added L3 Git Notes integration and Intent-Action-Explanation loop
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { exec } from 'child_process';
import { promisify } from 'util';
import {
    FocusState,
    StrictnessLevel,
    TaskContract,
    DriftSession,
    DriftGuardState,
    LogEntry,
    HelpPacket,
    InitResult,
    CheckpointResult,
    ChecklistItem,
    StateTransitionError,
    IntentMissingError,
    VerifyResult,
    ExplainResult,
    GitNoteMetadata,
    ScopeClaim,
    // Phase 4
    HandoffPacket
} from './types.js';
import { gitManager } from './git.js';
import { scopeManager } from './scope.js';
import { riskAnalyzer } from './risk.js';
import { createHash } from 'crypto';
import { minimatch } from 'minimatch';

const execAsync = promisify(exec);

const DRIFTGUARD_DIR = '.driftguard';
const TASKS_FILE = 'tasks.json';
const ACTIVE_PLAN_FILE = 'ACTIVE_PLAN.md';
const STATE_VERSION = '3.0.0'; // Updated for Phase 3

/**
 * StateManager Singleton
 * Manages the DriftSession and enforces state transition rules
 */
export class StateManager {
    private static instance: StateManager;
    private state: DriftGuardState;
    private projectPath: string;
    private initialized: boolean = false;

    private constructor() {
        this.projectPath = process.cwd();
        this.state = this.createInitialState();
    }

    /**
     * Get the singleton instance
     */
    public static getInstance(): StateManager {
        if (!StateManager.instance) {
            StateManager.instance = new StateManager();
        }
        return StateManager.instance;
    }

    /**
     * Create initial empty state
     */
    private createInitialState(): DriftGuardState {
        return {
            version: STATE_VERSION,
            session: {
                sessionId: uuidv4(),
                startTime: Date.now(),
                currentState: FocusState.IDLE,
                // Optional fields undefined by default
                // Phase 2 additions
                isVerified: false,
                intentFiled: false,
                // Phase 3 additions
                activeClaims: [],
                // Phase 4 additions
                lastKnownFileHashes: {}
            },
            tasks: {},
            logs: []
        };
    }

    /**
     * Get the .driftguard directory path
     */
    private getDriftGuardPath(): string {
        return path.join(this.projectPath, DRIFTGUARD_DIR);
    }

    /**
     * Get the tasks.json file path
     */
    private getTasksFilePath(): string {
        return path.join(this.getDriftGuardPath(), TASKS_FILE);
    }

    /**
     * Get the ACTIVE_PLAN.md file path
     */
    private getActivePlanPath(): string {
        return path.join(this.getDriftGuardPath(), ACTIVE_PLAN_FILE);
    }

    /**
     * Add a log entry
     */
    private log(action: string, taskId?: string, details?: string): void {
        this.state.logs.push({
            timestamp: new Date().toISOString(),
            action,
            taskId,
            details
        });

        // Keep only last 100 logs
        if (this.state.logs.length > 100) {
            this.state.logs = this.state.logs.slice(-100);
        }
    }

    /**
     * Sync state to L2 (filesystem)
     */
    private async syncToDisk(): Promise<void> {
        const driftGuardPath = this.getDriftGuardPath();

        // Ensure directory exists
        await fs.mkdir(driftGuardPath, { recursive: true });

        // Write tasks.json
        await fs.writeFile(
            this.getTasksFilePath(),
            JSON.stringify(this.state, null, 2),
            'utf-8'
        );

        // Generate and write ACTIVE_PLAN.md
        const activePlan = this.generateActivePlan();
        await fs.writeFile(this.getActivePlanPath(), activePlan, 'utf-8');
    }

    /**
     * Generate human-readable ACTIVE_PLAN.md
     */
    private generateActivePlan(): string {
        const { session, tasks } = this.state;
        const lines: string[] = [];

        lines.push('# 🛡️ DriftGuard Active Plan');
        lines.push('');
        lines.push(`> **State:** ${this.getStateEmoji(session.currentState)} ${session.currentState}`);
        lines.push(`> **Last Updated:** ${new Date().toISOString()}`);
        lines.push('');

        if (session.activeTaskId && tasks[session.activeTaskId]) {
            const task = tasks[session.activeTaskId];
            lines.push('---');
            lines.push('');
            lines.push(`## 📋 Active Task: ${task.title}`);
            lines.push('');
            lines.push(`**Goal:** ${task.goal}`);
            lines.push('');
            lines.push(`**Strictness:** L${task.strictness}`);
            lines.push('');
            lines.push('**Allowed Scopes:**');
            task.allowedScopes.forEach(scope => {
                lines.push(`- \`${scope}\``);
            });
            lines.push('');

            // Phase 3: Active Scope Claims
            if (task.claims && task.claims.length > 0) {
                lines.push('**Active Scope Claims (LOCKED):**');
                task.claims.forEach(claim => {
                    lines.push(`- \`${claim.path}\` ${claim.exclusive ? '(Exclusive)' : ''}`);
                });
                lines.push('');
            }

            lines.push('### Checklist');
            lines.push('');
            task.checklist.forEach(item => {
                const checkbox = item.status === 'done' ? '✅' : '⬜';
                lines.push(`- ${checkbox} ${item.text}`);
            });
            lines.push('');

            // Progress bar
            const done = task.checklist.filter(i => i.status === 'done').length;
            const total = task.checklist.length;
            const percent = total > 0 ? Math.round((done / total) * 100) : 0;
            const filled = Math.round(percent / 5);
            const bar = '█'.repeat(filled) + '░'.repeat(20 - filled);
            lines.push(`**Progress:** [${bar}] ${percent}% (${done}/${total})`);

            // Phase 2: Current Intent section
            if (task.lastIntent) {
                lines.push('');
                lines.push('### 🎯 Current Intent');
                lines.push('');
                lines.push(task.lastIntent);
                if (task.filesToTouch && task.filesToTouch.length > 0) {
                    lines.push('');
                    lines.push('**Files to touch:**');
                    task.filesToTouch.forEach(f => lines.push(`- \`${f}\``));
                }
            }

            // Phase 2: Verification status
            lines.push('');
            lines.push(`**Intent Filed:** ${session.intentFiled ? '✅' : '❌'}`);
            lines.push(`**Verified:** ${session.isVerified ? '✅' : '❌'}`);
        } else {
            lines.push('---');
            lines.push('');
            lines.push('*No active task. Use `dg_propose_task` to start.*');
        }

        lines.push('');
        lines.push('---');
        lines.push('## 📜 Recent Activity');
        lines.push('');

        const recentLogs = this.state.logs.slice(-5).reverse();
        if (recentLogs.length === 0) {
            lines.push('*No recent activity.*');
        } else {
            recentLogs.forEach(log => {
                const time = new Date(log.timestamp).toLocaleTimeString();
                lines.push(`- **${time}** - ${log.action}${log.details ? `: ${log.details}` : ''}`);
            });
        }

        lines.push('');
        lines.push('---');
        lines.push('*Generated by DriftGuard v' + STATE_VERSION + '*');

        return lines.join('\n');
    }

    /**
     * Get emoji for state
     */
    private getStateEmoji(state: FocusState): string {
        const emojis: Record<FocusState, string> = {
            [FocusState.IDLE]: '💤',
            [FocusState.PLANNING]: '📝',
            [FocusState.EXECUTING]: '⚡',
            [FocusState.VALIDATING]: '🔍',
            [FocusState.PANIC]: '🚨'
        };
        return emojis[state] || '❓';
    }

    /**
     * Hydrate state from L2 (filesystem)
     */
    public async hydrate(): Promise<boolean> {
        try {
            const data = await fs.readFile(this.getTasksFilePath(), 'utf-8');
            const parsed = JSON.parse(data) as DriftGuardState;

            // Validate version compatibility
            if (parsed.version !== STATE_VERSION) {
                this.log('hydrate', undefined, `Version mismatch: ${parsed.version} vs ${STATE_VERSION}`);
                // For now, accept older versions
            }

            this.state = parsed;
            this.initialized = true;
            this.log('hydrate', undefined, 'Session restored from disk');
            return true;
        } catch (error) {
            // File doesn't exist or is corrupted - start fresh
            return false;
        }
    }

    /**
     * Scan project to recommend strictness level
     */
    private async scanForStrictness(): Promise<{ level: StrictnessLevel; reason: string }> {
        try {
            // Check for package.json with test scripts
            const packageJsonPath = path.join(this.projectPath, 'package.json');
            const packageJson = await fs.readFile(packageJsonPath, 'utf-8');
            const pkg = JSON.parse(packageJson);

            if (pkg.scripts?.test && pkg.scripts.test !== 'echo "Error: no test specified" && exit 1') {
                return {
                    level: StrictnessLevel.L3_BALANCED,
                    reason: 'Detected test scripts in package.json - recommending L3 (Intent + Basic Linting)'
                };
            }

            // Check for CI configuration
            const ciPaths = ['.github/workflows', '.gitlab-ci.yml', 'Jenkinsfile'];
            for (const ciPath of ciPaths) {
                try {
                    await fs.access(path.join(this.projectPath, ciPath));
                    return {
                        level: StrictnessLevel.L4_ENGINEERED,
                        reason: `Detected CI configuration (${ciPath}) - recommending L4 (Test Passing Required)`
                    };
                } catch {
                    // CI path doesn't exist, continue checking
                }
            }

            return {
                level: StrictnessLevel.L2_LOGGED,
                reason: 'Basic project structure detected - recommending L2 (Requires Checklists)'
            };
        } catch {
            return {
                level: StrictnessLevel.L1_VIBE,
                reason: 'New or simple project - recommending L1 (Simple Logging)'
            };
        }
    }

    /**
     * Validate state transition
     */
    private validateTransition(action: string, allowedFrom: FocusState[]): void {
        if (!allowedFrom.includes(this.state.session.currentState)) {
            throw new StateTransitionError(action, this.state.session.currentState, allowedFrom);
        }
    }

    // ==================== PUBLIC API ====================

    /**
     * Initialize DriftGuard in the project
     */
    public async initialize(projectPath?: string): Promise<InitResult> {
        if (projectPath) {
            this.projectPath = projectPath;
        }

        const driftGuardPath = this.getDriftGuardPath();
        let status: 'created' | 'exists' = 'created';

        // Check if already exists
        try {
            await fs.access(driftGuardPath);
            status = 'exists';

            // Try to hydrate existing state
            await this.hydrate();
        } catch {
            // Directory doesn't exist, create it
            await fs.mkdir(driftGuardPath, { recursive: true });
        }

        // Add to .gitignore if not already there
        await this.updateGitignore();

        // Scan for strictness recommendation
        const { level, reason } = await this.scanForStrictness();

        // Initialize state if new
        if (status === 'created') {
            this.state = this.createInitialState();
        }

        this.initialized = true;
        this.log('dg_init', undefined, `Initialized at ${driftGuardPath}`);
        await this.syncToDisk();

        return {
            status,
            path: driftGuardPath,
            recommendedStrictness: level,
            reason
        };
    }

    /**
     * Update .gitignore to include .driftguard
     */
    private async updateGitignore(): Promise<void> {
        const gitignorePath = path.join(this.projectPath, '.gitignore');
        const entry = DRIFTGUARD_DIR;

        try {
            let content = '';
            try {
                content = await fs.readFile(gitignorePath, 'utf-8');
            } catch {
                // .gitignore doesn't exist
            }

            if (!content.includes(entry)) {
                const newContent = content + (content.endsWith('\n') ? '' : '\n') + entry + '\n';
                await fs.writeFile(gitignorePath, newContent, 'utf-8');
            }
        } catch (error) {
            // Silently ignore gitignore errors
        }
    }

    /**
     * Propose a new task
     */
    public async proposeTask(
        title: string,
        goal: string,
        allowedScopes: string[],
        checklist: { id: string; text: string }[],
        strictness?: StrictnessLevel
    ): Promise<TaskContract> {
        // Validate state transition
        this.validateTransition('dg_propose_task', [FocusState.IDLE]);

        // Generate unique task ID
        const taskId = `task_${uuidv4().slice(0, 8)}`;
        const now = new Date().toISOString();

        // Create and register the task
        const newTask: TaskContract = {
            taskId,
            title,
            goal,
            allowedScopes: allowedScopes || ['**'],
            checklist: checklist.map(item => ({
                id: item.id,
                text: item.text,
                status: 'todo' as const
            })),
            strictness: strictness ?? StrictnessLevel.L2_LOGGED,
            createdAt: now,
            updatedAt: now,
            // Phase 3 properties
            subTaskIds: [],
            claims: []
        };



        this.state.tasks[taskId] = newTask;
        this.state.session.activeTaskId = taskId; // Set focus
        this.log('dg_propose_task', taskId, `Task proposed: ${title}`);
        await this.syncToDisk();

        return newTask;
    }

    /**
     * Begin a step (transition to EXECUTING)
     */
    public async beginStep(stepId?: string): Promise<{ taskId: string; stepId: string; state: FocusState }> {
        // Validate state transition
        this.validateTransition('dg_begin_step', [FocusState.PLANNING, FocusState.IDLE]);

        if (!this.state.session.activeTaskId) {
            throw new Error('No active task. Use dg_propose_task first.');
        }

        const activeStepId = stepId ?? `step_${uuidv4().slice(0, 8)}`;
        this.state.session.activeStepId = activeStepId;
        this.state.session.currentState = FocusState.EXECUTING;

        this.log('dg_begin_step', this.state.session.activeTaskId, `Started step: ${activeStepId}`);
        await this.syncToDisk();

        return {
            taskId: this.state.session.activeTaskId,
            stepId: activeStepId,
            state: FocusState.EXECUTING
        };
    }

    /**
     * Checkpoint - save progress and return to IDLE
     * Phase 2: Now gated by intentFiled and writes L3 Git Notes
     */
    public async checkpoint(
        summary: string,
        completedChecklistIds: string[]
    ): Promise<CheckpointResult> {
        // Validate state transition
        this.validateTransition('dg_checkpoint', [FocusState.EXECUTING]);

        // Phase 2: Require intent to be filed
        if (!this.state.session.intentFiled) {
            throw new IntentMissingError();
        }

        const taskId = this.state.session.activeTaskId;
        if (!taskId || !this.state.tasks[taskId]) {
            throw new Error('No active task found');
        }

        const task = this.state.tasks[taskId];

        // Update checklist items
        completedChecklistIds.forEach(id => {
            const item = task.checklist.find(i => i.id === id);
            if (item) {
                item.status = 'done';
            }
        });

        task.updatedAt = new Date().toISOString();

        // Check if all items are done
        const allDone = task.checklist.every(item => item.status === 'done');

        const result: CheckpointResult = {
            status: 'saved',
            taskId,
            completedItems: task.checklist.filter(i => i.status === 'done').length,
            totalItems: task.checklist.length,
            gitNoteWritten: false
        };

        // Write L3 Git Note if in a repo
        const changedFiles = await gitManager.getChangedFiles();
        if (await gitManager.isGitRepo() && changedFiles.length > 0) {
            const noteMetadata: GitNoteMetadata = {
                taskId,
                title: task.title,
                intent: task.lastIntent || '',
                summary,
                timestamp: new Date().toISOString(),
                filesChanged: changedFiles
            };
            result.gitNoteWritten = await gitManager.writeNote(noteMetadata);
        }

        // Phase 4: Update hashes before releasing
        if (task.claims) {
            const activePatterns = task.claims.map(c => c.path);
            const hashes = await this.calculateFileHashes(activePatterns);
            this.state.session.lastKnownFileHashes = {
                ...(this.state.session.lastKnownFileHashes || {}),
                ...hashes
            };
        }

        // Release Active Claims
        if (task.claims) {
            task.claims = [];
            this.refreshActiveClaims();
        }

        // Update session state
        this.state.session.currentState = FocusState.IDLE;
        this.state.session.activeStepId = undefined;
        // Phase 2: Reset flags
        this.state.session.intentFiled = false;
        this.state.session.isVerified = false;

        // If all done, clear active task
        if (allDone) {
            this.state.session.activeTaskId = undefined;
        }

        this.log('dg_checkpoint', taskId, summary);
        await this.syncToDisk();

        return result;
    }

    /**
     * Panic - emergency stop
     */
    public async panic(reason: string): Promise<HelpPacket> {
        const previousState = this.state.session.currentState;
        const taskId = this.state.session.activeTaskId;
        const task = taskId ? this.state.tasks[taskId] : null;

        // Force PANIC state
        this.state.session.currentState = FocusState.PANIC;

        this.log('dg_panic', taskId ?? undefined, reason);
        await this.syncToDisk();

        // Build help packet
        return {
            currentTaskGoal: task?.goal ?? null,
            lastLogs: this.state.logs.slice(-3),
            panicReason: reason,
            currentState: FocusState.PANIC
        };
    }

    // ==================== PHASE 2 METHODS ====================

    /**
     * Report intent before making changes (Phase 2)
     * Transitions from PLANNING/IDLE to EXECUTING
     */
    public async reportIntent(
        intent: string,
        filesToTouch: string[]
    ): Promise<{ taskId: string; stepId: string; state: FocusState }> {
        // Validate state transition
        this.validateTransition('dg_report_intent', [FocusState.PLANNING, FocusState.IDLE]);

        if (!this.state.session.activeTaskId) {
            throw new Error('No active task. Use dg_propose_task first.');
        }

        const taskId = this.state.session.activeTaskId;
        const task = this.state.tasks[taskId];

        // Store intent in task
        task.lastIntent = intent;
        task.filesToTouch = filesToTouch;
        task.updatedAt = new Date().toISOString();

        // Generate step ID and transition to EXECUTING
        const stepId = `step_${uuidv4().slice(0, 8)}`;
        this.state.session.activeStepId = stepId;
        this.state.session.currentState = FocusState.EXECUTING;
        this.state.session.intentFiled = true;

        this.log('dg_report_intent', taskId, intent.slice(0, 100));
        await this.syncToDisk();

        return {
            taskId,
            stepId,
            state: FocusState.EXECUTING
        };
    }

    /**
     * Verify changes by running test command (Phase 2)
     */
    public async verify(): Promise<VerifyResult> {
        // Must be in EXECUTING state
        this.validateTransition('dg_verify', [FocusState.EXECUTING]);

        const taskId = this.state.session.activeTaskId;
        if (!taskId || !this.state.tasks[taskId]) {
            throw new Error('No active task found');
        }

        const task = this.state.tasks[taskId];
        const command = task.testCommand || 'echo "No test command configured"';

        let stdout = '';
        let stderr = '';
        let exitCode = 0;
        let success = true;

        try {
            const result = await execAsync(command, {
                cwd: this.projectPath,
                timeout: 60000, // 60 second timeout
                maxBuffer: 1024 * 1024 // 1MB buffer
            });
            stdout = result.stdout;
            stderr = result.stderr;
        } catch (error: any) {
            success = false;
            exitCode = error.code || 1;
            stdout = error.stdout || '';
            stderr = error.stderr || error.message || '';
        }

        // Set verified flag
        this.state.session.isVerified = success;

        this.log('dg_verify', taskId, success ? 'PASS' : 'FAIL');
        await this.syncToDisk();

        return {
            success,
            command,
            stdout,
            stderr,
            exitCode
        };
    }

    /**
     * Explain changes by comparing git diff to intent (Phase 2)
     */
    public async explainChange(): Promise<ExplainResult> {
        // Must be in EXECUTING state
        this.validateTransition('dg_explain_change', [FocusState.EXECUTING]);

        const taskId = this.state.session.activeTaskId;
        if (!taskId || !this.state.tasks[taskId]) {
            throw new Error('No active task found');
        }

        const task = this.state.tasks[taskId];

        // Get git diff
        const diffSummary = await gitManager.getDiffStat();
        const changedFiles = await gitManager.getChangedFiles();

        // Build 3-bullet summary
        const intent = task.lastIntent || 'No intent was declared';

        const changes = changedFiles.length > 0
            ? `Modified ${changedFiles.length} file(s): ${changedFiles.slice(0, 5).join(', ')}${changedFiles.length > 5 ? '...' : ''}`
            : 'No files changed';

        const verification = task.testCommand
            ? `Run: \`${task.testCommand}\``
            : 'No test command configured. Consider adding one with dg_propose_task.';

        this.log('dg_explain_change', taskId, `${changedFiles.length} files changed`);

        return {
            intent,
            changes,
            verification,
            diffSummary
        };
    }

    /**
     * Set test command for the active task (Phase 2)
     */
    public async setTestCommand(command: string): Promise<void> {
        const taskId = this.state.session.activeTaskId;
        if (!taskId || !this.state.tasks[taskId]) {
            throw new Error('No active task found');
        }

        this.state.tasks[taskId].testCommand = command;
        this.state.tasks[taskId].updatedAt = new Date().toISOString();

        this.log('set_test_command', taskId, command);
        await this.syncToDisk();
    }

    /**
     * Phase 3: Claim a Scope
     */
    public async claimScope(paths: string[], exclusive: boolean): Promise<{ granted: boolean, conflicts: ScopeClaim[] }> {
        const taskId = this.state.session.activeTaskId;
        if (!taskId) {
            throw new Error("No active task to claim scope for.");
        }

        const task = this.state.tasks[taskId];
        if (!task.claims) task.claims = [];

        // Collect all active claims from session
        const allActiveClaims = this.state.session.activeClaims || [];

        const conflicts: ScopeClaim[] = [];
        const newClaims: ScopeClaim[] = [];

        for (const path of paths) {
            const conflict = scopeManager.checkConflict(path, taskId, allActiveClaims, this.state.tasks);
            if (conflict) {
                conflicts.push(conflict);
            } else {
                newClaims.push({
                    path,
                    exclusive,
                    ownerTaskId: taskId,
                    createdAt: Date.now()
                });
            }
        }

        if (conflicts.length > 0) {
            // Reject ALL if any conflict exists (Atomic claim)
            return { granted: false, conflicts };
        }

        // Commit claims
        task.claims.push(...newClaims);
        this.refreshActiveClaims();

        // Phase 4: Snapshot hashes for integrity
        const activePatterns = task.claims.map(c => c.path);
        const hashes = await this.calculateFileHashes(activePatterns);
        this.state.session.lastKnownFileHashes = {
            ...(this.state.session.lastKnownFileHashes || {}),
            ...hashes
        };

        this.log('dg_claim_scope', taskId, `Granted active claims: ${newClaims.map(c => c.path).join(', ')}`);
        await this.syncToDisk();

        return { granted: true, conflicts: [] };
    }

    /**
     * Phase 3: Delegate Task/Scope
     */
    public async delegateTask(
        subTaskTitle: string,
        subTaskGoal: string,
        subScope: string[]
    ): Promise<TaskContract> {
        this.validateTransition('dg_delegate', [FocusState.EXECUTING]);

        const parentTaskId = this.state.session.activeTaskId!;
        const parentTask = this.state.tasks[parentTaskId];
        const parentClaims = parentTask.claims?.map(c => c.path) || [];

        if (!scopeManager.validateDelegation(parentClaims, subScope)) {
            if (parentClaims.length > 0) {
                throw new Error("Delegation Failed: Child scope is not contained within Parent's active claims.");
            }
        }

        // Utilize proposeTask but we need to patch the parentTaskId and currentState
        // because proposeTask changes state to PLANNING. 
        // Delegation should keep us in EXECUTING? Or switch to the child?
        // Manifesto: "Spawns a child task that inherits..."
        // Taking the logic from my previous attempt:

        const subTaskId = `sub_${uuidv4().substring(0, 8)}`;
        const now = new Date().toISOString();

        const subTask: TaskContract = {
            taskId: subTaskId,
            title: subTaskTitle,
            goal: subTaskGoal,
            allowedScopes: subScope,
            checklist: [],
            strictness: parentTask.strictness,
            createdAt: now,
            updatedAt: now,
            parentTaskId: parentTaskId,
            subTaskIds: [],
            claims: []
        };

        if (!parentTask.subTaskIds) parentTask.subTaskIds = [];
        parentTask.subTaskIds.push(subTaskId);

        this.state.tasks[subTaskId] = subTask;

        this.log('dg_delegate', parentTaskId, `Delegated sub-task ${subTaskId}: ${subTaskTitle}`);
        await this.syncToDisk();

        return subTask;
    }

    /**
     * Phase 3: Analyze Risk
     */
    public async analyzeRisk(targetPath: string): Promise<{ score: number, reason: string }> {
        const result = await riskAnalyzer.calculateRisk(this.projectPath, targetPath);

        const taskId = this.state.session.activeTaskId;
        if (taskId) {
            const task = this.state.tasks[taskId];
            task.riskScore = Math.max(task.riskScore || 0, result.score);
        }

        return result;
    }

    /**
     * Helper to refresh the activeClaims cache in session
     */
    private refreshActiveClaims() {
        const claims: ScopeClaim[] = [];
        for (const task of Object.values(this.state.tasks)) {
            if (task.claims) {
                claims.push(...task.claims);
            }
        }
        this.state.session.activeClaims = claims;
    }

    /**
     * Phase 4: Calculate MD5 hashes for files matching patterns
     */
    private async calculateFileHashes(patterns: string[]): Promise<Record<string, string>> {
        const hashes: Record<string, string> = {};
        if (patterns.length === 0) return hashes;

        const files = await gitManager.listFiles(patterns);
        for (const file of files) {
            try {
                const content = await fs.readFile(path.join(this.projectPath, file));
                const hash = createHash('md5').update(content).digest('hex');
                hashes[file] = hash;
            } catch {
                // Skip missing files
            }
        }
        return hashes;
    }

    /**
     * Phase 4: Check environment integrity
     */
    public async healthCheck(): Promise<{ status: 'CLEAN' | 'DIRTY' | 'NO_CLAIMS', dirtyFiles: string[] }> {
        const claims = this.state.session.activeClaims || [];
        if (claims.length === 0) {
            return { status: 'NO_CLAIMS', dirtyFiles: [] };
        }

        const patterns = claims.map(c => c.path);
        const currentHashes = await this.calculateFileHashes(patterns);
        const knownHashes = this.state.session.lastKnownFileHashes || {};
        const dirtyFiles: string[] = [];

        // Check for modified or new files
        for (const [file, currentHash] of Object.entries(currentHashes)) {
            const known = knownHashes[file];
            if (!known) {
                dirtyFiles.push(`${file} (NEW)`);
            } else if (known !== currentHash) {
                dirtyFiles.push(`${file} (MODIFIED)`);
            }
        }

        // Check for deleted files
        for (const [file, known] of Object.entries(knownHashes)) {
            if (!currentHashes[file]) {
                const inScope = patterns.some(p => minimatch(file, p));
                if (inScope) {
                    dirtyFiles.push(`${file} (DELETED)`);
                }
            }
        }

        if (dirtyFiles.length > 0) {
            return { status: 'DIRTY', dirtyFiles };
        }
        return { status: 'CLEAN', dirtyFiles: [] };
    }

    /**
     * Phase 4: Generate Handoff Packet
     */
    public async generateHandoff(): Promise<HandoffPacket> {
        const taskId = this.state.session.activeTaskId;
        const task = taskId ? this.state.tasks[taskId] : null;

        let planSummary = "No active task";
        if (task) {
            const done = task.checklist.filter(i => i.status === 'done').length;
            const total = task.checklist.length;
            planSummary = `${done} of ${total} items completed. Goal: ${task.goal}`;
        }

        const activeClaims = this.state.session.activeClaims?.map(c => c.path) || [];
        const logs = this.state.logs.slice(-3).map(l => `[${l.action}] ${l.details || ''}`);

        return {
            taskId: taskId || 'None',
            status: this.state.session.currentState,
            planSummary,
            activeClaims,
            lastSteps: logs,
            verificationStatus: this.state.session.isVerified ? 'VERIFIED' : 'PENDING'
        };
    }

    /**
     * Phase 4: Get Timeline
     */
    public async getTimeline(limit = 10): Promise<GitNoteMetadata[]> {
        const history = await gitManager.reconstructHistory();
        return history.slice(0, limit);
    }

    /**
     * Get project path
     */
    public getProjectPath(): string {
        return this.projectPath;
    }

    /**
     * Get current state (read-only)
     */
    public getState(): Readonly<DriftGuardState> {
        return this.state;
    }

    /**
     * Get current session
     */
    public getSession(): Readonly<DriftSession> {
        return this.state.session;
    }

    /**
     * Check if initialized
     */
    public isInitialized(): boolean {
        return this.initialized;
    }

    /**
     * Reset state (for testing)
     */
    public async reset(): Promise<void> {
        this.state = this.createInitialState();
        this.initialized = false;
        this.log('reset', undefined, 'State reset');
        await this.syncToDisk();
    }
}

// Export singleton instance
export const stateManager = StateManager.getInstance();

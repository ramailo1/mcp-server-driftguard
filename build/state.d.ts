/**
 * DriftGuard State Manager
 * The "Brain" - Manages session state with L2 filesystem persistence
 * Phase 2: Added L3 Git Notes integration and Intent-Action-Explanation loop
 */
import { FocusState, StrictnessLevel, TaskContract, DriftSession, DriftGuardState, HelpPacket, InitResult, CheckpointResult, VerifyResult, ExplainResult, GitNoteMetadata, ScopeClaim, HandoffPacket } from './types.js';
/**
 * StateManager Singleton
 * Manages the DriftSession and enforces state transition rules
 */
export declare class StateManager {
    private static instance;
    private state;
    private projectPath;
    private initialized;
    private constructor();
    /**
     * Get the singleton instance
     */
    static getInstance(): StateManager;
    /**
     * Create initial empty state
     */
    private createInitialState;
    /**
     * Get the .driftguard directory path
     */
    private getDriftGuardPath;
    /**
     * Get the tasks.json file path
     */
    private getTasksFilePath;
    /**
     * Get the ACTIVE_PLAN.md file path
     */
    private getActivePlanPath;
    /**
     * Add a log entry
     */
    private log;
    /**
     * Sync state to L2 (filesystem)
     */
    private syncToDisk;
    /**
     * Generate human-readable ACTIVE_PLAN.md
     */
    private generateActivePlan;
    /**
     * Get emoji for state
     */
    private getStateEmoji;
    /**
     * Hydrate state from L2 (filesystem)
     */
    hydrate(): Promise<boolean>;
    /**
     * Scan project to recommend strictness level
     */
    private scanForStrictness;
    /**
     * Validate state transition
     */
    private validateTransition;
    /**
     * Initialize DriftGuard in the project
     */
    initialize(projectPath?: string): Promise<InitResult>;
    /**
     * Update .gitignore to include .driftguard
     */
    private updateGitignore;
    /**
     * Propose a new task
     */
    proposeTask(title: string, goal: string, allowedScopes: string[], checklist: {
        id: string;
        text: string;
    }[], strictness?: StrictnessLevel): Promise<TaskContract>;
    /**
     * Begin a step (transition to EXECUTING)
     */
    beginStep(stepId?: string): Promise<{
        taskId: string;
        stepId: string;
        state: FocusState;
    }>;
    /**
     * Checkpoint - save progress and return to IDLE
     * Phase 2: Now gated by intentFiled and writes L3 Git Notes
     */
    checkpoint(summary: string, completedChecklistIds: string[]): Promise<CheckpointResult>;
    /**
     * Panic - emergency stop
     */
    panic(reason: string): Promise<HelpPacket>;
    /**
     * Report intent before making changes (Phase 2)
     * Transitions from PLANNING/IDLE to EXECUTING
     */
    reportIntent(intent: string, filesToTouch: string[]): Promise<{
        taskId: string;
        stepId: string;
        state: FocusState;
    }>;
    /**
     * Verify changes by running test command (Phase 2)
     */
    verify(): Promise<VerifyResult>;
    /**
     * Explain changes by comparing git diff to intent (Phase 2)
     */
    explainChange(): Promise<ExplainResult>;
    /**
     * Set test command for the active task (Phase 2)
     */
    setTestCommand(command: string): Promise<void>;
    /**
     * Phase 3: Claim a Scope
     */
    claimScope(paths: string[], exclusive: boolean): Promise<{
        granted: boolean;
        conflicts: ScopeClaim[];
    }>;
    /**
     * Phase 3: Delegate Task/Scope
     */
    delegateTask(subTaskTitle: string, subTaskGoal: string, subScope: string[]): Promise<TaskContract>;
    /**
     * Phase 3: Analyze Risk
     */
    analyzeRisk(targetPath: string): Promise<{
        score: number;
        reason: string;
    }>;
    /**
     * Helper to refresh the activeClaims cache in session
     */
    private refreshActiveClaims;
    /**
     * Phase 4: Calculate MD5 hashes for files matching patterns
     */
    private calculateFileHashes;
    /**
     * Phase 4: Check environment integrity
     */
    healthCheck(): Promise<{
        status: 'CLEAN' | 'DIRTY' | 'NO_CLAIMS';
        dirtyFiles: string[];
    }>;
    /**
     * Phase 4: Generate Handoff Packet
     */
    generateHandoff(): Promise<HandoffPacket>;
    /**
     * Phase 4: Get Timeline
     */
    getTimeline(limit?: number): Promise<GitNoteMetadata[]>;
    /**
     * Get project path
     */
    getProjectPath(): string;
    /**
     * Get current state (read-only)
     */
    getState(): Readonly<DriftGuardState>;
    /**
     * Get current session
     */
    getSession(): Readonly<DriftSession>;
    /**
     * Check if initialized
     */
    isInitialized(): boolean;
    /**
     * Reset state (for testing)
     */
    reset(): Promise<void>;
}
export declare const stateManager: StateManager;
//# sourceMappingURL=state.d.ts.map
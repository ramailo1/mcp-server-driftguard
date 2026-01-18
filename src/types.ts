/**
 * DriftGuard Data Contracts
 * Defines the core data structures for the "Firewall for Intelligence"
 * Phase 3: Added Scope Claims and Risk Analysis
 */

/**
 * Strictness levels define the rigor of validation
 * Higher levels require more verification before state transitions
 */
export enum StrictnessLevel {
    L1_VIBE = 1,        // No validation, simple logging
    L2_LOGGED = 2,      // Requires checklists
    L3_BALANCED = 3,    // Requires Intent + Basic Linting (Phase 2)
    L4_ENGINEERED = 4,  // Requires Test passing for Checkpoints (Phase 2)
    L5_CRITICAL = 5     // File-level claims + full CI + human approval
}

/**
 * Focus states represent the current phase of work
 * The state machine enforces valid transitions between these states
 */
export enum FocusState {
    IDLE = "IDLE",
    PLANNING = "PLANNING",
    EXECUTING = "EXECUTING",
    VALIDATING = "VALIDATING",
    PANIC = "PANIC"
}

/**
 * A checklist item within a task
 */
export interface ChecklistItem {
    id: string;
    text: string;
    status: 'todo' | 'done';
}

/**
 * TaskContract defines the scope and goals of a unit of work
 * This is the "contract" that the agent agrees to follow
 */
export interface TaskContract {
    taskId: string;
    title: string;
    goal: string;
    allowedScopes: string[]; // Access Control Lists (ACLs) - Glob patterns
    checklist: ChecklistItem[];
    strictness: StrictnessLevel;

    // Phase 2
    testCommand?: string;
    lastIntent?: string; // Stored intent from dg_report_intent
    filesToTouch?: string[]; // Files declared in intent

    // Phase 3
    parentTaskId?: string; // For delegated tasks
    subTaskIds?: string[]; // IDs of spawned child tasks
    claims?: ScopeClaim[]; // Active scope claims
    riskScore?: number; // 0-100 calculated risk

    createdAt: string;
    updatedAt: string;
}

// Phase 3: Scope Claim
export interface ScopeClaim {
    path: string;       // Glob pattern (e.g., "src/components/**")
    exclusive: boolean; // If true, no other taskId can claim an overlapping path
    ownerTaskId: string;
    createdAt: number;
}

/**
 * DriftSession represents the current active session state
 * This is the L1 (in-memory) representation that gets persisted to L2
 */
export interface DriftSession {
    sessionId: string;
    startTime: number;
    currentState: FocusState;
    activeTaskId?: string;
    activeStepId?: string;

    // Phase 2
    activeIntent?: string; // Transient intent for current step
    isVerified: boolean; // Has dg_verify passed for current changes?
    intentFiled: boolean; // Has dg_report_intent been called?

    // Phase 3
    activeClaims?: ScopeClaim[]; // Cache of currently active claims for quick lookup

    // Phase 4
    lastKnownFileHashes?: Record<string, string>; // path -> hash (for Integrity Check)
}

// Phase 4: Handoff Packet
export interface HandoffPacket {
    taskId: string;
    status: FocusState;
    planSummary: string;
    activeClaims: string[]; // Paths
    lastSteps: string[];    // Last 3 log entries
    verificationStatus: string;
}

/**
 * The complete persisted state stored in tasks.json
 */
export interface DriftGuardState {
    version: string;
    session: DriftSession;
    tasks: Record<string, TaskContract>;
    logs: LogEntry[];
}

/**
 * Log entry for audit trail
 */
export interface LogEntry {
    timestamp: string;
    action: string;
    taskId?: string;
    details?: string;
}

/**
 * Help packet returned during panic state
 */
export interface HelpPacket {
    currentTaskGoal: string | null;
    lastLogs: LogEntry[];
    panicReason: string;
    currentState: FocusState;
}

/**
 * Result of dg_init operation
 */
export interface InitResult {
    status: 'created' | 'exists';
    path: string;
    recommendedStrictness: StrictnessLevel;
    reason: string;
}

/**
 * Result of dg_checkpoint operation
 */
export interface CheckpointResult {
    status: 'saved';
    taskId: string;
    completedItems: number;
    totalItems: number;
    gitNoteWritten?: boolean; // Phase 2: Whether L3 Git Note was written
}

/**
 * Result of dg_verify operation (Phase 2)
 */
export interface VerifyResult {
    success: boolean;
    command: string;
    stdout: string;
    stderr: string;
    exitCode: number;
}

/**
 * Result of dg_explain_change operation (Phase 2)
 */
export interface ExplainResult {
    intent: string;       // What was planned
    changes: string;      // Files actually touched
    verification: string; // How to test
    diffSummary: string;  // Raw git diff --stat output
}

/**
 * Git Note metadata stored in L3 (Phase 2)
 */
export interface GitNoteMetadata {
    taskId: string;
    title: string;
    intent: string;
    summary: string;
    timestamp: string;
    filesChanged: string[];
}

/**
 * Error thrown when state transition is invalid
 */
export class StateTransitionError extends Error {
    constructor(
        public readonly action: string,
        public readonly fromState: FocusState,
        public readonly allowedFromStates: FocusState[]
    ) {
        super(
            `Invalid Transition: "${action}" not allowed from state "${fromState}". ` +
            `Allowed from: [${allowedFromStates.join(', ')}]`
        );
        this.name = 'StateTransitionError';
    }
}

/**
 * Error thrown when checkpoint is attempted without intent (Phase 2)
 */
export class IntentMissingError extends Error {
    constructor() {
        super(
            'PLAN_MISSING_INTENT: Cannot checkpoint without filing intent. ' +
            'Call dg_report_intent before dg_checkpoint.'
        );
        this.name = 'IntentMissingError';
    }
}

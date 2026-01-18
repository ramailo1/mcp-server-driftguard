/**
 * DriftGuard Type Definitions
 * The Data Contract for the "Firewall for Intelligence"
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
    strictness: StrictnessLevel;
    allowedScopes: string[]; // Glob patterns (e.g., "src/**/*.ts")
    checklist: ChecklistItem[];
    parentTaskId?: string;
    createdAt: string;
    updatedAt: string;
    // Phase 2 additions
    testCommand?: string;  // Command to run for verification (e.g., "npm test")
    lastIntent?: string;   // The last intent reported by the agent
    filesToTouch?: string[]; // Files declared in intent
}

/**
 * DriftSession represents the current active session state
 * This is the L1 (in-memory) representation that gets persisted to L2
 */
export interface DriftSession {
    activeTaskId: string | null;
    activeStepId: string | null;
    currentState: FocusState;
    dirtyBit: boolean;        // Placeholder for file change detection
    lastSnapshotHash: string; // Git HEAD hash or FS hash
    // Phase 2 additions
    isVerified: boolean;      // True if dg_verify has passed for the current step
    intentFiled: boolean;     // True if dg_report_intent was called
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

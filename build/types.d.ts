/**
 * DriftGuard Type Definitions
 * The Data Contract for the "Firewall for Intelligence"
 */
/**
 * Strictness levels define the rigor of validation
 * Higher levels require more verification before state transitions
 */
export declare enum StrictnessLevel {
    L1_VIBE = 1,// No validation, simple logging
    L2_LOGGED = 2,// Requires checklists
    L3_BALANCED = 3,// Requires Intent + Basic Linting (Phase 2)
    L4_ENGINEERED = 4,// Requires Test passing for Checkpoints (Phase 2)
    L5_CRITICAL = 5
}
/**
 * Focus states represent the current phase of work
 * The state machine enforces valid transitions between these states
 */
export declare enum FocusState {
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
    allowedScopes: string[];
    checklist: ChecklistItem[];
    parentTaskId?: string;
    createdAt: string;
    updatedAt: string;
    testCommand?: string;
    lastIntent?: string;
    filesToTouch?: string[];
}
/**
 * DriftSession represents the current active session state
 * This is the L1 (in-memory) representation that gets persisted to L2
 */
export interface DriftSession {
    activeTaskId: string | null;
    activeStepId: string | null;
    currentState: FocusState;
    dirtyBit: boolean;
    lastSnapshotHash: string;
    isVerified: boolean;
    intentFiled: boolean;
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
    gitNoteWritten?: boolean;
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
    intent: string;
    changes: string;
    verification: string;
    diffSummary: string;
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
export declare class StateTransitionError extends Error {
    readonly action: string;
    readonly fromState: FocusState;
    readonly allowedFromStates: FocusState[];
    constructor(action: string, fromState: FocusState, allowedFromStates: FocusState[]);
}
/**
 * Error thrown when checkpoint is attempted without intent (Phase 2)
 */
export declare class IntentMissingError extends Error {
    constructor();
}
//# sourceMappingURL=types.d.ts.map
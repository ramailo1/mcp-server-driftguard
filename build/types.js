/**
 * DriftGuard Type Definitions
 * The Data Contract for the "Firewall for Intelligence"
 */
/**
 * Strictness levels define the rigor of validation
 * Higher levels require more verification before state transitions
 */
export var StrictnessLevel;
(function (StrictnessLevel) {
    StrictnessLevel[StrictnessLevel["L1_VIBE"] = 1] = "L1_VIBE";
    StrictnessLevel[StrictnessLevel["L2_LOGGED"] = 2] = "L2_LOGGED";
    StrictnessLevel[StrictnessLevel["L3_BALANCED"] = 3] = "L3_BALANCED";
    StrictnessLevel[StrictnessLevel["L4_ENGINEERED"] = 4] = "L4_ENGINEERED";
    StrictnessLevel[StrictnessLevel["L5_CRITICAL"] = 5] = "L5_CRITICAL"; // File-level claims + full CI + human approval
})(StrictnessLevel || (StrictnessLevel = {}));
/**
 * Focus states represent the current phase of work
 * The state machine enforces valid transitions between these states
 */
export var FocusState;
(function (FocusState) {
    FocusState["IDLE"] = "IDLE";
    FocusState["PLANNING"] = "PLANNING";
    FocusState["EXECUTING"] = "EXECUTING";
    FocusState["VALIDATING"] = "VALIDATING";
    FocusState["PANIC"] = "PANIC";
})(FocusState || (FocusState = {}));
/**
 * Error thrown when state transition is invalid
 */
export class StateTransitionError extends Error {
    action;
    fromState;
    allowedFromStates;
    constructor(action, fromState, allowedFromStates) {
        super(`Invalid Transition: "${action}" not allowed from state "${fromState}". ` +
            `Allowed from: [${allowedFromStates.join(', ')}]`);
        this.action = action;
        this.fromState = fromState;
        this.allowedFromStates = allowedFromStates;
        this.name = 'StateTransitionError';
    }
}
/**
 * Error thrown when checkpoint is attempted without intent (Phase 2)
 */
export class IntentMissingError extends Error {
    constructor() {
        super('PLAN_MISSING_INTENT: Cannot checkpoint without filing intent. ' +
            'Call dg_report_intent before dg_checkpoint.');
        this.name = 'IntentMissingError';
    }
}
//# sourceMappingURL=types.js.map
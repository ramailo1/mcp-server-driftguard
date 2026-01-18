/**
 * DriftGuard Scope Manager
 * The "Traffic Controller" for agent collisions.
 * Handles hierarchical scope claims, conflict detection, and delegation logic.
 */

import { minimatch } from 'minimatch';
import { ScopeClaim, TaskContract } from './types.js';

export class ScopeManager {
    private static instance: ScopeManager;

    private constructor() { }

    public static getInstance(): ScopeManager {
        if (!ScopeManager.instance) {
            ScopeManager.instance = new ScopeManager();
        }
        return ScopeManager.instance;
    }

    /**
     * Check if a requested path conflicts with active claims.
     * 
     * Conflict Rules:
     * 1. If paths overlap (subset or superset) via glob matching.
     * 2. AND the existing claim is exclusive (or the new one is).
     * 3. UNLESS the existing claim is owned by a parent of the requestor (Delegation).
     * 
     * @param requestedPath Glob pattern being requested
     * @param requestorTaskId ID of the task requesting the scope
     * @param activeClaims List of all currently active claims in the session
     * @param tasks Map of all tasks (to check parent/child relationships)
     * @returns Conflicting ScopeClaim or null if granted
     */
    public checkConflict(
        requestedPath: string,
        requestorTaskId: string,
        activeClaims: ScopeClaim[],
        tasks: Record<string, TaskContract>
    ): ScopeClaim | null {
        for (const claim of activeClaims) {
            // Rule 3: Ignore claims owned by the requestor itself
            if (claim.ownerTaskId === requestorTaskId) {
                continue;
            }

            // Rule 3: Ignore claims owned by the parent of the requestor (Delegation)
            // The child is allowed to work within the parent's scope
            const requestorTask = tasks[requestorTaskId];
            if (requestorTask && requestorTask.parentTaskId === claim.ownerTaskId) {
                continue;
            }

            // Check overlap
            const overlap = this.checkOverlap(requestedPath, claim.path);

            if (overlap) {
                // Determine exclusivity conflict
                // If either is exclusive, it's a conflict (unless parent/child exception above applied)
                if (claim.exclusive) {
                    return claim;
                }
                // If the new claim wants to be exclusive, it conflicts with any existing overlap
                // (Assuming we pass 'exclusive' as arg if we wanted to enforce that too, 
                // but for now let's assume strictness: existing claims block new ones)
                return claim;
            }
        }

        return null;
    }

    /**
     * Check if two glob patterns overlap
     * returns true if A is subset of B, B is subset of A, or they intersect
     */
    private checkOverlap(pathA: string, pathB: string): boolean {
        // Direct match
        if (pathA === pathB) return true;

        // Check if A matches B (A is subset/file inside B's glob)
        // e.g. A="src/utils.ts", B="src/**" -> Match
        if (minimatch(pathA, pathB)) return true;

        // Check if B matches A (B is subset/file inside A's glob)
        // e.g. A="src/**", B="src/utils.ts" -> Match
        if (minimatch(pathB, pathA)) return true;

        // Check for partial intersection of two globs?
        // This is harder. For now, strict subset logic is usually enough for hierarchies.
        // e.g. src/auth/** and src/components/** do NOT match.

        // A simple heuristic: do they share a common base path?
        // For MVP, minimatch(A,B) || minimatch(B,A) covers the parent-child scope case.
        return false;
    }

    /**
     * validateDelegation
     * Ensures that a child task's scope is strictly a subset of the parent's scope.
     */
    public validateDelegation(
        parentScope: string[],
        childScope: string[]
    ): boolean {
        // Every path in childScope must be covered by at least one path in parentScope
        for (const childPath of childScope) {
            let covered = false;
            for (const parentPath of parentScope) {
                if (minimatch(childPath, parentPath) || childPath === parentPath) {
                    covered = true;
                    break;
                }
                // Special case: if parent is "src/**", it covers "src/utils/**"
                // But minimatch("src/utils/**", "src/**") might depend on options.
                // Generally simple-git globs work this way.
            }
            if (!covered) return false;
        }
        return true;
    }
}

export const scopeManager = ScopeManager.getInstance();

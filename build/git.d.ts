/**
 * DriftGuard Git Manager
 * Handles L3 (Git Notes) persistence for audit trails
 */
import { GitNoteMetadata } from './types.js';
/**
 * GitManager handles all Git operations for L3 storage
 */
export declare class GitManager {
    private static instance;
    private git;
    private projectPath;
    private _isRepo;
    private constructor();
    /**
     * Get the singleton instance
     */
    static getInstance(projectPath?: string): GitManager;
    /**
     * Check if current directory is a Git repository
     */
    isGitRepo(): Promise<boolean>;
    /**
     * Get the current HEAD commit hash
     */
    getHeadHash(): Promise<string | null>;
    /**
     * Get git diff stat output (summary of changes)
     */
    getDiffStat(): Promise<string>;
    /**
     * Get detailed git diff output
     */
    getDiffDetailed(): Promise<string>;
    /**
     * Get list of changed files
     */
    getChangedFiles(): Promise<string[]>;
    /**
     * Write a Git Note to the current HEAD commit
     * Uses refs/notes/driftguard namespace to avoid conflicts
     */
    writeNote(metadata: GitNoteMetadata): Promise<boolean>;
    /**
     * Read Git Note from a specific commit
     */
    readNote(commitHash?: string): Promise<GitNoteMetadata | null>;
    /**
     * List all commits with DriftGuard notes
     * Returns an array of commit hashes
     */
    listNotedCommits(): Promise<string[]>;
    /**
     * Reconstruct task history from Git Notes
     * Useful if .driftguard/ is deleted
     */
    reconstructHistory(): Promise<GitNoteMetadata[]>;
    /**
     * Update the project path
     */
    setProjectPath(path: string): void;
}
export declare const gitManager: GitManager;
//# sourceMappingURL=git.d.ts.map
/**
 * DriftGuard Git Manager
 * Handles L3 (Git Notes) persistence for audit trails
 */

import { simpleGit, SimpleGit, SimpleGitOptions } from 'simple-git';
import { GitNoteMetadata } from './types.js';

const DRIFTGUARD_NOTE_REF = 'refs/notes/driftguard';

/**
 * GitManager handles all Git operations for L3 storage
 */
export class GitManager {
    private static instance: GitManager;
    private git: SimpleGit;
    private projectPath: string;
    private _isRepo: boolean | null = null;

    private constructor(projectPath: string) {
        this.projectPath = projectPath;
        const options: Partial<SimpleGitOptions> = {
            baseDir: projectPath,
            binary: 'git',
            maxConcurrentProcesses: 1,
        };
        this.git = simpleGit(options);
    }

    /**
     * Get the singleton instance
     */
    public static getInstance(projectPath?: string): GitManager {
        if (!GitManager.instance) {
            GitManager.instance = new GitManager(projectPath || process.cwd());
        } else if (projectPath && projectPath !== GitManager.instance.projectPath) {
            // Update path if different
            GitManager.instance = new GitManager(projectPath);
        }
        return GitManager.instance;
    }

    /**
     * Check if current directory is a Git repository
     */
    public async isGitRepo(): Promise<boolean> {
        if (this._isRepo !== null) {
            return this._isRepo;
        }
        try {
            await this.git.revparse(['--git-dir']);
            this._isRepo = true;
            return true;
        } catch {
            this._isRepo = false;
            return false;
        }
    }

    /**
     * Get the current HEAD commit hash
     */
    public async getHeadHash(): Promise<string | null> {
        if (!(await this.isGitRepo())) {
            return null;
        }
        try {
            const hash = await this.git.revparse(['HEAD']);
            return hash.trim();
        } catch {
            return null;
        }
    }

    /**
     * Get git diff stat output (summary of changes)
     */
    public async getDiffStat(): Promise<string> {
        if (!(await this.isGitRepo())) {
            return 'Not a git repository';
        }
        try {
            const diff = await this.git.diff(['--stat']);
            return diff || 'No changes detected';
        } catch (error) {
            return `Error getting diff: ${error}`;
        }
    }

    /**
     * Get detailed git diff output
     */
    public async getDiffDetailed(): Promise<string> {
        if (!(await this.isGitRepo())) {
            return 'Not a git repository';
        }
        try {
            const diff = await this.git.diff();
            return diff || 'No changes detected';
        } catch (error) {
            return `Error getting diff: ${error}`;
        }
    }

    /**
     * Get list of changed files
     */
    public async getChangedFiles(): Promise<string[]> {
        if (!(await this.isGitRepo())) {
            return [];
        }
        try {
            const status = await this.git.status();
            const files: string[] = [
                ...status.modified,
                ...status.created,
                ...status.deleted,
                ...status.renamed.map(r => r.to),
            ];
            return [...new Set(files)]; // Deduplicate
        } catch {
            return [];
        }
    }

    /**
     * Write a Git Note to the current HEAD commit
     * Uses refs/notes/driftguard namespace to avoid conflicts
     */
    public async writeNote(metadata: GitNoteMetadata): Promise<boolean> {
        if (!(await this.isGitRepo())) {
            return false;
        }

        const headHash = await this.getHeadHash();
        if (!headHash) {
            return false;
        }

        try {
            const noteContent = JSON.stringify(metadata, null, 2);

            // Write note with --force to allow overwriting
            await this.git.raw([
                'notes',
                '--ref', DRIFTGUARD_NOTE_REF,
                'add',
                '-f', // Force overwrite if exists
                '-m', noteContent,
                headHash
            ]);

            return true;
        } catch (error) {
            console.error('Failed to write Git Note:', error);
            return false;
        }
    }

    /**
     * Read Git Note from a specific commit
     */
    public async readNote(commitHash?: string): Promise<GitNoteMetadata | null> {
        if (!(await this.isGitRepo())) {
            return null;
        }

        const hash = commitHash || await this.getHeadHash();
        if (!hash) {
            return null;
        }

        try {
            const noteContent = await this.git.raw([
                'notes',
                '--ref', DRIFTGUARD_NOTE_REF,
                'show',
                hash
            ]);

            return JSON.parse(noteContent.trim()) as GitNoteMetadata;
        } catch {
            // Note doesn't exist or parse error
            return null;
        }
    }

    /**
     * List all commits with DriftGuard notes
     * Returns an array of commit hashes
     */
    public async listNotedCommits(): Promise<string[]> {
        if (!(await this.isGitRepo())) {
            return [];
        }

        try {
            const output = await this.git.raw([
                'notes',
                '--ref', DRIFTGUARD_NOTE_REF,
                'list'
            ]);

            // Format: <note-object-hash> <commit-hash>
            const lines = output.trim().split('\n').filter(l => l);
            return lines.map(line => {
                const parts = line.split(' ');
                return parts[1] || parts[0]; // Get commit hash
            });
        } catch {
            return [];
        }
    }

    /**
     * Reconstruct task history from Git Notes
     * Useful if .driftguard/ is deleted
     */
    public async reconstructHistory(): Promise<GitNoteMetadata[]> {
        const commits = await this.listNotedCommits();
        const history: GitNoteMetadata[] = [];

        for (const hash of commits) {
            const note = await this.readNote(hash);
            if (note) {
                history.push(note);
            }
        }

        // Sort by timestamp descending (newest first)
        history.sort((a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );

        return history;
    }

    /**
     * Update the project path
     */
    public setProjectPath(path: string): void {
        this.projectPath = path;
        const options: Partial<SimpleGitOptions> = {
            baseDir: path,
            binary: 'git',
            maxConcurrentProcesses: 1,
        };
        this.git = simpleGit(options);
        this._isRepo = null; // Reset cache
    }
    /**
     * List files matching patterns
     */
    public async listFiles(patterns: string[]): Promise<string[]> {
        if (!(await this.isGitRepo())) {
            return [];
        }
        try {
            // git ls-files -c -o --exclude-standard -- pathspec...
            const output = await this.git.raw(['ls-files', '-c', '-o', '--exclude-standard', '--', ...patterns]);
            return output.split('\n').filter(s => s.trim().length > 0);
        } catch {
            return [];
        }
    }
}

// Export singleton instance
export const gitManager = GitManager.getInstance();

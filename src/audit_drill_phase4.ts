import { stateManager } from './state.js';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
    console.log("=== Phase 4 Audit Drill: Continuity ===");

    // Clean up
    if (fs.existsSync('.driftguard')) {
        fs.rmSync('.driftguard', { recursive: true, force: true });
    }

    // 1. Initialize
    console.log("\n[1] Initializing...");
    await stateManager.initialize();

    // 2. Propose & Claim (Snapshot Hashes)
    console.log("\n[2] Proposing Task & Claiming Scope...");
    const task = await stateManager.proposeTask("Continuity Task", "Test integrity", ['src/test_scope.txt'], []);
    // proposeTask sets activeTaskId now.

    // Create test file
    fs.writeFileSync('src/test_scope.txt', 'Version 1');

    const claim = await stateManager.claimScope(['src/test_scope.txt'], false);
    console.log(`Claimed: ${claim.granted}`);

    // 3. Health Check (Clean)
    console.log("\n[3] Health Check (Expect CLEAN)...");
    const health1 = await stateManager.healthCheck();
    console.log(`Status: ${health1.status}`);
    if (health1.status !== 'CLEAN') console.error("❌ Expected CLEAN");

    // 4. Out-of-Band Edit
    console.log("\n[4] Simulating Out-of-Band Edit...");
    fs.writeFileSync('src/test_scope.txt', 'Version 2 (Hacked)');

    // 5. Health Check (Dirty)
    console.log("\n[5] Health Check (Expect DIRTY)...");
    const health2 = await stateManager.healthCheck();
    console.log(`Status: ${health2.status}`);
    console.log(`Dirty Files: ${health2.dirtyFiles.join(', ')}`);
    if (health2.status === 'DIRTY') console.log("✅ Detected Manual Edit");
    else console.error("❌ Failed to detect edit");

    // 6. Checkpoint (Accept Changes)
    console.log("\n[6] Checkpoint (Accepting Changes)...");
    // Ensure reporting intent first (Phase 2 constraint)
    await stateManager.reportIntent("Update file", ["src/test_scope.txt"]);
    await stateManager.checkpoint("Accepted changes", []);

    // 7. Generate Handoff
    console.log("\n[7] Generating Handoff Packet...");
    // Checkpoint might reset active task?
    // If active task is reset, Handoff says "No active task".
    // But we check timeline anyway.
    const handoff = await stateManager.generateHandoff();
    console.log("Packet Task:", handoff.taskId);
    console.log("Plan Summary:", handoff.planSummary);

    // 8. Get Timeline
    console.log("\n[8] Getting Timeline...");
    // Need to have git notes written. Checkpoint does write notes.
    const timeline = await stateManager.getTimeline();
    console.log(`Timeline Entries: ${timeline.length}`);
    if (timeline.length > 0) {
        console.log(`Last Entry: ${timeline[0].summary}`);
    }

    console.log("\n=== Drill Complete ===");

    // Clean up test file
    try { fs.unlinkSync('src/test_scope.txt'); } catch { }
}

main().catch(console.error);

import { stateManager } from './state.js';
import { FocusState } from './types.js';

async function main() {
    console.log("=== Phase 3 Audit Drill ===");

    // 1. Initialize
    console.log("\n[1] Initializing...");
    await stateManager.initialize();

    // 2. Risk Analysis
    console.log("\n[2] Analyzing Risk...");
    const risk = await stateManager.analyzeRisk('src/index.ts');
    console.log(`Risk Score: ${risk.score}`);

    // 3. Propose Parent Task
    console.log("\n[3] Proposing Parent Task...");
    const parentTask = await stateManager.proposeTask(
        "Parent Task",
        "Manage scope",
        ['src/**'],
        [{ id: '1', text: 'work' }]
    );
    console.log(`Parent Task ID: ${parentTask.taskId}`);

    // 4. Claim Scope
    console.log("\n[4] Claiming Scope (src/**)...");
    const claimResult = await stateManager.claimScope(['src/**'], true); // Exclusive
    console.log(`Claim Granted: ${claimResult.granted}`);

    // 5. Simulate Rogue Task Conflict
    console.log("\n[5] Conflict Test (Simulating Rogue Task)...");
    // Propose Rogue Task
    const rogueTask = await stateManager.proposeTask(
        "Rogue Task",
        "Steal scope",
        ['src/index.ts'],
        [{ id: '1', text: 'steal' }]
    );
    // Switch to Rogue Task (proposeTask sets activeTaskId).
    console.log(`Rogue Task ID: ${rogueTask.taskId}`);

    // Try to claim overlapping scope
    try {
        const rogueClaim = await stateManager.claimScope(['src/index.ts'], false);
        console.log(`Rogue Claim Granted: ${rogueClaim.granted}`);
        if (!rogueClaim.granted) {
            console.log("✅ Conflict properly blocked!");
        } else {
            console.error("❌ Conflict FAILED (Allowed rogue claim!)");
        }
    } catch (e: any) {
        console.log(`Rogue Claim Error: ${e.message}`);
    }

    // 6. Restore Parent Task & Delegate
    console.log("\n[6] Delegation Test...");
    // Manually force state for testing
    console.log("Switching context back to Parent Task...");
    (stateManager as any).state.session.activeTaskId = parentTask.taskId;
    (stateManager as any).state.session.currentState = 'EXECUTING';

    try {
        const subTask = await stateManager.delegateTask(
            "Child Task",
            "Do sub work",
            ['src/index.ts'] // Subset of src/**
        );
        console.log(`✅ Delegated Child Task ID: ${subTask.taskId}`);
        console.log(`   Parent ID: ${subTask.parentTaskId}`);
    } catch (e: any) {
        console.error(`❌ Delegation FAILED: ${e.message}`);
    }

    console.log("\n=== Drill Complete ===");
}

main().catch(console.error);

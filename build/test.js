/**
 * Simple test script to verify DriftGuard MCP Server functionality
 * Run with: node build/test.js
 */
import { stateManager } from './state.js';
async function runTests() {
    console.log('🧪 DriftGuard Server Tests\n');
    let passed = 0;
    let failed = 0;
    // Test 1: Initialize
    console.log('Test 1: dg_init');
    try {
        const result = await stateManager.initialize();
        console.log(`  ✅ Status: ${result.status}`);
        console.log(`  ✅ Recommended Strictness: L${result.recommendedStrictness}`);
        passed++;
    }
    catch (error) {
        console.log(`  ❌ Error: ${error}`);
        failed++;
    }
    // Test 2: Propose Task
    console.log('\nTest 2: dg_propose_task');
    try {
        const task = await stateManager.proposeTask('Test Task', 'Verify that DriftGuard works correctly', ['src/**/*.ts'], [
            { id: 'step1', text: 'Create files' },
            { id: 'step2', text: 'Write tests' }
        ]);
        console.log(`  ✅ Task ID: ${task.taskId}`);
        console.log(`  ✅ State: ${stateManager.getSession().currentState}`);
        passed++;
    }
    catch (error) {
        console.log(`  ❌ Error: ${error}`);
        failed++;
    }
    // Test 3: State transition guard
    console.log('\nTest 3: State transition guard (checkpoint from PLANNING should fail)');
    try {
        await stateManager.checkpoint('Should fail', []);
        console.log(`  ❌ Should have thrown an error`);
        failed++;
    }
    catch (error) {
        if (error.name === 'StateTransitionError') {
            console.log(`  ✅ Correctly rejected: ${error.message}`);
            passed++;
        }
        else {
            console.log(`  ❌ Wrong error type: ${error}`);
            failed++;
        }
    }
    // Test 4: Begin step
    console.log('\nTest 4: dg_begin_step');
    try {
        const result = await stateManager.beginStep();
        console.log(`  ✅ Step ID: ${result.stepId}`);
        console.log(`  ✅ State: ${result.state}`);
        passed++;
    }
    catch (error) {
        console.log(`  ❌ Error: ${error}`);
        failed++;
    }
    // Test 5: Checkpoint
    console.log('\nTest 5: dg_checkpoint');
    try {
        const result = await stateManager.checkpoint('Completed first step', ['step1']);
        console.log(`  ✅ Status: ${result.status}`);
        console.log(`  ✅ Progress: ${result.completedItems}/${result.totalItems}`);
        console.log(`  ✅ State: ${stateManager.getSession().currentState}`);
        passed++;
    }
    catch (error) {
        console.log(`  ❌ Error: ${error}`);
        failed++;
    }
    // Test 6: Verify persistence by creating new instance
    console.log('\nTest 6: Persistence (hydrate from disk)');
    try {
        // Force re-read from disk
        const hydrated = await stateManager.hydrate();
        const state = stateManager.getState();
        console.log(`  ✅ Hydrated: ${hydrated}`);
        console.log(`  ✅ Tasks in state: ${Object.keys(state.tasks).length}`);
        console.log(`  ✅ Logs count: ${state.logs.length}`);
        passed++;
    }
    catch (error) {
        console.log(`  ❌ Error: ${error}`);
        failed++;
    }
    // Test 7: Panic
    console.log('\nTest 7: dg_panic');
    try {
        // First we need to begin a step again
        await stateManager.beginStep();
        const helpPacket = await stateManager.panic('Testing panic mode');
        console.log(`  ✅ Panic reason: ${helpPacket.panicReason}`);
        console.log(`  ✅ Current state: ${helpPacket.currentState}`);
        console.log(`  ✅ Last logs: ${helpPacket.lastLogs.length}`);
        passed++;
    }
    catch (error) {
        console.log(`  ❌ Error: ${error}`);
        failed++;
    }
    // Summary
    console.log('\n' + '='.repeat(40));
    console.log(`📊 Results: ${passed} passed, ${failed} failed`);
    console.log('='.repeat(40));
    // Check files exist
    console.log('\n📁 Files created:');
    const { promises: fs } = await import('fs');
    try {
        await fs.access('.driftguard/tasks.json');
        console.log('  ✅ .driftguard/tasks.json');
    }
    catch {
        console.log('  ❌ .driftguard/tasks.json NOT FOUND');
    }
    try {
        await fs.access('.driftguard/ACTIVE_PLAN.md');
        console.log('  ✅ .driftguard/ACTIVE_PLAN.md');
    }
    catch {
        console.log('  ❌ .driftguard/ACTIVE_PLAN.md NOT FOUND');
    }
    process.exit(failed > 0 ? 1 : 0);
}
runTests().catch(console.error);
//# sourceMappingURL=test.js.map
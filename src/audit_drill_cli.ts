
import { stateManager } from './state.js';
import * as fs from 'fs';
import * as path from 'path';

async function runAuditDrill() {
    console.log('🛡️ Starting Phase 2 Audit Drill (CLI Version)...\n');

    try {
        // 1. Initialize
        console.log('1. Initializing...');
        await stateManager.initialize(process.cwd());

        // 2. Propose Task
        console.log('2. Proposing Task...');
        const task = await stateManager.proposeTask(
            "Audit Drill Phase 2",
            "Verify explanation engine and L3 notes",
            ["package.json"],
            [{ id: "1", text: "Mod package.json" }]
        );
        console.log(`   Task ${task.taskId} proposed.`);

        // 3. Report Intent
        console.log('3. Reporting Intent...');
        await stateManager.reportIntent(
            "Bump version to 2.0.1",
            ["package.json"]
        );
        console.log('   Intent recorded.');

        // 4. Modify File (Simulate Agent Action)
        console.log('4. Modifying package.json...');
        const pkgPath = path.join(process.cwd(), 'package.json');
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        pkg.version = "2.0.1";
        fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
        console.log('   package.json updated to v2.0.1');

        // 5. Explain Change
        console.log('5. Explaining Change...');
        const explanation = await stateManager.explainChange();
        console.log('   Explanation generated:');
        console.log('   ---');
        console.log('   Intent:', explanation.intent);
        console.log('   Changes:', explanation.changes);
        console.log('   Verification:', explanation.verification);
        console.log('   ---');

        // 6. Checkpoint
        console.log('6. Checkpointing...');
        const result = await stateManager.checkpoint("Bumped version", ["1"]);
        console.log(`   Checkpoint saved. Git Note written: ${result.gitNoteWritten}`);

        if (result.gitNoteWritten) {
            console.log('\n✅ Audit Drill PASSED: All steps completed successfully.');
        } else {
            console.error('\n❌ Audit Drill FAILED: Git note was not written.');
            process.exit(1);
        }

    } catch (error) {
        console.error('\n❌ Audit Drill FAILED with error:', error);
        process.exit(1);
    }
}

runAuditDrill();

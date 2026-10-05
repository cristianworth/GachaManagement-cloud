import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const nodeOnly = args.includes('--node-only');
const dbOnly = args.includes('--db-only');
const jestArgs = args.filter(arg => arg !== '--node-only' && arg !== '--db-only');
const run = commandArgs => {
    const result = spawnSync(process.execPath, commandArgs, { cwd: root, stdio: 'inherit' });
    if (result.error) throw result.error;
    return result.status ?? 1;
};

let failed = false;
if (!nodeOnly && !dbOnly) {
    failed = run(['node_modules/jest/bin/jest.js', '--runInBand', ...jestArgs]) !== 0;
}
const files = dbOnly ? ['tests/database.test.mjs', 'tests/weeklyBatches.test.mjs'] : readdirSync(new URL('../tests/', import.meta.url))
    .filter(file => file.endsWith('.test.mjs')).sort().map(file => `tests/${file}`);
if (run(['--test', ...files]) !== 0) failed = true;
process.exitCode = failed ? 1 : 0;

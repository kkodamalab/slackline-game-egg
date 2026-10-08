import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const directory = process.argv[2] === 'browser' ? 'browser-tests' : 'test';
const files = readdirSync(directory).filter(f => f.endsWith('.test.js')).sort().map(f => `${directory}/${f}`);
if (!files.length) throw new Error(`No tests in ${directory}`);
// Pass explicit paths: Windows shells and Node 20 do not expand the same globs as Bash.
const result = spawnSync(process.execPath, ['--test', ...(directory === 'browser-tests' ? ['--test-concurrency=1'] : []), ...files], { stdio: 'inherit' });
process.exit(result.status ?? 1);

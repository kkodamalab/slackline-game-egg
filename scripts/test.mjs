import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const directory = process.argv[2] === 'browser' ? 'browser-tests' : 'test';
const files = readdirSync(directory).filter(f => f.endsWith('.test.js')).sort().map(f => `${directory}/${f}`);
if (!files.length) throw new Error(`No tests in ${directory}`);
// Pass explicit paths: Windows shells and Node 20 do not expand the same globs as Bash.
const capture = Boolean(process.env.GITHUB_ACTIONS);
const result = spawnSync(process.execPath, ['--test', ...(directory === 'browser-tests' ? ['--test-concurrency=1'] : []), ...files],
  { stdio: capture ? 'pipe' : 'inherit', encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
if (capture) {
  process.stdout.write(result.stdout ?? ''); process.stderr.write(result.stderr ?? '');
  if (result.status !== 0) {
    const output = (result.stdout ?? '') + (result.stderr ?? '');
    const start = output.indexOf('failing tests:');
    const details = (start >= 0 ? output.slice(start) : output.slice(-12000)).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
    console.log(`::error title=Test failure details::${details}`);
  }
}
process.exit(result.status ?? 1);

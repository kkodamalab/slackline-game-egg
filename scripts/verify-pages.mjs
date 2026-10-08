// Compare the real HTTPS deployment and its module graph with this checkout.
// No browser cache assumptions and no execution of downloaded JavaScript.
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
const root = new URL('../', import.meta.url);
const base = new URL('https://kkodamalab.github.io/slackline-game-egg/');
const normalize = text => text.replaceAll('\r\n', '\n');
const checked = new Set();
async function verify(url, file) {
  if (checked.has(url.href)) return;
  checked.add(url.href);
  let text;
  if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY) {
    // Use the existing proxy and verified TLS without exposing proxy credentials.
    const result = await run(process.platform === 'win32' ? 'curl.exe' : 'curl',
      ['--fail', '--silent', '--show-error', '--max-time', '15', url.href], { maxBuffer: 2 * 1024 * 1024 });
    text = result.stdout;
  } else {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`${response.status}: ${url}`);
    text = await response.text();
  }
  const expected = await readFile(new URL(file, root), 'utf8');
  if (normalize(text) !== normalize(expected)) throw new Error(`Published file differs from checkout: ${file}`);
  console.log(`OK ${url}`);
  if (file.endsWith('.js') && file.startsWith('src/')) {
    for (const match of text.matchAll(/(?:from\s+|import\(\s*)['"](\.\/[^'"]+)['"]/g)) {
      const dependency = new URL(match[1], url);
      if (!dependency.pathname.startsWith(base.pathname)) throw new Error(`Asset escaped project path: ${dependency}`);
      await verify(dependency, dependency.pathname.slice(base.pathname.length));
    }
  }
  return text;
}
const html = await verify(base, 'index.html');
if (!html.includes('id="phone-connection"') || !html.includes('value="phone"') || !html.includes('value="sensor"')) throw new Error('Four-input Host UI is not deployed');
for (const match of html.matchAll(/(?:src|href)="(\.\/[^"#]+\.(?:js|css)(?:\?[^"#]*)?)"/g)) {
  const url = new URL(match[1], base);
  await verify(url, url.pathname.slice(base.pathname.length));
}
console.log(`PASS: ${checked.size} published files match the current checkout.`);

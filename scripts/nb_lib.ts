// What both notebook gates share: the command line run in a child process, a notebook planted with a change, a source with a planted defect,
// a fake model, and the verdict of a run read from what it printed.
import { spawn } from 'node:child_process';
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export const ROOT = new URL('..', import.meta.url).pathname;
export const NB = path.join(ROOT, 'examples/notebook');
export const tmp = mkdtempSync(path.join(os.tmpdir(), 'nb-check-'));

export type Out = { code: number; out: string; stdout?: string; ms?: number };
export const node = (script: string, args: string[], env: Record<string, string> = {}, root = ROOT): Promise<Out> => new Promise((done) => {
  const t = performance.now(), p = spawn(process.execPath, ['--experimental-strip-types', path.join(root, script), ...args], { env: { ...process.env, ROFL_NB_DAEMON: '0', ...env } });
  let out = '', stdout = '';
  p.stdout.on('data', (d) => { out += d; stdout += d; }); p.stderr.on('data', (d) => { out += d; });
  const kill = setTimeout(() => p.kill(), 280_000);
  p.on('close', (code) => { clearTimeout(kill); done({ code: code ?? -1, out, stdout, ms: performance.now() - t }); });
});
export const cli = (args: string[], env: Record<string, string> = {}, root = ROOT) => node('notebook/cli.ts', args, env, root);

export const put = (to: string, text: string) => { mkdirSync(path.dirname(to), { recursive: true }); writeFileSync(to, text); };
/** A copy of a notebook, with its text changed, next to a copy of every file its front matter names; `also` replaces some of them. */
export function planted(name: string, from: string, change: (t: string) => string, also: [string, string][] = []): string {
  const text = readFileSync(path.join(NB, from), 'utf8');
  for (const f of [...(text.split(/^---$/m)[1] ?? '').matchAll(/^\s+- (.+)$/gm)].map((m) => path.join('examples/notebook', m[1]))) put(path.join(tmp, name, f), readFileSync(path.join(ROOT, f), 'utf8'));
  for (const [f, edit] of also) put(path.join(tmp, name, f), edit);
  const file = path.join(tmp, name, 'examples/notebook', from);
  put(file, change(text));
  return file;
}
/** A source with one planted line; a pattern that no longer matches is a check that plants nothing, so it throws. */
export function mutate(file: string, at: RegExp, plant: (m: string) => string): string {
  const src = readFileSync(path.join(ROOT, file), 'utf8'), out = src.replace(at, plant);
  if (out === src) throw new Error(`${file}: the planted defect did not apply`);
  return out;
}
/** The tree, linked, with its own copy of notebook/ and of the directory of `file`, in which that one file is replaced. */
export function linked(name: string, file: string, text: string): string {
  const root = path.join(tmp, name), copied = new Set(['notebook', file.split('/')[0]]);
  mkdirSync(root, { recursive: true });
  for (const e of readdirSync(ROOT)) if (!copied.has(e) && e !== '.git') symlinkSync(path.join(ROOT, e), path.join(root, e));
  for (const d of copied) cpSync(path.join(ROOT, d), path.join(root, d), { recursive: true });
  writeFileSync(path.join(root, file), text);
  return root;
}

export const REVIEW = path.join(NB, 'review.rofl.md');
export const withCell = (cell: string, kind = 'rofl') => (t: string) => `${t}\n\`\`\`${kind}\n${cell}\n\`\`\`\n`;
export const withNatural = withCell('No change touches a module nobody owns.', 'natural');
export const smallJs = readFileSync(path.join(NB, 'small.js'), 'utf8'), spinning = smallJs + '\nexport function spin(n) {\n  return n ? spin(n - 1) : 0;\n}\n';
export const fake = (name: string, answer: string) => { const f = path.join(tmp, name); writeFileSync(f, `#!/bin/sh\ncat > /dev/null\necho "$0" >> ${path.join(tmp, 'called')}\nprintf '[%s]' "$@" >> ${path.join(tmp, 'argv')}; echo " $(pwd -P)" >> ${path.join(tmp, 'argv')}\ncat <<'EOF'\n${answer}\nEOF\n`); chmodSync(f, 0o755); return f; };
export const spy = fake('spy.sh', 'x');
export const good = fake('good.sh', 'Here it is.\n```rofl\nA module M is unowned if some change touches M, unless some team owns M.\n\nnever M is unowned\n```');

export const results: [string, boolean, string][] = [];
export const check = (name: string, ok: boolean, o?: Out) => results.push([name, ok, ok || !o ? '' : `exit ${o.code}\n${o.out.slice(-1500)}`]);
export const has = (o: Out, s: string) => o.out.includes(s);
/** The verdict the run printed last, or in --json its status: an exit code alone is no verdict, since the code under check can exit early.
 *  The last line counts what was asked, and on an exit other than 0 names the code: `2 questions answered, none fails` or `... (exit 1; see npm run nb -- --help)`. */
export const STATUS = ['ok', 'fails', 'unread', 'blind'];
export const verdict = (o: Out): string | null => {
  const text = o.stdout ?? '';
  if (text.startsWith('{')) { try { return JSON.parse(text).status ?? null; } catch { return null; } }
  const last = text.trim().split('\n').pop() ?? '', m = /\(exit ([123]); see npm run nb -- --help\)$/.exec(last);
  return m ? STATUS[Number(m[1])] : /^\S+: (?:\d+ [a-z]|nothing asked|0 cells)[^—]*$/.test(last) ? 'ok' : null;
};
export const is = (o: Out, code: number) => o.code === code && verdict(o) === STATUS[code];
/** Every check as ok or FAIL, the count and the time, and the exit. */
export function report(what: string, t0: number): never {
  for (const [name, ok, why] of results) console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${why ? `\n${why.replace(/^/gm, '     ')}` : ''}`);
  const bad = results.filter((r) => !r[1]).length;
  console.log(`\n${results.length - bad}/${results.length} ${what}, ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  process.exit(bad ? 1 : 0);
}

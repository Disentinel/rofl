// repl.ts — interactive shell over the api. Not part of the evaluator.
// Commands:  ? L | why L | whynot L | excise F | budget N { CMD } |
//            load FILE | who NAME | retract F | tick | run [N] |
//            save FILE | restore FILE | facts [REL] | sentences on|off | quit
// Any other line ending in '.' is asserted as program text.
//
// `?`, `why` and `whynot` answer in the sentences of the document where a
// phrase exists (facts/phrases.rofl, facts/js-phrases.rofl, the `sig` and
// `phrase` facts of every loaded file and its `X.phrases.rofl` beside it),
// positionally where none does. A `.md` file loads through the reader.

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import { Rofl } from './api.ts';
import { Vocabulary } from './say.ts';
import { roflFromMd } from '../scripts/md_world.ts';

let rofl = new Rofl();
let who: string | undefined;
const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..') + '/';
const vocab = Vocabulary.fromFiles(ROOT, []);
let sentences = true;

function loadFile(f: string, budget?: number): { ok: boolean; diagnostics: string[] } {
  const p = f.endsWith('.md') ? roflFromMd(f) : f;
  const text = fs.readFileSync(p, 'utf8');
  vocab.addText(text);
  const beside = p.replace(/\.rofl$/, '') + '.phrases.rofl';
  if (fs.existsSync(beside)) vocab.addText(fs.readFileSync(beside, 'utf8'));
  return rofl.load(text, { who, budget });
}
/** The query with its answer's bindings put in, so the row can be said as the fact it is. */
function instance(query: string, bindings: Record<string, string>): string {
  return query.replace(/"[^"]*"|\b[A-Z][A-Za-z0-9_]*\b/g, (t) => (t.startsWith('"') ? t : bindings[t] ?? t));
}

const bootPath = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'boot.rofl');
if (fs.existsSync(bootPath)) {
  const res = rofl.load(fs.readFileSync(bootPath, 'utf8'));
  console.log(res.ok ? `loaded boot.rofl` : `boot.rofl failed: ${res.diagnostics.join('; ')}`);
}

function exec(line: string, budget?: number): void {
  line = line.trim();
  if (!line || line.startsWith('--')) return;
  const m = line.match(/^budget\s+(\d+)\s*\{(.*)\}$/s);
  if (m) return exec(m[2].trim(), parseInt(m[1], 10));
  if (line === 'quit' || line === 'exit') process.exit(0);
  if (line === 'tick') {
    const r = rofl.tickAdvance({ budget });
    console.log(JSON.stringify(r));
    return;
  }
  if (line.startsWith('run')) {
    const n = parseInt(line.slice(3).trim() || '1000', 10);
    const r = rofl.run({ maxTicks: n, budget });
    console.log(JSON.stringify(r));
    return;
  }
  if (line.startsWith('load ')) {
    const f = line.slice(5).trim();
    const r = loadFile(f, budget);
    console.log(r.ok ? 'ok' : 'REJECTED:\n' + r.diagnostics.join('\n'));
    return;
  }
  if (line === 'sentences on' || line === 'sentences off') { sentences = line.endsWith('on'); return; }
  if (line.startsWith('who ')) { who = line.slice(4).trim() || undefined; return; }
  if (line.startsWith('save ')) { fs.writeFileSync(line.slice(5).trim(), rofl.save()); console.log('saved'); return; }
  if (line.startsWith('restore ')) { rofl = Rofl.fromSnapshot(fs.readFileSync(line.slice(8).trim(), 'utf8')); console.log('restored'); return; }
  if (line.startsWith('facts')) {
    const rel = line.slice(5).trim() || undefined;
    for (const k of rofl.factKeys(rel)) console.log(k);
    return;
  }
  if (line.startsWith('?')) {
    const q = rofl.query(line.slice(1).trim(), { budget });
    if (q.error) { console.log('error: ' + q.error); return; }
    if (q.rows.length === 0) console.log('(empty)');
    for (const r of q.rows) {
      const s = sentences ? vocab.say(instance(line.slice(1).trim(), r.bindings)) : null;
      console.log(s ? (r.text ? `${s}  [${r.text}]` : s) : r.text);
    }
    if (q.partial) console.log('[partial: budget exhausted, hole emitted]');
    return;
  }
  const said = (t: string) => (sentences ? vocab.sayAll(t) : t);
  if (line.startsWith('why ')) { const w = rofl.why(line.slice(4).trim(), { budget }); console.log(w.ok ? said(w.text) : w.text); return; }
  if (line.startsWith('whynot ')) { console.log(said(rofl.whynot(line.slice(7).trim(), { budget }).text)); return; }
  if (line.startsWith('excise ')) {
    const r = rofl.excise(line.slice(7).trim(), { budget });
    if (!r.ok) { console.log('error: ' + r.error); return; }
    for (const k of r.removed) console.log('- ' + k);
    for (const k of r.added) console.log('+ ' + k);
    if (r.removed.length + r.added.length === 0) console.log('(no change)');
    return;
  }
  if (line.startsWith('retract ')) {
    const r = rofl.retract(line.slice(8).trim());
    console.log(r.ok ? 'ok' : r.diagnostics.join('; '));
    return;
  }
  const r = rofl.assert(line, { who });
  console.log(r.ok ? 'ok' : r.diagnostics.join('\n'));
}

const files = process.argv.slice(2);
for (const f of files) {
  const r = loadFile(f);
  console.log(r.ok ? `loaded ${f}` : `${f} REJECTED:\n` + r.diagnostics.join('\n'));
}

async function main(): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'rofl> ' });
  rl.prompt();
  for await (const l of rl) {
    try { exec(l); } catch (e) { console.log('error: ' + (e as Error).message); }
    rl.prompt();
  }
}
main();

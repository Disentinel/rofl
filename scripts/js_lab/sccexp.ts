// sccexp.ts — the one activation of all monotone rules, split into strongly connected components activated bottom-up,
// as a wrapper over AggEval.activate; the 20-round model at N files with and without it, public facts compared.
//   node --experimental-strip-types sccexp.ts <corpusRoot> <N>
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../../src/api.ts';
import { scan } from '../../scanners/js_ast.ts';
import { AggEval } from '../../src/aggeval.ts';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const [corpus, nArg] = process.argv.slice(2); const n = Number(nArg);
const pick = ['eslint', 'cli-engine', 'services', 'shared', 'config', 'linter', '.'];
function listJs(dir: string): string[] { const o: string[] = []; for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) { const p = path.join(dir, e.name); if (e.isDirectory()) o.push(...listJs(p)); else if (e.name.endsWith('.js')) o.push(p); } return o; }
const lists = pick.map((d) => listJs(path.join(corpus, d)));
const files: string[] = [];
for (let i = 0; files.length < n; i++) { const l = lists[i % lists.length]; const j = Math.floor(i / lists.length); if (j < l.length) files.push(l[j]); if (lists.every((l2) => Math.floor(i / lists.length) >= l2.length)) break; }
const q = (x: string) => '"' + x.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
function hostFacts(paths: string[], strings: Set<string>): string[] {
  const o: string[] = [], dirs = new Set(['.']);
  const dirOf = (p: string) => { const i = p.lastIndexOf('/'); return i < 0 ? '.' : p.slice(0, i); };
  for (const p of paths) for (let d = dirOf(p); d !== '.'; d = dirOf(d)) dirs.add(d);
  for (const d of dirs) { o.push(`fs_dir[code](${q(d)}).`); if (d !== '.') o.push(`fs_parent[code](${q(d)}, ${q(dirOf(d))}).`, `fs_dir_in[code](${q(dirOf(d))}, ${q(d.slice(d.lastIndexOf('/') + 1))}, ${q(d)}).`); }
  for (const p of paths) o.push(`fs_file[code](${q(p)}).`, `fs_dir_of[code](${q(p)}, ${q(dirOf(p))}).`, `fs_file_in[code](${q(dirOf(p))}, ${q(p.slice(p.lastIndexOf('/') + 1))}, ${q(p)}).`);
  for (const s of strings) { if (!s || s.includes('\n')) continue; const segs = s.split('/'); o.push(`str_segs[code](${q(s)}, ${segs.length}).`, `str_char0[code](${q(s)}, ${q(String.fromCodePoint(s.codePointAt(0)!))}).`); segs.forEach((g, k) => o.push(`str_seg[code](${q(s)}, ${k}, ${q(g)}).`)); if (s.indexOf(':') > 0) o.push(`str_scheme[code](${q(s)}, ${q(s.slice(0, s.indexOf(':')))}).`); }
  return o;
}
const facts: string[] = [], strings = new Set<string>();
for (const f of files) for (const fact of scan(fs.readFileSync(f, 'utf8'), { file: path.relative(corpus, f) }).facts) { facts.push(fact); const v = /^ast_attr\[code\]\(\w+, value, (".*")\)\.$/.exec(fact); if (v) strings.add(v[1].slice(1, -1).replace(/\\(.)/g, '$1')); }
const all = [...facts, ...hostFacts(files.map((f) => path.relative(corpus, f)), strings)];

// ---------------------------------------------------------------- the patch: SCCs of the first activation, bottom-up
const proto = AggEval.prototype as any;
const origActivate = proto.activate;
let sccLog = ''; const acts: string[] = [];
function sccActivate(this: any, rules: any[]) {
  acts.push(String(rules.length)); if (rules.length < 50) return origActivate.call(this, rules);
  // relation graph over these rules: head -> positive premises
  const heads = new Set(rules.map((r) => r.clause.head.rel));
  const dep = new Map<string, Set<string>>();
  for (const r of rules) { const h = r.clause.head.rel; if (!dep.has(h)) dep.set(h, new Set()); for (const p of r.posRels as string[]) if (heads.has(p)) dep.get(h)!.add(p); }
  // Tarjan
  let index = 0; const idx = new Map<string, number>(), low = new Map<string, number>(), onStack = new Set<string>(), stack: string[] = [];
  const comp = new Map<string, number>(); const comps: string[][] = [];
  const strong = (v: string) => {
    idx.set(v, index); low.set(v, index); index++; stack.push(v); onStack.add(v);
    for (const w of dep.get(v) ?? []) {
      if (!idx.has(w)) { strong(w); low.set(v, Math.min(low.get(v)!, low.get(w)!)); }
      else if (onStack.has(w)) low.set(v, Math.min(low.get(v)!, idx.get(w)!));
    }
    if (low.get(v) === idx.get(v)) { const c: string[] = []; let w: string; do { w = stack.pop()!; onStack.delete(w); comp.set(w, comps.length); c.push(w); } while (w !== v); comps.push(c); }
  };
  for (const h of [...heads].sort()) if (!idx.has(h)) strong(h);
  // Tarjan emits components in reverse topological order of the dependency edges (a component after everything it reads)
  const byComp: any[][] = comps.map(() => []);
  for (const r of rules) byComp[comp.get(r.clause.head.rel)!].push(r);
  const sizes = byComp.map((c) => c.length).filter((x) => x > 0);
  sccLog += ` [${rules.length} rules: ${comps.length} components, ${sizes.filter((x) => x > 1).length} multi-rule, largest ${Math.max(...sizes)}]`;
  for (const c of byComp) if (c.length) origActivate.call(this, c);
}

function run(name: string, model: string, patched: boolean) {
  const r = new Rofl({ space: 400_000_000, reuse: false });
  const l = r.load(model, { budget: 4_000_000_000 }); if (!l.ok) { console.error(name, l.diagnostics.slice(0, 3)); process.exit(1); }
  r.assert(all.join('\n'), { who: 'scanner' });
  const origMatch = proto.matchPremise; let calls = 0;
  proto.matchPremise = function (...rest: any[]) { calls++; return origMatch.apply(this, rest); };
  if (patched) proto.activate = sccActivate;
  const t = performance.now(); let rep: any;
  try { rep = r.evaluate(4_000_000_000); } finally { proto.matchPremise = origMatch; proto.activate = origActivate; }
  const ms = performance.now() - t;
  const ph = new Set([...fs.readFileSync('../../facts/js-phrases.rofl', 'utf8').matchAll(/^sig\((\w+),/gm)].map((m) => m[1]));
  const pub = new Set<string>();
  for (const f of r.store.allFacts()) { const first = f.args[0] as any; if (first && first.k === 'a' && /^r[0-9a-f]{8}$/.test(first.name)) continue; if (ph.has(f.rel) || f.persp === 'audit') pub.add(f.key); }
  console.log(`${name.padEnd(28)} files ${files.length} | eval ${ms.toFixed(0).padStart(6)} ms | premise calls ${String(calls).padStart(8)} | peakRows ${rep.peakRows} | facts ${r.store.factCount()} | public rows ${pub.size}${patched ? ' | activations ' + acts.join(',') + sccLog : ''}`);
  return pub;
}
const which = process.argv[4] ?? 'opt';
const model = fs.readFileSync(path.join(HERE, which === 'base' ? 'base-model.rofl' : 'opt-model.rofl'), 'utf8');
const a = run(which + ' model, as is', model, false);
const b = run(which + ' model, SCC activation', model, true);
let miss = 0, extra = 0; for (const k of a) if (!b.has(k)) miss++; for (const k of b) if (!a.has(k)) extra++;
console.log(`public facts: ${miss === 0 && extra === 0 ? 'IDENTICAL' : `DIFFER missing ${miss} extra ${extra}`}`);

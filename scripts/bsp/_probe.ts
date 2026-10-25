// K workers (rofl serve), barriers at the levels: each evaluates its group of files up to a level, the [surface] facts
// each made at that level (serve `published`) are passed to every other worker until none is new, then the next level. One JSON line per level and a
// last line with the times; the answers' union goes to OUT/union-K.txt.
//   node scripts/bsp/xwall.ts GROUPS_DIR K OUT     (GROUPS_DIR/g0 .. g{K-1}/f.rofl, scripts/bsp/split.py makes them)
import fs from 'node:fs';
import path from 'node:path';
import { RoflPort } from '../../runtime/port.ts';
import { MODEL_FILES } from '../../notebook/front.ts';

const ROOT = new URL('../..', import.meta.url).pathname;
const [G, kArg, OUT] = process.argv.slice(2);
const K = Number(kArg);
const bin = path.join(ROOT, 'rust/target/release/rofl');
const ms = (t: number) => Math.round(performance.now() - t);
const log = (o: unknown) => console.log(JSON.stringify(o));
const QUESTION = 'examples/vscode/side-effects.rofl';
type S = { port: { send: (o: object) => Promise<Record<string, unknown>> }; id: string };
const T = performance.now();
const gs = await Promise.all([...Array(K).keys()].map(async (k) => {
  const port = await RoflPort.start(bin);
  const pid = (port as unknown as { child: { pid: number } }).child.pid;
  const s = await port.fresh(4_000_000_000, { space: 400_000_000 });
  const t = performance.now();
  for (const f of MODEL_FILES) await s.loadFile(path.join(ROOT, f));
  await s.loadFile(`${G}/g${k}/f.rofl`);
  await s.loadFile(path.join(ROOT, QUESTION));
  await s.load('sealed(provenance).');
  return { k, port, pid, s, loadMs: ms(t) };
}));
const FWD: Record<string, [string, string, number[]]> = process.env.FWD ? JSON.parse(fs.readFileSync(process.env.FWD, 'utf8')) : {};
const splitArgs = (a: string) => { const out: string[] = []; let d = 0, q = false, cur = ''; for (let i = 0; i < a.length; i++) { const c = a[i]; if (q) { cur += c; if (c === '\\') { cur += a[++i]; } else if (c === '"') q = false; continue; } if (c === '"') { q = true; cur += c; continue; } if (c === '(' || c === '[') d++; if (c === ')' || c === ']') d--; if (c === ',' && d === 0) { out.push(cur.trim()); cur = ''; continue; } cur += c; } out.push(cur.trim()); return out; };
const forward = (text: string) => text.replace(/^(\w+)\[surface\]\((.*)\)\.$/gm, (l, r, a) => { const f = FWD[r]; if (!f) return l; const xs = splitArgs(a); return `${f[0]}[${f[1]}](${f[2].map((i) => xs[i]).join(', ')}).`; });
let fwdMs = 0;
const send = (g: typeof gs[0], o: object) => { const x = g.s as unknown as S; return x.port.send({ ...o, session: x.id }); };
const peakMb = (g: typeof gs[0]) => Number(/^VmHWM:\s+(\d+)/m.exec(fs.readFileSync(`/proc/${g.pid}/status`, 'utf8'))?.[1] ?? 0) / 1024;
const loadMs = Math.max(...gs.map((g) => g.loadMs));
const published = async (g: typeof gs[0]) => ((await send(g, { op: 'published' })).rofl as string);
const T0 = performance.now();
let barriers = 0, workMs = 0, readMs = 0, passed = 0;
let r0 = await Promise.all(gs.map(async (g) => { const t = performance.now(); const r = await send(g, { op: 'evaluate', wall: -1 }); return { ms: ms(t), next: r.next as number | null }; }));
workMs += Math.max(...r0.map((r) => r.ms));
while (r0[0].next != null) {
  const lv = r0[0].next;
  if (r0.some((r) => r.next !== lv)) throw new Error(`workers disagree on the next level: ${r0.map((r) => r.next)}`);
  r0 = await Promise.all(gs.map(async (g) => { const t = performance.now(); const r = await send(g, { op: 'evaluate_on', wall: lv }); return { ms: ms(t), next: r.next as number | null }; }));
  const evalMs = Math.max(...r0.map((r) => r.ms)); const evals = r0.map((r) => r.ms);
  workMs += evalMs;
  let admitMs = 0, rounds = 0;
  const adm = gs.map(() => 0), got = gs.map(() => 0);
  if (K > 1 && !process.env.ISO) for (;;) {
    const td = performance.now(); const pub = await Promise.all(gs.map(published)); readMs += ms(td);
    if (process.env.DUMP) fs.appendFileSync(process.env.DUMP, pub.map((p, j) => p.replace(/^/gm, `${lv} ${j} `).replace(/ $/, '')).join(''));
    if (pub.every((p) => p.length === 0)) break;
    barriers++; rounds++;
    const res = await Promise.all(gs.map(async (g) => {
      const t9 = performance.now(); const text = forward(pub.filter((p, j) => j !== g.k && p.length).join('')); fwdMs += ms(t9);
      if (!text) return 0;
      const n = text.split('\n').length - 1; passed += n; got[g.k] += n;
      const t2 = performance.now(); await send(g, { op: 'admit', rofl: text, joinable: !!process.env.JOIN });
      adm[g.k] += ms(t2); return ms(t2);
    }));
    admitMs += Math.max(...res); if (lv === 7) log({ round: rounds, res, n: pub.map((p) => p.split('\n').length - 1) });
  }
  workMs += admitMs;
  log({ lv, evalMs, admitMs, rounds, evals, adm, got });
}
const ASK = ['side_effect_value(S, F, V)', 'side_effect_site(S, F)', 'side_effect_form(S, F, T)', 'side_effect_count(F, N, V)'];
const union = new Set<string>();
for (const g of gs) for (const q of ASK) for (const r of (await g.s.ask(q)).rows) union.add(`${q.slice(0, q.indexOf('('))}(${r.join(', ')})`);
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(`${OUT}/union-${K}.txt`, [...union].sort().join('\n') + '\n');
log({ K, loadMs, workMs, readMs, wallMs: ms(T), barriers, passed, peakMbMax: Math.round(Math.max(...gs.map(peakMb))), peakMbSum: Math.round(gs.reduce((a, g) => a + peakMb(g), 0)), answers: union.size, fwdMs, evalOnly: ms(T0) });
for (const g of gs) await g.port.stop();
process.exit(0);

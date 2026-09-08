// scanners/store_trace.ts — RECORD THE STORE BOUNDARY, so it can be REPLAYED.
//
// `scanners/store_boundary.ts` COUNTS the calls the evaluator makes into
// `FactStore`. Counting decides whether the seam can cross a process; it does
// not decide what to put behind it, because a backend is chosen by what the
// calls COST, and that is a function of their order, their argument shapes and
// the wholesale `clearDerived` drop between them — none of which a histogram
// carries.
//
// So this records the same run as a TRACE: every call, in order, with its
// arguments interned and its ANSWER, and writes it where a Rust harness can
// replay it against a candidate store. A synthetic uniform-random KV benchmark
// would measure the wrong workload entirely: this one is twenty calls per fact
// with a fixed mix, 1.4 rows per point lookup, and a whole layer dropped at
// once.
//
// THE ANSWER IS RECORDED BECAUSE IT IS THE ORACLE. A replayed backend must
// agree with the reference on every `add` (is it new), every `get` (is it
// there) and the final live fact set. Row COUNTS are recorded too but are
// advisory for `argMatches`, which the port explicitly allows to over-answer
// in any order (src/store.ts:243).
//
// The instrument is store_boundary.ts's: the prototype is wrapped for one run
// and restored, so `src/` carries no recorder and no flag.
//
// usage: node --experimental-strip-types scanners/store_trace.ts [name ...]
// output: rust/storebench/traces/<name>.trace
import { Rofl } from '../src/api.ts';
import { Store, type FactRec } from '../src/store.ts';
import { canonTerm, type Term } from '../src/unify.ts';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const R = join(import.meta.dirname, '..') + '/';

/** String table. Everything crossing the boundary is a name, a perspective,
 *  a canonical argument rendering or a firing signature; ids make the trace
 *  small and make the replay's own interning honest — a backend is not
 *  charged for parsing text the engine would have handed it as a symbol. */
class Interner {
  private m = new Map<string, number>();
  list: string[] = [];
  id(s: string): number {
    let i = this.m.get(s);
    if (i === undefined) { i = this.list.length; this.list.push(s); this.m.set(s, i); }
    return i;
  }
}

/** Per-relation REUSE is on by default in the JS kernel (`src/api.ts:181`)
 *  and does not exist in the Rust engine at all: `Store::clear_derived`
 *  (rust/rofl/src/store.rs:888) takes no `keep` predicate, so the Rust
 *  fixpoint re-derives every layer whole. A trace taken with reuse ON is
 *  therefore not the Rust engine's workload, and it is also not REPLAYABLE —
 *  `clearDerived(keep)` retains a set the trace does not carry (measured on
 *  spat: 314 `derived_by` rows of one rule survive a drop). Both traces are
 *  emitted; the benchmark replays the second. */
function record(files: string[], reuse: boolean) {
  const sym = new Interner();
  const ops: string[] = [];
  // SEVEN STORES, NOT ONE. `npm run boundary` sums its counters over every
  // `Store` instance a run touches, and a run touches more than the world's:
  // `Evaluation` builds a SCRATCH store per kernel program it consults
  // (`policyStore`, src/engine.ts:232) and `load` clones a rollback backup
  // (src/api.ts:282). Measured on sensors: 7 instances, and the world's own is
  // 1305 of the 9131 adds. A replay that merged them would be replaying a
  // workload no single store ever saw, so each instance is tagged and the
  // replay gives each its own backend.
  const ids = new Map<any, number>();
  let cur = -1;
  const at = (self: any): void => {
    let id = ids.get(self);
    if (id === undefined) { id = ids.size; ids.set(self, id); }
    if (id !== cur) { ops.push(`x ${id}`); cur = id; }
  };
  const orig: Record<string, any> = {};
  const P = Store.prototype as any;

  const argIds = (args: Term[]) => args.map((a) => sym.id(canonTerm(a)));

  // The recorder's OWN lookups must not appear in the trace: `support` and
  // `witnessesOf` are handed a key and the trace wants the fact behind it, so
  // the callback calls `get` — and a wrapped `get` would record 34285 reads
  // the evaluator never made. It calls the ORIGINAL.
  const rawGet = Store.prototype.get;
  const look = (self: any, key: string): FactRec | undefined => rawGet.call(self, key);
  const wrap = (m: string, fn: (self: any, a: any[], r: any) => void) => {
    const p = P[m];
    orig[m] = p;
    P[m] = function (...a: any[]) { const r = p.apply(this, a); at(this); fn(this, a, r); return r; };
  };

  // add(rel, persp, args, {scope, base, frozen}) -> boolean(new)
  wrap('add', (_s, a, r) => {
    const ids = argIds(a[2] as Term[]);
    ops.push(`a ${sym.id(a[0])} ${sym.id(a[1])} ${a[3].base ? 1 : 0} ${a[3].frozen ? 1 : 0} ` +
             `${a[3].scope === 'tick' ? 1 : 0} ${r ? 1 : 0} ${ids.length}${ids.length ? ' ' + ids.join(' ') : ''}`);
  });
  // get(key) / has(key) -> the record. The key is decomposed so a backend with
  // a numeric identity is not forced to reconstruct the JS spelling.
  const keyOp = (c: string) => (_s: any, a: any[], r: any) => {
    const rec: FactRec | undefined = c === 'g' ? r : look(_s, a[0]);
    if (!rec) { ops.push(`${c} -1 -1 0 0`); return; }
    const ids = argIds(rec.args);
    ops.push(`${c} ${sym.id(rec.rel)} ${sym.id(rec.persp)} 1 ${ids.length}${ids.length ? ' ' + ids.join(' ') : ''}`);
  };
  wrap('get', keyOp('g'));
  wrap('has', keyOp('h'));
  wrap('relPersp', (_s, a, r) => ops.push(`p ${sym.id(a[0])} ${sym.id(a[1])} ${(r as any[]).length}`));
  wrap('relAll', (_s, a, r) => ops.push(`l ${sym.id(a[0])} ${(r as any[]).length}`));
  wrap('indexed', (_s, a, r) => ops.push(`i ${sym.id(a[0])} ${a[1] === null ? -1 : sym.id(a[1])} ${r ? 1 : 0}`));
  wrap('argMatches', (_s, a, r) => {
    const pos = a[3] as number[]; const vals = (a[4] as string[]).map((v) => sym.id(v));
    ops.push(`m ${sym.id(a[0])} ${a[1] === null ? -1 : sym.id(a[1])} ${a[2]} ${r === null ? -1 : (r as any[]).length} ` +
             `${pos.length} ${pos.join(' ')} ${vals.join(' ')}`);
  });
  // support(key, sig, witness) -> boolean(new). The witness is a rule id, a
  // tick and a premise list; its SIZE is what a backend stores, so the premise
  // count is carried and the premises themselves are not.
  wrap('support', (_s, a, r) => {
    const rec = look(_s, a[0]);
    const ids = rec ? argIds(rec.args) : [];
    ops.push(`s ${rec ? sym.id(rec.rel) : -1} ${rec ? sym.id(rec.persp) : -1} ${sym.id(a[1])} ` +
             `${sym.id(a[2].ruleId)} ${a[2].prems.length} ${r ? 1 : 0} ${ids.length}${ids.length ? ' ' + ids.join(' ') : ''}`);
  });
  wrap('supportCount', (_s, a) => { const rec = look(_s, a[0]); if (rec) ops.push(`n ${sym.id(rec.rel)} ${sym.id(rec.persp)} ${argIds(rec.args).length} ${argIds(rec.args).join(' ')}`); });
  wrap('witnessesOf', (_s, a, r) => { const rec = look(_s, a[0]); if (rec) { const ids = argIds(rec.args); ops.push(`w ${sym.id(rec.rel)} ${sym.id(rec.persp)} ${(r as any[]).length} ${ids.length}${ids.length ? ' ' + ids.join(' ') : ''}`); } });
  wrap('clearDerived', () => ops.push('c'));
  wrap('remove', (_s, a, r) => ops.push(`r ${r ? 1 : 0}`));
  wrap('perspectivesOf', (_s, a, r) => ops.push(`v ${sym.id(a[0])} ${(r as any[]).length}`));
  wrap('relCount', (_s, a, r) => ops.push(`o ${sym.id(a[0])} ${r}`));

  let live: string[] = [];
  let main = 0;
  let nstores = 1;
  try {
    const r = new Rofl({ reuse }); r.load(readFileSync(R + 'boot.rofl', 'utf8'));
    for (const f of files) r.load(readFileSync(R + f, 'utf8'));
    r.evaluate();
    live = r.store.allFactKeys().slice().sort();
    main = ids.get(r.store) ?? 0;
    nstores = ids.size;
  } finally { for (const m of Object.keys(orig)) P[m] = orig[m]; }
  return { sym, ops, live, main, nstores };
}

const WORLDS: Record<string, string[]> = {
  sensors: ['examples/sensors.rofl'],
  spat: readdirSync(R + 'examples/spat').filter((x) => x.endsWith('.rofl')).sort().map((x) => 'examples/spat/' + x),
  wtf: readdirSync(R + 'examples/wtf').filter((x) => x.endsWith('.rofl')).sort().map((x) => 'examples/wtf/' + x),
  goof: readdirSync(R + 'examples/goof').filter((x) => x.endsWith('.rofl')).sort().map((x) => 'examples/goof/' + x),
};

const want = process.argv.slice(2).filter((a) => !a.startsWith('--'));
for (const name of want.length ? want : Object.keys(WORLDS)) {
  const files = WORLDS[name];
  if (!files) { console.error(`unknown world ${name}`); continue; }
  // ONE PROCESS PER VARIANT. `safetyMemo` (src/engine.ts:220) caches the
  // kernel's policy answers for the life of the PROCESS, so the second world
  // evaluated in one node run never builds the scratch stores the first one
  // did. Measuring both variants in one process would credit the second with
  // the first's warm memo. The npm script runs this twice.
  for (const reuse of (process.argv.includes('--noreuse') ? [false] : [true])) {
  const { sym, ops, live, main, nstores } = record(files, reuse);
  const out: string[] = [`ROFLTRACE 2 ${name} ${main} ${nstores}`, `S ${sym.list.length}`];
  for (const s of sym.list) out.push(s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n'));
  out.push(`O ${ops.length}`);
  for (const o of ops) out.push(o);
  out.push(`F ${live.length}`);
  for (const k of live) out.push(k.replace(/\\/g, '\\\\').replace(/\n/g, '\\n'));
  const tag = reuse ? name : `${name}-noreuse`;
  const path = R + `rust/storebench/traces/${tag}.trace`;
  writeFileSync(path, out.join('\n') + '\n');
  let own = 0, cur = -1;
  for (const o of ops) { if (o.startsWith('x ')) cur = Number(o.slice(2)); else if (cur === main) own++; }
  console.log(`${tag.padEnd(18)} ${String(ops.length).padStart(8)} ops (${String(own).padStart(7)} on the world store)  ${String(live.length).padStart(7)} live facts  ${nstores} stores`);
  }
}

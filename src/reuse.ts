// reuse.ts — what a later evaluation of the same world need not derive again,
// and the scratch stores the kernel's own programs are asked in.
//
// A derived relation is a function of two things already in the store: the
// rules whose conclusions its dependency cone passes through, and the asserted
// facts those rules read. Fingerprint both and a relation whose fingerprint has
// not moved needs no re-derivation: its facts, its support counts and its
// witnesses are already the ones this evaluation would write. Nothing here
// names a relation; which relations are immune to data (the rule-shaped meta
// layer) and which are not (anything reading a per-fact table) is read off the
// cone policy.rofl derives.

import { type Term, mka, fnv1a } from './unify.ts';
import { type Clause } from './unify.ts';
import { denseClauses } from './dense.ts';
import { POLICY_DENSE } from './kernel-dense.ts';
import { Store, type FactStore, type FactRec } from './store.ts';
import { V, IFACE, RESERVED, MAIN, KERNEL_PERSP, relOfFactTerm, encodeRule, resolveClauseBooks } from './reflect.ts';

interface PolicyRow { rel: string; args: Term[]; persp: Term | null; }

/** A program the kernel ships, encoded once. It arrives in the DENSE form --
 *  facts and one-fact rules, read by src/dense.ts -- and not as source text,
 *  so that running the kernel's own policy does not require the surface
 *  parser. This installs nothing anywhere: the rows are held here and copied
 *  into a scratch store when a question is asked. A FACT keeps the
 *  perspective its own book resolves to; a RULE becomes reflection under the
 *  kernel's, which is where the readers look for it. */
const encoded = new Map<string, PolicyRow[]>();
function kernelProgram(src: string): PolicyRow[] {
  let rows = encoded.get(src);
  if (rows === undefined) {
    rows = [];
    for (const c0 of denseClauses(src)) {
      const c = resolveClauseBooks(c0);
      if (c.body.length === 0) rows.push({ rel: c.head.rel, args: c.head.args, persp: c.head.persp });
      else for (const f of encodeRule(c).facts) rows.push({ rel: f.rel, args: f.args, persp: null });
    }
    encoded.set(src, rows);
  }
  return rows;
}

/** A scratch store holding one of the kernel's own programs and nothing else.
 *  The caller copies in whatever reflection its question needs. */
export function policyStore(src: string): Store {
  const pol = new Store();
  for (const f of kernelProgram(src)) {
    // A RESERVED relation is auto-perspectived on read, so its rows belong to
    // the kernel's book; a fact of the program's own vocabulary belongs to the
    // book the clause resolved to, and reading it anywhere else finds nothing.
    const persp = f.persp !== null && f.persp.k === 'a' && !RESERVED.has(f.rel)
      ? f.persp.name : KERNEL_PERSP;
    pol.add(f.rel, persp, f.args, { scope: 'timeless', base: true });
  }
  return pol;
}

/** What the previous evaluation left standing. `hits` are the relations whose
 *  derived facts (and provenance) this evaluation reuses instead of deriving;
 *  `keys` is the fingerprint to record for every relation that could have been
 *  reused, hit or miss, so the NEXT evaluation can ask the same question. */
export interface ReusePlan { hits: Set<string>; keys: Map<string, string> }

export const noReuse = (): ReusePlan => ({ hits: new Set(), keys: new Map() });

/** A record the plan keeps: a fact of a reused relation, or the provenance
 *  record of one. Both would be rewritten identically by a scratch run. */
export function reusedRec(hits: Set<string>, rec: FactRec): boolean {
  if (hits.has(rec.rel)) return true;
  if (rec.rel !== V.derived_by) return false;
  const about = relOfFactTerm(rec.args[0]);
  return about !== null && hits.has(about);
}

/** A 53-bit string hash (cyrb53): wide enough that two programs asked of safety.rofl do not share an answer by accident. */
export function digest53(str: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${str.length}:${(h2 >>> 0).toString(16)}${(h1 >>> 0).toString(16)}`;
}
/** ASK THE KERNEL'S OWN PROGRAM. policy.rofl derives `rule_reads`,
 *  `rule_relation`, `cone` and `opaque_closed`; this copies the caller's
 *  reflection into a store of its own, runs the program there and unpacks the
 *  answer. It decides NOTHING. A store of its own, because the kernel's
 *  program costs in proportion to the program it describes, so a program's
 *  budget would pay for the kernel's questions about it. */
type PolicyAnswer = { rels: Set<string>; cone: Map<string, Set<string>>; opaqueClosed: Set<string> };
/** What policy.rofl said of a program, by a digest of what it was asked: the same rules asked again (every tick of a world,
 *  every evaluation after a fact) are answered from here. */
const policyMemo = new Map<string, PolicyAnswer>();
const POLICY_MEMO_CAP = 32;

function policyAnswer(store: FactStore, seed: ReadonlySet<string> | null, solve: (pol: Store) => void): PolicyAnswer {
  const parts: string[] = seed === null ? ['-'] : ['+', ...[...seed].sort()];
  for (const rel of [V.concludes, V.premise_pos, V.premise_neg]) for (const f of store.relAll(rel)) parts.push(f.key);
  const memoKey = digest53(parts.join('\n'));
  const hit = policyMemo.get(memoKey);
  if (hit !== undefined) return hit;
  const pol = policyStore(POLICY_DENSE);
  for (const rel of [V.concludes, V.premise_pos, V.premise_neg]) {
    for (const f of store.relAll(rel)) pol.add(rel, f.persp, f.args, { scope: 'timeless', base: true });
  }
  for (const rel of seed ?? []) pol.add(IFACE.opaque_seed, MAIN, [mka(rel)], { scope: 'timeless', base: true });
  solve(pol);
  const pairs = (rel: string): Map<string, Set<string>> => {
    const m = new Map<string, Set<string>>();
    for (const f of pol.relAll(rel)) {
      const a = f.args[0], b = f.args[1];
      if (a.k !== 'a' || b.k !== 'a') continue;
      let out = m.get(a.name);
      if (!out) { out = new Set(); m.set(a.name, out); }
      out.add(b.name);
    }
    return m;
  };
  const names = (rel: string): Set<string> => {
    const out = new Set<string>();
    for (const f of pol.relAll(rel)) if (f.args[0].k === 'a') out.add(f.args[0].name);
    return out;
  };
  const answer = { rels: names(IFACE.rule_relation), cone: pairs(IFACE.cone), opaqueClosed: names(IFACE.opaque_closed) };
  if (policyMemo.size >= POLICY_MEMO_CAP) policyMemo.clear();
  policyMemo.set(memoKey, answer);
  return answer;
}

/** THE PLAN. `schedule` is what this evaluation orders its negation phases by:
 *  the reuse gate compares it with what the last one wrote to
 *  `store.derivedSchedule`, because the schedule is an input no dependency cone
 *  can see (nothing reads it, yet it changes every answer: measured on
 *  examples/wtf, a model loaded with no strata then given the table served the
 *  wrong first-pass answers verbatim from the cache).
 *
 *  Nothing this evaluation re-derives may read anything it reuses: a relation
 *  whose own fingerprint moved is re-derived, and the fixpoint it is
 *  re-derived in is not the one a scratch run would have, so the canonical
 *  witness (the first firing in canonical order) would differ from a scratch
 *  run's. `hits` is shrunk until that holds. */
export function planReuse(store: FactStore, rules: { id: string; clause: Clause }[], schedule: string,
    solve: (pol: Store) => void, tableRead = true): ReusePlan {
  const hits = new Set<string>();
  const keys = new Map<string, string>();
  if (rules.length === 0) return { hits, keys };
  const scheduleHeld = schedule === store.derivedSchedule;

  const byHead = new Map<string, { id: string; clause: Clause }[]>();
  for (const r of rules) {
    let a = byHead.get(r.clause.head.rel);
    if (!a) { a = []; byHead.set(r.clause.head.rel, a); }
    a.push(r);
  }

  const first = policyAnswer(store, null, solve);
  const rels = new Set<string>([...byHead.keys(), ...first.rels]);

  // (1) relations whose contents this evaluation cannot promise to reproduce.
  //     A leaf is an input only if everything it holds survives clearDerived;
  //     a rule that stages '@next', or reads across the tick boundary, cannot
  //     promise its relation either.
  const opaque = new Set<string>();
  for (const rel of rels) {
    const rs = byHead.get(rel);
    if (!rs) {
      if (store.relAll(rel).some((f) => !f.base && !f.frozen)) opaque.add(rel);
      continue;
    }
    for (const r of rs) {
      if (r.clause.head.temporal !== 'now'
          || r.clause.body.some((b) => (b.t === 'pos' || b.t === 'neg') && b.lit.temporal !== 'now')) {
        opaque.add(rel); break;
      }
    }
  }
  for (const rel of policyAnswer(store, opaque, solve).opaqueClosed) opaque.add(rel);

  // (2) the dependency cone of every relation, opaque ones too
  const cone = new Map(first.cone);
  for (const rel of rels) if (!cone.has(rel)) cone.set(rel, new Set([rel]));

  // (3) the fingerprint: the inputs, the rules that transform them, the clock
  const inputHash = new Map<string, string>();
  const hashOf = (rel: string): string => {
    let h = inputHash.get(rel);
    if (h === undefined) {
      const parts: string[] = [];
      for (const f of store.relAll(rel)) if (f.base || f.frozen) parts.push(f.key);
      h = fnv1a(parts.join('\n'));
      inputHash.set(rel, h);
    }
    return h;
  };
  for (const [rel, c] of cone) {
    if (opaque.has(rel) || !byHead.has(rel)) continue;
    const parts: string[] = [String(store.tick)];
    for (const x of [...c].sort()) {
      parts.push(x + '=' + hashOf(x));
      for (const id of (byHead.get(x) ?? []).map((r) => r.id).sort()) parts.push(id);
    }
    keys.set(rel, fnv1a(parts.join('|')));
  }

  // (4) hits
  if (scheduleHeld) for (const [rel, k] of keys) if (store.derivedKeys.get(rel) === k) hits.add(rel);
  // a `stratum` this evaluation re-derives may not come out the table the reused relations were derived under; the rounds evaluator reads no table
  if (tableRead && byHead.has(IFACE.stratum) && !hits.has(IFACE.stratum)) hits.clear();
  for (;;) {
    let shrank = false;
    for (const x of rels) {
      if (hits.has(x) || !byHead.has(x)) continue;
      for (const y of cone.get(x) ?? []) if (hits.delete(y)) shrank = true;
    }
    if (!shrank) break;
  }
  return { hits, keys };
}

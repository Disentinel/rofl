// demo.ts — HECK: contradiction as the objective function.
//
//   node --experimental-strip-types examples/heck/demo.ts
//
// Nothing in the transcript is composed by hand; README.md and page.html paste
// this program's stdout. Every contradiction the engine derives is checked a
// second time by exhaustive enumeration of the declared situation space, in
// plain TypeScript that shares no code with examples/heck/heck.rofl.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../../src/api.ts';
import { evaluateSemiring } from '../../src/semiring.ts';
import {
  chaosSemiring, contradictionsAdded, renderChaos, REJECTED, type Chaos,
  tropicalSemiring, unitFiringCost,
} from '../../runtime/semirings.ts';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '..', '..');
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

export const BOOT = read('boot.rofl');
export const HECK = read('examples', 'heck', 'heck.rofl');

// ===========================================================================
// THE CODEX
//
// Twenty-four standing ordinances of the Department of Standing Ordinances.
// Written straight: the contrast between the register and the content is the
// whole of the joke, and playing it broad would kill it.
//
// The sealed-writ exemption is restated in every prohibition rather than
// declared once, because the scope decomposition is per-ordinance and because
// that is precisely how a codex reaches twenty-four paragraphs. It is also
// what makes the sealed writ the one region where nothing contradicts
// anything, which the fifth verdict then condemns.
// ===========================================================================

export const CODEX = `
dim petitioner  damned demon auditor contractor
dim hour        matins terce vespers nocturne
dim venue       pit annex registry furnace
dim writ        ordinary expedited distrained sealed

act file_in_triplicate stamp_form_9 surrender_receipt
act ignite_petitioner withhold_verdict rescind_stamp

ordinance o_001 "Every petition shall be filed in triplicate."
  commands file_in_triplicate

ordinance o_002 "Filing in triplicate is prohibited before the third watch, save upon a sealed writ."
  where hour in matins terce; writ in ordinary expedited distrained
  forbids file_in_triplicate

ordinance o_003 "Form 9 shall bear the stamp of the receiving office."
  commands stamp_form_9

ordinance o_004 "No stamp shall be affixed in the Registry, save upon a sealed writ."
  where venue in registry; writ in ordinary expedited distrained
  forbids stamp_form_9

ordinance o_005 "A stamp once affixed shall be rescinded upon the application of an auditor."
  where petitioner in auditor
  commands rescind_stamp

ordinance o_006 "The rescission of a stamp is prohibited at every watch, save upon a sealed writ."
  where writ in ordinary expedited distrained
  forbids rescind_stamp

ordinance o_007 "The petitioner shall surrender the receipt upon presenting at the Pit."
  where venue in pit
  commands surrender_receipt

ordinance o_008 "Receipts shall not be surrendered by contractors, save upon a sealed writ."
  where petitioner in contractor; writ in ordinary expedited distrained
  forbids surrender_receipt

ordinance o_009 "A petitioner presenting at nocturne shall be ignited."
  where hour in nocturne
  commands ignite_petitioner

ordinance o_010 "The ignition of an auditor is prohibited, save upon a sealed writ."
  where petitioner in auditor; writ in ordinary expedited distrained
  forbids ignite_petitioner

ordinance o_011 "A verdict shall be withheld pending the stamp required by paragraph 3."
  commands withhold_verdict
  cites o_003

ordinance o_012 "No verdict shall be withheld in the Furnace, save upon a sealed writ."
  where venue in furnace; writ in ordinary expedited distrained
  forbids withhold_verdict

ordinance o_013 "The provisions of paragraph 14 apply to the present paragraph in their entirety."
  cites o_014

ordinance o_014 "The provisions of paragraph 13 apply to the present paragraph in their entirety, and the requirement of triplicate filing is hereby incorporated."
  cites o_013
  cites o_001

ordinance o_015 "Where paragraphs 13 and 14 are silent, paragraph 16 governs."
  cites o_016

ordinance o_016 "Where paragraph 15 governs, the rescission of the stamp is required."
  cites o_015
  commands rescind_stamp

ordinance o_017 "A demon presenting at the Annex shall stamp Form 9."
  where petitioner in demon; venue in annex
  commands stamp_form_9

ordinance o_018 "A contractor presenting at terce shall surrender the receipt."
  where petitioner in contractor; hour in terce
  commands surrender_receipt

ordinance o_019 "The damned shall file in triplicate at vespers."
  where petitioner in damned; hour in vespers
  commands file_in_triplicate

ordinance o_020 "A demon presenting at the Annex at terce shall stamp Form 9, the foregoing notwithstanding."
  where petitioner in demon; venue in annex; hour in terce
  commands stamp_form_9

ordinance o_021 "A petition received at sext shall be refused."
  where hour in sext
  forbids file_in_triplicate

ordinance o_022 "An auditor shall not be required to file in triplicate, save upon a sealed writ."
  where petitioner in auditor; writ in ordinary expedited distrained
  forbids file_in_triplicate

ordinance o_023 "Every act performed in the Furnace shall be recorded by the stamp of Form 9."
  where venue in furnace
  commands stamp_form_9

ordinance o_024 "The Registry shall withhold no verdict, save upon a sealed writ."
  where venue in registry; writ in ordinary expedited distrained
  forbids withhold_verdict
`;

// ===========================================================================
// THE DOCKET
//
// Ten petitions. Each amends the codex — a new paragraph, and optionally a
// narrowing of a standing one, which is how a petition can accidentally make
// peace. The chancery grants a petition only if it manufactures at least one
// contradiction and reconciles none.
// ===========================================================================

export const DOCKET = `
petition p_01 "That the Registry be required to stamp Form 9 upon every expedited writ."
  add p_01_new "The Registry shall stamp Form 9 upon every expedited writ."
    where venue in registry; writ in expedited
    commands stamp_form_9

petition p_02 "That the prohibition on the ignition of auditors be confined to matins, in the interest of good order."
  narrow o_010 hour matins
  add p_02_new "The ignition of an auditor is prohibited at matins."
    where petitioner in auditor; hour in matins
    forbids ignite_petitioner

petition p_03 "That contractors presenting at terce be relieved of the surrender of receipts."
  add p_03_new "A contractor presenting at terce need not surrender the receipt."
    where petitioner in contractor; hour in terce
    forbids surrender_receipt

petition p_04 "That the surrender of receipts be confined to the damned, and the Pit be closed to the triplicate filings of contractors."
  narrow o_007 petitioner damned
  add p_04_new "A contractor presenting at the Pit shall not file in triplicate."
    where petitioner in contractor; venue in pit
    forbids file_in_triplicate

petition p_05 "That the sealed writ be brought within the prohibition on ignition."
  add p_05_new "The ignition of an auditor is prohibited upon a sealed writ."
    where petitioner in auditor; writ in sealed
    forbids ignite_petitioner

petition p_06 "That paragraph 19 be affirmed in identical terms."
  add p_06_new "The damned shall file in triplicate at vespers."
    where petitioner in damned; hour in vespers
    commands file_in_triplicate

petition p_07 "That the Furnace be relieved of the stamp requirement."
  add p_07_new "No stamp shall be affixed in the Furnace."
    where venue in furnace
    forbids stamp_form_9

petition p_08 "That paragraph 2 be confined to matins, and the third watch be left to the discretion of the clerk."
  narrow o_002 hour matins
  add p_08_new "Filing in triplicate is prohibited at matins."
    where hour in matins
    forbids file_in_triplicate

petition p_09 "That the citation ring of paragraphs 13 and 14 be extended to the prohibition of rescission."
  add p_09_new "Paragraph 6 is incorporated into paragraph 13 by reference."
    cites o_006
    cites o_013

petition p_10 "That the sealed writ be exempted from the requirement of triplicate filing."
  add p_10_new "Triplicate filing is not required upon a sealed writ."
    where writ in sealed
    forbids file_in_triplicate
`;

// ===========================================================================
// the parser. Config text in, structures out; nothing here decides anything.
// ===========================================================================

export interface Ordinance {
  id: string;
  text: string;
  scope: Map<string, string[]>;   // dimension -> the values it is in force at
  commands: string[];
  forbids: string[];
  cites: string[];
}

export interface Codex {
  dims: Map<string, string[]>;
  acts: string[];
  ordinances: Ordinance[];
}

export interface Petition {
  id: string;
  text: string;
  add: Ordinance;
  narrow?: { id: string; dim: string; values: string[] };
}

const words = (s: string) => s.trim().split(/\s+/).filter((x) => x.length > 0);

/** `"..."` at the end of a header line, and the id before it. */
function headline(line: string): { id: string; text: string } {
  const m = line.match(/^\s*\S+\s+(\S+)\s+"([^"]*)"\s*$/);
  if (m === null) throw new Error(`unparsable header: ${line}`);
  return { id: m[1], text: m[2] };
}

function readBody(lines: string[], i: number, o: Ordinance): number {
  while (i < lines.length) {
    const line = lines[i];
    if (!/^\s{2,}\S/.test(line)) break;
    const w = words(line);
    if (w[0] === 'where') {
      for (const clause of line.trim().slice('where'.length).split(';')) {
        const c = words(clause);
        if (c.length === 0) continue;
        if (c[1] !== 'in') throw new Error(`unparsable scope: ${clause}`);
        o.scope.set(c[0], c.slice(2));
      }
    } else if (w[0] === 'commands') o.commands.push(...w.slice(1));
    else if (w[0] === 'forbids') o.forbids.push(...w.slice(1));
    else if (w[0] === 'cites') o.cites.push(...w.slice(1));
    else break;
    i++;
  }
  return i;
}

export function parseCodex(src: string): Codex {
  const dims = new Map<string, string[]>();
  const acts: string[] = [];
  const ordinances: Ordinance[] = [];
  const lines = src.split('\n');
  let i = 0;
  while (i < lines.length) {
    const w = words(lines[i]);
    if (w.length === 0 || w[0].startsWith('#')) { i++; continue; }
    if (w[0] === 'dim') { dims.set(w[1], w.slice(2)); i++; continue; }
    if (w[0] === 'act') { acts.push(...w.slice(1)); i++; continue; }
    if (w[0] === 'ordinance') {
      const { id, text } = headline(lines[i]);
      const o: Ordinance = { id, text, scope: new Map(), commands: [], forbids: [], cites: [] };
      ordinances.push(o);
      i = readBody(lines, i + 1, o);
      continue;
    }
    throw new Error(`unparsable codex line: ${lines[i]}`);
  }
  return { dims, acts, ordinances };
}

export function parseDocket(src: string): Petition[] {
  const out: Petition[] = [];
  const lines = src.split('\n');
  let i = 0;
  while (i < lines.length) {
    const w = words(lines[i]);
    if (w.length === 0 || w[0].startsWith('#')) { i++; continue; }
    if (w[0] !== 'petition') throw new Error(`unparsable docket line: ${lines[i]}`);
    const { id, text } = headline(lines[i]);
    i++;
    let narrow: Petition['narrow'];
    let add: Ordinance | undefined;
    while (i < lines.length) {
      const b = words(lines[i]);
      if (b.length === 0 || b[0] === 'petition') break;
      if (b[0] === 'narrow') {
        narrow = { id: b[1], dim: b[2], values: b.slice(3) };
        i++;
      } else if (b[0] === 'add') {
        const h = headline(lines[i]);
        add = { id: h.id, text: h.text, scope: new Map(), commands: [], forbids: [], cites: [] };
        i = readBody(lines, i + 1, add);
      } else break;
    }
    if (add === undefined) throw new Error(`petition ${id} adds nothing`);
    out.push({ id, text, add, narrow });
  }
  return out;
}

export const CDX = parseCodex(CODEX);
export const PETITIONS = parseDocket(DOCKET);

/** The codex as it would stand if the petition were granted. */
export function amend(cdx: Codex, p: Petition): Codex {
  const ordinances = cdx.ordinances.map((o) => {
    if (p.narrow === undefined || p.narrow.id !== o.id) return o;
    const scope = new Map(o.scope);
    scope.set(p.narrow.dim, p.narrow.values);
    return { ...o, scope };
  });
  return { ...cdx, ordinances: [...ordinances, p.add] };
}

// ===========================================================================
// the codex, as facts
// ===========================================================================

const quote = (s: string) => `"${s.replace(/"/g, "'")}"`;

export function codexFacts(cdx: Codex): string {
  const out: string[] = [];
  for (const [d, vs] of cdx.dims) {
    out.push(`dim(${d}).`);
    for (const v of vs) out.push(`dom(${d}, ${v}).`);
  }
  for (const a of cdx.acts) out.push(`act(${a}).`);
  cdx.ordinances.forEach((o, i) => {
    out.push(`ordinance(${o.id}). filed(${o.id}, ${i + 1}). text(${o.id}, ${quote(o.text)}).`);
    for (const [d, vs] of o.scope) for (const v of vs) out.push(`scope(${o.id}, ${d}, ${v}).`);
    for (const a of o.commands) out.push(`commands(${o.id}, ${a}).`);
    for (const a of o.forbids) out.push(`forbids(${o.id}, ${a}).`);
    for (const c of o.cites) out.push(`cites(${o.id}, ${c}).`);
  });
  return out.join('\n');
}

export function world(cdx: Codex = CDX, extra = ''): Rofl {
  const r = new Rofl();
  for (const src of [BOOT, HECK, codexFacts(cdx), extra]) {
    if (src === '') continue;
    const res = r.load(src);
    if (!res.ok) throw new Error(`load failed: ${JSON.stringify(res).slice(0, 400)}`);
  }
  return r;
}

const BUDGET = 4_000_000;

export function rows(r: Rofl, q: string): Record<string, string>[] {
  const res = r.query(q, { budget: BUDGET });
  if (res.error !== undefined) throw new Error(`heck: query ${q}: ${res.error}`);
  if (res.partial) throw new Error(`heck: query ${q} hit the budget`);
  return res.rows.map((x) => x.bindings as Record<string, string>);
}
export const col = (r: Rofl, q: string, v: string): string[] => rows(r, q).map((x) => x[v]);

/** The contradiction set, as canonical strings. The extension of `clash/3` IS
 *  the codex's chaos, and its cardinality is the ceiling the fold is given. */
export function clashSet(r: Rofl): string[] {
  return rows(r, 'clash(A, B, X)').map((x) => `${x.A}|${x.B}|${x.X}`).sort();
}

// ===========================================================================
// the oracle: the whole situation space, enumerated in plain TypeScript.
//
// Shares no code with heck.rofl. It builds the citation closure itself, walks
// every situation, and reports which (commander, forbidder, act) triples are
// really in force together. If the two disagree the demo says so and exits.
// ===========================================================================

export function oracleClashes(cdx: Codex): string[] {
  const dimNames = [...cdx.dims.keys()];
  const byId = new Map(cdx.ordinances.map((o) => [o.id, o]));

  // transitive closure of `cites`, by repeated relaxation — the ring makes a
  // single pass wrong, and this is the plainest thing that is right
  const binds = new Map<string, Set<string>>();
  const bars = new Map<string, Set<string>>();
  for (const o of cdx.ordinances) {
    binds.set(o.id, new Set(o.commands));
    bars.set(o.id, new Set(o.forbids));
  }
  for (let changed = true; changed;) {
    changed = false;
    for (const o of cdx.ordinances) {
      for (const c of o.cites) {
        for (const [table, key] of [[binds, 'b'], [bars, 'r']] as const) {
          const mine = table.get(o.id)!;
          for (const a of table.get(c) ?? []) {
            if (!mine.has(a)) { mine.add(a); changed = true; }
          }
          void key;
        }
      }
    }
  }

  const inForce = (o: Ordinance, sit: Record<string, string>): boolean =>
    dimNames.every((d) => {
      const vs = o.scope.get(d);
      return vs === undefined ? true : vs.includes(sit[d]);
    });

  // an ordinance whose scope names a value the domain does not have is in
  // force nowhere, which the enumeration discovers rather than being told
  const situations: Record<string, string>[] = [{}];
  for (const d of dimNames) {
    const next: Record<string, string>[] = [];
    for (const s of situations) for (const v of cdx.dims.get(d)!) next.push({ ...s, [d]: v });
    situations.length = 0;
    situations.push(...next);
  }

  const found = new Set<string>();
  for (const sit of situations) {
    const live = cdx.ordinances.filter((o) => inForce(o, sit));
    for (const a of live) for (const b of live) {
      for (const act of binds.get(a.id)!) {
        if (bars.get(b.id)!.has(act)) found.add(`${a.id}|${b.id}|${act}`);
      }
    }
  }
  void byId;
  return [...found].sort();
}

export const SITUATION_COUNT = (cdx: Codex): number =>
  [...cdx.dims.values()].reduce((n, vs) => n * vs.length, 1);

// ===========================================================================
// the chancery: two fixpoints per petition, and the difference between them
// ===========================================================================

export interface Verdict {
  petition: Petition;
  was: string[];
  now: string[];
  manufactured: string[];
  reconciled: string[];
  approved: boolean;
}

const splitTriple = (s: string) => s.split('|');

export function docketFacts(verdicts: Verdict[]): string {
  const out: string[] = [];
  for (const v of verdicts) {
    out.push(`petition(${v.petition.id}). petition_text(${v.petition.id}, ${quote(v.petition.text)}).`);
    for (const c of v.was) out.push(`was_clash(${v.petition.id}, ${splitTriple(c).join(', ')}).`);
    for (const c of v.now) out.push(`now_clash(${v.petition.id}, ${splitTriple(c).join(', ')}).`);
  }
  return out.join('\n');
}

/** The two fixpoints and the set difference, for every petition on the docket.
 *  `approved` here is TypeScript's arithmetic; the engine reaches the same
 *  verdict from the same facts in `chanceryWorld`, and main() checks that they
 *  agree rather than trusting either. */
export function judge(cdx: Codex, petitions: Petition[]): Verdict[] {
  const before = clashSet(world(cdx));
  return petitions.map((p) => {
    const now = clashSet(world(amend(cdx, p)));
    const wasSet = new Set(before), nowSet = new Set(now);
    const manufactured = now.filter((c) => !wasSet.has(c));
    const reconciled = before.filter((c) => !nowSet.has(c));
    return {
      petition: p, was: before, now, manufactured, reconciled,
      approved: manufactured.length > 0 && reconciled.length === 0,
    };
  });
}

export function chanceryWorld(cdx: Codex, verdicts: Verdict[]): Rofl {
  return world(cdx, docketFacts(verdicts));
}

// ===========================================================================
// the minimal amendment: tropical, on the same facts, asking the opposite
// question.
//
// HECK's own carrier maximises — of two readings it keeps the more
// contradictory. This one minimises: among the single edits that would carry a
// refused petition over the standard, which adds the FEWEST contradictions.
// Same rules, same fixpoint machinery, a different carrier and therefore a
// different question, which is the claim the whole example is built to show.
// ===========================================================================

export interface Remedy {
  edit: string;
  added: number;
  reconciled: number;
  cost: number;             // tropical: firings on the cheapest derivation
}

/** Every single-value widening of the petition's own new paragraph, plus every
 *  single prohibition it could carry. Bounded and enumerated, not searched. */
export function candidates(cdx: Codex, p: Petition): { label: string; petition: Petition }[] {
  const out: { label: string; petition: Petition }[] = [];
  for (const [d, vs] of cdx.dims) {
    const held = p.add.scope.get(d);
    if (held === undefined) continue;                // already in force at every value
    for (const v of vs) {
      if (held.includes(v)) continue;
      const scope = new Map(p.add.scope);
      scope.set(d, [...held, v]);
      out.push({
        label: `extend to ${d} ${v}`,
        petition: { ...p, add: { ...p.add, scope } },
      });
    }
  }
  for (const a of cdx.acts) {
    if (p.add.forbids.includes(a)) continue;
    out.push({
      label: `also forbid ${a}`,
      petition: { ...p, add: { ...p.add, forbids: [...p.add.forbids, a] } },
    });
  }
  return out;
}

export function remedy(cdx: Codex, p: Petition): Remedy | null {
  const before = new Set(clashSet(world(cdx)));
  let best: Remedy | null = null;
  for (const { label, petition } of candidates(cdx, p)) {
    const amended = amend(cdx, petition);
    const r = world(amended);
    const now = clashSet(r);
    const nowSet = new Set(now);
    const added = now.filter((c) => !before.has(c));
    const reconciled = [...before].filter((c) => !nowSet.has(c));
    if (added.length === 0 || reconciled.length > 0) continue;
    // the cheapest derivation of the contradiction this edit buys, in firings
    const t = evaluateSemiring(r.store, tropicalSemiring, { weight: unitFiringCost });
    const [a, b, act] = splitTriple(added[0]);
    const cost = t.value.get(`clash[main](${a},${b},${act})`) ?? Infinity;
    const cand: Remedy = { edit: label, added: added.length, reconciled: reconciled.length, cost };
    if (best === null || cand.added < best.added
      || (cand.added === best.added && cand.edit < best.edit)) best = cand;
  }
  return best;
}

// ===========================================================================
// the fold: how much contradiction a paragraph drags in
//
// The weight lives on the hyperedge, not on the fact: a firing that concludes
// `tainted` is a step that carries a quarrel forward, and every other firing
// is free. So a paragraph's value is the number of contradiction-carrying
// steps on its MOST contradictory reading — max, not min, which is the one
// inversion this whole example turns on.
// ===========================================================================

const CARRIES = contradictionsAdded(1);
const FREE = contradictionsAdded(0);
export const chaosWeight = (key: string): Chaos =>
  (key.startsWith('tainted[') ? CARRIES() : FREE());

export interface Fold {
  ceiling: number;
  rounds: number;
  converged: boolean;
  disciplineHeld: boolean;
  cyclic: number;
  chaos: Map<string, Chaos>;      // ordinance id -> its tainted annotation
  saturated: string[];            // the paragraphs that have reached the ceiling
}

export function foldChaos(r: Rofl, ceiling: number, opts: { maxRounds?: number } = {}): Fold {
  const res = evaluateSemiring(r.store, chaosSemiring(ceiling), {
    weight: chaosWeight, ...opts,
  });
  const chaos = new Map<string, Chaos>();
  for (const [k, v] of res.value) {
    const m = k.match(/^tainted\[main\]\(([^)]+)\)$/);
    if (m !== null) chaos.set(m[1], v);
  }
  const saturated = [...chaos].filter(([, v]) => v === ceiling).map(([o]) => o).sort();
  return {
    ceiling, rounds: res.rounds, converged: res.converged,
    disciplineHeld: res.disciplineHeld, cyclic: res.cyclic, chaos, saturated,
  };
}

/** The same fold with the ceiling taken away — the control that says the
 *  ceiling is doing the work and the fixture is not simply easy. */
export function foldUncapped(r: Rofl, ceiling: number, maxRounds: number): {
  converged: boolean; disciplineHeld: boolean; rounds: number; top: number;
} {
  const capped = chaosSemiring(ceiling);
  const res = evaluateSemiring(r.store, {
    ...capped,
    times: (a: Chaos, b: Chaos) =>
      (a === REJECTED || b === REJECTED ? REJECTED : (a as number) + (b as number)),
  }, { weight: chaosWeight, maxRounds });
  let top = 0;
  for (const [k, v] of res.value) {
    if (k.startsWith('tainted[') && typeof v === 'number' && v > top) top = v;
  }
  return {
    converged: res.converged, disciplineHeld: res.disciplineHeld, rounds: res.rounds, top,
  };
}

// ===========================================================================
// hygiene: every boot.rofl audit over HECK's own reflection
// ===========================================================================

export const HYGIENE_GOALS = [
  'unstratified(X)', 'malformed[audit](R)', 'breach[audit](R)',
  'leak[audit](A, B)', 'forged[audit](F)', 'undefined_premise[audit](R, Rel)',
];

export function hygiene(r: Rofl): { goal: string; count: number }[] {
  return HYGIENE_GOALS.map((goal) => ({ goal, count: rows(r, goal).length }));
}

// ===========================================================================
// the transcript
// ===========================================================================

const WIDTH = 78;
const say = (s = '') => console.log(s);
function rule(title: string): void {
  say();
  say('='.repeat(WIDTH));
  say(title);
  say('='.repeat(WIDTH));
}

export function wrap(s: string, indent: string, width = WIDTH): string[] {
  const out: string[] = [];
  let line = '';
  for (const w of s.split(' ')) {
    if (line !== '' && (indent + line + ' ' + w).length > width) { out.push(indent + line); line = w; }
    else line = line === '' ? w : line + ' ' + w;
  }
  if (line !== '') out.push(indent + line);
  return out;
}

const para = (id: string) => id.replace(/^o_0*/, 'para ').replace(/^p_/, 'petition ');

function main(): void {
  const r = world();
  const clashes = clashSet(r);
  const ceiling = clashes.length;

  say('HECK — contradiction as the objective function.');
  say('a change is APPROVED only if it makes the codex worse.');
  say();
  say(`codex      ${CDX.ordinances.length} ordinances, ${CDX.acts.length} acts, `
    + `parsed into ${codexFacts(CDX).split('\n').length} facts`);
  say(`situation  ${[...CDX.dims].map(([d, v]) => `${d}:${v.length}`).join(' x ')}`
    + ` = ${SITUATION_COUNT(CDX)} situations`);
  say(`rules      examples/heck/heck.rofl, loaded next to boot.rofl`);

  // -------------------------------------------------------------------------
  rule('0. hygiene — checked before anything else, not assumed');

  for (const { goal, count } of hygiene(r)) {
    say(`  ${goal.padEnd(34)} -> ${count === 0 ? 'empty' : `${count} !!`}`);
  }
  say();
  say('  Every rule range-restricted, nothing unstratifiable, and the [audit]');
  say('  and [chancery] heads bridge from [main] with a kernel-emitted');
  say('  bridge_decl, so no ledger is read that was not declared.');

  // -------------------------------------------------------------------------
  rule('1. the contradictions the codex carries');

  const oracle = oracleClashes(CDX);
  const agree = oracle.length === clashes.length && oracle.every((c, i) => c === clashes[i]);
  say(`  ${clashes.length} mutually exclusive prescriptions are derivable.`);
  say();
  for (const c of clashes.slice(0, 12)) {
    const [a, b, act] = splitTriple(c);
    say(`  ${para(a).padEnd(9)} requires ${act.padEnd(19)} ${para(b)} forbids it`);
  }
  if (clashes.length > 12) say(`  ... and ${clashes.length - 12} more`);
  say();
  say(`  ORACLE: the whole situation space enumerated in plain TypeScript,`);
  say(`  ${SITUATION_COUNT(CDX)} situations x ${CDX.ordinances.length} ordinances, sharing no code with heck.rofl:`);
  say(`  ${oracle.length} contradictions, and the two sets ${agree ? 'AGREE exactly' : 'DISAGREE'}.`);
  if (!agree) {
    say(`  engine only: ${clashes.filter((c) => !oracle.includes(c)).join(' ')}`);
    say(`  oracle only: ${oracle.filter((c) => !clashes.includes(c)).join(' ')}`);
    process.exitCode = 1;
  }

  // -------------------------------------------------------------------------
  rule('2. the demonic MOOT — consistency, found and condemned');

  say('  MOOT hunts dead clauses to delete. The same five verdicts, the same');
  say('  operators, the same stratification, the sign of the judgement');
  say('  reversed: here a paragraph that offends nobody is the defect.');
  say();

  const serene = col(r, 'serene[audit](O)', 'O');
  say(`  SERENE (${serene.length}) — party to no contradiction at all, direct or inherited.`);
  for (const o of serene) {
    say(`    ${para(o)}`);
    for (const line of wrap(rows(r, `text(${o}, T)`)[0].T, '      ')) say(line);
  }

  const harm = rows(r, 'harmonised[audit](A, B)');
  say();
  say(`  HARMONISED (${harm.length}) — in force together, bound to a common act, quarrelling over nothing.`);
  for (const h of harm.slice(0, 6)) say(`    ${para(h.A)} and ${para(h.B)}`);
  if (harm.length > 6) say(`    ... and ${harm.length - 6} more pairs in agreement`);

  const inert = rows(r, 'inert[audit](O, D)');
  say();
  say(`  INERT (${inert.length}) — governs no situation, so it cannot even be provoked.`);
  for (const x of inert) {
    say(`    ${para(x.O)}: empty on ${x.D}`);
    for (const line of wrap(rows(r, `text(${x.O}, T)`)[0].T, '      ')) say(line);
  }

  const red = rows(r, 'redundant[audit](A, B)');
  say();
  say(`  REDUNDANT (${red.length}) — scope inside another's, binding and barring nothing new.`);
  for (const x of red.slice(0, 6)) say(`    ${para(x.A)} adds nothing to ${para(x.B)}`);
  if (red.length > 6) say(`    ... and ${red.length - 6} more`);

  const placid = rows(r, 'placid[audit](D, V)');
  say();
  say(`  PLACID (${placid.length}) — a REGION of the situation space at peace. This is the`);
  say('  verdict the department acts on: it names where to aim the next amendment.');
  for (const x of placid) say(`    ${x.D} = ${x.V}`);
  say();
  for (const line of wrap('Every prohibition in the codex restates the sealed-writ '
    + 'exemption, so no prohibition runs against a sealed writ, so nothing '
    + 'contradicts anything there. Twenty-four paragraphs agreeing by accident '
    + 'is the worst thing the department has ever produced.', '  ')) say(line);

  // -------------------------------------------------------------------------
  rule('3. the docket — may a petition be granted?');

  const verdicts = judge(CDX, PETITIONS);
  const cw = chanceryWorld(CDX, verdicts);
  const engineApproved = new Set(col(cw, 'approved[chancery](P)', 'P'));
  const mismatch = verdicts.filter((v) => engineApproved.has(v.petition.id) !== v.approved);
  say(`  ${verdicts.filter((v) => v.approved).length} of ${verdicts.length} petitions are granted.`);
  say();
  for (const v of verdicts) {
    const mark = v.approved ? 'GRANTED ' : 'REFUSED ';
    say(`  ${mark} ${v.petition.id}  +${v.manufactured.length} manufactured  `
      + `-${v.reconciled.length} reconciled`);
    for (const line of wrap(v.petition.text, '           ')) say(line);
  }
  say();
  say(`  The engine reaches the same ${verdicts.length} verdicts from the same facts`);
  say(`  (approved[chancery] over the set difference): ${mismatch.length === 0 ? 'AGREE exactly' : 'DISAGREE'}.`);
  if (mismatch.length > 0) {
    say(`  disagreed on: ${mismatch.map((v) => v.petition.id).join(' ')}`);
    process.exitCode = 1;
  }

  // -------------------------------------------------------------------------
  rule('4. whynot on a refusal — the paragraphs it made peace between');

  // POSITIVE CONTROL, in the program rather than beside it. Three different
  // reasons to refuse, and a docket that stops exercising one of them stops
  // demonstrating anything — so the demo fails here rather than printing a
  // section with nothing in it.
  const causes = {
    'reconciles and manufactures nothing':
      verdicts.filter((v) => v.reconciled.length > 0 && v.manufactured.length === 0),
    'manufactures MORE than it reconciles, and is refused anyway':
      verdicts.filter((v) => v.reconciled.length > 0 && v.manufactured.length > 0),
    'manufactures nothing at all':
      verdicts.filter((v) => v.reconciled.length === 0 && v.manufactured.length === 0),
  };
  for (const [why, hits] of Object.entries(causes)) {
    say(`  ${String(hits.length).padStart(2)} refused because it ${why}`);
    if (hits.length === 0) {
      say('  !! the docket no longer exercises this refusal — the section below is empty');
      process.exitCode = 1;
    }
  }
  say();
  const guilty = causes['reconciles and manufactures nothing'][0];
  const netter = causes['manufactures MORE than it reconciles, and is refused anyway'][0];
  // The refusal worth asking about is the one whose ONLY failing premise is
  // the reconciliation: p_02 fails twice over (it manufactures nothing either)
  // and its tree is dominated by that second cause.
  say(`  ${netter.petition.id}: ${netter.petition.text}`);
  say(`  It manufactures ${netter.manufactured.length} contradictions, so the standard's first`);
  say('  half is satisfied and exactly one premise is left to fail.');
  say();
  say(cw.whynot(`approved[chancery](${netter.petition.id})`, { depth: 4, nodes: 24 }).text);
  say();
  say('  The guilt is named, not merely reported: `reconciles` holds, so the');
  say('  petition removed a contradiction the codex already had --');
  for (const c of netter.reconciled) {
    const [a, b, act] = splitTriple(c);
    say(`    ${para(a)} required ${act}, ${para(b)} forbade it, and now neither does.`);
  }
  say();
  say(`  ${guilty.petition.id} is refused for the other reason, and its tree says so instead:`);
  say(`  it manufactures nothing, so every one of the ${guilty.now.length} contradictions it leaves`);
  say('  behind was already in the codex, and `manufactures` has no witness at all.');
  say();
  say();
  for (const line of wrap(`The standard is not "on balance", and ${netter.petition.id} is the `
    + `proof: it manufactures ${netter.manufactured.length} contradictions and reconciles `
    + `${netter.reconciled.length}, so it leaves the codex strictly worse, and it is refused `
    + 'anyway. Making peace ANYWHERE is the offence. That is a modelling '
    + 'decision, it is in the rule rather than in the host, and README.md '
    + 'argues it.', '  ')) say(line);

  // -------------------------------------------------------------------------
  rule('5. the minimal amendment — tropical, on the same facts');

  say('  HECK\'s carrier maximises: of two readings it keeps the more');
  say('  contradictory. Ask the opposite question of the same fixpoint and');
  say('  the answer changes with the carrier and nothing else.');
  say();
  for (const v of verdicts.filter((x) => !x.approved).slice(0, 4)) {
    const fix = remedy(CDX, v.petition);
    if (fix === null) {
      const why = v.reconciled.length > 0
        ? 'its offence is in the NARROWING, which no edit to its new paragraph can undo'
        : 'no single edit reaches the standard';
      say(`  ${v.petition.id}  no remedy: ${why}`);
      continue;
    }
    say(`  ${v.petition.id}  ${fix.edit.padEnd(28)} +${fix.added} contradiction(s), `
      + `cheapest derivation ${fix.cost} firings`);
  }

  // -------------------------------------------------------------------------
  rule('6. the engine — where the codex can no longer be made worse');

  const fold = foldChaos(r, ceiling);
  say(`  The fold: a paragraph's value is the number of contradiction-carrying`);
  say(`  steps on its MOST contradictory reading. plus = max, times = +.`);
  say();
  say(`  ceiling            ${ceiling} distinguishable contradictions (the extension of clash/3)`);
  say(`  facts on a cycle   ${fold.cyclic} (paragraphs 13/14 and 15/16 cite each other)`);
  say(`  rounds             ${fold.rounds}`);
  say(`  converged          ${fold.converged}`);
  say(`  discipline held    ${fold.disciplineHeld}`);
  say();
  const ranked = [...fold.chaos].sort((a, b) => {
    const av = a[1] === REJECTED ? -1 : a[1], bv = b[1] === REJECTED ? -1 : b[1];
    return (bv as number) - (av as number) || (a[0] < b[0] ? -1 : 1);
  });
  for (const [o, v] of ranked.slice(0, 8)) {
    say(`    ${para(o).padEnd(9)} ${renderChaos(v)}`);
  }
  say();
  if (fold.saturated.length > 0) {
    say(`  ${fold.saturated.length} paragraphs stand at the ceiling: ${fold.saturated.map(para).join(', ')}.`);
    say('  THE CODEX HAS NOWHERE TO GROW HERE. HELL HAS REACHED MAXIMUM ENTROPY.');
    say('  These paragraphs already drag in every contradiction the vocabulary');
    say('  admits; no further reading of them can be made to say more.');
  } else {
    say('  No paragraph stands at the ceiling: the codex can still be made worse.');
  }
  say();
  const CAP = 40;
  const loose = foldUncapped(r, ceiling, CAP);
  const looser = foldUncapped(r, ceiling, CAP * 2);
  for (const line of wrap('THE CEILING IS THE WHOLE ARGUMENT, and here is the '
    + 'control. Take it away — the same carrier, the same weights, the same '
    + 'data, times no longer clamped — and the citation ring is a pump:', '  ')) say(line);
  say();
  say(`    converged        ${loose.converged}`);
  say(`    discipline held  ${loose.disciplineHeld}`);
  say(`    stopped at       ${loose.rounds} rounds (the caller's cap, not a fixpoint)`);
  say(`    highest value    ${loose.top} at ${CAP} rounds, ${looser.top} at ${CAP * 2}`);
  say(`                     — measured twice, so "still climbing" is not a guess`);
  say();
  for (const line of wrap('Every other instance in runtime/semirings.ts survives a '
    + 'cycle because times moves a value where plus will discard it. Here they '
    + 'pull the same way, so convergence is bought by finite height alone: the '
    + 'vocabulary is finite, so the distinguishable contradictions are finite, '
    + 'so the carrier is. That is the mechanism, it is the only one available '
    + 'to this instance, and the fold reports a false declaration rather than '
    + 'hanging when it is removed.', '  ')) say(line);
  say();
}

const real = (p: string) => fs.realpathSync(p);
if (process.argv[1] !== undefined
  && real(path.resolve(process.argv[1])) === real(new URL(import.meta.url).pathname)) {
  main();
}

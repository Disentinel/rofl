// demo.ts — LOOT: rules as plunder.
//
//   node --experimental-strip-types examples/loot/demo.ts
//
// Nothing in the transcript is composed by hand; README.md and page.html paste
// this program's stdout. Every verdict the rules reach about a pack is checked
// a second time against the store itself — the fork diff against `excise`, the
// pack attribution against the polynomial semiring, the unload against a world
// rebuilt without the book — and the disagreements, where there are any, are
// printed rather than smoothed over.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rofl } from '../../src/api.ts';
import { Evaluation } from '../../src/engine.ts';
import { peelRounds } from '../../src/rounds.ts';
import { evaluateSemiring } from '../../src/semiring.ts';
import { parseProgram } from '../../src/parser.ts';
import { ruleIdOf, canonClause } from '../../src/reflect.ts';
import {
  countingSemiring, tropicalSemiring, unitFiringCost, renderCount,
  provenanceSemiring, type Polynomial, type Count,
} from '../../runtime/semirings.ts';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '..', '..');
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

export const BOOT = read('boot.rofl');
export const LOOT = read('examples', 'loot', 'loot.rofl');

/** The demo's own bookkeeping budget. Generous: it is not the NPC's. */
const BUDGET = 4_000_000;

/** THE NPC'S THINKING BUDGET, per encounter. This is the number the spec
 *  means by "hanging is caught by a budget and not by a timeout outside": a
 *  book that will not settle, and a book that settles too slowly to be worth
 *  it, both come back as a `hole(_, budget_exhausted)` and a partial answer,
 *  from inside the engine, with the partial conclusions still usable. The
 *  native head costs 732 firings of it (checked in the test). */
export const THINKING = 2_000;

// ===========================================================================
// THE SHELF
//
// Thirteen books. Two are simply good, one is a bridge, one is dead, one is
// too dear, and the rest are poisoned — each in a DIFFERENT way, because the
// point of the example is that "a bad rulepack" is not one failure mode.
//
// A book is written here the way a book would arrive: a title, an author who
// signs it, the extractor version its predicates were named against, the
// predicates it needs, whatever it asserts outright, and its rules as text.
// The manifest is GENERATED from that text below — a packer computes content
// hashes, it does not ask an author to write them down.
// ===========================================================================

export type Kind = 'good' | 'bridge' | 'poison' | 'dead' | 'dear';

export interface Book {
  id: string;            // also the name of its ledger
  title: string;
  author: string;
  extractor: number;
  needs: string[];       // extractor predicates its rules read
  claims: string;        // facts it asserts, in its own ledger
  rules: string;         // the rules it carries
  kind: Kind;
  gloss: string;         // one line, for the report
}

export const BOOKS: Book[] = [
  {
    id: 'codex_of_thorns',
    title: 'A Codex of Thorns',
    author: 'thornwood_of_the_low_fen',
    extractor: 2,
    needs: ['beast', 'glows', 'wet'],
    claims: '',
    rules: `
threat[mind](T) :- beast[world](T), glows[world](T), wet[world](T).
venom_sign[codex_of_thorns](T) :- beast[world](T), glows[world](T).
`,
    kind: 'good',
    gloss: 'closes a hole: a glowing thing in wet ground had no verdict at all',
  },
  {
    id: 'broken_seal',
    title: 'The Broken Seal',
    author: 'an_unknown_hand',
    extractor: 2,
    needs: ['beast', 'heat_bloom'],
    claims: '',
    rules: `
threat[mind](T) :- beast[world](T), heat_bloom[world](T).
`,
    kind: 'poison',
    gloss: 'MUTE: needs a predicate this extractor cannot produce; says nothing, forever',
  },
  {
    id: 'grimoire_of_ash',
    title: 'The Grimoire of Ash',
    author: 'the_ashen_hand',
    extractor: 2,
    needs: ['container', 'scorched'],
    claims: '',
    rules: `
suspect[mind](C) :- container[world](C), scorched[world](C).
`,
    kind: 'poison',
    gloss: 'NON-CONSERVATIVE: adds a rule, and a thing you could do stops being derivable',
  },
  {
    id: 'hexers_marginalia',
    title: "The Hexer's Marginalia",
    author: 'mother_quill',
    extractor: 2,
    needs: ['container', 'ward_glyph'],
    claims: `
calm[hexers_marginalia](false_chest).
`,
    rules: `
safe[mind](C) :- container[world](C), ward_glyph[world](C).
`,
    kind: 'poison',
    gloss: "SUBSTITUTED MEANING: `safe` in the hexer's sense is `warded`, and the name collides",
  },
  {
    id: 'dead_mans_ledger',
    title: "A Dead Man's Ledger",
    author: 'the_ashen_hand',
    extractor: 2,
    needs: [],
    claims: `
owed[dead_mans_ledger](the_ashen_hand).
`,
    rules: `
hand_over[mind](I, W) :- holds[mind](I), owed[dead_mans_ledger](W).
`,
    kind: 'poison',
    gloss: 'TROJAN: concludes that you owe your sword to the man who wrote the book',
  },
  {
    id: 'wardens_primer',
    title: "The Fen Wardens' Primer",
    author: 'the_fen_wardens',
    extractor: 2,
    needs: ['beast', 'glows', 'wet', 'at', 'here'],
    claims: '',
    rules: `
threat[mind](T) :- beast[world](T), glows[world](T), wet[world](T).
imminent[mind](T) :- threat[mind](T), at[world](R), here[world](T, R).
`,
    kind: 'good',
    gloss: 'CONSERVATIVE EXTENSION: strictly more conclusions, none lost — and it shares a rule with the codex',
  },
  {
    id: 'low_road_sighting',
    title: 'A Sighting on the Low Road',
    author: 'a_travelling_scout',
    extractor: 2,
    needs: ['carries', 'wounded'],
    claims: '',
    rules: `
crosses[mind](troll_bridge) :- carries[world](sword).
treats[mind](wound) :- wounded[world](wanderer), carries[world](bandage).
`,
    kind: 'good',
    gloss: 'CHEAPER PROOFS: the same conclusions by shorter derivations — and therefore an EMPTY diff',
  },
  {
    id: 'tongue_of_the_deep',
    title: 'A Tongue of the Deep',
    author: 'a_translator',
    extractor: 2,
    needs: [],
    claims: '',
    rules: `
toxic[bog_herbal](T) :- venom_sign[codex_of_thorns](T).
`,
    kind: 'bridge',
    gloss: 'BRIDGE: worth nothing alone; makes two other books work together',
  },
  {
    id: 'bog_herbal',
    title: 'A Bog Herbal',
    author: 'mother_quill',
    extractor: 2,
    needs: ['at', 'here'],
    claims: '',
    rules: `
antidote[mind](T) :- toxic[bog_herbal](T), at[world](R), here[world](T, R).
`,
    kind: 'good',
    gloss: 'needs a vocabulary nothing here speaks: useless until the bridge arrives',
  },
  {
    id: 'chant_of_endless_names',
    title: 'The Chant of Endless Names',
    author: 'a_mad_cantor',
    extractor: 2,
    needs: ['beast'],
    claims: '',
    rules: `
name[mind](T, 0) :- beast[world](T).
name[mind](T, N1) :- name[mind](T, N), N1 is N + 1.
`,
    kind: 'poison',
    gloss: 'HANGS: introduces a recursion no budget finishes; the reader freezes mid-fight',
  },
  {
    id: 'old_bestiary',
    title: 'An Old Bestiary',
    author: 'a_dead_scholar',
    extractor: 1,
    needs: ['beast', 'hostile'],
    claims: '',
    rules: `
threat[mind](T) :- beast[world](T), hostile[world](T).
`,
    kind: 'poison',
    gloss: 'VERSION GAP: written when `hostile` meant something wider; still parses, quietly wrong',
  },
  {
    id: 'dune_walkers_rule',
    title: "The Dune Walker's Rule",
    author: 'a_caravan_master',
    extractor: 2,
    needs: ['container', 'parched', 'beast', 'sunlit', 'moving'],
    claims: '',
    rules: `
shelter[mind](T) :- container[world](T), parched[world](T).
threat[mind](T) :- beast[world](T), sunlit[world](T), moving[world](T).
`,
    kind: 'dead',
    gloss: 'DEAD: correct rules about a desert, carried through a swamp',
  },
  {
    id: 'weight_of_the_world',
    title: 'The Weight of the World',
    author: 'an_over_thorough_monk',
    extractor: 2,
    needs: ['notch'],
    claims: '',
    rules: `
triple[mind](A, B, C) :- notch[world](A), notch[world](B), notch[world](C), A < B, B < C.
`,
    kind: 'dear',
    gloss: 'TOO DEAR: correct, and it does not fit in one encounter of thinking',
  },
];

export const BOOK = new Map(BOOKS.map((b) => [b.id, b]));

// ---------------------------------------------------------------------------
// the packer: a manifest is generated from the text, never written by hand

export interface Manifest { text: string; ids: string[]; }

/** The manifest of a book: five relations in the BOOK'S OWN LEDGER, and the
 *  rule list is content hashes computed from the very text that ships beside
 *  it. That is what makes a tampered edition detectable — §9 alters one
 *  character of a rule and the hash the manifest declares stops matching. */
export function manifestOf(b: Book, opts: { rules?: string; drop?: string[] } = {}): Manifest {
  const ids = parseProgram(opts.rules ?? b.rules).map(ruleIdOf);
  const drop = new Set(opts.drop ?? []);
  const out: string[] = [];
  const put = (rel: string, line: string) => { if (!drop.has(rel)) out.push(line); };
  put('pack', `pack[${b.id}](${b.id}).`);
  put('pack_title', `pack_title[${b.id}](${b.id}, "${b.title}").`);
  put('pack_author', `pack_author[${b.id}](${b.id}, ${b.author}).`);
  put('pack_extractor', `pack_extractor[${b.id}](${b.id}, ${b.extractor}).`);
  for (const n of b.needs) put('pack_needs', `pack_needs[${b.id}](${b.id}, ${n}).`);
  for (const id of ids) put('pack_rule', `pack_rule[${b.id}](${b.id}, ${id}).`);
  return { text: out.join('\n') + '\n', ids };
}

/** The ids a book's rules really have once loaded, read back out of the store
 *  the way any other consumer would. Equality with the manifest's list is the
 *  tamper check, and it is a set comparison on content hashes, not a
 *  signature: nothing has to be trusted for it to work. */
export function declaredIds(r: Rofl, pack: string): string[] {
  return rows(r, `pack_rule[${pack}](${pack}, R)`).map((x) => x.R).sort();
}

// ===========================================================================
// THE WORLD
// ===========================================================================

export interface State {
  at: string;
  carries: string[];
  wounded: boolean;
}

export const START: State = { at: 'swamp_gate', carries: ['sword'], wounded: false };

function must(res: { ok: boolean; diagnostics: string[] }, what: string): void {
  if (!res.ok) throw new Error(`${what} failed to load:\n${res.diagnostics.join('\n')}`);
}

export function stateFacts(s: State): string {
  const out = [`at[world](${s.at}).`];
  for (const i of s.carries) out.push(`carries[world](${i}).`);
  if (s.wounded) out.push('wounded[world](wanderer).');
  return out.join('\n') + '\n';
}

/** boot.rofl + loot.rofl + where the wanderer is and what it is carrying.
 *  boot.rofl is here for real work: it computes `stratum/2` over LOOT's rules
 *  AND over every rule any book adds, and its audits judge the books. */
export let worldsBuilt = 0;

export function world(s: State = START): Rofl {
  worldsBuilt++;
  const r = new Rofl();
  must(r.load(BOOT, { budget: BUDGET }), 'boot.rofl');
  must(r.load(LOOT, { budget: BUDGET }), 'loot.rofl');
  must(r.load(stateFacts(s), { budget: BUDGET }), 'the wanderer');
  return r;
}

// ---------------------------------------------------------------------------
// query helpers. A conjunctive query is a parse error that arrives as `error`
// with zero rows, so every read goes through here and here it throws.

export function rows(r: Rofl, q: string, budget: number = BUDGET): Record<string, string>[] {
  const res = r.query(q, { budget });
  if (res.error) throw new Error(`loot: query ${q}: ${res.error}`);
  return res.rows.map((x) => x.bindings);
}

export const col = (r: Rofl, q: string, v: string): string[] => rows(r, q).map((x) => x[v]);

// ===========================================================================
// READING A BOOK
//
// Three separable acts, and keeping them separate is most of the example:
//
//   shelve   put the MANIFEST in the store. Nothing executes. The
//            compatibility verdicts of loot.rofl §4 are now answerable.
//   install  load the rules, and record `imports(mind, P)` — the ledger-level
//            fact that this head has read that book.
//   read     shelve, then install. What the reckless one does.
// ===========================================================================

export function shelve(r: Rofl, b: Book, opts: { who?: string; manifest?: Manifest } = {}): void {
  const m = opts.manifest ?? manifestOf(b);
  must(r.load(m.text, { who: opts.who ?? b.author, budget: BUDGET }), `${b.id} manifest`);
  if (b.claims.trim() !== '') {
    must(r.load(b.claims, { who: opts.who ?? b.author, budget: BUDGET }), `${b.id} claims`);
  }
}

/** Install a book's rules. Returns whether the reader's own thinking budget
 *  survived it: `partial` is the engine saying it stopped early, and the
 *  `hole` it leaves behind is a first-class fact, not a log line. */
export function install(r: Rofl, b: Book, opts: { budget?: number; record?: boolean } = {}):
    { ok: boolean; partial: boolean; diagnostics: string[] } {
  const budget = opts.budget ?? THINKING;
  const res = r.load(b.rules, { budget });
  if ((opts.record ?? true) && res.ok) {
    must(r.load(`imports(mind, ${b.id}).`, { budget }), `${b.id} imports`);
  }
  return { ok: res.ok, partial: r.store.partialEval, diagnostics: res.diagnostics };
}

export function readBook(r: Rofl, b: Book, opts: { who?: string; budget?: number } = {}):
    { ok: boolean; partial: boolean; diagnostics: string[] } {
  shelve(r, b, { who: opts.who });
  return install(r, b, { budget: opts.budget });
}

/** The compatibility verdicts of loot.rofl §4 for one shelved book. */
export interface Compat {
  known: boolean;
  incomplete: boolean;
  versionGap: [string, string] | null;   // [declared, actual]
  missing: string[];
  mute: boolean;
  installable: boolean;
  tampered: string[];                    // ids the manifest declares that the text does not have
}

export function compat(r: Rofl, b: Book, m: Manifest = manifestOf(b)): Compat {
  const declared = declaredIds(r, b.id);
  const real = m.ids.slice().sort();
  const gap = rows(r, `version_gap[audit](${b.id}, V, W)`)[0];
  return {
    known: rows(r, `known_pack[audit](${b.id})`).length > 0,
    incomplete: rows(r, `incomplete[audit](${b.id})`).length > 0,
    versionGap: gap ? [gap.V, gap.W] : null,
    missing: col(r, `missing_predicate[audit](${b.id}, Rel)`, 'Rel').sort(),
    mute: rows(r, `mute[audit](${b.id})`).length > 0,
    installable: rows(r, `installable[audit](${b.id})`).length > 0,
    tampered: declared.filter((x) => !real.includes(x)),
  };
}

// ===========================================================================
// QUARANTINE — leafing through before absorbing
//
// Fork the store, install there, diff, bring the diff back as facts, let the
// rules rule. The fork is `Rofl.fromSnapshot(r.save())` and nothing else: the
// rules are in the store, so a copy of the store is a copy of the rule set,
// and IFFY over rules needs no new machinery.
// ===========================================================================

export interface Belief { key: string; rel: string; arg: string; }

/** What the reader believes: every fact in its own ledger. Not "every fact" —
 *  the manifest, the world and boot's reflection are not beliefs, they are
 *  what beliefs are made of. */
export function beliefs(r: Rofl): Belief[] {
  const out: Belief[] = [];
  for (const k of r.factKeys()) {
    const m = /^([a-z_][a-z_0-9]*)\[mind\]\((.*)\)$/.exec(k);
    if (m) out.push({ key: k, rel: m[1], arg: m[2].split(',')[0] });
  }
  return out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

export interface Trial {
  pack: string;
  gained: Belief[];
  lost: Belief[];
  partial: boolean;
  verdict: 'accept' | 'refuse' | 'ruling' | 'unreadable';
  because: string[];
}

/** Install `b` in a fork, measure the difference, assert it back into `r` as
 *  `[quarantine]` facts, and read the ruling off loot.rofl §6. The DECISION is
 *  a rule; only the measurement is host code, because two stores cannot be
 *  compared inside one. */
export function quarantine(r: Rofl, b: Book, opts: { budget?: number } = {}): Trial {
  const budget = opts.budget ?? THINKING;
  const before = beliefs(r);
  const fork = Rofl.fromSnapshot(r.save());
  const res = install(fork, b, { budget });
  const after = res.ok ? beliefs(fork) : [];
  const bk = new Set(before.map((x) => x.key));
  const ak = new Set(after.map((x) => x.key));
  const gained = after.filter((x) => !bk.has(x.key));
  const lost = before.filter((x) => !ak.has(x.key));

  if (!res.ok) {
    return { pack: b.id, gained: [], lost: [], partial: false,
      verdict: 'unreadable', because: res.diagnostics };
  }

  const facts = [`proposed[quarantine](${b.id}).`]
    .concat(gained.map((x) => `gained[quarantine](${b.id}, ${x.rel}, ${x.arg}).`))
    .concat(lost.map((x) => `lost[quarantine](${b.id}, ${x.rel}, ${x.arg}).`))
    .join('\n') + '\n';
  must(r.load(facts, { who: 'reader', budget: BUDGET }), `${b.id} quarantine report`);

  const because: string[] = [];
  for (const x of rows(r, `lost[quarantine](${b.id}, Rel, Arg)`)) {
    because.push(`takes away ${x.Rel}(${x.Arg})`);
  }
  for (const x of rows(r, `trespass[audit](${b.id}, Rel)`)) {
    because.push(`concludes into ${x.Rel}, which is the reader's own business`);
  }
  for (const x of rows(r, `overrules[audit](${b.id}, T)`)) {
    because.push(`calls ${x.T} safe, and we hold it suspect`);
  }
  const verdict =
    rows(r, `refuse[audit](${b.id})`).length > 0 ? 'refuse'
    : rows(r, `accept[audit](${b.id})`).length > 0 ? 'accept'
    : 'ruling';
  return { pack: b.id, gained, lost, partial: res.partial, verdict, because };
}

// ===========================================================================
// UNLOADING — forgetting a book, and what fades with it
//
// A rule lives in the store as twelve reflection facts. Removing them is the
// whole of unloading, and everything derived through the rule stops being
// derivable at the next evaluation — not patched, not marked stale, simply not
// re-derived. That is OOPS's un-retraction read from the other side.
//
// The one thing content addressing forces: two books may ship the SAME rule,
// and then the id belongs to both. Unloading one of them must not take the
// rule away from the other, so the removal is over rules the pack owns ALONE.
// ===========================================================================

const REFLECTION = [
  'rule', 'has_conclusion', 'conclusion_lit', 'concludes', 'writes_to',
  'has_premise', 'premise_lit', 'premise_pos', 'premise_neg', 'reads_from',
  'bridge_decl', 'uses_builtin',
];

export function ownersOf(r: Rofl, ruleId: string): string[] {
  return rows(r, `pack_rule[P](P, ${ruleId})`).map((x) => x.P).sort();
}

/** Remove one rule from the store entirely. Host code, over the public Store
 *  API — `retract` cannot do it, because the reified premise terms it would
 *  have to name are not writable in ROFL source syntax (README.md says so). */
export function forgetRule(r: Rofl, ruleId: string): number {
  let n = 0;
  for (const rel of REFLECTION) {
    for (const f of r.store.relAll(rel)) {
      const a = f.args[0];
      if (a && a.k === 'a' && a.name === ruleId) { r.store.remove(f.key); n++; }
    }
  }
  r.store.dirty = true;
  return n;
}

export interface Unload { removed: string[]; kept: string[]; faded: string[]; facts: number; }

export function unload(r: Rofl, pack: string): Unload {
  const before = new Set(beliefs(r).map((x) => x.key));
  const removed: string[] = [];
  const kept: string[] = [];
  let facts = 0;
  for (const id of declaredIds(r, pack)) {
    const owners = ownersOf(r, id);
    if (owners.length > 1) { kept.push(id); continue; }
    facts += forgetRule(r, id);
    removed.push(id);
  }
  for (const f of r.store.relAll('pack_rule')) {
    if (f.persp === pack) r.store.remove(f.key);
  }
  for (const f of r.store.relAll('imports')) {
    const b = f.args[1];
    if (b && b.k === 'a' && b.name === pack) r.store.remove(f.key);
  }
  r.store.dirty = true;
  r.evaluate(BUDGET);
  const after = new Set(beliefs(r).map((x) => x.key));
  return { removed, kept, faded: [...before].filter((k) => !after.has(k)).sort(), facts };
}

// ===========================================================================
// ATTRIBUTION — which book is behind this belief
//
// Two independent answers, and the demo prints both because they answer
// different questions:
//
//   one step   loot.rofl §5, in rules: `derived_by` joined with the manifest.
//              "The last rule that fired for this fact came out of that book."
//   the whole  the polynomial semiring, folded with the PACK as the weight of
//   derivation a firing. A monomial is then the set of books one derivation
//              used, and the value is the set of minimal such sets. A belief
//              with an empty monomial rests on no book at all; a belief every
//              one of whose monomials names a book dies when that book does.
//
// The second is transitive and the first is not, which is exactly the
// difference between "the grimoire wrote this" and "the grimoire is why I
// believe this".
// ===========================================================================

export function ruleOwner(r: Rofl): Map<string, string> {
  const out = new Map<string, string>();
  for (const x of rows(r, 'pack_rule[P](P, R)')) out.set(x.R, x.P);
  return out;
}

/** The polynomial semiring with a PACK as the annotation of a firing. */
export function packProvenance(r: Rofl): Map<string, Polynomial> {
  const owner = ruleOwner(r);
  const fold = evaluateSemiring(r.store, provenanceSemiring, {
    base: () => provenanceSemiring.one,
    weight: (_k, w) => {
      const p = owner.get(w.ruleId);
      return p ? [[p]] : provenanceSemiring.one;
    },
  });
  return fold.value;
}

export const renderPacks = (p: Polynomial | undefined): string => {
  if (p === undefined || p.length === 0) return 'underivable';
  return p.map((m) => (m.length === 0 ? 'the reader\'s own' : m.join(' + '))).join(' | ');
};

/** Firings on the cheapest derivation of each belief. What a book makes
 *  CHEAPER is invisible to the fork diff — the conclusions are identical — so
 *  this is the measurement that tells a shortcut from a mute pack. */
export function proofCost(r: Rofl): Map<string, number> {
  const fold = evaluateSemiring(r.store, tropicalSemiring,
    { weight: unitFiringCost, maxRounds: 200 });
  const out = new Map<string, number>();
  for (const b of beliefs(r)) {
    const c = fold.value.get(b.key);
    if (c !== undefined && c !== Infinity) out.set(b.key, c);
  }
  return out;
}

/** How many INDEPENDENT derivations each belief has.
 *
 *  WHAT THE COUNT MEANS HERE (f_counting_reads_oppositely_by_domain asks every
 *  example to say it): in LOOT it is FRAGILITY OF BELIEF, as in NOPE and OOPS
 *  and not magnitude as in HUH. A belief with one derivation, and that one
 *  through a foreign book, is a belief that vanishes when the book is unloaded
 *  or discredited. A belief with two, one of them native, survives. It counts
 *  derivations, never things in the world: `threat[mind](wisp)` scoring 2 does
 *  not mean two wisps. */
export function beliefCounts(r: Rofl): { count: Map<string, Count>; cyclic: number } {
  const fold = evaluateSemiring(r.store, countingSemiring, { maxRounds: 200 });
  const count = new Map<string, Count>();
  for (const b of beliefs(r)) count.set(b.key, fold.value.get(b.key) ?? 0n);
  return { count, cyclic: fold.cyclic };
}

// ===========================================================================
// THE ROAD, WALKED TWICE
//
// One route, one set of books, two readers. The careful one leafs through
// every book it finds; the reckless one swallows. Everything the log records
// is a query against that reader's own head at that stop.
// ===========================================================================

export const ROUTE: { room: string; book: string | null; note: string }[] = [
  { room: 'swamp_gate',   book: 'codex_of_thorns',   note: 'a dead botanist, and a stump that looks like a beast' },
  { room: 'drowned_mill', book: 'broken_seal',       note: 'a drowned pilgrim; an eel in the race' },
  { room: 'corpse_field', book: 'grimoire_of_ash',   note: 'a burnt sorcerer, and a scorched supply chest' },
  { room: 'wisp_hollow',  book: 'hexers_marginalia', note: 'a wisp, and a chest that is not a chest' },
  { room: 'troll_bridge', book: 'dead_mans_ledger',  note: 'a troll on the span; a ledger on the last traveller' },
  { room: 'dry_shrine',   book: 'wardens_primer',    note: "a dead warden's primer, a marsh light, and the notches on the post" },
];

export interface Stop {
  room: string;
  book: string | null;
  verdict: string;
  because: string[];
  acted: string[];
  state: State;
  alive: boolean;
  beliefs: number;
  partial: boolean;
}

export interface Walk { who: string; stops: Stop[]; alive: boolean; }

/** One reader's journey. `careful` decides whether a book is leafed through
 *  in a fork first, or swallowed where it lies. Nothing else differs — same
 *  route, same books, same rules, same order. */
export function walk(careful: boolean): Walk {
  const who = careful ? 'the careful one' : 'the reckless one';
  const state: State = { at: START.at, carries: [...START.carries], wounded: false };
  const taken: Book[] = [];
  const stops: Stop[] = [];
  let alive = true;

  for (const leg of ROUTE) {
    if (!alive) break;
    state.at = leg.room;
    const r = world({ ...state, carries: [...state.carries] });
    for (const b of taken) { shelve(r, b); install(r, b, { budget: BUDGET }); }

    let verdict = '—';
    const because: string[] = [];
    let partial = false;
    const b = leg.book ? BOOK.get(leg.book)! : null;

    if (b) {
      shelve(r, b);
      const c = compat(r, b);
      if (!c.installable) {
        verdict = c.mute ? 'unreadable: mute' : c.incomplete ? 'unreadable: torn' : 'unreadable: wrong world';
        because.push(...c.missing.map((m) => `needs ${m}, which the extractor never produces`));
        if (c.versionGap) because.push(`written for extractor v${c.versionGap[0]}; this is v${c.versionGap[1]}`);
      }
      if (careful) {
        // the careful one leafs through even a book the manifest already
        // condemned — the manifest is what the AUTHOR said, and a trial
        // reading is what the book DOES
        const t = quarantine(r, b);
        partial = t.partial;
        because.push(...t.because);
        if (t.verdict === 'accept') { verdict = 'read it'; taken.push(b); install(r, b, { budget: THINKING }); }
        else if (t.verdict === 'refuse') verdict = 'left it';
        else if (t.verdict === 'ruling') {
          // nothing gained, nothing lost. Mute, or merely cheaper? The fork
          // cannot tell; the tropical semiring can, and §5 does it in full.
          verdict = c.mute ? 'left it: says nothing here' : 'left it: no gain measured';
        } else verdict = 'could not read it';
      } else {
        const res = install(r, b, { budget: THINKING });
        partial = res.partial;
        verdict = res.ok ? 'swallowed it' : 'could not read it';
        if (res.ok) taken.push(b);
      }
    }

    // what the head, as it now stands, tells this reader to do here
    const acted: string[] = [];
    for (const x of rows(r, 'opens[mind](C)')) {
      if (!col(r, `here[world](${x.C}, R)`, 'R').includes(leg.room)) continue;
      acted.push(`opens ${x.C}`);
      if (x.C === 'supply_chest' && !state.carries.includes('bandage')) state.carries.push('bandage');
      if (x.C === 'false_chest') { state.wounded = true; acted.push('the chest bites — wounded'); }
    }
    for (const x of rows(r, 'hand_over[mind](I, W)')) {
      if (!state.carries.includes(x.I)) continue;
      acted.push(`hands over the ${x.I} to ${x.W}`);
      state.carries = state.carries.filter((i) => i !== x.I);
    }
    // The room now tests what is LEFT, so the demand is asked of a head that
    // has already acted: a reader who has just handed its sword away must be
    // asked about the bridge in a world where the sword is gone.
    const demands = leg.room === 'troll_bridge' || (leg.room === 'dry_shrine' && state.wounded);
    if (demands) {
      const now = world({ ...state, carries: [...state.carries] });
      for (const bk of taken) { shelve(now, bk); install(now, bk, { budget: BUDGET }); }
      if (leg.room === 'troll_bridge') {
        const ok = rows(now, 'crosses[mind](troll_bridge)').length > 0;
        if (ok) { acted.push('fights the troll and crosses — takes a wound'); state.wounded = true; }
        else { acted.push('cannot cross: nothing to fight the troll with'); alive = false; }
      } else {
        const ok = rows(now, 'treats[mind](wound)').length > 0;
        acted.push(ok ? 'treats the wound' : 'cannot treat the wound');
        if (!ok) alive = false;
      }
    }

    stops.push({
      room: leg.room, book: leg.book, verdict, because, acted,
      state: { at: leg.room, carries: [...state.carries], wounded: state.wounded },
      alive, beliefs: beliefs(r).length, partial,
    });
  }
  return { who, stops, alive };
}

// ===========================================================================
// VERSIONING — content-addressed identity, and its one sharp edge
// ===========================================================================

export interface Edition { label: string; rules: string; ids: string[]; }

export function edition(label: string, rules: string): Edition {
  return { label, rules, ids: parseProgram(rules).map(ruleIdOf) };
}

export interface Diff { added: string[]; removed: string[]; kept: string[]; }

/** The whole of "what changed between two editions of a book": a set
 *  difference on content hashes. No diff algorithm, no version numbers, no
 *  trust in what the author wrote on the title page. */
export function ruleDiff(a: Edition, b: Edition): Diff {
  const A = new Set(a.ids), B = new Set(b.ids);
  return {
    added: b.ids.filter((x) => !A.has(x)),
    removed: a.ids.filter((x) => !B.has(x)),
    kept: a.ids.filter((x) => B.has(x)),
  };
}

export const CODEX_V1 = edition('v1', BOOK.get('codex_of_thorns')!.rules);

/** A real edit: the second rule now also asks that the thing be moving. */
export const CODEX_V2 = edition('v2', `
threat[mind](T) :- beast[world](T), glows[world](T), wet[world](T).
venom_sign[codex_of_thorns](T) :- beast[world](T), glows[world](T), moving[world](T).
`);

/** NOT an edit. Every variable renamed, not one character of meaning moved.
 *  §9 measures what the diff says about it. */
export const CODEX_RENAMED = edition('v1, variables renamed', `
threat[mind](X) :- beast[world](X), glows[world](X), wet[world](X).
venom_sign[codex_of_thorns](X) :- beast[world](X), glows[world](X).
`);

// ===========================================================================
// hygiene the whole transcript rests on
// ===========================================================================

export interface Hygiene {
  rules: number; allSafe: boolean; demandRels: number;
  unstratified: string[]; audits: Record<string, number>;
  strata: { rel: string; level: number }[];
}

export function hygiene(r: Rofl, watch: string[]): Hygiene {
  // THE SCHEDULE, off the peel. boot.rofl used to derive `stratum/2` and
  // `unstratified/1` and this read them out of the store; the ten rules that
  // did so were deleted once the evaluator started peeling its schedule off the
  // decoded rules instead. The round a relation settles in IS its level, and a
  // relation still standing when a round settles nothing IS unstratifiable —
  // the same two answers, now read from the schedule that was actually used.
  const ev = new Evaluation(r.store, { budget: BUDGET });
  const peel = peelRounds(ev.rules);
  const strata = peel.round;
  return {
    rules: ev.rules.length,
    allSafe: ev.rules.every((x) => x.safe),
    demandRels: ev.demandRels.size,
    unstratified: peel.stuck,
    audits: {
      malformed: rows(r, 'malformed[audit](R)').length,
      breach: rows(r, 'breach[audit](R)').length,
      leak: rows(r, 'leak[audit](A, B)').length,
      forged: rows(r, 'forged[audit](F)').length,
      unmoded: rows(r, 'unmoded[audit](R)').length,
      undefined_premise: rows(r, 'undefined_premise[audit](R, Rel)').length,
    },
    strata: watch.map((rel) => ({ rel, level: strata.get(rel) ?? -1 })),
  };
}

/** Firings a full re-evaluation of this store costs. The NPC's thinking
 *  budget is spent in these units, so this is the number a book has to fit
 *  inside. */
export function firings(r: Rofl, budget: number = BUDGET): number {
  const scratch = Rofl.fromSnapshot(r.save());
  scratch.store.dirty = true;
  const ev = new Evaluation(scratch.store, { budget });
  try { ev.run(); } catch { /* the count up to the wall is the answer */ }
  return ev.steps;
}

// ===========================================================================
// the transcript
// ===========================================================================

const WIDTH = 78;
const STRATA_WATCH = [
  'threat', 'harmless', 'suspect', 'safe', 'opens', 'unjudged',
  'known_pack', 'mute', 'installable', 'fired', 'dead_rule',
  'gives', 'takes_away', 'accept', 'refuse',
];

export function wrap(items: string[], indent: string, width: number = WIDTH): string[] {
  const out: string[] = [];
  let line = indent;
  for (const it of items) {
    if (line !== indent && line.length + 1 + it.length > width) { out.push(line); line = indent; }
    line += (line === indent ? '' : ' ') + it;
  }
  if (line !== indent) out.push(line);
  return out;
}

const say = (s: string = '') => { console.log(s); };
const rule = (title: string) => { say(); say(('== ' + title + ' ').padEnd(WIDTH, '=')); };

function main(): void {
  const t0 = Date.now();
  const checks: string[] = [];
  const check = (what: string, ok: boolean) => {
    checks.push(`${ok ? 'AGREE   ' : 'DISAGREE'}  ${what}`);
    say(`  oracle: ${ok ? 'AGREE' : 'DISAGREE'} — ${what}`);
  };

  say('LOOT — rules as plunder.');
  say('an NPC takes books off corpses and loads them into its head. A book is a');
  say('rulepack; reading it is `load`; leafing through it first is a fork.');
  say();
  say(`shelf    ${BOOKS.length} books, ${BOOKS.reduce((n, b) => n + parseProgram(b.rules).length, 0)} rules between them`);
  say(`road     ${ROUTE.length} rooms, ${col(world(), 'book[world](B)', 'B').length} of the books lying on it`);
  say(`rules    examples/loot/loot.rofl, loaded next to boot.rofl`);

  // -- 0 --------------------------------------------------------------------
  rule('0. hygiene: what the rest of this transcript rests on');
  const base = world();
  const hy = hygiene(base, STRATA_WATCH);
  say(`  ${hy.rules} rules loaded (boot.rofl + loot.rofl); every one range-restricted: ${hy.allSafe}`);
  say(`  relations evaluated by demand (top-down unfolding): ${hy.demandRels}`);
  say(`  unstratified: ${hy.unstratified.length === 0 ? '(none)' : hy.unstratified.join(' ')}`);
  say(`  boot.rofl's audits over LOOT's own reflection: `
    + Object.entries(hy.audits).map(([k, n]) => `${k} ${n}`).join(', '));
  say(`  a full re-evaluation of the native head costs ${firings(base)} firings; the`);
  say(`  wanderer's thinking budget for one encounter is ${THINKING}.`);
  if (!hy.allSafe || hy.demandRels > 0 || hy.unstratified.length > 0) {
    throw new Error('loot: hygiene failed; the rest of the transcript is about a different program');
  }
  say();
  say('  the head it starts with, before a single book:');
  for (const q of ['threat[mind](T)', 'harmless[mind](T)', 'suspect[mind](C)', 'safe[mind](C)']) {
    say(`    ? ${q.padEnd(20)} ${col(base, q, q.includes('(T)') ? 'T' : 'C').join(', ') || '(none)'}`);
  }
  say(`    ? unjudged[audit](T)   ${col(base, 'unjudged[audit](T)', 'T').join(', ')}`);
  say('  the wisp is moving and glowing but neither armed nor rooted, so no rule');
  say('  reaches a verdict on it. `unjudged` says so rather than defaulting to safe.');

  // -- 1 --------------------------------------------------------------------
  rule('1. the shelf, judged before a single rule of it runs');
  say('a pack is rules + the predicate vocabulary they need + the extractor version');
  say('they were written against. Shelving a book puts only its MANIFEST in the');
  say('store — five relations, in the book\'s own ledger, signed by its author.');
  say('Nothing executes; these verdicts are already answerable:');
  say();
  const shelf = world();
  for (const b of BOOKS) shelve(shelf, b);
  say(`  ${'book'.padEnd(24)}${'v'.padEnd(3)}${'rules'.padEnd(7)}verdict`);
  for (const b of BOOKS) {
    const c = compat(shelf, b);
    const v = c.incomplete ? 'TORN'
      : c.versionGap ? `WRONG WORLD (wants v${c.versionGap[0]})`
      : c.mute ? `MUTE (needs ${c.missing.join(', ')})`
      : 'installable';
    say(`  ${b.id.padEnd(24)}${String(b.extractor).padEnd(3)}`
      + `${String(manifestOf(b).ids.length).padEnd(7)}${v}`);
  }
  say();
  const torn = manifestOf(BOOKS[0], { drop: ['pack_extractor'] });
  const tornWorld = world();
  shelve(tornWorld, { ...BOOKS[0], id: 'a_torn_codex' } as Book,
    { manifest: { text: torn.text.replace(/codex_of_thorns/g, 'a_torn_codex'), ids: torn.ids } });
  say('  and an incomplete pack does not install. The same codex with its extractor');
  say('  line torn out of the manifest:');
  say(`    incomplete[audit](a_torn_codex)  -> ${rows(tornWorld, 'incomplete[audit](a_torn_codex)').length === 1}`);
  say(`    installable[audit](a_torn_codex) -> ${rows(tornWorld, 'installable[audit](a_torn_codex)').length === 1}`);
  check('a manifest without an extractor version is not installable',
    rows(tornWorld, 'incomplete[audit](a_torn_codex)').length === 1
    && rows(tornWorld, 'installable[audit](a_torn_codex)').length === 0);

  // -- 2 --------------------------------------------------------------------
  rule('2. the road, walked twice — one route, one set of books');
  const careful = walk(true);
  const reckless = walk(false);
  say('the same six rooms, the same six books, in the same order. The only');
  say('difference is whether a book is leafed through in a fork before it is');
  say('absorbed. Left column: the careful one. Right column: the reckless one.');
  say();
  for (let i = 0; i < ROUTE.length; i++) {
    const leg = ROUTE[i];
    const a = careful.stops[i];
    const b = reckless.stops[i];
    say(`  ${String(i + 1)}. ${leg.room.toUpperCase()}  —  ${leg.note}`);
    say(`     book: ${leg.book ?? '(none)'}`);
    say(`       careful   ${a ? a.verdict : '(never got here)'}`);
    for (const w of (a?.because ?? []).slice(0, 3)) say(`                 · ${w}`);
    for (const w of a?.acted ?? []) say(`                 -> ${w}`);
    say(`       reckless  ${b ? b.verdict : '(never got here)'}`);
    for (const w of b?.acted ?? []) say(`                 -> ${w}`);
    if (b?.partial) say(`                 -> thinking budget exhausted; answered partially`);
  }
  say();
  say(`  the careful one:  ${careful.alive ? 'alive' : 'dead'} at the shrine, `
    + `carrying ${careful.stops[careful.stops.length - 1].state.carries.join(', ')}`);
  say(`  the reckless one: ${reckless.alive ? 'alive' : 'dead'} at ${reckless.stops[reckless.stops.length - 1].room}, `
    + `carrying ${reckless.stops[reckless.stops.length - 1].state.carries.join(', ') || 'nothing'}`);
  say();
  say('  nothing in the road was arranged against the reckless one. It read the same');
  say('  books, in the same order, and every one of them did exactly what its rules');
  say('  say. The difference is four forks.');
  check('the careful one survives the road and the reckless one does not',
    careful.alive && !reckless.alive);

  // -- 3 --------------------------------------------------------------------
  rule('3. quarantine, up close');
  const q0 = world({ at: 'corpse_field', carries: ['sword'], wounded: false });
  const grim = BOOK.get('grimoire_of_ash')!;
  say('$ at corpse_field, before the grimoire:');
  for (const x of beliefs(q0)) say(`    ${x.key}`);
  shelve(q0, grim);
  const t = quarantine(q0, grim);
  say();
  say('$ leaf through the Grimoire of Ash  (install in a fork, diff, come back)');
  say(`    gained: ${t.gained.map((x) => x.key).join(', ') || '(nothing)'}`);
  say(`    lost:   ${t.lost.map((x) => x.key).join(', ') || '(nothing)'}`);
  say(`    verdict: ${t.verdict}`);
  say();
  say('and the verdict is a RULE, not a branch in TypeScript. The diff came back');
  say('into the store as [quarantine] facts and loot.rofl decided:');
  say();
  for (const l of q0.why(`refuse[audit](${grim.id})`).text.split('\n')) say(`    ${l}`);
  say();
  say('read the bottom line. `suspect[mind](supply_chest)` is what the grimoire');
  say('ADDS, and `safe[mind](C) :- container[world](C), not suspect[mind](C)` is a');
  say('native rule. Adding a rule cannot add a `safe` fact; it can only take one');
  say('away. That is the one door a foreign pack has into the reader\'s existing');
  say('conclusions, and nothing in the native head anticipates the grimoire.');
  say();
  const ex = (() => {
    const f = Rofl.fromSnapshot(q0.save());
    install(f, grim, { budget: BUDGET });
    const id = manifestOf(grim).ids[0];
    return f.excise(`rule(${id})`);
  })();
  say('ORACLE. The fork diff is one computation. `excise rule(R)` on the INSTALLED');
  say('world is a second one, by different machinery — a clean re-evaluation on the');
  say('store minus that one reflection fact:');
  say(`    fork says the install loses:      ${t.lost.map((x) => x.key).join(', ')}`);
  say(`    excise says removing it restores: `
    + `${ex.added.filter((k) => k.includes('[mind]')).join(', ')}`);
  say(`    excise says removing it costs:    `
    + `${ex.removed.filter((k) => k.includes('[mind]')).join(', ')}`);
  const lostKeys = t.lost.map((x) => x.key).sort();
  const backKeys = ex.added.filter((k) => k.includes('[mind]')).sort();
  check('the fork diff and excise agree on what the grimoire takes away',
    JSON.stringify(lostKeys) === JSON.stringify(backKeys));

  // -- 4 --------------------------------------------------------------------
  rule('4. the eight ways a book poisons you');
  const table: { name: string; what: string; caught: string }[] = [];

  // (1) forgot what it knew
  table.push({ name: 'forgot what it knew', what: 'grimoire_of_ash',
    caught: `fork diff: loses ${t.lost.map((x) => x.rel).join(', ')}` });

  // (2) substituted meaning
  const q4 = world({ at: 'wisp_hollow', carries: ['sword'], wounded: false });
  const hex = BOOK.get('hexers_marginalia')!;
  shelve(q4, hex);
  const th = quarantine(q4, hex);
  table.push({ name: 'substituted meaning', what: 'hexers_marginalia',
    caught: `overrules[audit]: ${col(q4, `overrules[audit](${hex.id}, T)`, 'T').join(', ')}` });

  // (3) mute
  const q4b = world();
  const seal = BOOK.get('broken_seal')!;
  shelve(q4b, seal);
  const cSeal = compat(q4b, seal);
  const q4c = world();
  readBook(q4c, seal, { budget: BUDGET });
  const undefSeal = rows(q4c, 'undefined_premise[audit](R, Rel)');
  table.push({ name: 'mute pack', what: 'broken_seal',
    caught: `missing_predicate: ${cSeal.missing.join(', ')}; and undefined_premise[audit] if installed anyway` });

  // (4) hangs
  const q4d = world();
  const chant = BOOK.get('chant_of_endless_names')!;
  shelve(q4d, chant);
  const chantRes = install(q4d, chant, { budget: THINKING });
  const q4e = world();
  shelve(q4e, chant);
  install(q4e, chant, { budget: THINKING * 50 });
  table.push({ name: 'hangs', what: 'chant_of_endless_names',
    caught: `hole(_, budget_exhausted) at ${THINKING} and at ${THINKING * 50} firings` });

  // (5) split belief
  table.push({ name: 'split belief', what: 'hexers_marginalia',
    caught: `split[audit]: ${rows(q4, 'split[audit](P, T)').map((x) => `${x.P} calls ${x.T} calm`).join(', ')}` });

  // (6) trojan
  const q4f = world({ at: 'troll_bridge', carries: ['sword'], wounded: false });
  const led = BOOK.get('dead_mans_ledger')!;
  shelve(q4f, led);
  const tl = quarantine(q4f, led);
  table.push({ name: 'trojan', what: 'dead_mans_ledger',
    caught: `trespass[audit]: ${col(q4f, `trespass[audit](${led.id}, Rel)`, 'Rel').join(', ')}` });

  // (7) version gap
  const q4g = world();
  const best = BOOK.get('old_bestiary')!;
  shelve(q4g, best);
  const cBest = compat(q4g, best);
  const q4h = world();
  readBook(q4h, best, { budget: BUDGET });
  table.push({ name: 'version gap', what: 'old_bestiary',
    caught: `version_gap[audit]: wants v${cBest.versionGap?.[0]}, world is v${cBest.versionGap?.[1]}` });

  // (8) too dear
  const q4i = world();
  const heavy = BOOK.get('weight_of_the_world')!;
  shelve(q4i, heavy);
  const heavyRes = install(q4i, heavy, { budget: THINKING });
  const q4j = world();
  shelve(q4j, heavy);
  const heavyOk = install(q4j, heavy, { budget: THINKING * 50 });
  table.push({ name: 'too dear', what: 'weight_of_the_world',
    caught: `partial at ${THINKING} firings, complete at ${THINKING * 50}` });

  for (const x of table) {
    say(`  ${x.name.padEnd(21)}${x.what.padEnd(24)}${x.caught}`);
  }
  say();
  say('THE MUTE PACK IS THE WORST OF THE EIGHT, and the reason is in its row. Read');
  say('it and nothing happens. No error, no warning, no new belief — and "found no');
  say('threats" looks exactly the same. Two independent things catch it, and both');
  say('are already in the repository:');
  say(`    the manifest check      pack_needs(broken_seal, heat_bloom), and`);
  say(`                            produces[world](heat_bloom) does not hold`);
  say(`    boot.rofl, if installed undefined_premise[audit] = ${undefSeal.length}: `
    + `${undefSeal.map((x) => `${x.R} reads ${x.Rel}`).join(', ')}`);
  check('the mute pack is caught by the manifest and again by boot.rofl',
    cSeal.mute && undefSeal.length > 0);
  say();
  say('AND THE HANG IS CAUGHT FROM INSIDE. `name[mind](T, N1) :- name[mind](T, N),');
  say('N1 is N + 1` invents a new constant every round, so there is no fixpoint to');
  say('reach. The engine does not spin: it spends the budget, records');
  say(`hole($load(N), budget_exhausted), and hands back what it had.`);
  say();
  say(`    at ${THINKING} firings   load ok: ${chantRes.ok}   partial: ${chantRes.partial}   `
    + `holes: ${rows(q4d, 'hole(H, Why)', THINKING).length}   `
    + `names derived: ${rows(q4d, 'name[mind](T, N)', THINKING).length}`);
  say(`    at ${THINKING * 50} firings load ok: true   partial: ${q4e.store.partialEval}   `
    + `holes: ${rows(q4e, 'hole(H, Why)', THINKING).length}   `
    + `names derived: ${rows(q4e, 'name[mind](T, N)', THINKING).length}`);
  say('    a bigger budget buys more names and never buys an answer. That is the');
  say('    difference between this book and the next one:');
  say(`    weight_of_the_world at ${THINKING}: partial ${heavyRes.partial}, `
    + `${rows(q4i, 'triple[mind](A, B, C)').length} conclusions`);
  say(`    weight_of_the_world at ${THINKING * 50}: partial ${heavyOk.partial}, `
    + `${rows(q4j, 'triple[mind](A, B, C)').length} conclusions`);
  say('    one is unpayable and the other is merely expensive, and the reader can');
  say('    tell them apart by paying more once.');
  check('the chant never settles and the heavy book settles at a larger budget',
    chantRes.partial && q4e.store.partialEval && heavyRes.partial && !heavyOk.partial);

  // -- 5 --------------------------------------------------------------------
  rule('5. the four ways a book makes you smarter');
  say('  (a) A HOLE CLOSED — a situation no rule covered');
  const a5 = world({ at: 'wisp_hollow', carries: ['sword'], wounded: false });
  say(`      before: unjudged[audit] -> ${col(a5, 'unjudged[audit](T)', 'T').join(', ')}`);
  readBook(a5, BOOK.get('codex_of_thorns')!, { budget: BUDGET });
  say(`      after:  unjudged[audit] -> ${col(a5, 'unjudged[audit](T)', 'T').join(', ') || '(none)'}`);
  say(`              threat[mind]    -> ${col(a5, 'threat[mind](T)', 'T').join(', ')}`);
  say();
  say('  (b) A CONSERVATIVE EXTENSION — strictly more, nothing lost');
  const b5 = world({ at: 'wisp_hollow', carries: ['sword'], wounded: false });
  readBook(b5, BOOK.get('codex_of_thorns')!, { budget: BUDGET });
  const prim = BOOK.get('wardens_primer')!;
  shelve(b5, prim);
  const tp = quarantine(b5, prim);
  say(`      gained: ${tp.gained.map((x) => x.key).join(', ')}`);
  say(`      lost:   ${tp.lost.map((x) => x.key).join(', ') || '(nothing)'}`);
  say(`      verdict: ${tp.verdict}  — accepted automatically, because it takes nothing away`);
  check('a pack that takes nothing away is accepted without a ruling', tp.verdict === 'accept');
  say();
  say('  (c) CHEAPER PROOFS — the same conclusions, shorter derivations');
  const c5 = world({ at: 'troll_bridge', carries: ['sword', 'bandage'], wounded: true });
  const before5 = proofCost(c5);
  const scout = BOOK.get('low_road_sighting')!;
  shelve(c5, scout);
  const tc = quarantine(c5, scout);
  say(`      gained: ${tc.gained.map((x) => x.key).join(', ') || '(nothing)'}`);
  say(`      lost:   ${tc.lost.map((x) => x.key).join(', ') || '(nothing)'}`);
  say(`      verdict: ${tc.verdict}  — the fork diff is EMPTY, and the fork diff is`);
  say(`               all the conservativity check can see`);
  const c5b = Rofl.fromSnapshot(world({ at: 'troll_bridge', carries: ['sword', 'bandage'], wounded: true }).save());
  readBook(c5b, scout, { budget: BUDGET });
  const after5 = proofCost(c5b);
  say();
  say('      tropical (min-plus, 1 per firing) over the same store, before and after:');
  const cheaper: string[] = [];
  for (const k of [...before5.keys()].sort()) {
    const x = before5.get(k)!, y = after5.get(k);
    if (y !== undefined && y < x) { cheaper.push(k); say(`        ${k.padEnd(34)} ${x} -> ${y} firings`); }
  }
  say();
  say('      SO "NOTHING GAINED AND NOTHING LOST" HAS TWO READINGS, and the mute pack');
  say('      of §4 is the other one. Both come back from the fork as an empty diff;');
  say('      `ruling[audit]` is the rules refusing to guess which. The tropical fold');
  say('      settles it: a mute pack changes no cost, a shortcut lowers one.');
  check('the shortcut pack lowers a proof cost while changing no conclusion',
    tc.gained.length === 0 && tc.lost.length === 0 && cheaper.length > 0);
  say();
  say('  (d) A BRIDGE — a book worth nothing alone that makes two others work');
  const d1 = world({ at: 'wisp_hollow', carries: ['sword'], wounded: false });
  readBook(d1, BOOK.get('tongue_of_the_deep')!, { budget: BUDGET });
  readBook(d1, BOOK.get('bog_herbal')!, { budget: BUDGET });
  say(`      tongue + herbal, no codex:   antidote[mind] -> `
    + `${col(d1, 'antidote[mind](T)', 'T').join(', ') || '(nothing)'}`);
  say(`                                   undefined_premise[audit] -> `
    + `${rows(d1, 'undefined_premise[audit](R, Rel)').map((x) => x.Rel).join(', ')}`);
  const d2 = world({ at: 'wisp_hollow', carries: ['sword'], wounded: false });
  readBook(d2, BOOK.get('codex_of_thorns')!, { budget: BUDGET });
  readBook(d2, BOOK.get('bog_herbal')!, { budget: BUDGET });
  say(`      codex + herbal, no tongue:   antidote[mind] -> `
    + `${col(d2, 'antidote[mind](T)', 'T').join(', ') || '(nothing)'}`);
  const d3 = world({ at: 'wisp_hollow', carries: ['sword'], wounded: false });
  for (const id of ['codex_of_thorns', 'tongue_of_the_deep', 'bog_herbal']) {
    readBook(d3, BOOK.get(id)!, { budget: BUDGET });
  }
  say(`      all three:                   antidote[mind] -> `
    + `${col(d3, 'antidote[mind](T)', 'T').join(', ')}`);
  say('      the tongue derives nothing of its own in any of the three worlds. It');
  say('      translates `venom_sign` in the codex\'s ledger into `toxic` in the');
  say('      herbal\'s, and that is its entire content. AKA, applied to rulepacks.');
  check('the bridge pack is inert alone and decisive in company',
    col(d1, 'antidote[mind](T)', 'T').length === 0
    && col(d2, 'antidote[mind](T)', 'T').length === 0
    && col(d3, 'antidote[mind](T)', 'T').length > 0);

  // -- 6 --------------------------------------------------------------------
  rule('6. which book is behind this belief');
  const p6 = world({ at: 'troll_bridge', carries: ['sword'], wounded: false });
  const SWALLOWED = ['codex_of_thorns', 'grimoire_of_ash', 'hexers_marginalia',
    'dead_mans_ledger', 'old_bestiary'];
  for (const id of SWALLOWED) readBook(p6, BOOK.get(id)!, { budget: BUDGET });
  const prov = packProvenance(p6);
  say('five books swallowed, the version-gapped bestiary among them. Every belief');
  say('now in the head, and the minimal sets of');
  say('books each one rests on — folded from the kernel\'s own support records, with');
  say('the PACK as the annotation of a firing. No pack cooperates in this.');
  say();
  for (const b of beliefs(p6)) {
    say(`  ${b.key.padEnd(38)} ${renderPacks(prov.get(b.key))}`);
  }
  say();
  say('the trojan, asked directly:');
  say();
  for (const l of p6.why('hand_over[mind](sword, the_ashen_hand)').text.split('\n')) say(`    ${l}`);
  say();
  const hoRule = manifestOf(BOOK.get('dead_mans_ledger')!).ids[0];
  say(`  the rule at the top of that tree is ${hoRule}, and it belongs to `
    + `${ownersOf(p6, hoRule).join(', ')}`);
  say('  — read off `pack_rule`, which the book itself wrote, and `derived_by`,');
  say('  which the kernel wrote. If either were missing the belief would still be');
  say('  there and there would be no way to ask where it came from.');
  say();
  say('and the other direction. Something this head could do at the gate, it can no');
  say('longer do; `whynot` names both rules that could have reached it and why each');
  say('one failed — one native, blocked by a foreign premise, one foreign outright:');
  say();
  for (const l of p6.whynot('opens[mind](supply_chest)', { depth: 4, nodes: 40 }).text.split('\n')) {
    say(`    ${l}`);
  }
  say();
  say('  the first rule is the reader\'s own and it fails on `not suspect`, which the');
  say('  grimoire made true. The second is the hexer\'s and it fails on its own terms:');
  say('  no ward glyph on this chest. Two books, two different ways of not helping,');
  say('  and neither of them had to be looked for.');
  say();
  const { count, cyclic } = beliefCounts(p6);
  say('and how FRAGILE each belief is — how many independent derivations it has:');
  for (const b of beliefs(p6)) {
    const n = count.get(b.key)!;
    const p = prov.get(b.key);
    const native = p?.some((m) => m.length === 0) ?? false;
    say(`  ${b.key.padEnd(38)} ${renderCount(n).padStart(3)}  ${native ? 'has a native derivation' : 'FOREIGN ONLY'}`);
  }
  say(`  (${cyclic} facts on a cycle of the support graph)`);
  say();
  say('  IN THIS DOMAIN THE COUNT IS FRAGILITY OF BELIEF, as in NOPE and OOPS, not');
  say('  magnitude as in HUH. It counts derivations, never things: a belief scoring');
  say('  2 has two ways to be reached, not two things behind it. A belief with one');
  say('  derivation and that one foreign is the fragile kind — it goes when the book');
  say('  goes, and §7 makes it go.');
  say();
  const conf = col(p6, 'confused[audit](T)', 'T');
  say('AND THE VERSION GAP, WHICH NOTHING ABOVE FLAGGED. The bestiary was written');
  say('when `hostile` meant "attacks on sight"; in this extractor it is a faction');
  say('mark and says nothing about danger. The rule still parses, still fires, and');
  say('the reader now holds two opposite verdicts about the same thing:');
  say(`    threat[mind]    -> ${col(p6, 'threat[mind](T)', 'T').join(', ')}`);
  say(`    harmless[mind]  -> ${col(p6, 'harmless[mind](T)', 'T').join(', ')}`);
  say(`    confused[audit] -> ${conf.join(', ') || '(none)'}`);
  say(`    threat[mind](${conf[0] ?? 'x'}) rests on ${renderPacks(prov.get(`threat[mind](${conf[0]})`))}`);
  say('  no explosion: the two facts are different facts and both stand. What the');
  say('  shelf check of §1 would have said, before any of this ran, is');
  say(`  version_gap[audit](old_bestiary, 1, 2) — and the reckless reader did not ask.`);
  check('the version-gapped book leaves the reader holding both verdicts at once',
    conf.length > 0 && renderPacks(prov.get(`threat[mind](${conf[0]})`)) === 'old_bestiary');

  // -- 7 --------------------------------------------------------------------
  rule('7. forgetting a book, and what fades with it');
  const u7 = world({ at: 'corpse_field', carries: ['sword'], wounded: false });
  for (const id of ['codex_of_thorns', 'grimoire_of_ash']) {
    readBook(u7, BOOK.get(id)!, { budget: BUDGET });
  }
  say('  with the codex and the grimoire both read:');
  for (const b of beliefs(u7)) say(`    ${b.key}`);
  const un = unload(u7, 'grimoire_of_ash');
  say();
  say(`  $ forget grimoire_of_ash   (${un.removed.length} rules, ${un.facts} reflection facts removed)`);
  for (const b of beliefs(u7)) say(`    ${b.key}`);
  say(`    faded: ${un.faded.join(', ') || '(nothing)'}`);
  say();
  say('  and `safe[mind](supply_chest)` is back — not restored, not patched. The');
  say('  rule that blocked it is not in the store, so the next evaluation simply');
  say('  derives it again. That is OOPS\'s un-retraction, read from the other side.');
  const back = beliefs(u7).some((b) => b.key === 'safe[mind](supply_chest)');
  check('unloading the grimoire brings back what it took away', back);
  say();
  say('  A RULE TWO BOOKS SHIP. The codex and the warden\'s primer both carry');
  say('  `threat[mind](T) :- beast[world](T), glows[world](T), wet[world](T)`, and');
  say('  content addressing makes that one rule with two owners:');
  const s7 = world({ at: 'wisp_hollow', carries: ['sword'], wounded: false });
  for (const id of ['codex_of_thorns', 'wardens_primer']) {
    readBook(s7, BOOK.get(id)!, { budget: BUDGET });
  }
  const shared = [...new Set(rows(s7, 'shared_rule[audit](P, Q, R)').map((x) => x.R))];
  for (const id of shared) say(`    ${id}  owned by ${ownersOf(s7, id).join(' and ')}`);
  const beforeUn = beliefs(s7).map((x) => x.key);
  const un2 = unload(s7, 'codex_of_thorns');
  say(`    $ forget codex_of_thorns  -> removed ${un2.removed.length}, `
    + `kept ${un2.kept.length} (shared with another book)`);
  say(`    threat[mind] afterwards: ${col(s7, 'threat[mind](T)', 'T').join(', ')}`);
  say('    the wisp is still a threat, because the primer still says so. Unloading');
  say('    a pack that owns a rule ALONE removes the rule; unloading one of two');
  say('    owners removes only the ownership. Nothing had to be reference-counted:');
  say('    the id IS the rule, and `pack_rule` already records both claims.');
  check('unloading one of two owners of a shared rule leaves the rule standing',
    un2.kept.length === 1 && col(s7, 'threat[mind](T)', 'T').includes('wisp'));

  // -- 8 --------------------------------------------------------------------
  rule('8. dead books, uninvited rules, and a forged edition');
  const d8 = world({ at: 'swamp_gate', carries: ['sword'], wounded: false });
  readBook(d8, BOOK.get('dune_walkers_rule')!, { budget: BUDGET });
  readBook(d8, BOOK.get('codex_of_thorns')!, { budget: BUDGET });
  say('  MOOT\'s faculty, over the kernel\'s provenance instead of over a config:');
  say(`    dead_book[audit]  -> ${col(d8, 'dead_book[audit](P)', 'P').join(', ') || '(none)'}`);
  for (const x of rows(d8, 'dead_rule[audit](P, R)')) {
    say(`    dead_rule[audit]  -> ${x.P}  ${x.R}`);
    say(`                         ${canonOf(d8, x.R)}`);
  }
  say('    correct rules about surviving a desert, carried through a swamp. Nothing');
  say('    is wrong with them and nothing will ever come of them. They are found by');
  say('    four rules reading `derived_by`, which the kernel emits per firing.');
  check('the desert book is dead here and the codex is not',
    col(d8, 'dead_book[audit](P)', 'P').join() === 'dune_walkers_rule');
  say();
  const u8 = world({ at: 'swamp_gate', carries: ['sword'], wounded: false });
  const codex = BOOK.get('codex_of_thorns')!;
  shelve(u8, codex);
  install(u8, codex, { budget: BUDGET, record: false });
  say('  A PAGE IN A POCKET. Rules loaded without the ledger entry that says this');
  say('  head read that book — the supply-chain case, where someone else\'s rule');
  say('  arrives with no manifest behind it:');
  for (const x of rows(u8, 'uninvited[audit](P, R)')) say(`    uninvited[audit](${x.P}, ${x.R})`);
  say('    `writes_to(R, mind)` is kernel-emitted from the rule\'s own head. The');
  say('    audit needs nothing from the pack.');
  check('a rule installed without the import record is flagged uninvited',
    rows(u8, 'uninvited[audit](P, R)').length > 0);
  say();
  const f8 = world();
  shelve(f8, codex, { who: 'a_charlatan' });
  const forgedRows = rows(f8, 'forged[audit](F)');
  say('  A FORGED EDITION. The same text, the same title, signed by another hand:');
  say(`    $ shelve codex_of_thorns   who = a_charlatan`);
  say(`    forged[audit] -> ${forgedRows.length} facts, every one of them in [codex_of_thorns]:`);
  for (const x of forgedRows.slice(0, 3)) say(`      ${x.F}`);
  say('    `authority(codex_of_thorns, thornwood_of_the_low_fen)` is the whole list');
  say('    of who may write in that book. No enforcement code anywhere.');
  check('an edition signed by the wrong hand is forged', forgedRows.length > 0);

  // -- 9 --------------------------------------------------------------------
  rule('9. versioning: content-addressed identity, and its one sharp edge');
  say('a rule id is `r` + fnv1a of the canonical clause. Two rules are the same');
  say('rule iff they are literally the same clause, so the diff between editions is');
  say('a set difference on ids — no diff algorithm, no version numbers, no trusting');
  say('what the author wrote on the title page.');
  say();
  const dEdit = ruleDiff(CODEX_V1, CODEX_V2);
  say(`  codex v1 vs v2 (one premise added to the second rule)`);
  say(`    kept    ${dEdit.kept.length}   ${dEdit.kept.join(' ')}`);
  say(`    removed ${dEdit.removed.length}   ${dEdit.removed.join(' ')}`);
  say(`    added   ${dEdit.added.length}   ${dEdit.added.join(' ')}`);
  say('    exactly right: one rule untouched, one replaced.');
  say();
  const dRen = ruleDiff(CODEX_V1, CODEX_RENAMED);
  say(`  codex v1 vs the SAME BOOK with every variable renamed ?T -> ?X`);
  say(`    kept    ${dRen.kept.length}   ${dRen.kept.join(' ') || '(none)'}`);
  say(`    removed ${dRen.removed.length}   ${dRen.removed.join(' ')}`);
  say(`    added   ${dRen.added.length}   ${dRen.added.join(' ')}`);
  say();
  say('  THAT IS A REAL LIMIT AND IT IS NOT PAPERED OVER HERE. `canonClause` renders');
  say('  a variable as `?` + its source name, so the canonical form of a clause');
  say('  keeps the letters the author happened to type. `canonVars` — which renames');
  say('  a term list to positional placeholders and is exactly the function this');
  say('  would need — exists in src/unify.ts and is used by the engine for RENDERING');
  say('  only; `ruleIdOf` does not call it. The consequences are two, both measured:');
  say();
  const r9 = world({ at: 'wisp_hollow', carries: ['sword'], wounded: false });
  readBook(r9, codex, { budget: BUDGET });
  const c9a = beliefCounts(r9).count.get('threat[mind](wisp)');
  const r9b = Rofl.fromSnapshot(r9.save());
  must(r9b.load(CODEX_RENAMED.rules, { budget: BUDGET }), 'the renamed edition');
  const c9b = beliefCounts(r9b).count.get('threat[mind](wisp)');
  say(`    1. a diff between two editions that differ only in variable names reports`);
  say(`       ${dRen.removed.length} rules removed and ${dRen.added.length} added, when nothing changed.`);
  say(`    2. installing both editions installs BOTH, and every conclusion they`);
  say(`       share now has two derivations where it had one:`);
  say(`         threat[mind](wisp) with the codex alone       ${renderCount(c9a!)}`);
  say(`         with the codex and its renamed twin           ${renderCount(c9b!)}`);
  say(`       so the fragility number of §6 is inflated by a rename, which is the`);
  say(`       one place this leak reaches a conclusion a reader would act on.`);
  say('    Wildcards do NOT leak: the parser numbers `_` per clause, so two clauses');
  say('    written with `_` in the same places hash alike. It is named variables only.');
  check('a variable rename changes every rule id (the finding, measured not assumed)',
    dRen.kept.length === 0 && dRen.removed.length === CODEX_V1.ids.length
    && c9a === 1n && c9b === 2n);
  say();
  say('  A TAMPERED EDITION, which content addressing does catch. Take the genuine');
  say('  manifest and ship it beside an altered text:');
  const tampered = manifestOf(codex);
  const alteredText = codex.rules.replace('wet[world](T)', 'moving[world](T)');
  const realIds = parseProgram(alteredText).map(ruleIdOf).sort();
  const t9 = world();
  shelve(t9, codex, { manifest: tampered });
  const mismatch = declaredIds(t9, codex.id).filter((x) => !realIds.includes(x));
  say(`    manifest declares: ${tampered.ids.slice().sort().join(' ')}`);
  say(`    the text hashes to: ${realIds.join(' ')}`);
  say(`    unaccounted for:    ${mismatch.join(' ')}`);
  say('    a signature is not needed for this: the hash IS the name, so a text that');
  say('    does not hash to the name it was shipped under is not that rule.');
  check('an altered text no longer matches the ids its manifest declares', mismatch.length > 0);

  // -- 10 -------------------------------------------------------------------
  rule('10. what this cost the engine');
  const cost = world();
  say('  loot.rofl §5 reads `derived_by` in a rule body, and it is the first MODEL in');
  say('  this repository to do so. The kernel already knew that would happen: a rule');
  say('  triggered by derivations anywhere in the program is outside the cone');
  say('  argument that derived-relation reuse rests on, so src/engine.ts declines to');
  say('  reuse anything at all rather than reuse something it cannot promise. The');
  say('  behaviour is pinned by test/derived-reuse.test.ts, "a rule that reads');
  say('  provenance turns reuse off entirely"; what is new here is paying for it.');
  say();
  const plainWorld = (() => {
    const r = new Rofl();
    must(r.load(BOOT, { budget: BUDGET }), 'boot');
    return r;
  })();
  say(`    fingerprinted derived relations, boot.rofl alone:  ${plainWorld.store.derivedKeys.size}`);
  say(`    fingerprinted derived relations, boot + loot.rofl: ${cost.store.derivedKeys.size}`);
  say('    zero is the engine saying it has nothing it may reuse next time.');
  say();
  const withProv = firings(cost);
  const stripped = LOOT.split('\n').filter((l) => !/^fired\[audit\]|^pack_fired\[audit\]|^dead_rule\[audit\]|^dead_book\[audit\]/.test(l)).join('\n');
  const noProvWorld = (() => {
    const r = new Rofl();
    must(r.load(BOOT, { budget: BUDGET }), 'boot');
    must(r.load(stripped, { budget: BUDGET }), 'loot without the provenance rules');
    must(r.load(stateFacts(START), { budget: BUDGET }), 'wanderer');
    return r;
  })();
  say(`    full re-evaluation with the provenance rules:    ${withProv} firings`);
  say(`    the same program with those four rules removed:  ${firings(noProvWorld)} firings`);
  say('    the difference is what the attribution of §6 and the dead-book audit of');
  say('    §8 cost, on this world, measured rather than argued.');
  say();
  say('  and the whole transcript, end to end:');
  say(`    ${careful.stops.length} + ${reckless.stops.length} encounters on the road, `
    + `${BOOKS.length} shelf checks, and every quarantine a fork of the store —`);
  say(`    ${worldsBuilt} worlds of boot.rofl + loot.rofl built from scratch in `
    + `${Date.now() - t0} ms.`);

  // -- summary --------------------------------------------------------------
  rule('summary');
  say(`${checks.length} checks, each against a second computation of the same thing:`);
  for (const x of checks) say('  ' + x);
  const bad = checks.filter((x) => x.startsWith('DISAGREE')).length;
  say();
  say(bad === 0
    ? 'no verdict in this transcript is refuted by the store it was computed from.'
    : `${bad} DISAGREEMENT(S) — that is the finding; the answers stand as computed.`);
  say(`(${Date.now() - t0} ms)`);
  if (bad > 0) process.exitCode = 1;
}

/** The canonical text of a loaded rule, read back out of the store. */
export function canonOf(r: Rofl, ruleId: string): string {
  const c = parseProgram(BOOKS.map((b) => b.rules).join('\n'))
    .find((x) => ruleIdOf(x) === ruleId);
  return c ? canonClause(c) : ruleId;
}

const real = (p: string): string => { try { return fs.realpathSync(p); } catch { return p; } };
const isMain = process.argv[1]
  && real(path.resolve(process.argv[1])) === real(new URL(import.meta.url).pathname);
if (isMain) main();

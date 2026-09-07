// engine-split.test.ts — the policy/mechanism classification of src/engine.ts,
// run as a test so it cannot drift off its subject in silence.
//
// A classification is a claim about a file. What KEEPS it honest changed on
// 2026-09-01, and the change is the point of this file:
//
//   BEFORE. The claim was 42 line ranges — 84 hardcoded numbers — plus a pin on
//   the file's length. Every one of those numbers went stale the moment anyone
//   inserted a line, so the guard fired on MOVEMENT, which is not an event.
//   Measured: eleven comment lines inserted into src/engine.ts, changing no
//   behaviour and no count, turned EIGHT tests red across this file and
//   test/bootstrap-dag.test.ts.
//
//   NOW. A block is keyed by the NAME of the definition that opens it. Ranges
//   are outputs. The pin on the file's length is gone, and in its place is a
//   guard aimed at the event the pin was standing in for: every definition
//   src/engine.ts holds must either open a block or be DECLARED as absorbed by
//   one, so a new method cannot slide into a neighbouring block and inherit a
//   category nobody chose.
//
// Four things are checked here, and each has a control:
//
//   1. Every key RESOLVES, to exactly one definition, in order.
//   2. Every definition is accounted for (the ABSORBED map).
//   3. The counts, which are now ROW COUNTS from the emitted store rather than
//      numbers a reduce printed: `block(engine_ts, L, mech)` returns 491.
//   4. The POLICY label is MEASURED, not asserted. Two of the blocks are
//      recomputed as ROFL rules and compared against the kernel's own answer,
//      each with a control that would catch a probe agreeing about nothing.
//
// The mutant SET below is the coverage measurement CLAUDE.md asks for: one
// mutant shows the gate is alive, only a set says what it sees. Six mutants,
// each naming the constraint it targets, and the two it CANNOT see are named
// too — silence about a blind spot is the defect the set exists to prevent.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BLOCKS, DECLS, ABSORBED, split, report, resolve, definitions, contamination,
  world, rows, facts, demandAsRules, maxStratumAsRules, type Decl,
} from '../scanners/engine_split.ts';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

const SRC = read('src', 'engine.ts').split('\n');
const S = split();
const W = world(S);

// ---------------------------------------------------------------------------
// 1 + 2: the classification still describes the file it was drawn over

test('every key resolves, in order, and no definition is unaccounted for', () => {
  assert.deepEqual(S.drift, []);
  // and the resolution is total: 42 blocks, tiling by construction
  assert.equal(BLOCKS.length, DECLS.length);
  assert.equal(BLOCKS[0].from, 1);
  assert.equal(BLOCKS[BLOCKS.length - 1].to, SRC.length);
  let cursor = 1;
  for (const b of BLOCKS) { assert.equal(b.from, cursor, `hole at ${b.id}`); cursor = b.to + 1; }
});

test('the anchors still stand, and NOT by accident of a global search', () => {
  for (const b of BLOCKS) {
    assert.ok(SRC[b.from - 1].includes(b.anchor), `${b.id}: "${b.anchor}" is not at line ${b.from}`);
  }
  // THE REASON THE SEARCH IS SCOPED. `for (;;) {` occurs five times in
  // src/engine.ts and `matchPremise(` three times. A global first-hit search
  // resolved `renameClause(` to its CALL at 1031 rather than its definition —
  // the one block out of 42 an unscoped search got wrong. Keying by definition
  // name and scoping part-anchors to the owning method removes the class.
  const occ = (needle: string) => SRC.filter((l) => l.includes(needle)).length;
  // FIVE, THEN TWO. Three of the `for (;;)` loops were fixpoints the host
  // computed by hand -- the unfoldable set, the demand closure and the stratum
  // cone -- and they are rules now. The hazard the scoping exists for is
  // smaller than it was and has not gone: two is still more than one.
  assert.ok(occ('for (;;) {') >= 2, `${occ('for (;;) {')} occurrences — the hazard is real`);
  assert.ok(occ('renameClause(') >= 2, 'the call site that misled a global search is still there');
  const rc = BLOCKS.find((b) => b.id === 'renameClause')!;
  assert.ok(SRC[rc.from - 1].includes('renameClause(c: Clause): Clause'), 'resolved to the DEFINITION');
  assert.ok(SRC.findIndex((l) => l.includes('renameClause(')) + 1 < rc.from,
    'and a CALL to it stands earlier in the file, which is what the global search hit');
});

test('the split is keyed by names, not by line numbers', () => {
  // the tax, stated as a property: no line number is an INPUT anywhere in the
  // declaration table. 84 of them were, and that is what made an insertion cost
  // eight red tests.
  const declared = JSON.stringify(DECLS);
  assert.equal(/"(from|to)":\s*\d/.test(declared), false, 'a line number is back in the table');
  // 29 -> 30: `planBody`, declared as its own block rather than absorbed into
  // the header, because it is a DECISION and an absorbed definition inherits a
  // category nobody chose — which is what this control exists to catch.
  assert.equal(DECLS.filter((d) => d.key.kind === 'def').length, 33);
  assert.equal(DECLS.filter((d) => d.key.kind === 'part').length, 9);
  assert.equal(DECLS.filter((d) => d.key.kind === 'file').length, 1);
  // the 12 parts cut exactly four methods, and that is the declared loan
  const cut = new Set(DECLS.flatMap((d) => (d.key.kind === 'part' ? [d.key.of] : [])));
  assert.deepEqual([...cut].sort(), ['planReuse', 'prepare', 'run', 'runWellFounded']);
});

// ---------------------------------------------------------------------------
// THE MUTANT SET. One mutant is liveness; a set is coverage.

const mutate = (fn: (lines: string[]) => string[], decls: Decl[] = DECLS): string[] =>
  resolve(fn([...SRC]), decls).drift;

test('MUTANTS: what the drift gate catches, and what it does not', () => {
  // POSITIVE CONTROL FIRST: the unmutated file is clean, so a mutant going red
  // is the mutation and not a permanently-broken gate.
  assert.deepEqual(resolve([...SRC], DECLS).drift, []);

  // (1) a block key whose definition was RENAMED — the event a name key exists
  //     to make loud, where a line key would have silently moved on
  const renamed = mutate((l) => l.map((x) => x.replace('private stratumCone(', 'private stratumCohn(')));
  assert.ok(renamed.some((d) => d.includes('no longer defines "stratumCone"')), renamed.join('; '));

  // (2) a key that now names TWO definitions — first-hit would have picked one
  //     and reported nothing
  const doubled = mutate((l) => { l.splice(600, 0, '  private negHolds(x: number): void {}'); return l; });
  assert.ok(doubled.some((d) => d.includes('names 2 definitions')), doubled.join('; '));

  // (3) a part anchor gone from its owner's region. NOTE the mutant: the first
  //     attempt renamed it to `fingerprints`, which the gate did NOT catch —
  //     correctly, since an anchor is a SUBSTRING test and `fingerprints`
  //     contains `fingerprint`. That was a weak mutant, not a weak gate, and it
  //     is recorded here because a mutant that fails to kill reads exactly like
  //     a gate that cannot.
  const noAnchor = mutate((l) => l.map((x) => x.replace('// (3) fingerprint', '// (3) fnv over the keys')));
  assert.ok(noAnchor.some((d) => d.includes('fingerprint') && d.includes('has no first line')), noAnchor.join('; '));

  // (4) A NEW METHOD, unclassified. This is the mutant that replaces the line
  //     pin: it is the only kind of change to src/engine.ts that should cost a
  //     red test, because it is the only one that is a classification event.
  const added = mutate((l) => { l.splice(950, 0, '  private brandNewProbe(): void {}', ''); return l; });
  assert.ok(added.some((d) => d.includes('brandNewProbe') && d.includes('inherits a category nobody chose')),
    added.join('; '));

  // (5) an absorbed definition DELETED — the map is a claim in both directions
  const dropped = mutate((l) => l.map((x) => x.replace('  private negLevel(', '  private negLvl(')));
  assert.ok(dropped.some((d) => d.includes('absorbs [negLvl]')), dropped.join('; '));

  // (6) a part declaring an owner that is not the block above it
  const misowned = resolve([...SRC], DECLS.map((d) =>
    (d.id === 'hits' && d.key.kind === 'part' ? { ...d, key: { ...d.key, of: 'prepare' } } : d))).drift;
  assert.ok(misowned.some((d) => d.includes('part of prepare')), misowned.join('; '));

  // ---- AND WHAT IT CANNOT SEE, measured rather than assumed ----------------
  //
  // (a) A LINE CHANGING CATEGORY. Rewriting a MECH line inside a POL block as
  //     something that decides nothing leaves the gate silent — the category is
  //     the scanner's hand judgement, which is exactly the contamination
  //     declared as `dirty(engine_split, cat, K, language_model)`. This mutant
  //     is why that loan is written down instead of assumed away.
  const recat = mutate((l) => l.map((x) =>
    x.replace('const byHead = new Map<string, ERule[]>();', 'const byHead = new Map<string, ERule[]>(); // reclassified')));
  assert.deepEqual(recat, [], 'the gate sees text, not meaning — and says so in the loan table');
  //
  // (b) A METHOD MOVED WITHIN ITS OWN BLOCK. `fireRule` and `propagate` are
  //     both absorbed by `activate`; swapping their order changes nothing the
  //     gate can name, because ABSORBED is a set-with-order over a region and
  //     the region did not change shape. Harmless here, and stated so that
  //     nobody reads this gate as an ordering check.
  const reordered = ABSORBED['activate'];
  assert.deepEqual(reordered, ['propagate', 'fireRule', 'fireRuleFront'],
    'the absorbed list is ORDERED by line, so a genuine move would surface as a mismatch');
});

// ---------------------------------------------------------------------------
// 3: the counts, as ROW COUNTS out of the emitted store

// THE 2026-09-01 SHIFT: the space wall (a second budget, in rows, so that an
// evaluation that runs out of MEMORY says so instead of being killed). Every
// counter below that moved carries the reason it moved, because a census
// updated without one stops being a census and becomes an echo.
test('the split: mechanism is 693 of 959 code lines, policy 169 — by query', () => {
  // 778 -> 826 (+48): the whole of the space wall, both halves of it — the
  // charge inside solveBody's accumulator loop and the charge on every row
  // written, host-written rows included.
  // 826 -> 834 (+8): the kernel-ledger ring. Seven of the eight are the ring
  // itself, in three places (`conclude` 5, `matchPremise` 1, `negHolds` 1);
  // the eighth is the import line that brings `KERNEL_PERSP` and
  // `isKernelLedger` in, which is PLUMB and lands in neither block below —
  // which is why this total moves by 8 and the mechanism count by 7.
  // 834 -> 851 (+17): the comparison branch given a failure sink, symmetric
  // with `is`. `str_len(S) < 5` was silently false for ever while
  // `N is str_len(S), N < 5` worked, and `str_len(7) < 5` produced no rows and
  // NO hole while `N is str_len(7)` produced `str_type_error` — the same
  // inability, one audible and one mute.
  // 851 -> 901 (+50): `planBody`, which decides where a negation may stand so
  // that literal order cannot change the answer, plus the two call sites that
  // solve the plan instead of the written body. THE WHOLE +50 IS POLICY AND
  // PLUMB: `mech` below does not move by a line, which is the claim rather
  // than the constant — a rule about what a sentence MEANS adds no machinery.
  // 928 -> 962 (+34): `safetyAnswer` — the same shape as `policyAnswer`, plus
  // the SEED, which is the part that is not fixed. Building the store and
  // unpacking the answer is shared machinery (`policyStore` is one function
  // now); walking every term of every rule for its variables, in order, is a
  // cost this particular question brings and the next one will bring its own.
  // That FALSIFIES the prediction the last iteration committed to -- that the
  // orchestration being fixed would make the next move raise MECH by about
  // zero. Orchestration is fixed; seeding is not.
  //
  // 901 -> 928 (+27): `policyAnswer` — copy the reflection into a store of its
  // own, run policy.rofl there, unpack four relations — minus three walks and
  // two `for(;;)` loops it replaces. ASKING A PROGRAM IS LONGER THAN COMPUTING
  // THE ANSWER, and that is the finding, not an accident: the decision left the
  // host (it is nine clauses of policy.rofl now) and the line count went up.
  // 962 -> 952 (-10): the first fall. Four folds left -- the growing-set
  // fixpoint for the demand set, the memoised closure behind it, the stratum
  // cone's own loop and two nested loops over every body -- and what replaced
  // them is unpacking five relations out of an answer that was already being
  // asked for. The deletions outweigh the unpacking, which is the first time
  // that has been true in this branch.
  // 954 -> 953 (-1): `matchPremise` unified a literal argument by argument and
  // now hands both lists to `unifyAll`, which checks the arity itself — so the
  // separate length guard went with the loop. See src/unify.ts for why the
  // copy moved: `unify` copies the substitution before it knows whether the
  // terms match, so a per-argument loop allocated a Map per argument.
  // 952 -> 954 (+2): two import lines, where the kernel's own programs stopped
  // being source text it parses and became a compiled form it reads.
  // 953 -> 959 (+6): the round's front was ONE key set, so a premise given a
  // window and no bound argument walked the whole derived layer to find one
  // relation's facts. `FrontInfo` now carries `byRel` beside `keys` and
  // `noteFront` maintains it. Plumbing, not policy: the branch that iterates
  // the window already filtered by relation, so no answer moves.
  assert.equal(rows(W, 'code_line(engine_ts, L, K)'), 959);
  // 491 -> 526 (+35): all of it mechanism — chargeRow, the accumulator's
  // try/finally and its release, the wholesale price on the unknown gap, and
  // the two fields BudgetExhausted now carries to say WHICH wall and WHERE.
  // 526 -> 533 (+7): the ring, and ALL of it is mechanism rather than policy,
  // which is the classification worth reading rather than the number. Who may
  // write a ledger is policy and it lives in boot.rofl and src/api.ts; what
  // the evaluator will not instantiate a perspective variable to is a property
  // of the fixpoint itself, decided before any rule of any program is
  // consulted. `pol` does not move: 126 before and after.
  // 533 -> 550 (+17): ALL SEVENTEEN ARE MECHANISM and `pol` did not move,
  // which is the negative control on the classification — and it corrected me.
  // I expected the line refusing to order a STRING to read as POLICY, since it
  // states what is forbidden. The scanner disagrees and is right: the decision
  // lives in the reason atom declared in reflect.ts; this branch only enforces
  // it. codeKept moved by the same +17 with NO reached/kept gap, because the
  // whole edit sits inside evalBuiltin, which the monotone core keeps entire.
  // UNCHANGED at 550 across the negation-order fix, and this is the negative
  // control on that classification: `planBody` answers "where may a negation
  // stand", which is a decision, and the solving that follows it was already
  // here. If this number had moved, the POL declaration would be wrong.
  // 598 -> 632 (+34): all of `safetyAnswer`, and 25 lines of it are the SEED
  // rather than the ask. What came OUT is not visible here because it is not
  // mechanism: `classify` lost its 25-line fold and kept 12 lines that read a
  // verdict, which moved it from `decides` to `enforces` below.
  //
  // 550 -> 598 (+48): all of `policyAnswer`. It is a FIXED cost — the same
  // method answers any question policy.rofl can be asked — so the next decision
  // moved should lower `decides` without moving this at all. That is the
  // prediction this number exists to refute.
  // 632 -> 694 (+62), and MOST OF IT IS A CORRECTION RATHER THAN GROWTH.
  // `kernelProgram`, `policyStore` and `POLICY_BUDGET` were absorbed into
  // `planBody`'s POL block for no reason but the order of definitions in the
  // file; they are declared as their own MECH block now and moved above
  // `planBody` so the absorption cannot come back. That is 32 lines of
  // mechanism that were being counted as policy. The rest is `safetyAnswer`
  // unpacking five relations instead of one.
  // 694 -> 693 (-1): `matchPremise`'s per-argument unify loop is one
  // `unifyAll` call now, and the arity guard went into it. Mechanism, not
  // policy — the line decided nothing.
  assert.equal(rows(W, 'block(engine_ts, L, mech)'), 693);
  // 124 -> 126 (+2), and this is the one worth reading twice. The two lines
  // are NOT the wholesale gap decision, which is where I first said they were
  // and which the block table refutes: that decision is inside the alternating
  // fixpoint's MECH block. They are the `edb(unknown)` declaration becoming a
  // CHARGED write, which lands in the admissibility block below — a POL block,
  // before-A. Measured off the block table rather than reasoned from the diff.
  // 126 -> 174 (+48): the whole of `planBody`, declared POL in the block table.
  // 174 -> 151 (-23): `reads`, `opaqueClosure` and `cone` are policy.rofl now.
  // 151 -> 181 (+30): `classify` LOST ITS STAR. Its 25-line fold is gone and
  // what stands there reads a verdict, which is plain POL -- the star always
  // meant "waiting on a fact family that does not exist", and the two families
  // it waited for now exist as seeds.
  // 181 -> 152: four blocks shrank to readings, and the asking machinery left.
  assert.equal(rows(W, 'block(engine_ts, L, pol)'), 152);
  // 92 -> 93 (+1): `classify` reads the plan instead of the written body, and
  // that block is the range-restriction analysis — POL*, since it needs the
  // rules themselves rather than only a program's text.
  // 93 -> 95: `opaqueSet` keeps the seed and gains the two lines that hand it
  // to the program and take the closure back.
  // 95 -> 63: `classify` is no longer starred. What is left starred is
  // `demandSet` and `opaqueSet`, and both wait on the same kind of thing -- a
  // fact the reflection does not carry flat.
  // 63 -> 17: `demandSet` LOST ITS STAR with `classify`. The star meant
  // "waiting on a fact family that does not exist", and nothing here waits any
  // more -- `opaqueSet` alone still does, for a premise's tense and a
  // store-shape fact.
  assert.equal(rows(W, 'block(engine_ts, L, pol_star)'), 17);
  // 71 -> 82 (+11): DEFAULT_SPACE in the constants block, the three fields
  // (space, rows, peakRows) and the constructor option that reads it
  // 82 -> 83 (+1): the import line for `KERNEL_PERSP` and `isKernelLedger`.
  // The eighth line of the ring, and the only one outside MECH — which is the
  // arithmetic that makes the +8 total and the +7 mechanism agree.
  // 83 -> 84 (+1): `ERule` carries `plan`, the body in the order it is solved.
  // 84 -> 86 (+2): the `bootstrap` field and the option that sets it -- the
  // rung that stops the kernel asking a program about the program that answers.
  // 86 -> 89: three lines of the answer field and its comment.
  // 89 -> 91: the two imports land in the header block.
  // 91 -> 97 (+6): `FrontInfo.byRel` and `noteFront`, see the code_line note.
  assert.equal(rows(W, 'block(engine_ts, L, plumb)'), 97);
  // the number the rewrite question is about: 216 -> 218, the same +2 as `pol`
  // UNCHANGED by the ring, and that is the claim rather than the constant:
  // `policy/1` is `pol` + `pol_star`, 126 + 92, and neither moved. A ring the
  // evaluator enforces before it consults any rule is not policy about a
  // program, so if this number HAD moved the classification above would be
  // wrong. It is the negative control on the +7 landing in MECH.
  // 218 -> 267 (+49): 48 of planBody plus the one line in `classify`.
  // 246 -> 244: `classify` is shorter by the fold and longer by the comment
  // that says which of the two unsafeties is still written here.
  // 244 -> 169.
  assert.equal(rows(W, 'policy(engine_ts, L)'), 169);
  // AND THE SPLIT THAT SAYS WHAT CAN MOVE. `decides` is policy whose judgement
  // lives in this code; `enforces` is policy that reads a judgement the rules
  // already derived and acts on it — `checkUnstratified` reads `unstratified/1`
  // out of the store, which is policy-as-data by construction, and still counts
  // as nine policy lines. A metric that called all 267 movable would stall at
  // 46 and look like failure; this is the number the work is actually against.
  // 221 -> 200 -> 186, and the number that matters more, because it counts
  // JUDGEMENTS rather than typing: the host held 12 decisions, then 9, and
  // holds 8. `classify` crossed the line rather than shrinking away: range
  // restriction is safety.rofl's now, and what stands in the host reads that
  // verdict and adds the one case the rules do not model, which is exactly
  // what `enforces` means.
  // 221 -> 200 -> 186 -> 84, and the arithmetic of the last step is worth
  // writing out because two different things happened in it. SEVENTY lines
  // crossed from `decides` to `enforces`: the demand set (46), the stratum
  // cone (12), the provenance question (8) and the negated relations (4) are
  // safety.rofl's answers now, and what stands here reads them -- 27 lines,
  // which is the whole of `enforces` +27. THIRTY-TWO lines were never policy
  // at all: the machinery for asking a kernel program sat inside `planBody`'s
  // block because it sat below it in the file, and it is declared MECH and
  // moved above it now. Four decisions remain in the host: where a negation
  // may stand, the opaque seed, the fingerprint hits, and the run gate.
  assert.equal(rows(W, 'decides(engine_ts, L)'), 84);
  assert.equal(DECLS.filter((d) => d.role === 'decides').length, 4);
  assert.equal(rows(W, 'enforces(engine_ts, L)'), 85);
  assert.equal(rows(W, 'decides(engine_ts, L)') + rows(W, 'enforces(engine_ts, L)'),
               rows(W, 'policy(engine_ts, L)'), 'every policy line has a role');
  // NEGATIVE CONTROL: the join discriminates — a role nothing carries is empty.
  assert.equal(rows(W, 'block(engine_ts, L, mech)') > 0, true);
  assert.equal(rows(W, 'role_of(K, wishful)'), 0);
  // NEGATIVE CONTROL: the join really is discriminating. A category nothing
  // carries must return nothing, or the rule is one that always says yes.
  assert.equal(rows(W, 'block(engine_ts, L, wishful)'), 0);
  assert.equal(rows(W, 'block(other_file, L, mech)'), 0);
  // and the host's own arithmetic agrees with the store, so neither is alone
  assert.equal(S.byCat['MECH'].code, 693);
  assert.equal(S.total.code, 959);
  assert.equal(S.byCat['POL'].code + S.byCat['POL*'].code, 169);
});

test('policy splits by WHEN the answer is needed, and most of it is needed too early', () => {
  // unchanged: the wall decides nothing after phase A or at the end of a run
  // 31 -> 23: the provenance question and the negated relations are readings.
  assert.equal(rows(W, 'policy_when(engine_ts, L, after_a)'), 23);
  // 119 -> 121 (+2): the same two lines as `pol` above, and they are before-A
  // because the admissibility block they land in runs before a rule fires
  // 121 -> 170 (+49): a rule is planned once, when it is classified, and never
  // again — so every line of the negation-order fix is needed before phase A.
  // 184 -> 182: classify's fold is gone; its verdict-reading is not.
  assert.equal(rows(W, 'policy_when(engine_ts, L, before_a)'), 115);
  // 66 -> 31: the reuse plan's three decisions left for policy.rofl.
  assert.equal(rows(W, 'policy_when(engine_ts, L, end_of_run)'), 31);
  assert.equal(23 + 115 + 31, rows(W, 'policy(engine_ts, L)'));
  // MECH and PLUMB lines carry a tense too, and it must NOT leak into the
  // policy total: the relation is defined over `policy`, not over `block`.
  assert.equal(rows(W, 'policy_when(engine_ts, L, na)'), 0);
});

test('the scanner asserts: the structure is in the store, not in a print', () => {
  // 42 -> 43: one more block, and the tiling still has no gap.
  // 43 -> 41: three block declarations removed with the code they named, one
  // added for the asking.
  // 41 -> 42: `safetyAnswer`, which asks the second kernel program.
  // 42 -> 43: the asking machinery is a block of its own now.
  assert.equal(rows(W, 'block_at(engine_ts, K, F, T)'), 43);
  assert.equal(rows(W, 'part_of(K, M)'), 9);
  assert.equal(rows(W, 'cut_method(M)'), 4);
  assert.equal(rows(W, 'target(engine_ts, F)'), 1);
  // the emitted text is a program, and it parses: `world()` throws otherwise.
  // Pin the shape rather than the volume, so this does not become a second pin.
  const text = facts(S);
  assert.match(text, /^code_line\(engine_ts, \d+, [a-z][A-Za-z0-9_]*\)\.$/m);
  assert.equal(/\(\s*[A-Z]/.test(text.replace(/^-- .*$/gm, '')), false,
    'an emitted argument starting with a capital would parse as a VARIABLE, not an atom');
});

test('the contamination is declared, dated and COUNTABLE', () => {
  // docs/modelling-a-language.md, THE DECOUPLING RULE: a dirty scanner is
  // admissible when the contamination is declared as something that goes away
  // with the language model, and what makes that safe is that it can be
  // queried. So it is queried.
  // 96 -> 98: the two hand judgements the new block carries, cat and tense.
  // 98 -> 115 (+17): the ROLE of every policy block — decides or enforces —
  // which is the judgement that says whether it can move into .rofl at all.
  // 105 -> 107: one more block, so one more cat judgement and one more tense.
  assert.equal(rows(W, 'dirty(engine_split, K, U, R)'), 109);
  assert.equal(rows(W, 'dirty(engine_split, role, U, R)'), 14, 'one per POL or POL* block');
  assert.equal(rows(W, 'dirty(engine_split, cat, U, R)'), 43, 'one per block: the MECH/POL verdict');
  assert.equal(rows(W, 'dirty(engine_split, tense, U, R)'), 43, 'one per block: the before-A verdict');
  assert.equal(rows(W, 'dirty(engine_split, part, U, R)'), 9, 'the slices inside a method');
  // the two loans retire on different events and are counted apart
  // 96 -> 98: the cat and tense judgements of the new block.
  assert.equal(rows(W, 'dirty(engine_split, K, U, language_model)'), 100);
  assert.equal(rows(W, 'dirty(engine_split, K, U, split_the_method)'), 9);
  // ZERO IS THE TARGET, and it is a query, not a promise
  assert.equal(rows(W, 'hand_judged(engine_ts, K)'), 43);
  // NEGATIVE CONTROL: the loan table is not a rule that says yes to anything
  assert.equal(rows(W, 'dirty(engine_split, K, U, someday)'), 0);
  assert.equal(rows(W, 'dirty(some_other_scanner, K, U, R)'), 0);
  // and the table is generated from the declarations, so it cannot go stale
  assert.equal(contamination().length, 109);
});

// ---------------------------------------------------------------------------
// 4: the POLICY label, measured against the kernel's own answer

test('MEASURED: the demand-backed set is two rules, and it agrees with the kernel', () => {
  const sensors = demandAsRules(read('examples', 'sensors.rofl'));
  assert.deepEqual(sensors.rules, sensors.host);
  assert.deepEqual(sensors.host, ['close', 'corroborated', 'temp'],
    'and the table is not empty, or the agreement is about nothing');

  // transitive: `pair` is demand-backed only because it reads one
  const chain = demandAsRules(`
close(V1, V2)  :- D is V1 - V2, D <= 2, D >= -2.
near(A, B)     :- close(A, B).
pair(A, B)     :- seed(A), seed(B), near(A, B).
seed(1). seed(2).
`);
  assert.deepEqual(chain.rules, chain.host);
  assert.deepEqual(chain.host, ['close', 'near', 'pair']);

  // NEGATIVE CONTROL: a program with nothing unfoldable is empty on both
  // sides, so the two agreements above are not a rule that always says yes
  const flat = demandAsRules('p(1). q(X) :- p(X).');
  assert.deepEqual(flat.host, []);
  assert.deepEqual(flat.rules, []);
});

test('MEASURED: readStrata\'s MAX is two rules — expressible, and still not portable', () => {
  const m = maxStratumAsRules(read('examples', 'sensors.rofl'));
  const disagree = [...new Set([...m.host.keys(), ...m.rules.keys()])]
    .filter((k) => m.host.get(k) !== m.rules.get(k));
  assert.deepEqual(disagree, []);
  // This used to pin the exact relation count at 49. It is unpinned on
  // 2026-09-01 for the same reason the line ranges are: the number counts
  // relations in boot.rofl, and boot.rofl grew by 166 lines under this test
  // while it was being edited (49 -> 51), which is not a fact about readStrata.
  // What the pin was standing for is kept: the agreement must range over a
  // large table, not an empty one.
  assert.ok(m.host.size >= 45, `${m.host.size} relations — the agreement is about nothing`);
  // the max is doing real work: relations carrying more than one stratum row
  assert.ok(m.rows > m.host.size, `${m.rows} rows over ${m.host.size} relations`);
  // ...and the reason it stays in the host is in the rule text: `top_stratum`
  // reads `not beaten`, so it is a negation rule, and the kernel needs this
  // answer BEFORE it can schedule negation.
  assert.equal(BLOCKS.find((b) => b.id === 'readStrata')!.when, 'before-A');
});

test('the report renders and carries its own headline', () => {
  const text = report(W).join('\n');
  // the same three numbers as the count test, read out of the RENDERED text
  // rather than the store, which is what makes this a second witness and not
  // a restatement. They moved for the reasons given there: the space wall.
  assert.match(text, /MECH\s+693 code/);
  assert.match(text, /TOTAL\s+959 code/);
  assert.match(text, /before-A\s+115 code lines/);
});

test('the definition index reads src/engine.ts, and it is not a grep', () => {
  const defs = definitions(SRC);
  assert.ok(defs.length > 40, `${defs.length} definitions — the index is not reading the file`);
  // NEGATIVE CONTROL: `if (`, `for (` and `return (` sit at member indentation
  // all over this file and are not definitions. A naive `name(` regex claims
  // dozens of them.
  for (const kw of ['if', 'for', 'while', 'return', 'switch']) {
    assert.equal(defs.some((d) => d.name === kw), false, `${kw} was indexed as a definition`);
  }
  // and it finds things a member-only regex would miss
  assert.ok(defs.some((d) => d.name === 'strataToken'), 'a top-level function');
  assert.ok(defs.some((d) => d.name === 'Evaluation'), 'the class');
  // names are NOT unique, which is why a two-hit key is drift rather than
  // a silent first-hit
  assert.ok(defs.filter((d) => d.name === 'constructor').length > 1);
});

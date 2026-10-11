# The surface split: what crosses files, measured and prototyped

Set 2026-10-05 for `w_next_version_cutoff`. The plan scouted: a file is a volume; its `[code]`/`[flow]` facts are
computed locally and cooled; a new book `[surface]` holds the file's external interface and stays resident; a rule
that joins two files reads only `[surface]`; the question's answers come from surface joins plus the volumes the
`why` touches. `docs/volumes-and-residency.md` named the crossing edge ("a materialised export surface"); this
measures how wide it is, builds it by hand on a 14-file corpus, and says what it costs. Numbers: the finding
`f_the_surface_split_is_a_book_of_about_sixty_rules_and_the_wall_is_ingest_order_not_memory`.

Status: sections 1-4 are the scouting as it was written (its relation names, such as `sx_export_fn`, are the
prototype's). Of the work in section 5, items 1-3 are built (section 6); item 4, the driver, is being finished
and is not in the tree yet; items 5 and 6 are open.

## What was run

- **Census**, vscode subset S, 500 files, the witnessed cone (15.8 M facts held, 4.5 GB state text). The 1000-file
  witnessed state was killed at the dump (SIGKILL, the `f_a_snapshot_of_a_corpus_world_costs_more_than_the_machine`
  wall again), so locality is counted at 500 only. Support is read from the `wit` lines: a fact crosses when its
  head and the premises of ONE witness name 2+ files (node id prefix, or a corpus path string such as a
  `module_target` target). The `why` of the answers was run at 500 (all 248) and 1000 (150 of 1008).
- **Prototype**, 14 files: `examples/vscode/mini` plus 9 hand-made (a helper merged across callers `id(p)`, a
  re-export `export { id as ident }` and `export *`, a callback `each(xs, cb)` over an array of the caller, a throw
  caught in another file, a function whose only unguarded caller is elsewhere). The model's three cross-file rule
  files were copied and edited (17 edits, below), the new rules file `js-surface`'s 29 rules were added, and the harness ran
  every file alone (forked core + its facts + the others' `[surface]` facts) and compared with the whole world, in
  both directions. Scratch files, not in the tree.

## 1. The inventory: what crosses

Immediate support in 2+ files at 500 files, per relation: facts whose head spans files / facts with a crossing
witness, of the relation's total. Base facts that cross: 0. Of 10.9 M derived facts (reflection `derived_by` set
aside) **60,718 (0.56 %)** have a crossing witness.

| crossing relation (500 files) | crossing / total | rule (file:head) | what crosses | surface fact |
|---|---|---|---|---|
| `may_be_node` | 18.5k / 108.8k | js-dataflow:768 import; :803 `ns`; :819 default; :841 `require`; :464-467 arg to param; :473-474 call result | an imported name is another file's node; a call's value is what the callee returns | `sx_export_fn`, `sx_default`, `sx_module`, `sx_cjs`, `sx_arg_node`, `sx_ret_node` |
| `may_be_lit` | 23.4k / 90.8k (heads carry no id) | js-dataflow:788; :464-467; :473-474 | an exported constant, an argument, a return | `sx_export_lit`, `sx_arg_lit`, `sx_ret_lit` |
| `resolves` | 3.3k / 12.0k | js-callgraph:331 (and :295-321 `new`, decorators, `for of`) | the callee node is in another file and `fn_node(F)` is read there | `sx_fn` |
| `member_obj`, `member_at`, `member_value`, `member_plain` | 3.2k, 3.1k, 1.0k, 1.0k | js-dataflow:554-561, :791, :805 | a member read on an imported object or a namespace | `sx_member` |
| `module_target`, `ts_resolved`, `resolved_import` | 1.9k, 1.9k, 3 | js-modules:132-184 | a site names a path string; support is the file TREE (core), not the other file | none: core |
| `exports_name`, `exports_value`, `reexport_offers` | 163, 13, 147 | js-dataflow:723, :728-731, :765, :784-786 | `export *` and `export {a as b} from` read the other file's exports | `sx_export_fn`, `sx_export_lit` |
| `thrown_by`, `caught_value` | 983, 28 | js-controlflow:382, :384-386 | what a callee throws, caught in the caller | `sx_thrown` |
| `elem_at`, `iter_elem`, `accessor_read`, `ext_member`, `se_member_of` | 490, 492, 27, 203, 513 | js-dataflow:346, :1093; js-controlflow:207 | the elements of an array a caller built; a class imported | `sx_elem`, `sx_member` |
| `side_effect_value`, `se_site`, `se_valued` | 139, 1, 2 | examples/vscode/side-effects.rofl: wrapper rule `se_site(W, F, I) :- resolves(W, Fn), se_param(Fn, I, F)` | a wrapper in another file hands its parameter on | `sx_param_sink` |

Not in the cone at 500 but crossing by the same shape (read, not run): `calls` (js-callgraph:340-341, head spans
files), `throwing_call` (js-controlflow:189), `reached_unguarded`/`may_not_run`/`reachable`/`may_not_be_reached`
(js-controlflow:412-446, a callee-keyed head whose support is the CALLERS), the `eff_*` family (js-effects:101-105,
192, 205, 231, 236, 382-395, 433, 522-527: `resolves` plus the callee's `eff_latent`/`eff_module`), `amb_exn_carrier`
(js-ambient:260). About 45 rules in 5 files in all.

The shape: three things cross. (a) A name a file offers (exports, re-exports). (b) A call: arguments go into the
callee's parameters, results come out of its returns, throws come out, reach goes into it. (c) The contents of
anything that leaves: an array or object passed or returned is read INSIDE by the other file.

## 2. Before and after

```
-- before: an imported name is the node the other file's export list holds
may_be_node[flow](E, F) :- imports_name[code](Local, Name, D, File), module_target[code](D, Target),
                           exports_name[code](F, Name, Target), ident_in[code](E, Local, File).
-- after: the other file is read through its surface only
may_be_node[flow](E, F) :- imports_name[code](Local, Name, D, File), module_target[code](D, Target),
                           sx_export_fn[surface](Target, Name, F), ident_in[code](E, Local, File).
sx_export_fn[surface](File, Name, F) :- exports_name[code](F, Name, File).        -- js-surface.rofl

-- before: the argument flows into the callee's body, the result out of its returns
may_be_lit[flow](U, V) :- resolves[code](C, F), arg_at[flow](C, I, A), may_be_lit[flow](A, V),
                          param_of[flow](F, I, Name), param_use[flow](F, Name, U).
may_be_lit[flow](C, V) :- resolves[code](C, F), returns[flow](F, E), may_be_lit[flow](E, V).
-- after: the caller PUBLISHES, the callee SUBSCRIBES; the result is read from the callee's summary
sx_arg_lit[surface](F, I, V) :- resolves[code](C, F), arg_at[flow](C, I, A), may_be_lit[flow](A, V).
may_be_lit[flow](U, V) :- sx_arg_lit[surface](F, I, V), param_of[flow](F, I, Name), param_use[flow](F, Name, U).
sx_ret_lit[surface](F, V) :- returns[flow](F, E), may_be_lit[flow](E, V).
may_be_lit[flow](C, V) :- resolves[code](C, F), sx_ret_lit[surface](F, V).

-- the wrapper rule of the question
se_site(W, F, I) :- resolves[code](W, Fn), sx_param_sink[surface](Fn, I, F).
sx_param_sink[surface](Fn, I, F) :- se_param(Fn, I, F).

-- what leaves a file takes its contents with it (found by the prototype, section 3)
sx_esc[surface](N) :- sx_arg_node[surface](_, _, N).   -- also sx_ret_node, sx_export_fn, and the elements/members of an escaped node
sx_elem[surface](A, I, E) :- sx_esc[surface](A), ast_node[code](A, array_expression, _, _), ast_child[code](A, elements, I, E).
elem_at[flow](X, I, E) :- may_be_node[flow](X, A), sx_elem[surface](A, I, E).
may_be_lit[flow](E, V) :- sx_lit[surface](E, V).      -- the value set of a foreign node, mirrored

-- a callee-keyed head whose support is the callers
may_not_run[code](F) :- sx_called[surface](F), not sx_reached[surface](F).
```

## 3. What the prototype showed (14 files, seconds per run)

- **Parity.** The edited model with every file resident gives the original's `side_effect_value`,
  `side_effect_site`, `catch_from_host`, `unresolved_call`, `may_not_run`: identical.
- **Cooling.** Each file alone with core + the others' `[surface]` facts: **identical to the whole world** for all
  five relations (29 answer rows, 21 sites), forward and reverse ingest order. Surface 168 facts for 14 files
  (12 a file), against about 670 derived facts a volume: 1.8 %.
- **The naive cut** (each file alone, original model, no surface): 24 of 29 answers missing, 5 of 21 sites missing,
  and INVENTED: `catch_from_host(guard)`, 13 of 16 `unresolved_call`, `may_not_run(lib.helper)`. The hazard of
  `volumes-and-residency.md`, reproduced: a starved volume does not go quiet, it announces.
- **SURPRISE 1: exports and summaries are not enough.** The first surface (exports, per-function arguments/returns,
  throws, param sinks) lost 4 answers and `may_not_run`: `each(['/tmp/a1','/tmp/a2'], p => fs.unlinkSync(p))`. The
  array is built in cb.ts, read in each.ts, and the callback it feeds is in cb.ts again. A node that leaves a file
  takes its elements, members and value sets with it: `sx_esc`, `sx_elem`, `sx_member`, `sx_lit`, `sx_node`
  (a third of the 168 facts). The scouted plan did not name this.
- **SURPRISE 2: ingest order is semantic.** Evaluating a file before the surface is complete, with a negation over
  `[surface]` (`catch_from_host`, `may_not_run`, `unresolved_call`), INVENTS: in reverse order round 1 gives
  `catch_from_host(guard)` and `may_not_run(lib)` that round 2 withdraws. The surface fixpoint took 3-4 rounds and
  40-47 volume evaluations for 14 files (2.9-3.4 x), because every volume read the whole surface, so any change
  dirtied all. A fact derived over a negation of `[surface]` is volatile: not cooled before quiescence, re-derived
  when its key changes.
- **SURPRISE 3: a callee-keyed head is placed by its callers.** `may_not_run(F)` and `reached_unguarded(F)` have F
  in B and their positive support in A. Alone, B said nothing (missing, not invented) until `sx_called` was added.
- **Precision (the helper merge).** With returns published as the callee's merged may-set (parity), `mkdir(id('/var/a'))`
  has the values `/etc/x`, `/var/a`, `/var/b`, the same as today (and the same ~ files^2 growth). With a
  `param i -> return` summary (`sx_ret_param`, the return is parameter i; the constant returns exclude it; the call
  reads its own argument) the six merged rows vanish and each call has its own value; the sink INSIDE the helper
  (`fs.writeFileSync(path)` in pfs.ts) still merges its callers, as it must: that is the context-insensitive answer.
  The direct-return form needs no new analysis; `return f(p)`, `return {k: p}` need the parameter as a symbolic value.
- **The why.** Through the surface it stops at `sx_ret_lit[surface](util#4,"/var/a") [axiom]` (162 lines, 2 files
  named) where the whole-world why is 253 lines naming 6 files. To expand that step the volume of the node's id
  prefix is lifted, and, with merged returns, the callers that fed it; with `sx_ret_param` it is one volume.
- Not covered: namespace import of an INTERNAL module (`member_value` over `module_object`, needs `sx_member` per
  export), classes across files (`obj_like`, `super_of`), the `eff_*` family.

## 4. Sizes and the estimate

Per-file facts, vscode 500 files, witnessed cone: 43 k derived (reflection included), of which crossing 0.56 %.
A held fact costs about 300 bytes (15.2 GB / 51.7 M facts at 4,243 files; the finding's "3.6 KB per held fact" is 3.6 MB
per file). Surface at 4,243 files, scaled from the 500-file relation counts: **lean** (exported or escaped functions,
cross-file argument tuples, `param -> return`) about 0.4 M facts (95 a file); **as prototyped** (every function, merged
returns, reach) about 1.0 M (245 a file). Core: 31 k of the model plus **276 k host string facts** (`str_seg`,
`str_segs`, `str_char0`, prefix-less, 65 a file) that cooling by prefix would keep resident: mint them in the file's
volume or only for module sources (about 40 k left). Touched by a why: median 13 files at 500, 21 at 1000 (p90 20, 29;
max 22, 37), a union of 75 files (7.5 %) over 150 of the 1008 answers at 1000, each volume 3.6 MB sealed.

| at 4,243 files | today (cone, sealed) | split |
|---|---|---|
| resident for the 700 sites, 9.5 k values | 15.2 GB | core + surface, 0.15-0.45 GB |
| a why (about 30-40 volumes) | does not fit (witnessed) | +0.15-0.25 GB, one at a time |
| every answer's why open at once (300-600 files) | | 1.1-3.3 GB |
| ingest peak | 15.2 GB | one volume + core + surface, under 1 GB |
| time | 305 s eval + 110 s load | 8-20 min (estimate, 2-4 evaluations a volume, 72 ms each), 2.7 h if each volume loads the whole surface: LOAD ONLY THE KEYED SUBSET |

The wall moves from memory to ingest scheduling.

## 5. Work (each about one workflow unless noted)

1. **Rules.** DONE (section 6: 49 rules rewritten, the book is `rules/js-surface.rofl`). Rewrite about 45 rules in js-dataflow (:464-467, :473-474, :723-731, :765, :768, :784-791, :803-806,
   :819, :841), js-callgraph (:295-341), js-controlflow (:189, :377-386, :412-446), js-effects (12), js-ambient (:260)
   and the question's wrapper; the new rules file `js-surface` (about 60 rules with the escape tables, `calls`, `eff_*`).
2. **Parity gate.** DONE (section 6: world `vscode_surface_split`, `npm run test:split`). A world `vscode_surface_split` over the 14-file corpus: every file alone + core + others' surface
   equals the whole world, 0 missing and 0 invented (the volume_locality gate with a surface), plus the naive cut as the
   planted defect that must go red. The harness of this note is its seed.
3. **Lint.** DONE, as rules over the rule reflection rather than in `scanners/rule_shape.ts` (section 6). A rule that
   reads a foreign-capable relation (the table above, derived from the
   crossing census, not listed by hand) in one premise and a file-local one (`fn_node`, `ast_child`, `param_of`,
   `returns`) on its foreign column is an alarm unless its other side is `[surface]` or it is excused; a negation over
   `[surface]` marks the head volatile.
4. **Driver, Rust.** NOT BUILT YET: being finished in its own branch. Cool by (volume, book) in rofl serve and the ingest loop (the surface survives, `[code]`/`[flow]`
   go); the ingest as a surface fixpoint with dirty tracking by KEY (volume subscribes to the surface facts keyed on
   the files and functions it names); a volume lift for a `why` that expands a `[surface]` axiom by the origin prefix.
   Unknown, needs a measurement first: `fork()` of a world holding 1 M surface facts.
5. **Scanner.** Host string facts into the volume (276 k out of core); node ids already carry the file.
6. **Precision**, separately: `param i -> return` and `param i -> argument j of a call` summaries beyond the direct
   form (the parameter as a symbolic value), which also cuts the why of an answer to one helper volume.

## 6. Built: the book, the gate and the lint (items 1-3)

`rules/js-surface.rofl` is the `[surface]` book; the finding is
`f_the_surface_book_mirrors_what_escapes_and_every_file_alone_equals_the_whole_world`.

- **Three shapes.** Exports keyed by the module's path (`sx_export_node`, `sx_export_val`, `sx_export_lit`,
  `sx_default`, `sx_cjs`, `sx_module`, `sx_eff_module`, `sx_effect_module`). Subscriptions keyed by the callee and
  published by the caller (`sx_arg_lit`, `sx_arg_node`, `sx_called`, `sx_reached`, `sx_reach`, `sx_entry`, `sx_next`,
  `sx_cb`, `sx_mwrite`; the question's `sx_param_sink`). Escaping nodes: `sx_esc` is every node a channel hands over
  and what it holds, and for each the facts the model reads about it are published and **mirrored** back into their
  relation (`may_be_node(N, M) :- sx_node(N, M)`), so the rules that read another file's node stay as they were.
- **49 rules rewritten** (js-dataflow 21, js-callgraph 14, js-controlflow 9, js-effects 4, the question's wrapper).
  With every file resident the public facts are the model's; the one change is precision: `sx_ret_param` gives a call
  of a function returning its own parameter that call's argument.
- **A function read as a value is asked in `[flow]`** (`fn_value`, `fn_label`, `fn_nested`): mirroring into
  `fn_node`, which `nearest_v` negates, made the program unstratifiable.
- **The gate.** World `vscode_surface_split` (both engines) holds the answers with every file resident;
  `scripts/surface_split.ts` (`npm run test:split`) evaluates each of the 14 files alone with the others' surface to
  a fixpoint, forward and reverse, and every fact of every file equals the whole world's: 420 surface facts, 93
  evaluations. The planted break (the model before the book, no surface) loses 84 of 184 answers and invents 16.
- **The lint** (item 3; `f_the_surface_lint_is_a_foreign_capable_column_read_by_a_local_premise`) is rules over the
  rule reflection, `examples/surface/surface.rofl`, seeded by `xl_seed(Rel, Col)` and excused by `xl_ok` in
  `facts/surface-lint.rofl`. Foreign-capability is a column, propagated through the rules' own heads from the seeds;
  `xl_finding` is a file-local premise read at a foreign key, `xl_alarm` one with no excuse, `xl_ok_stale` an excuse
  with no finding; `volatile_direct` and `volatile_head` are the heads a driver must not cool before the surface is
  quiescent (in the model one head, the js-effects rule over `not sx_eff_module`). It reads a mirrored relation as the channel; over the
  model (world `surface_model`, Rust only) it is green with 8 excuses, each with its reason; world `surface` is the
  planted fixture (both engines).

## 7. Built: the driver (item 4)

`runtime/split.ts` over rofl serve; the finding is
`f_the_driver_answers_from_core_and_surface_and_the_subscription_closure_is_the_cost`.

- **A volume, locally.** The core (model, question, the facts naming no file) is one evaluated world; a volume is a
  fork of it holding the file's facts and the `[surface]` facts it subscribes to, added by delta
  (`Session::assert_delta`, `load_delta`). After its evaluation it publishes the `[surface]` facts it concluded and
  not read, and is COOLED: `cool` by book (`Session::cool_books`, rofl serve `cool` with `books`) writes its base
  facts to a signed volume file and drops every book of the program but `[surface]` (the list is read from the program's
  reflection), the surface staying where it was published.
  The `hot` most recent worlds stay, and a later evaluation of one adds by delta; a cooled one is reheated (by delta
  into a fork of the evaluated core). tests/cool.rs holds the by-book round trip byte for byte.
- **Subscription by key.** A surface fact's key is its first argument: a module path, a callee, an escaping node (and the argument a rule joins on, where a rule reads the relation through a later one). A
  volume reads the facts of the keys it owns (its node prefix) and of the names its world holds (`view`: the atoms and
  strings of what it wrote above the core), and since a fact read is mirrored, the names that fact holds too. It is
  evaluated again only when a fact of a key it subscribed to moved. A subscription never shrinks.
- **Phases: the ingest-order hazard, soundly.** Every relation gets a phase from the program's reflection: the most
  negations (or aggregates) over relations `[surface]` reaches on a path from `[surface]` to it. A surface relation of
  phase k is published only when the phases below are quiescent, so within a phase publications only grow (a least
  fixpoint; a withdrawal is counted and the gate is red on one) and every negation over the surface reads a complete
  one. The number of phases is read from the program, not written down. The answers are read after the last phase only, each from the volume's last
  evaluation, which saw every fact of every key it reads.
- **The resident world**: a second fork of the core holding every publication as a base fact (asserted by delta as it
  arrives) and, after the fixpoint, the answers. `side_effect_value` and `side_effect_count` are asked there.
- **A lifted why.** The why is asked in the resident world. A fact it shows as an axiom that the world holds as
  published names the volumes that published it: they are reheated into the resident world (by delta) and the fact
  loses its base copy, until the why rests on base facts of lifted volumes and core. Then the lifted volumes are
  cooled by book again and the published facts made base again: the resident world is the one it was (the gate
  compares it byte for byte).
- **The gate**, `npm run test:split` (scripts/surface_split.ts `--driver`): the 14 files in both orders, every volume's
  facts at its last evaluation equal the whole world's (as for the hand loop), the resident world's 57 answers equal
  the whole world's, and every one of the 29 whys of a `side_effect_value` answer is a PROOF in the whole world: every
  fact it shows holds there, every axiom is a base fact there and none is a `[surface]` fact, every negation it shows
  fails there. 6 of the 29 are the whole world's why byte for byte; the rest differ only where a fact has more than
  one derivation and the smaller world's least witness is another (a fact naming no file, `external_module("fs")`,
  proved from another file's import; a function read through its surface mirror), and in the candidates a
  negation's whynot lists from files not lifted. 1.8 volumes are lifted a why (3 at most). Forward 66 evaluations,
  reverse 56 (4.7 and 4.0 a volume, over 4 phases). Planted: `early` (each volume's answers from its first
  evaluation) loses 12-23 answers; `narrow` (only a volume's own keys) loses 72 answers and invents 16; `nophase`
  (every relation published from the start) withdraws 5 and 2 publications inside one phase, the hazard itself,
  though the final answers on 14 files come out equal.
- **Found on the way.** A fact rendered from a scanned string holding a control character could not be read back
  (`\u0007` in a string literal): both parsers now read the escapes the renderer writes. And restricting a volume's
  names to the facts that name its own nodes (not following what a read fact names) is UNSOUND: on the 14 files it
  loses 3 answers and 7 surface facts (a member written onto an object reached through another file's node).
- **Measured, vscode subset S at 500 files** (`scripts/vscode_curve.ts DIR 500 split --hot 32`, Rust release, a
  shared machine): the answers asked of the resident world are the whole world's EXACTLY (248 values, 67 sites, the
  env rows, the five family counts; the 341 answer keys diff empty against the cone run). But it is not yet an
  economy: 6,335 s wall (5 whys included, 579 s) against 40 s for the whole cone world (15 s load, 25 s eval); the
  engine's peak RSS 2.0 GB against 2.5 GB, with 32 hot volume worlds kept. The resident world holds 770 k facts (the
  core world 162 k of them): the surface is 136,757 facts, 273 a file, above the 95-245 estimated, because the value
  sets of merged returns spread. 3,803 volume evaluations, 7.6 a volume (phases 6+5+2+1 rounds, no publication
  withdrawn, none by delta in a hot world: round-robin never comes back within 32), median 1.5 s each. THE COST IS
  THE SUBSCRIPTION CLOSURE: a volume reads on average 14 k surface facts (10 % of the surface, 45 k at most), because
  what an escaping node holds names further nodes and the closure of the escape graph is wide; every reheat adds them
  all again, and every growth of the surface in a round dirties the volumes that read it although their own
  publication did not move (the last evaluations of most volumes changed nothing they publish). Narrowing the names
  to what a volume's own facts name is unsound (above). A why lifted 1-3 volumes and took 14-186 s, nearly all of it
  the full evaluation the resident world needs after cooling by book (the cool leaves it dirty). 1,000 and 4,243
  files were not run: at 500 the driver is 140 times the whole world, and the curve would only say so again.
- **What it needs next** (each bounded): a volume subscribed to a key only when one of its rules can join on it
  (from the lint's foreign-capable columns: a mirrored row is read only where a local premise binds its key), not
  through every name a read row holds; a volume re-evaluated only when a fact of a key a premise actually bound moved;
  the volume kept hot through its round (or a dependency order) so re-evaluations go by delta; and cooling by book
  that keeps the resident world evaluated (the volume's facts retracted by delta) so a why costs the lift, not a
  re-evaluation.

### 7.1 Hardened after a review of the driver

- **Never from a partial or unevaluated world.** The driver throws on a partial evaluation of the core, a volume or the
  resident world (`evaluate`'s `partial`, and an `ask` of the resident world before the answers and before each why).
  rofl serve `view` refuses a world not evaluated or partial, and needs a non-empty `prefix`.
- **A cooled volume forgets nothing.** Cooling is by every book of the program but `[surface]`, the list read from the
  reflection (`main` always); the why lift cools the same list, less `main`, where the resident world keeps its answers.
  rofl serve `cool` with `books` REFUSES, before anything moves, a base fact of the volume in a book neither cooled nor
  kept (`keep`), and says what it wrote by book: a volume holding base facts in `[main]` is refused (they could not be
  told from the answers), as one holding a `[surface]` base fact. tests/cool.rs; the gate's `probe[audit]` fact in a
  volume, and the planted `books` break (cooling code, flow, main only), which the refusal turns red.
- **Subscription keys are checked.** At start the program's reflection is read (`reflect`): every premise over a
  `[surface]` relation must join on an argument (a variable occurring again in the rule); a premise with none is refused,
  naming the rule. Where the joined argument is not the first (8 rules of the JS model read `sx_*` by a later argument,
  `sx_esc(N) :- sx_cjs(_, N)`) the fact is also keyed by that argument, so the volume of N finds it. A first argument that is an
  integer or a compound is refused; at a later joined argument it is BROADCAST (`stats.broadcast`): no
  world names an integer, so every volume reads the fact and is evaluated again when one moves (over-delivery costs time
  only). `sx_str(V) :- sx_export_lit(_, _, V), str_value(V)` of js-concat reads the exported values by V, and an integer V
  (8080) is such a fact. The corpus has 3 such facts and no volume's outcome depends on them (a planted break that drops them stays green), so
  the proof is test/split-driver.test.ts, an integer-joined fact a count-only version would not deliver. `keyOf` skips strings, so a parenthesis in a quoted argument no longer miscounts.
  Necessary, not sufficient: that the joined key is one the volume names is what the parity gate shows.
- **Phases.** A literal whose book is a variable (the closure of a `tree`) is read in every book its relation holds; a
  book that is neither refused, where it used to drop the edge. The phases are checked as a property of the
  reflection (no premise reads a higher phase; a negation or aggregate over the surface reads a strictly lower one; every
  phase is held by a premise), not as a count. test/split-driver.test.ts.
- **A why** is turned into text only for the engine's refusal (`EngineRefusal`); a failed protocol or a refused
  reheat throws. vscode_curve `split` refuses a base fact naming two files, as the hand loop does.
- **Readers.** `\u` takes exactly four hex digits in both parsers, and the dense readers read the main readers' escapes.

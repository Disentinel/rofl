# The surface split: what crosses files, measured and prototyped

Set 2026-10-05 for `w_next_version_cutoff`. The plan scouted: a file is a volume; its `[code]`/`[flow]` facts are
computed locally and cooled; a new book `[surface]` holds the file's external interface and stays resident; a rule
that joins two files reads only `[surface]`; the question's answers come from surface joins plus the volumes the
`why` touches. `docs/volumes-and-residency.md` named the crossing edge ("a materialised export surface"); this
measures how wide it is, builds it by hand on a 14-file corpus, and says what it costs. Numbers: the finding
`f_the_surface_split_is_a_book_of_about_sixty_rules_and_the_wall_is_ingest_order_not_memory`.

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

1. **Rules.** Rewrite about 45 rules in js-dataflow (:464-467, :473-474, :723-731, :765, :768, :784-791, :803-806,
   :819, :841), js-callgraph (:295-341), js-controlflow (:189, :377-386, :412-446), js-effects (12), js-ambient (:260)
   and the question's wrapper; the new rules file `js-surface` (about 60 rules with the escape tables, `calls`, `eff_*`).
2. **Parity gate.** A world `vscode_surface_split` over the 14-file corpus: every file alone + core + others' surface
   equals the whole world, 0 missing and 0 invented (the volume_locality gate with a surface), plus the naive cut as the
   planted defect that must go red. The harness of this note is its seed.
3. **Lint** `scanners/rule_shape.ts`: a rule that reads a foreign-capable relation (the table above, derived from the
   crossing census, not listed by hand) in one premise and a file-local one (`fn_node`, `ast_child`, `param_of`,
   `returns`) on its foreign column is refused unless its other side is `[surface]`; a negation over `[surface]`
   marks the head volatile.
4. **Driver, Rust.** Cool by (volume, book) in rofl-serve and the ingest loop (the surface survives, `[code]`/`[flow]`
   go); the ingest as a surface fixpoint with dirty tracking by KEY (volume subscribes to the surface facts keyed on
   the files and functions it names); a volume lift for a `why` that expands a `[surface]` axiom by the origin prefix.
   Unknown, needs a measurement first: `fork()` of a world holding 1 M surface facts.
5. **Scanner.** Host string facts into the volume (276 k out of core); node ids already carry the file.
6. **Precision**, separately: `param i -> return` and `param i -> argument j of a call` summaries beyond the direct
   form (the parameter as a symbolic value), which also cuts the why of an answer to one helper volume.

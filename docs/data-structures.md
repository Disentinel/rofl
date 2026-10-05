# Declared data structures

Designed 2026-10-04 with the owner (`f_a_structure_is_declared_and_does_not_change_the_meaning`),
work item `w_data_structures`. Steps 1 and 2 of the order, `function` and `tree`
with `closure`, are built (see "Function, as built" and "Tree, as built"); the
other structures are not, and this is the note the three parsers, the TS check
and the Rust engine are built from.

## The rule

A declared structure changes **no fact**. The facts of a world are exactly
those it has without the declaration. The declaration is two things:

1. **A promise** about one relation's data, which the system checks
   mechanically. A broken promise is a refusal that names the place (the
   offending fact, its file and line, and the other fact it clashes with),
   never silent corruption and never a wrong answer.
2. **A licence** for the Rust engine to store and answer that relation as one
   structure instead of a heap of rows.

A structure is an **access path, never a rewrite**. The engine still evaluates
every rule as written, premise by premise; the structure only answers a
premise (`ast_within(A, D)` with D bound) faster and smaller than the heap
would. The host never recognises a rule's meaning (the option rejected on
2026-10-04: an engine that spots closure rules reaches into the rules'
semantics; a declaration is the author's, visible in the model, like
`lattice`). Where the engine does spot something, it only *proposes* (below).

Two kinds, told apart by one word:

- **A promise about what the rules conclude**: `function`, `span`, `sequence`,
  `ordered`, and `tree` or `dag` without `closure`. The rules stay as they
  are; the declaration adds the check and the licence.
- **A name for a derived form**: `alias`, `equivalence`, and `closure` on a
  `tree` or `dag`. The declaration *is* the definition of the second relation,
  and lowers to the rules the author would have written (as the aggregate
  sugar does, `docs/aggregates.md` "The sugar"), so the author deletes those
  rules instead of adding to them. The TypeScript engine evaluates the
  lowering; the Rust engine answers from the structure; the facts agree.

## Syntax

Words, not keywords, as `lattice` and `tag`: a line declares only when a second
name follows, so `tree(x).` is still a fact. The declaration names the
relation, not a book (`lattice p[b](...)` is refused today; so is this); it
holds in every book that concludes the relation, one structure per book, as a
lattice has a cell per book. Role words (`to`, `from`, `at`, `by`) precede the
variable they mark, as `min` and `max` do in `pareto p(K, min C, max T).`

| Structure | Declaration | Sentence |
| --- | --- | --- |
| tree | `tree ast_in(P, C).` `tree ast_in(P, C) closure ast_within.` | `` Each child of `ast_in` has one parent and no node is its own ancestor. `` and, with the closure, `` ... ancestor, and `ast_within` holds of each node and every ancestor of it. `` |
| alias | `alias in_fn(N, F) is nearest_v(N, F).` `alias ast_in(P, C) is ast_child(P, _, _, C).` | `` `in_fn` is `nearest_v`. `` `` `ast_in` is `ast_child` without its field and position. `` |
| function | `function ast_name(N, to Name).` | `` `ast_name` has one Name for each N. `` |
| span | `span src_range(N, from S, to E).` `span src_range(N, from S, to E) laminar.` | `` Each `src_range` of N runs from S to E. `` and `` ... and any two are nested or apart. `` |
| equivalence | `equivalence same(A, B) of copy_edge(A, B).` | `` `same` is the equivalence that `copy_edge` generates. `` |
| sequence | `sequence ast_child(P, F, at I, C).` | `` The `ast_child` of each P and F are numbered 0, 1, 2, ... by I. `` |
| ordered | `ordered ast_node(N, _, _, by L).` | `` `ast_node` is ordered by its integer L. `` |
| dag | `dag calls(F, G).` `dag calls(F, G) closure reaches.` | `` No `calls` path returns to where it began. `` `` `reaches` holds of each node and every node a path leads to. `` |

The reader reads each sentence into its line and rofl-render writes it back,
as for the aggregate declarations. Reflection gets one kernel row per
declaration beside `lattice_decl`: `structure_decl(Rel, Arity, Kind)`, with
`structure_role(Rel, Pos, Role)` and `structure_closure(Rel, Closure)`, timeless
like `sealed`. The three parsers (`src/parser.ts`, `rust/rofl/src/rofl_parse.rs`,
the reader in `examples/ring1/ring1.rofl`) dispatch in `clause()` where the
`lattice` and `tag` words are, and must agree on the refusals below.

## Promise, check, answer, saving

The figures are those of `f_half_the_world_is_provenance_and_a_fifth_is_the_ancestor_closure`
(TS engine, before engine-fast; to be taken again): `ast_within` is 20-21% of
a full world and 34-38% of a sealed one, about 11 rows per node; the permuted
copies are about 9%; the scan's one-value-per-key relations most of its ~5.5%.

**tree.** *Promise*: each child has at most one parent; no cycle (a forest).
*Check*: one pass over the relation, a parent array indexed by child, then a
walk from each node with a visited mark; refusal `tree ast_in: node 12 has
parents 3 (f.rofl:9) and 7 (f.rofl:14)` or `... is its own ancestor through
12, 5, 9`. *Answers*: ancestry as containment of the engine's own pre-order
intervals, O(1); ancestors by the parent chain, nearest first, stoppable;
descendants as one contiguous pre-order range; with `closure`, all three are
the premises `ast_within(A, D)` serves, strict (irreflexive, as the rules
are). Children from a child list. Depth, subtree size and common ancestor come
free of the same arrays; no reader asks for them yet. *Saves*: the closure's
rows, ~11 per node, and their provenance rows; ast_in itself stays a
projection of ast_child (alias). Trees are per file for code, so a retracted
file drops its tree whole.

**alias.** *Promise*: the second relation has no other conclusion, fact or
rule (checked by name when the program is read: `alias in_fn: also concluded
by rule r07 (js-dataflow.rofl:512)`). A projection (`ast_child` without field
and position) lowers to `ast_in(P, C) :- ast_child(P, _, _, C)` and the engine
answers it by a distinct-index on the kept columns of the first, with no
promise beyond the name check; when the kept columns are a key of the source
(`function ast_child(P, F, I, to C)` makes (P, C) one) the index is the source
itself. *Answers*: the same rows, stored once, each read through a permuted
index. *Saves*: a relation per alias: ast_in = ast_child, in_fn = eff_in_fn =
nearest_v (~9% of facts in all). `why` goes one step through the lowered rule.

**function.** *Promise*: one value per key, `ast_name(N, to Name)` has at most
one Name per N. *Check*: a hash by key at insertion; refusal names both facts.
*Answers*: a map; and the planner learns `at most one match`, the estimate
the delta-first plan lacks today when it counts all rows instead of the
constant-bound ones. *Saves*: little memory (a hash per key); the plan. Most of
the scan is functions: ast_node, ast_attr, ast_name, binder. Smallest, so it
carries the plumbing first.

**span.** *Promise*: each row is an interval over an ordered dimension (source
positions, ticks, versions, line ranges, value ranges), `S =< E`, both integers;
`laminar` adds that any two intervals are nested or disjoint (true of AST
ranges, false of a calendar). *Check*: sort by S, a stack walk; refusal names
the two crossing intervals. *Answers*: containment, overlap and stabbing
(`src_range(N, S, E), S =< X, X =< E`) by an interval index, a nesting tree
when laminar. The premises are still the written comparisons; the index serves
the premise whose arguments and following comparisons it can, as any index.
*Saves*: the pairwise scans of position tests (the control-flow rules compare
positions). Not a source range only.

**equivalence.** *Promise*: none about data (the declaration defines the
relation as the reflexive, symmetric, transitive closure of the generator
relation); the check is that nothing else concludes it. *Answers*: a
representative per class (union-find): `same(A, B)` is one find each, a class
is a list. *Saves*: n^2 pairs for a class of n; the flow's node merging is this
(~44% of flow nodes merge, `f_half_the_world...`). Incremental: addition is a
union; **retraction of a generator is a rebuild of the class** (a union-find
does not split), which is why it comes late.

**sequence.** *Promise*: for each key (P, F) the indexes I are the integers 0
to n-1, each once. *Check*: a count and a maximum per key; refusal names the
gap or the repeat. *Answers*: first, last, next, previous in O(1);
`I is max(J : ast_child(P, F, J, _))` is the last (the sequence-expression
max). *Saves*: the aggregates over positions, and the later/next pairs written
as rules (`seq_later`).

**ordered.** *Promise*: the marked argument is an integer in every row.
*Check*: one pass; refusal names the row and the non-integer. *Answers*: a
sorted index, so `A < X =< B` is a range lookup, not a scan. *Saves*: scans
only. The word clashes with the declared orders (`pareto`, `lex`: "`p` is
ordered by Pareto dominance"); see the open questions.

**dag.** *Promise*: no path returns to its start. *Check*: strongly connected
components (`src/scc.ts` has them); refusal names a cycle. *Answers*:
reachability by interval or label sets over the condensation, not all pairs;
with `closure`, `reaches(A, B)` as a test, a walk or a range. *Saves*: the
reachability closures: the call graph, flows_to, eff_reaches. A cycle is the
usual case in a call graph, so a dag declaration there is refused, and the
condensed form (`closure` over components) is a separate, later decision.

## Through why, whynot, retraction and incremental

**why.** A structure's answer is rebuilt as the derivation the rules would
have given. For a tree with `closure`, `ast_within(A, D)` has one derivation
(the path is unique): `ast_within(A, P)` and `ast_in(P, D)` for D's parent P,
down to `ast_in(A, X)`. The engine walks the parent chain and emits that
chain; it is the left-linear derivation of the two rules, so the printed
`why` is the TS engine's, byte for byte. This is why the provenance rows of
the closure are not stored (they are the bulk of the sealed world) and cost
nothing until asked. `whycheck` rechecks that chain. An alias goes one rule
step; function, sequence, ordered and span derive nothing, they are premises
of other rules and appear as facts.

**whynot.** `whynot ast_within(A, D)` answers from the structure: D has the
ancestors X, Y, Z and A is none of them (or D has none). The verdict is the
TS engine's; the words may differ, and whether they must not is open.

**retraction.** A structure updates by the delta that retracts a fact, and
`excise` stays the same: the result must equal a fresh evaluation without the
fact. Removing a tree edge detaches a subtree, so the interval labels of it
are renumbered (labels carry gaps, or are rebuilt for the touched root; a
file is one root). A virtual relation (`ast_within`) has no stored rows to
retract; the readers of it are given the retraction deltas **enumerated from
the structure before the edge goes**: the pairs (ancestors of P and P) x
(subtree of C and C). Their own retractions then go the existing way.

**incremental.** An added edge enumerates the same two sets after it lands. A
fact that breaks a promise is refused at the tick it arrives, naming the
place, and the previous state stays. The cost to avoid is the first load: all
edges arrive at once, so the delta of `ast_within` is the whole closure again
and a reader whose delta premise is `ast_within` enumerates it. The structure
has no use then unless the reader's other premises go first and probe the
structure, which is the delta-first plan (`w_cmp_delta_first`) and the reason
this work waits for it.

## What TypeScript does

Parses every declaration, in the sentence form as well; **checks the promise**
(the refusals above, with the same text, so a planted break in one proof world
is refused by both engines); and **evaluates by the rules**: the plain rules
for a promise-only declaration, the lowering for `alias`, `equivalence` and
`closure`. It stores no structure and its facts are the reference
(`f_rust_is_the_engine_ts_is_the_reference`): the acceptance is facts
identical in both engines on every world, `why` and `whycheck` unchanged,
retraction identical to a fresh run, the promise refused when broken, then
the Rust release before and after on self, mcp, cli_exits and util for facts,
time and memory.

## Detection: the engine proposes, the author declares

Only the author knows whether every *future* fact of a relation keeps the
promise (the scanner can change; a flag can add a parent). The engine never
declares a structure. `npm run structures` (a mode of rofl-load, read-only,
over a world and its facts) inspects each relation and prints a proposal as
the declaration's sentence, with what it measured:

- **function / key**: for each relation of arity up to 5, the column sets
  that determine the rest (one hash pass per candidate; singletons and
  all-but-last first). It reports the near misses too, with the offending
  facts: "ast_in: 2 children with two parents" is a scanner fault found, not
  only a gain missed.
- **tree**: a binary relation whose columns share a type and whose rows
  have one parent per child and no cycle; and, over the rule reflection, a
  pair of rules that is the closure of it (the schema `P(a, d) :- Q(a, d)`,
  `P(a, d) :- P(a, x), Q(x, d)`), proposed as `closure`.
- **alias**: two relations whose rows are equal under a permutation or
  projection of columns (sorted-tuple hash, candidates by row count).
- **ordered, span, sequence**: an integer column; two integer columns with
  `S =< E` and, if so, whether they are laminar; indexes dense from 0 per key.
- **equivalence, dag**: a relation closed under the three laws on its data
  (classes against n^2); an acyclic one (components).

Every proposal carries the rows and bytes it would save, the premises of the
rules that it would serve (from the reader census, as
`facts/ast-within-readers.rofl` does by hand for the tree) and the worlds over
which it held, since a promise that holds on four corpora is evidence and on
one is a coincidence. The author pastes the line; from then the check guards
it.

## Order

0. **The detection report, read-only, for function, tree and alias.** It
   touches no read path of the engine, so it can land before
   `w_cmp_delta_first`, and it settles by measurement that the promises hold
   on the four corpora before anything stores them. **Built 2026-10-04**
   (`rust/rofl/src/structures.rs`; `rofl-load` and `rofl-eval
   --propose-structures`, `npm run structures`): on self, mcp, cli_exits and
   util it proposes `tree ast_in(P, C) closure ast_within.` (the closure is
   exact), the ast_in and in_fn aliases, and 169 functions that hold on all
   four (`f_the_engine_proposes_a_forest_a_closure_and_aliases_on_all_four_corpora`).
1. **The plumbing with `function`.** The declaration in the three parsers and
   the sentence, the reflection rows, the refusal with its place, the TS check
   and the proof world with a planted break. `function` has the smallest
   promise, so every later structure reuses all of this, and it gives the
   planner the at-most-one estimate that the delta-first plan needs.
2. **`tree` with `closure`.** The largest saving (a fifth of every world,
   a third of a sealed one) and the readers are known (below), so it is the
   one to measure the whole design on. Needs delta-first (the first-load
   problem) and after it the engine's read paths are stable. **Built
   2026-10-05** where no witness is kept (see "Tree, as built"); where witnesses
   are kept the closure is rows.
3. **`alias`.** Mostly storage names and permuted indexes (~9%); independent
   of the tree, but it touches the same read paths, so after it.
4. **`ordered`, then `sequence`.** A sorted index first (small), then
   sequences, which are an ordered column with a density promise.
5. **`span`.** Interval index; laminar reuses the tree's intervals.
6. **`dag`, `equivalence`.** Their incremental case is the hard one
   (a cycle is common in a call graph; a union-find does not split), so they
   come last, when the labels and the delta enumeration are in use.

## Function, as built

`function ast_name(N, to Name).` in all three readers (`src/parser.ts`,
`rust/rofl/src/rofl_parse.rs`, `examples/ring1/ring1.rofl`) and as the sentence
`` `ast_name` has one Name for each N. `` (`` `best` has one W. `` for no key,
`` has one A and B for each K. `` for two values; `scripts/read_md.ts` reads it,
rofl-render writes it). A word, not a keyword: it declares only when a second
name follows, so `function(x).` is a fact. A role word, `to`, marks each value;
an unmarked argument is the key, and the values come last. The door
(`src/structure.ts`, `rust/rofl/src/structure.rs`) refuses, with these words in
both engines: a kernel relation; an argument that is not a variable, or is
written twice; no `to` (``a function names the value its key determines``); a
key after a value; a book (`function p[b](...)`: a declaration names the
relation); a second declaration of one relation.

Reflection, timeless in the kernel's book beside `lattice_decl`:
`structure_decl(Rel, Arity, function)` and a `structure_role(Rel, Pos, to)` for
each marked argument (Pos from 1; a key position has no row). `structure_closure`
is not built (no `closure` yet).

**The check** (`checkFunctions`, `check_functions`): after every evaluation, at
every tick (every evaluation is one) and after a retraction by `retract_delta`,
over the facts the evaluation left, base and derived alike. Two facts of one
relation, one book and one key with different values refuse the run:
`program rejected: function nm: key (1) has two values in the book main: (a) and
(b); 1 more key breaks it too`. The key is shown by its canonical terms; the
named key is the smallest by canonical text and the two values the smallest two,
so both engines name the same ones. The world is left dirty: nothing is answered
from a broken promise, and that holds for every later question (`query`, `why`,
`whynot`, `excise`, and in Rust `ask`) until the world is fixed and evaluated: the
judgement is made after the evaluator has cleared the flag, so a refusal puts the
flag back; the end of an evaluation by a budget wall is judged like any other end
(f_a_refused_world_stays_refused_and_a_wall_judges_the_promise). **Per book** (the note's choice): one key with a value in
each of two books holds; a hypothetical world that breaks it (`excise`, an
assumption's fork) is refused as that run, with the same message, and the world it
was a what-if of is untouched. This is the conservative reading of open question
5: a promise is never relaxed for a what-if, because a structure answering from a
what-if would answer from a broken promise; whether a hypothetical may break
one and say so instead is the owner's.

**The licence taken**: the delta-first planner (`joinplan.rs`, `delta_stat`)
estimates a premise whose key is bound, by a constant or by a variable bound
before it, in a named book, as one match per binding and does not make the
counting pass over the relation's rows. The counted average already equals one
for a relation that keeps its promise, so the plan chosen does not change on a
true function; what changes is the avoided pass. The estimate for a skewed key
that `f_a_join_plan_is_never_observed` fears is a property of a relation that is
not a function. No key-to-value map is added: a probe on a bound key is already an
index lookup, and a second structure for it would store what the index holds.
Facts, `why` and `whynot` are the same with and without the declaration
(`tests/structure.rs`, the twin relations of `ds_function_holds`).

## Tree, as built

`tree ast_in(P, C).` and `tree ast_in(P, C) closure ast_within.` in all three readers
(`src/parser.ts`, `rust/rofl/src/rofl_parse.rs`, `examples/ring1/ring1.rofl`, whose
tree wraps a closure as `$closure(Name, $structure(..))`) and as the sentences
`` Each child of `ast_in` has one parent and no node is its own ancestor. `` and, with a
closure, `` ... , and `ast_within` holds of each node and every ancestor of it. ``
(`scripts/read_md.ts`, rofl-render; a line that opens with `Each` is no question to
the notebook, `english()` leaves these two alone as it leaves a tag's). A tree has
no role word; its first argument is the parent and its second the child. The door
refuses, with the same words in both engines: what a function's door refuses; a tree
of other than two arguments; a `closure` on anything but a tree; a closure that is its
tree's relation, a kernel relation, already a structure, or already concluded by a rule
or a fact; and afterwards, at the clause, any rule or fact that concludes the closure
(`'ast_within' is the closure of the tree ast_in and has no other conclusion`).

Reflection, timeless in the kernel's book: `structure_decl(Rel, 2, tree)` and, with a
closure, `structure_closure(Rel, Closure)` (a new reserved name: every golden's census
moves by one). The model's two closure rules are not written by the author any more:
**`closure` lowers, at load, to the two rules the author would have written**,

    ast_within[B](P, C) :- ast_in[B](P, C).
    ast_within[B](P, D) :- ast_within[B](P, X), ast_in[B](X, D).

with a variable book, so the closure holds in every book the edges have (the note's
choice: a declaration names the relation, not a book). The rules are in the program as
any rules are: reflected (so `flow` gains the book variable's row and the model's
rule rows are the lowered text, which is what `rules_js-structure` and
`cost_shapes_model` moved by), numbered by content (the TypeScript and the Rust engine
name them alike), and printed by `why` as any rule is. TypeScript evaluates them.

**The promise** (`checkTrees`, `check_trees`), judged where a function's is (after every
evaluation, tick, wall and retraction; a refused world stays refused): per book, one
parent for each child, then no cycle. `program rejected: tree ast_in: node (c) has two
parents in the book main: (a) and (b)`, with `; 1 more child breaks it too`; or `node (a) is
its own ancestor in the book main: through (a), (c), (b)`, each node the parent of the one
before it, from the smallest node of the cycle, with `; 1 more cycle`. The smallest child,
its two smallest parents and the cycle through the smallest node, by canonical text, so
both engines name the same ones; a child with two parents is refused before a cycle is
looked for. The edges are judged as they stand, asserted or concluded.

**What the Rust engine answers, and when.** The closure is answered from the tree only
where no witness is kept (`sealed(provenance)`, or the harness's `--no-provenance`): a
witness names the facts a conclusion rests on, and a row that is not stored is no fact.
Then no rule of the closure fires and no row of it is stored; the forest of each book
(`forest.rs`: arrays indexed by node, a parent and the engine's own pre-order numbering)
answers each premise that reads it: both ends bound is interval containment, the
descendant bound is the parent chain, the ancestor bound is one pre-order range, neither
bound is the ancestors of every node (what a reader that wants every pair asks for, and
costs every row, as the stored rows would). A negation asks the same. The forest is
built whole from the edge relation's rows and again when that relation has more rows than
when it was built (a rebuild of the touched book, the note's first choice for
maintenance: an edge added or retracted is a rebuild, and a retraction in such a world is
a full evaluation, `retract_delta` refusing a closure answered from its tree). A rule that
reads the closure is fired whole when news of the edges reaches it and it has not fired
since they last changed, since the closure has no news of its own (the case: the edges a
negation concludes, a level above the rule's first firing; `vclosure_reader_stale`). A
broken forest never loops and is never read: the first parent stands, a node no root
reaches has no place, and the world is refused after the evaluation by the promise.
Where a witness is kept, and where the closure's edges are concluded from it, or it is
answered on demand, or the world has a lattice or an assumption, the closure is rows:
the closure kernel (`fire_closure`) walks each book (the kernel reads the lowered rules'
variable book); `vclosure_reason` says which.

**The planner.** The estimate of a premise over the closure is read off the forest, not
counted: both ends bound is one match; the descendant bound is the mean depth; the
ancestor bound the mean subtree; neither bound costs every row, so a plan never starts
from it, and a rule that names the closure first is solved from the premise that binds an
end (`ds_tree_plan`: a closure larger than the world's space wall, read by rules that
name it first; written order meets the wall, the plan does not; and with the estimate of
an unbound closure at one row, `vclosure_unbound_cheap`, the world is cut).

**What the state says.** The canonical state lists the closure's rows, generated on
output from the forests (`tick drv support=0`, as a sealed derived row prints), so the
census counts them and the goldens keep their meaning; the count of stored facts
(`fact_count`, rofl-eval's `facts`) does not. The rows are those of the tick evaluated:
a tick that ends takes them as it takes any derived row.

**What an explanation says.** A premise that matched a row of the closure names the row
(`PremRef::VRow`, the canonical key of the fact, spelled where a firing records its
premises), so a cell's member keeps `[fact:w[main](a,b)]` in the state and in a snapshot, and
`why` of a row, as a premise or asked, rebuilds its firing from the tree: the lowered
first rule over the edge when the parent is the ancestor, else the second over the row of
the parent and the edge of the parent to the child (a forest gives a row one firing), a
row written once and referred to after. `excise` lists the closure's rows with the rest.
All of it is what the world with the closure STORED says (`ROFL_NO_VCLOSURE=1`), byte for
byte: whycheck asks every why, why all, whynot and excise and the canonical state of the
sealed worlds of both, and the goldens hold their states to each other. A snapshot of
such a world is opened with its closures engaged (`Eval::vclosure_restore`) and the same
state. **A wall is the one difference, and it is declared.** A row answered from the tree
costs no space and no step, so a world whose wall the stored closure meets is cut with
the rows and not without (`ds_tree_plan`, which says so with
`check_opt(W, closure_unwalled, 1)`); a world that meets the wall stored and does not say
so is red, and one that says so and meets none (f_a_join_plan_is_never_observed, the same
principle: a hole is a shrug, and completing it refines it; an owner question).

**Proof.** `ds_tree_syntax`, `ds_tree_phrase`, `ds_tree_holds` and `ds_tree_sealed` (the
same files, with and without the seal: the closure answered from the tree, by the kernel
and by TypeScript's rules, against a hand-written twin, in each pattern a reader of the
model asks, in two books, with a child whose parents are in two books, with edges that
arrive in rounds and edges a negation concludes), `ds_tree_tick[_sealed]`,
`ds_tree_retract[_sealed]`, `ds_tree_retract_edge[_sealed]`, `ds_tree_wall`, `ds_tree_plan`,
`ds_tree_explain` (the explanations, by hand), `ds_tree_demand_edge` and
`ds_tree_demand_book[_sealed]` (edges that read a demand relation);
eight refused forests; `rust/rofl/tests/tree.rs` (forty random forests, the closure
answered from the tree against the rules, every pattern asked, a retraction against a
fresh world); 32 planted faults (`scripts/agg_breaks.ts`).

**Measured** (Rust release, `rofl-eval --bytes --budget 4000000000 --space 40000000
--delta-first`, three runs, median; the seeds regenerated for the scanner's 16-hex node
ids; before is the engine and the model of 3f37887, after this tree's).

| world | facts stored, before | after | closure rows not stored | eval ms, before | after | RSS MB, before | after |
| --- | --- | --- | --- | --- | --- | --- | --- |
| self, sealed | 1,315,105 | 801,480 (-39.1%) | 513,629 | 3,255 | 2,753 | 509 | 476 |
| mcp, sealed | 979,700 | 645,112 (-34.2%) | 334,580 | 2,412 | 1,961 | 414 | 378 |
| cli_exits, sealed | 1,484,841 | 949,150 (-36.1%) | 535,683 | 3,651 | 2,925 | 576 | 534 |
| util, sealed | 2,446,459 | 1,558,330 (-36.3%) | 888,133 | 6,334 | 5,154 | 984 | 928 |
| self | 2,341,818 | 2,341,825 | 0 | 10,695 | 10,646 | 1,390 | 1,390 |
| mcp | 1,736,397 | 1,736,392 | 0 | 7,224 | 7,525 | 1,062 | 1,056 |
| cli_exits | 2,644,152 | 2,644,147 | 0 | 11,520 | 12,010 | 1,565 | 1,552 |
| util | 4,302,735 | 4,302,742 | 0 | 19,656 | 20,024 | 2,671 | 2,673 |

Sealed, the facts the closure took are gone to the row (before less after is the closure
less the reflection of the two rules, four rows), and the evaluation is a fifth shorter
(the closure is not walked into rows, and what reads it asks the tree). The resident set
falls less (6-9%) since it holds the seed's snapshot, which is loaded before anything
is evaluated. Not sealed, the closure is rows as it was: the spread of three runs
(about 5%) covers the difference. The canonical state of util, sealed, before and after,
is the same in every relation of the model, `ast_within` by hash; what differs is the
reflection of the two lowered rules and the structure rows (17 relations, none of them
facts of the world). Over one seed the sealed state (the closure from the tree) equals the state with the kernel's rows relation by relation and row by row on all four corpora (the provenance's relations aside; only `shrug`, a row the seal writes, differs). A reader asks the tree for 48% of the closure's rows (matches, not
distinct rows: 248,461 of 513,629 on self, 445,682 of 888,133 on util).

## What serves the readers of the tree

`facts/ast-within-readers.rofl` classifies every premise of `rules/js-*.rofl`
that reads `ast_within` or `ast_in`, by the question it asks and the
arguments bound when the premise is reached in written order, and the world
`ast_within_readers` counts them. 56 premises in 48 rules (49 of `ast_within`,
7 of `ast_in`):

| Question | Premises | Bound | Served by |
| --- | --- | --- | --- |
| is-ancestor (a test) | 16 | both | interval containment |
| descendants-of | 17 | ancestor | one pre-order range |
| ancestors-of | 13 | descendant | parent chain |
| scoped ascent (path between a node and a boundary) | 3 | descendant | parent chain, stopped |
| scoped descent (a walk down that does not enter a function) | 3 | parent | pre-order range, skipping the subtree of each boundary |
| nearest with property | 1 | child | parent chain, first hit |
| children-of, parent-of (the seed of a walk) | 2, 1 | parent, child | child list, parent array |

Four operations serve all fifty-six: **ancestry by interval, the parent
chain (stoppable, filterable), the pre-order range (filterable, with skip),
the child list.** No reader asks for depth, a subtree count, a common
ancestor, or the pairs with both ends free (`ff`: none). The later premises
filter by kind (`fn_node`, `ident`, `scope_node`, `try_statement`), so a
per-kind index over the range is an optimisation to measure, not one to
design now. Of the descendants-of premises, 6 are filtered by a name and
walk a function's whole body for one identifier (`param_use`,
`param_hidden`, `hidden_at`, `for_of_use`): the cost is the range, not the
test.

Which readers need materialised rows anyway:

- **None, by their own access pattern.** No premise reads the closure with both
  ends free: every one tests, or enumerates from, an end that is bound.
- **The relations they conclude**: `try_stops`, `completion_outer`,
  `this_over`, `encloses_s`, `shadowed_by`, `hidden_at`, `param_hidden` conclude
  pairs, which are their own relations and stay rows; they are restrictions
  of the closure, not the closure.
- **`nearest_v`, `up_s`, `eff_runs_in`**: walks over `ast_in` that conclude one
  row per node; they are rules of their own over the tree, and stay (they are
  a function and an alias candidate, not the tree's business).
- **The planner's choice**: written order is not evaluation order. If the
  engine puts an `ast_within` premise first (the shape lint calls it a
  closure entered from the wide end), the pattern is `ff` at that moment
  and the structure has nothing to answer but the full enumeration. The
  engine must not do that, and the delta-first plan must put the `ast_within`
  premise behind a bound one.
- **Two clauses written as pairwise not-closer** (`this_nearer`,
  `private_inner`) are `nearest with property` in disguise; with the structure
  they are two ancestor enumerations and a test (`completion_fn_between`
  asks exists-a-function-between the same way).
  They could become a walk up that stops at the first hit, but only in a model
  change, which is the owner's (`rules/js-*.rofl`).

The frozen copy `examples/linter/corpus-dataflow.rofl` repeats 23 of these
premises under the same questions and is not counted.

## Open questions

- **Closure by declaration or by recognition.** Taken, by declaration: `closure`
  lowers to the two rules and the model's are deleted ("Tree, as built"). The
  alternative kept the rules and let the engine propose `closure` (detection)
  while still evaluating them: no model edit, but the licence would rest on a
  recognition, which is the thing the design refuses.
- **The closure where witnesses are kept.** Stored, today. Answering it from the
  tree there needs a row to exist when a conclusion cites it (a witness names
  facts), so the rows a conclusion cites would be stored when cited, with their
  one derivation, the others generated on output with their witness and
  `derived_by` line, and `why` would build a row on demand. Sealed, a reader's
  matches are under half the closure's rows, so the gain is under half the closure
  and its provenance rows. Bounded; not built; the owner says whether it is wanted.
- **`ordered` as a word** clashes with `pareto` and `lex`, "declared order".
- **A promise per book or per relation**: built per book (a cell per book);
  `ast_in[code]` and a copy of it in another book then each need a promise.
- **`whynot` text**: the same verdict, or the same words?
- **A structure over a relation with facts from several sources**: the check
  runs per tick over all of them (a base fact and a rule's conclusion alike).
  Whether a violation in a hypothetical book (`holds` / `assume`) refuses the
  whole run or only that book. Built conservatively: a what-if that breaks the
  promise is refused like any run (see "Function, as built"); the owner decides
  whether it may instead break it and say so.
- **Interval labels under retraction**: gaps and a rebuild of the touched
  root, or an order-maintenance structure.

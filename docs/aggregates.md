# Aggregates

## Status

Decided 2026-09-28 by the owner (f_aggregation_is_one_cell_engine_with_two_syntaxes).
It widens f_count_is_a_kernel_change_and_the_witness_is_the_set,
which planned one stratified `count`. Both decisions that finding fixed still
hold, now in a general form. The programme is a matrix in `facts/agg.rofl` over
`rules/agg.rofl`. Every open cell in it is owned by a work item, and a cell
closes only when a world proves it.

Built as of 2026-09-29, in the Rust engine: the cell substrate and the body
aggregates count, sum, min, max, or and and, with the empty group
(w_agg_cell_store and w_agg_body_strat, thirty cells, each closed by its own
world; see "The body aggregate, as built" below). Then the order lattice: the
relation declaration `lattice p(K..., op V)` with recursive min, max, or and and,
and the cross-kind rules of the cell row (w_agg_order_lattice, nine more cells;
"The order lattice, as built"). Then the threshold `at_least(N, X : body)`,
over closed input and inside its own recursion, with its Quorum witness
(w_agg_threshold, seven more cells; "The threshold, as built"). Then the
holistic aggregates median, quantile and rank over Int, stratified
(w_agg_holistic, seven more cells; "The holistic aggregates, as built"). Then
the well-founded policy and ticks for every kind built: a cell under
`semantics(well_founded)` is refused, a well-founded world is read from below
by a stratified one, a value staged `@next` (a lattice's included) arrives as
base with the provenance of its tick, and `retain_ticks` keeps what a live cell
cites (w_agg_wfs_ticks, sixteen more cells; "Well-founded worlds and ticks, as
built"). Then the holes column for every kind built: an overflow, a type
error or a builtin's fault is a hole and never a value, a budget cut is a
hole and never a smaller value, and what a hole leaves out is not known to be
false, to a negation above it as to an aggregate, in both engines and across a
tick (w_agg_overflow_holes, eight more cells; "Holes, as built"). Then the
answer model (w_agg_shrug, a column of its own decided by the owner
2026-09-29): a literal holds, is unentailed, or is a shrug, with a reason from
a closed vocabulary and structured meta, one kernel relation for what hole,
support_withdrawn, the lattice and cell holes, the walls and the well-founded
`unknown` each said, in both engines for the kernel and in Rust for the
aggregates (eight more cells; "Shrugs, as built"). Then the join lattices
union, hull and bitor, with the reads `E in S` and `A subset S` and their
Cover witness (w_agg_join_lattice, eleven more cells; "The join lattice, as
built"). Then the declared widening `lattice p(K, hull I) widen N.` with the
interval functions of `is` and intervals with infinite ends: a cell widened
after N improvements settles, and is a shrug `widened` whose meta is its
enclosure, never a value held (w_agg_widening, eleven more cells; "Widening,
as built"). Then the semiring tags `tag p(K..., alg T).`, tropical, viterbi
and trust recursing as the order lattice of their ⊕ and counting stratified,
⊗ run through the body by the engine (w_agg_tags, twenty-four cells; "Tags,
as built"). Then subsumption, `p(K..., V1...) <= p(K..., V2...) :- Body.`:
a cell per key holding the antichain of the values none of those it was
given dominates, the order ordinary rofl over closed relations, what a
dominated value concluded withdrawn, a consumer not monotone in it refused on
its data, and a dominance that is no order a `conflict` (w_agg_subsumption,
twelve cells; "Subsumption, as built"). Then the sentence form of every kind,
declaration, tag, dominance rule and shrug, read and written and round-tripped,
and the sugar (average rounded toward zero at a stated scale, every, at most
and exactly N) lowered onto count, sum and a comparison, in Rust (w_agg_phrase,
eighteen cells; "The sentence form, as built"). Then the TypeScript engine,
2026-09-30: every kind evaluates there, and its canonical state, witnesses,
holes, shrugs and explanations are the Rust engine's byte for byte on every
aggregate proof world, which both engines now answer (w_agg_ts, twenty-eight
cells; "The TypeScript engine, as built"). Then per-key precision: what a
hole left out reaches exactly the groups of a body aggregate and the keys of
a counting tag whose value it could change, decided under every completion
elsewhere, in both engines, the holes and shrug cells of six kinds reopened
and closed again against a completions oracle (w_agg_precise_holes, twelve
cells; "Precise holes, as built"). The rest of the matrix is not built.

Reviewed the same day: four of the thirty proofs were found wanting (sum
`eval_rust` and `why`, min_max_strat `witness` and `why`) and those cells are
closed again only by strengthened worlds; a cell's name also lacked its tick,
which touches the still-open `ticks` column. Each defect is recorded in
`facts/findings.rofl`. The review of w_agg_wfs_ticks found every `ticks`
proof wanting: a hole at tick 0 read as absent at tick 1, so the count,
sum, min_max_strat, holistic, threshold, empty_group and order_lattice
`ticks` cells stood on worlds with no hole across a boundary, the cell row's
on a fact staged again and explained by its first staging, and the threshold
world's early-reflection alarm could not fire on its data. Each of the eight
is closed again only by the strengthened world
(f_a_hole_at_a_tick_read_as_absent_at_the_next). The review of
w_agg_overflow_holes found all eight `holes` proofs wanting: the decided
answers of every holes world were alarms `not answer`, silent when the answer
is wrongly held unknown; and for order_lattice, sum and cell, a wall closed as
final a lattice a plain hole had not yet reached, and the carry of unknowns ran
past both walls. The eight cells are closed again only by the strengthened
worlds and the new ones ("Holes, as built"). The review of w_agg_shrug found
four `shrug` proofs wanting: the cell row's (a rule reading shrug could
withdraw the row it read, and a fault met under an over-estimate the
alternation discarded stayed carried), threshold's (the oracle had no group
without members, and such a group stayed a shrug) and order_lattice's (a
divergence named the cells of other cycles). They are closed again only by the
strengthened worlds and `agg_cell_shrug_wfs_history`. A second review found
two more wanting: threshold's (a group left open named only the unknown that
reached it last) and the cell row's (a paradox was never a root, and Rust read
`q()` as a term no atom is); both are closed again only by the strengthened
`agg_threshold_shrug` and `agg_cell_shrug_wfs`. The review of
w_agg_subsumption found five proofs wanting: `eval_rust` (a monotone consumer
an improvement reached back through was refused), `ticks` (a conclusion
staged from a fact withdrawn later in the tick stayed staged, for a lattice's
hole as well, so order_lattice's `ticks` too), `holes` (a cell whose only
comparison, with itself, faults), `why` (whynot read a fault as no) and
`safety` (the door read a body in no order); each is closed again only by the
strengthened worlds.

## Scope

- Every aggregate class. The Rust engine (`rust/rofl`) comes first; the TS engine gets them best-effort, at small scale.
- Production-ready: features first, then tests. Wherever possible the tests are rofl itself, as rules and `alarm`.
- Values are `Int` within ±2^60. Overflow writes a hole and never wraps; the
  Rust `eval_arith` is checked too (f_arithmetic_wraps_past_the_term_range).

## One cell engine, two syntaxes

A **cell** maps a key to a value, and new values are merged in with ⊕. Both
syntaxes produce cells.

**Body aggregate.** The cell is keyed by the group variables.

    N is count(R : concludes(R, Rel))
    S is sum(V ; K : cost(K, V))          -- K, the projection key, is mandatory
    M is min(D : dist(A, B, D))

- A non-idempotent aggregate must name its projection key. Without one, set
  semantics would merge two equal contributions into one, and a sum would
  count one of them fewer times than it should. The key fixes that.
- It is stratified. The aggregate premise is a dependency edge of the same kind as a negation.
- It fires once, after its input round closes. Semi-naive propagation never
  fires it again, and its inner relations are not in `trigger_rels`.
- An empty group: count and sum give `0` only when the group key is bound
  from outside the aggregate, because that is a negative claim and needs
  stratification. min and max give no row.

**Relation declaration.** The cell is keyed by the declared head prefix.

    lattice dist(A, C, min D).
    lattice reach(X, union S).

- A semiring tag is a cell keyed by the **whole** head. Tags move into the kernel, and ⊗ runs through the body.
- Recursion is allowed only if ⊕ is idempotent.
- A consumer of a recursive cell must be monotone in the cell's value, and
  `safety.rofl` checks that. A non-monotone read must come from a higher stratum.
- A predicate has one algebra.

**Insert.** A contribution `(k, v)` computes `new = cell[k] ⊕ v`. If `new` is
unchanged, nothing propagates. If it changed, the cell is updated, `k` goes to
Δnext and the witness is updated.

## The algebra decides

Each kind has one algebra class (`algebra_class` in `facts/agg.rofl`). The
class alone decides recursion and deduplication, with no case-by-case judgement.

| Class | Examples | Recursion | Dedup | Witness |
| --- | --- | --- | --- | --- |
| idempotent total order | min, max, or, and | yes | none | Best |
| idempotent join | set union, interval hull, bitset or | yes; infinite height needs a declared widening, forced after N improvements | none | Cover / Widened |
| invertible | count, sum | stratified only | by the projection tuple | Group |
| holistic | quantile, median, rank | stratified only | by the projection tuple; the group is recomputed | Group |
| threshold | `at_least(N, X : body)` | yes (it is monotone) | none | Quorum (exactly N) |
| idempotent semiring tag | tropical, viterbi, trust (boolean is a plain relation) | yes | none | Best of its order lattice |
| counting semiring tag | counting | stratified only | a derivation per firing | Group of its derivations |
| partial order | subsumption, Pareto | yes | none | Antichain |

- **Subsumption.** It is written Souffle-style,
  `dist(A, B, D1) <= dist(A, B, D2) :- D2 < D1.`, and serves partial orders
  that have no join. It is a later add-on, but it is in scope and in the matrix.
- **Sugar.** In sentence form, *at least / at most / exactly N*, *every* and
  *avg* are lowered before the kernel sees them. The lowering is not free, so
  the sugar row keeps its `eval_rust`, `eval_ts` and `safety` cells: *avg* is
  sum over count with a declared rounding and no row for an empty group (never
  a division by zero); *every* is count-equality over a domain bound from
  outside; *at most* and *exactly N* are not monotone and are refused inside
  recursion.
- **or / and** are the idempotent total order on {false < true}; the
  `min_max_strat` and `order_lattice` rows cover them.

## The body aggregate, as built

**Syntax.** One form, read by `rust/rofl/src/rofl_parse.rs`, `src/parser.ts`
and ring 1 (`examples/ring1/ring1.rofl`) alike:

    aggelem  := term 'is' aggop '(' termlist [ ';' termlist ] ':' body ')'
    aggop    := count | sum | min | max | or | and

    N is count(B : ballot(B, C))            -- count the distinct B
    N is count(B, H : cast(B, C, H))        -- count distinct (B, H) pairs
    S is sum(V ; K : cost(K, V))            -- sum V over distinct (V, K)
    M is min(D : dist(A, B, D), D >= 0)     -- min, max over integers
    F is or(X : flag(Y, X))                 -- or, and over `true` and `false`

- The operation words are not keywords: `count` is an aggregate only after
  `is`, followed by `(`, with a `:` at the top level before the matching `)`,
  and a name everywhere else.
- Values and keys are terms, not expressions (bind `W is ...` inside the body).
  The result is a variable or a constant.
- `:` and `;` are tokens now; `:-` is still one token. A character that makes no
  token is refused by both parsers, and so is an integer literal outside
  [-2^60, 2^60).

**Shape**, judged by `safety.rofl` (a wrong shape refuses the program when it
is evaluated): count takes no key and at least one term; sum takes exactly one
value and at least one key; min, max, or and and take exactly one value and no
key. The aggregate's body must bind everything the aggregate counts, sums or
groups by, and the rule must be range-restricted with the aggregate binding
its result and its group variables.

**Correlation and groups, by written order.** A variable of the aggregate that
also occurs elsewhere in the rule is *shared*. Bound by a premise written before
the aggregate, it is a correlation: the aggregate is asked per value, and an
empty group of count or sum reads `0`. Otherwise it is a group variable the
aggregate binds, and a group with no member has no row. The load door refuses a
shared variable that a premise written *after* the aggregate would bind, since
otherwise which reading applies would depend on where a premise stands. min,
max, or and and give no row for an empty group either way. Nesting an
aggregate inside another, and `@next` inside one, are refused.
Variables are not scoped per aggregate: another aggregate's body is
"elsewhere in the rule", so a variable written in two aggregates is shared
between them, and when neither binds it before the other it is refused like
any late binder (`examples/checks/agg-count-safety-5-refused-two-aggregates.rofl`).
Two independent aggregates name their variables apart.

**Stratified.** An aggregate reads its inner relations the way a negation
does: `premise_agg(R, Rel)` in the reflection, no `premise_pos`, a strict edge in
`peel_rounds` and in `rules/strata.rofl`. A relation read through its own
aggregate is refused (`... reads a closed relation; a recursive min/max is a
lattice declaration`). The stock evaluator (`--strata`, `Mode::Strata`) orders
its passes by the `stratum` table instead, so it seals an aggregate only when
the table ranks the aggregate's head and every derived relation it reads
strictly below it; otherwise, and so without `rules/strata.rofl` or a table of
the program's own, the program is refused (`the stock evaluator cannot seal
its aggregate`), never counted over a relation still being derived. A cell is
sealed once per correlation, after its input is closed, and never recomputed;
a second seal of one key is a defect.
An aggregate may not read what the kernel writes while evaluating
(`derived_by`, `hole`, the cell relations). Under `semantics(well_founded)` an
aggregate is refused ("Well-founded worlds and ticks, as built").

**Values.** Integers within ±2^60. A sum whose total leaves the range, or a
value of the wrong type, writes `hole($cell(R, At, Tick, Key), agg_overflow)` or
`agg_type_error` and gives no row. The total decides, not a partial sum: count
and sum accumulate in i128 and check the range once, so the verdict does not
depend on the order the members are folded in. Arithmetic (`is`) is checked
the same way and holes as `arith_overflow`. A builtin that fails for an error
inside the aggregate's body (an overflow, a zero divisor, a string type) drops
a member for a reason other than its absence, so the group is not known: the
correlation gets `hole($cell(R, At, Tick, Corr), Reason)` beside the rule's own
`hole($rule(R), Reason)`, and no row — never the value of the members that
survived. A member left with an unbound variable is the same, as
`agg_open_member`.

**What a hole leaves out, read by an aggregate**
(f_an_aggregate_read_what_a_plain_hole_left_out). A rule holed by a builtin's
error, and a body aggregate's cell holed, leave the rule's conclusion under
that solution unknown, not false: over `v(a,1). v(b,oops). v(c,5). v(d,7).`,
`x(K, Y) :- v(K, X), Y is X + 1.` leaves `x(b, _)` unknown, and a median over
x is 6 or 8, not the 6 of the members that survived. A body aggregate
(count, sum, min, max, or, and, median, quantile, rank) whose inner body under
its correlation could read such a conclusion is a hole on the correlation's
cell, `support_withdrawn`, and no row, and what its rule would conclude is
unknown in turn; a lattice that reads one holds it as the cell's fault
(`plain_fault`, `plain_agg_holes`, `plain_flush`, `lat_plain`, over the
machinery of "What a hole reaches is a hole" below). It is carried once its
relation has closed, so a conclusion that also holds by another rule, even one
a stratum higher, is known and decides nothing. Through positive rules it is
carried SILENTLY: their conclusions are absent as they always were and their
rules are not holed, so a program with no body aggregate and no lattice
evaluates exactly as before, the same in both engines. A negation over it
is undecided ("Holes, as built"). A threshold stays monotone. As for an inner fault, the
aggregate is holed per correlation, not per group: a grouped aggregate with no
correlation loses every group. `whynot` of its conclusion says it is not known
to hold and the path back to the hole.

**The cell and its witness.** A conclusion that used an aggregate records one
premise for it, `PremRef::Cell`, naming a sealed cell `$cell(Rule, At, Tick,
Key)`. The tick is part of the name because a cell is sealed once per tick: an
`@next` conclusion carries its tick's cell across the boundary, and the next
tick seals another under the same rule, position and key. A cell that no live
firing cites goes with its tick.
A count or sum cell is a Group: every distinct projection tuple is a member.
A min, max, or or and cell is a Best: every derivation that reaches the final
value, and nothing else. Members carry their derivation height and are ordered
by height, then projection (Group) or premise signature (Best); a member's
premises are those of its least-signature derivation. Rules read a cell as
`agg_cell[$kernel](Cell, Value, Height)` and `agg_sealed[$kernel](Cell, Rel,
Round)`, and its members as `agg_member` and `agg_member_prem` (written only
when some rule reads them).

**why and whynot.** `why` prints a cell as
`count(?B : ballot[main](?B,c1)) = 3 [aggregate: 3 members, sealed ballot@2]`,
then its members `#1 (b1) h=1` with each one's derivation, five of them and
`[n more members: why all ...]` for the rest; `why all` prints every member.
`whynot` says `... = 3, not 99 [aggregate]`, `... has no value:
hole(agg_overflow) [aggregate]` (any reason: the members exist, so nothing
below is asked), or `... has no value: empty group [aggregate]`, and only the
last goes on to ask why the inner literal has no match. A world asks for these with
`explain_request(Kind, Atom)` and reads `explained[$explain](Kind, Atom, I,
Line)` under `rofl-load --explain`.

**Proofs.** Each closed cell names a world in `facts/checks.rofl`
(`agg_<kind>_<column>`), loaded together (`check_opt(W, together, 1)`: every
file loads before the world is evaluated once, a refusal fixture offered
alone) and answered by both engines; `npm test` holds the one hash both reach,
its alarms and its expected refusals, in either engine.
`npm run test:agg:breaks` plants a fault per entry of `scripts/agg_breaks.ts`
in the engine and shows each world turn red ("The loop", below).
`rust/rofl/tests/agg_worlds.rs` rebuilds every such world, evaluates it twice,
saves and reopens it, and cuts the empty-group data at every budget; it also
opens a ticked world's snapshot without evaluating it and requires the same
state and the same `why`, requires an ended tick to keep only the cells a
firing carried, and requires a damaged cell in a snapshot to be refused.

## The order lattice, as built

w_agg_order_lattice, in the Rust engine; decisions in
f_a_lattice_cell_is_its_fact, f_monotone_in_the_value_is_judged_per_rule_by_safety,
f_a_lattice_hole_is_applied_when_the_lattice_closes,
f_the_stock_evaluator_cannot_rank_a_read_from_outside_a_lattice,
f_a_lattice_value_can_be_founded_only_on_its_own_history,
f_self_support_is_judged_by_existence_not_by_the_canonical_derivation,
f_lattice_faults_are_judged_against_the_lattice_as_it_closed,
f_an_unknown_value_reaches_what_reads_it,
f_a_wall_left_lattice_values_as_if_final,
f_a_hole_stopped_at_the_close_of_its_lattice and
f_a_wall_named_cells_that_improved_through_one_another.

**Syntax.** A declaration, anywhere in a program, read by
`rust/rofl/src/rofl_parse.rs`, `src/parser.ts` and ring 1 alike:

    lattice dist(A, C, min D).
    lattice widest(A, C, max W).
    lattice reach(X, or B).
    lattice best(min D).               -- no key: one cell

    latdecl := 'lattice' ident '(' [ term ',' ]* aggop term ')' '.'

`lattice` is a word, not a keyword: it declares only when a second name
follows it, so `lattice(x).` is still a fact. The value is the last argument
and the key every argument before it (the head prefix). The door requires them
to be distinct variables (`_` is one), no book, and a relation that is not the
kernel's. safety.rofl requires the operation to be idempotent (min, max, or,
and; the joins union, hull and bitor, "The join lattice, as built"):
`lattice p(K, sum S)` is refused, because the recursion gate reads the
algebra flag (`idempotent_op`); sum and count are body aggregates.

**Reflection.** The declaration is one kernel row,
`lattice_decl[$kernel](Rel, Arity, Op)`, timeless like the semantics
declaration: rules as data, readable by rules, carried by a snapshot and
decoded again by `lattice_decls` on open. It has no rule id; the rules that
conclude and read the relation are ordinary rules and keep theirs.

**The cell is the fact.** `dist(a, c, 3)` is the cell `dist[main](a, c)` holding
3. A rule's conclusion into a lattice relation is a contribution `(k, v)`,
merged at `conclude` with the same `AggOp::insert` a body min folds with: a
worse value is dropped, an equal one is another firing of the same fact (a
tie), a better one supersedes the old fact and enters Δ. A superseded fact is
no answer (`Store::retire_keeping_firings`, its runs swept once per settle)
and keeps its firings: they are how the cell reached the value that replaced
it (the witness, below). So the relation holds one fact per key, whatever the
number of paths: shortest paths over a cyclic graph end with one row per
reachable pair, where the same rules without the declaration enumerate path
lengths until the budget cuts them (the 74 831 cost facts of
f_semiring_needs_parameterized_evaluator; `tests/lattice_scale.rs` shows
102 202 on 12 nodes against 144, and 3 000 nodes settling with 3 559
improvements, equal to Dijkstra's).

**Inner and outer reads.** A rule reads a lattice P *inside its recursion* when
P depends on the rule's head (safety.rofl `lat_inner`, over every edge of the
present tense). Such a rule must be monotone in P's value (below); it fires
with the other rules of the recursion, and when a value improves it fires again
on the new fact, concluding either the same head (a fresh firing) or a better
lattice value (which supersedes the old one). After every fixpoint
(`lattice_settle`), a fact with a firing that read a value since improved on
must also fire from the values that replaced it, or it is a defect,
`Halt::Bug` — the monotonicity argument checked, not assumed; the firing that
read the old value stays until the lattice closes (the witness, below). A
solution over a value improved on earlier in the same batch is not concluded
at all: the rule fires again on the value that replaced it. Every other read is *outer*
(`lattice_outer`): a strict edge, like a negation's, in `peel_rounds`, so the
rule fires once P is closed and may read it any way at all — a non-monotone
read comes only from a higher stratum. A negation of P inside its recursion is
refused (`lattice_negated`), and so is a body aggregate over it there (it
reads a closed relation).

**Monotone in the value.** For an inner read, the value variable and every
variable computed from it may be used only (safety.rofl, `lat_ok`):

- as a lattice head's value, directly or through `X is V + E`, `E + V`,
  `V - E`, `E - V`, `min(V, E)`, `max(V, E)` or `X is V` (E not depending on V),
  moving the way that head's order improves (min and and improve downwards, max
  and or upwards; `E - V` turns the direction, so `N is 0 - D` carries a min
  into a max);
- in a comparison that stays true as the value improves: `D < N`, `D <= N`,
  `N > D`, `N >= D` of a min, the mirror of a max;
- as `B = true` of an or, `B = false` of an and; and a premise may read the
  constant `true` of an or, `false` of an and.

Anything else is refused (`lattice_nonmonotone`): a join on the value, the value
as a key, in a relation that is not a lattice, under a negation, in an equality,
multiplied, or turned the wrong way. The check is per rule and sufficient: two
rules monotone only together (`W1 <= W2` concluding W1 beside `W2 < W1`
concluding W2) are refused; write `min(W1, W2)`, which is arithmetic in both
engines for exactly this. Its arguments are terms, a variable or a constant,
as every functor's are: `min(X + 1, 5)` is refused by both parsers and is
written `Z is X + 1, Y is min(Z, 5)`; `min(max(A, 0), B)` nests
(f_the_rust_parser_read_an_expression_as_an_argument). The host seeds what the rules need to read (the slots
`neg`, `hkey`, `hval`, `lkey`, `lval`, `lit_arity`, `premise_arith`), only for a
program that declares a lattice.

**One algebra per predicate.** Refused: two declarations of one relation with
different operations or arities; a rule writing a lattice at another width; a
rule whose head is a lattice and whose head value is a body aggregate of another
operation (a body sum and a lattice min on one predicate), directly or passed
on through `X is ...` or `=` (`lat_aggval`: `M is max(W : e(A, C, W)), D is M
+ 0` into a min is the same max). A body aggregate of the same operation is a
contribution like any other.

**Witness: Best.** A lattice fact's members are its firings that reach its
value — a worse one never became a firing — well-founded, and canonical at the
close of the relation: ordered by height, then rule id, then premise signature.

*What a member may read.* Where the final values alone give the fact a
derivation, its members read final values only: at the close every firing that
read a superseded value is removed from it (`settle_stale`). Where they do
not, the firings by which the value was reached stay, and cite the superseded
values they read, whose own firings stay with them. That is a value reached
only through the cell's own earlier values: a max that saturates (`best(B, W)
:- best(A, W1), e(A, B, _), X is W1 + 1, W is min(X, 3)` over a cycle ends
with best(a, 3) and best(b, 3) deriving each other and nothing else), a
threshold (`D1 < 2` concluding 0), a decrement floored at 0, a consumer that
is no lattice on the way (`flag(C) :- dist(_, C, D), D < 2. dist(a, C, 0) :-
flag(C).`), or an or over a cycle through a min. A member that read an earlier
value reads a bound the cell still meets — every inner read is monotone — so
the witness stays true of the final state, and well-founded by height, which
the final values alone cannot give such a fact. Which earlier values a cell
passed through is the evaluation's own: deterministic, and not a property of
the program; only these facts show it. A superseded value's history ends with
its tick; a snapshot carries it, and the dead record, as a ghost with firings.

*Self-support, judged by existence.* A firing that cites the fact itself (a
zero-weight self-loop), or a premise every derivation of which uses the fact,
is self-support and no member; it is removed, with its `derived_by` row if no
other firing of that rule stands. Only a premise higher than the fact can be
one. The question is whether a derivation without the fact exists, never which
derivation is canonical, so the member set does not change when a node is
renamed. In the recursion's derivation graph (its relations' facts, superseded
values included, under a root for what lies outside it) the answer is
dominance: `Store::dominators` (Cooper, Harvey and Kennedy over reverse
postorder, once per closing relation) when every firing reads at most one fact
of the recursion; when a firing reads two (all-pairs by doubling), a least
fixpoint per fact over the part of the graph above it (`Store::founded_without`,
first along one least derivation). Rules read the members as
`lattice_member[$kernel](Fact, I, Height, Rule)` and
`lattice_member_prem[$kernel](Fact, I, Prem)`, written when some rule reads
them; they, and the lattice's holes, rank strictly above every lattice.

**why and whynot.** `why dist(a, c, 3)` prints `dist[main](a,c,3) [lattice min: 2
members]` and each member, `#1 h=1 <= rule @tick 0` with its premises, a digest
of five at the top (`why all` for the rest) and the canonical member alone
below it; a premise that is a superseded value is marked `an earlier value,
improved on since`. `whynot dist(a, c, 2)` says `dist[main](a,c) is a lattice cell (min)
holding 3`, then `2 would improve it, and no contribution reaches 2` and lists
every contribution the rules make at the key over the final facts, best first:
that list is why there is no smaller. `whynot dist(a, c, 5)` says `5 is not its
value: min keeps the best contribution, 3`. A holed cell says `has no value:
hole(Reason) [lattice min]` and, when another hole reached it, the path back
to the fault (Holes, below); a key with no cell and no hole goes to the
ordinary exploration.

**Refused, each with its reason named:** an asserted fact in a lattice relation
(the cell holds what its rules conclude: assert the input elsewhere and
conclude it); any lattice under `semantics(well_founded)` ("Well-founded worlds
and ticks, as built", which also says how a lattice head concluded `@next`
crosses a tick); a program that reads
`derived_by` beside a lattice (a cell that improves withdraws its old firings);
a lattice whose rule is not range-restricted, and a rule answered on demand that
reads a lattice (it would be unfolded while the lattice improves).

**Holes.** A contribution outside the carrier (min and max hold integers, or and
and booleans), and a builtin that fails for an error in a rule the lattice
decides (one concluding into it, or reading it inside its recursion), are
faults, held with the facts the failed derivation read and decided when the
lattice closes (`LatFault`, `apply_lattice_holes`). A fault is applied if
every fact it read still stands — a failure on a value since improved on says
nothing about the cell — and all of them are judged against the lattice as it
closed, before any is applied, so whether a fault arrived before or after
another one that holes what it read decides nothing: both are applied. A
fault in a rule concluding into the lattice withdraws the cell's fact with
`hole($lattice(Rel, Persp, Tick, Key), Reason)` (`$lattice(Rel)` when the key
depends on what failed); the rule's own hole, `hole($rule(Id), Reason)`, is
written then too, and only then, for any rule the lattice decides.

*What a hole reaches is a hole* (`Eval::poison`,
f_an_unknown_value_reaches_what_reads_it). A fault leaves something unknown:
a cell's value, every cell of a relation when the key was not bound, or
whether a tuple of another relation holds (a fault in a rule that reads the
lattice inside its recursion and concludes something else). Every active rule
that reads it — inside the recursion, and the monotone rules reading its
relations — is solved with it in place of the premise: the unknown value
decides no comparison and no sum (a builtin or a negation that reads it, or a
variable nothing bound, passes undecided; an error on known values passes too,
since that derivation would fault), and an argument that holds it matches
anything. What the rule concludes is unknown in turn: a cell of a lattice
closing now is withdrawn as `support_withdrawn`; a cell of a lattice that
closes later is held as its fault; a tuple that does not hold otherwise is
absent, and its rule holed `support_withdrawn`. Whatever rested on something
withdrawn is withdrawn (a fact left with firings but none well-founded too),
and is unknown in turn, until nothing moves. It is a closure over sets on the
lattice as it closed, so nothing depends on the order anything arrived in or
on a value a holed cell had reached: over `e(a,c,1). e(c,k,heavy). e(k,f,1).
e(a,f,10).` shortest paths hole (a,k), (c,k), (a,f) and (c,f), and so with
`e(a,k,5)` or `e(a,k,100)` beside them. A holed cell's earlier values go with
it. A body aggregate in a rule so solved is not computed: what it binds is
unknown, which can hole more than needed and never less.

*Readers outside the recursion* (f_a_hole_stopped_at_the_close_of_its_lattice)
fire once the lattice has closed, when everything a hole leaves unknown there
is known to be unknown, and they carry it on too. A stratum's rules, once it
has run, are solved against every unknown already carried, as a rule inside
the recursion is at the close (`poison_readers`): a lattice above that reads a
holed cell (`l3(C, D) :- q(_, C, D)`) has that cell unknown, a hole
`support_withdrawn` at its close, never the ⊕ of what else contributed; a
tuple it would conclude is absent and its rule holed. A negation that matches
nothing but could match something unknown (`not d(A, C, _)` over a holed
cell, `not near(C)` over a tuple not known to hold) is undecided: the
solution is not concluded, what it would conclude is unknown and carried on,
and its rule holed (`lat_undecided`). A body aggregate (count, sum, min, max,
or, and) whose inner body under its correlation could read something
unknown is a hole, `support_withdrawn`, on each group whose value it could
change and on no other ("Precise holes, as built"), and what the rule would
conclude from such a group is unknown; an or or an and a known member
already decides is decided, unless the unknown's own value is not known. A threshold is monotone: a quorum
reached without the unknown stands, and one short of it is unknown. A
conclusion `@next` from an unknown is not staged, its rule is holed, and it
is unknown in the tick it would arrive in ("A hole across a tick", in
"Well-founded worlds and ticks, as built"). A
tuple with an argument not known (`cnt(a, _)` from a holed count) is every
tuple it could be: a negation of any of them is undecided, and a reader of
it solved with the unknown in its place. That a negation or an aggregate
never reads a relation a hole can still reach is checked, not assumed: the
closure halts with a bug if an active one does. The rule holes so written
are news, propagated before the next stratum; and `hole` ranks above every
relation a lattice reaches (but one that reads `hole` itself), so a negation
of what reads it runs after the last reader it holes. `whynot` of a withdrawn cell
names its hole and the path back to the fault, a step per line with its rule
(`reached by R from C, which has no value: hole(...)`); of a tuple left
unknown, `T is not known to hold` and the same path. The path is the
evaluation's, so a snapshot reopened without evaluating says the hole alone. The cascade visits only the firings that cite what it
withdrew (the store's citer index, kept while a program with a lattice
evaluates).

In a rule a lattice decides, each builtin that can fail (`is`, the
comparisons) runs after every premise it does not feed (`sink_builtins`, the
plan's only change for such a rule): a failure then counts only for a
derivation every other premise admits, and the body's written order decides
nothing. `dist(A, C, D) :- e(B, C, W), Y is W + 1, dist(A, B, D1), D is D1 +
Y.` fails on a weight `heavy` only where some `dist(A, B, _)` exists, and
holes that cell, as the same rule written with `dist` first does.

*At a wall* (f_a_wall_left_lattice_values_as_if_final) — the budget or the
space — every open lattice is `hole($lattice(Rel), budget_exhausted)` or
`space_exhausted` and keeps the values it reached, each a bound the value
meets and none final; its standing faults are applied and carried on as at a
close. A cell on an *improving cycle* is withdrawn as `hole($lattice(Rel,
Persp, Tick, Key), improving_cycle)` and what it reaches as
`support_withdrawn`: a cell some value of which was first concluded, through
first firings, from an earlier value of the same cell (`reached_from_own`,
judged value by value; Tarjan over the cells, a cell's values one node, only
narrows which cells to ask). A min over a negative cycle, or a max over a
positive one, is such a cycle and never settles; a zero-weight cycle is not
(its firings are ties), nor a positive one under min, nor cells that
improved through one another along paths where no value came back through
its own cell — `cs` to `cy` first 11 through `cx`, then 3 by a longer path,
and `cs` to `cx` then 4 through `cy` — whatever order the values arrived in
(f_a_wall_named_cells_that_improved_through_one_another). This is a report
at the wall of how each value was reached, not a detection before it:
whether an improving cycle stops is not decidable from the rules, so a max
saturating at 50 through itself is named, and withdrawn, even when it had
stopped long before the wall; and a cell on a cycle the wall stopped before
any value of it came round keeps the value it reached, a bound under the
relation's hole like every other, so which cells of a diverging cycle are
named depends on how far the wall let it go (tests/lattice_scale.rs,
`a_wall_before_a_cycle_came_round_names_none_of_it`). Either way the
relation's hole marks every value kept as a bound. A
superseded value's firings are kept until the close, so a run's memory grows
with its improvements; each firing is charged a row, so the space wall bounds
it. A lattice the wall did not reach closes as it would have ("Holes, as built").

**The stock evaluator** (`--strata`) closes a lattice where its table ranks
it, and refuses a lattice the table does not rank and an outer reader the table
does not rank strictly above it (`check_lattice_strata`). rules/strata.rofl
ranks lattices and what the kernel writes above them, but not outer readers:
telling outside from inside takes a negation that evaluator cannot order before
it reads its table, so a program ranks its own
(`examples/checks/agg-lattice-strata-ranks.rofl`).

**Proofs.** Nine cells, eleven worlds, each seen red under a planted fault in
`scripts/agg_breaks.ts`: `agg_lattice_syntax`, `_reflect`, `_strata` (with
`proves_recursion`), `_safety`, `_eval`, `_witness`, `_why` on the
order_lattice row, and `agg_cell_safety`, `agg_cell_strata` on the cell row;
`agg_lattice_wall` (the budget) and `agg_lattice_space` (the space) prove
eval_rust at a wall beside `agg_lattice_eval`. A wall stops the rules of its
own world, so those two are checked by the rows their cut state must and
must not hold, lines of their files (`-- expect-row: ...`, `-- expect-no-row:
...`, read by scripts/goldens.ts; `check_opt(W, space, N)` sets the space
wall, `rofl-load --space N`). `agg_lattice_strata_stock` is coverage of the
stock evaluator. Their dataset,
`examples/checks/agg-lattice-data.rofl`: shortest paths with a positive and a
zero-weight cycle, a tie and a value improved on, widest paths, a critical
path on a DAG, or and and over a cycle, a weight that is not a number, and a
consumer that fires two rounds before the cell it read improves; beside it in
the eval, witness and why worlds, `examples/checks/agg-lattice-history-data.rofl`:
the five values reached only through their own history, two graphs alike but
for a node's name, zero-weight and or self-loops, one rule in two body orders,
faults that arrive early and late, and an overflow on a value since improved
on; and `examples/checks/agg-lattice-holes-data.rofl` in the eval and why
worlds: one hole in three graphs alike but for the value the holed cell
reached first, an unknown carried through a relation that is no lattice, one
through a tuple the fault withdrew, a relation-wide fault carried to a
second lattice of the recursion, and the readers outside it: a lattice above
reading a holed cell, two lattices in a row, a negation of a holed cell and
of a tuple not known, a count and a threshold; the why world also asks `why`
of a value 1200 derivations deep (`agg-lattice-why-deep.rofl`), which both
engines walk to its source (`why_depth_cut`, `ts_why_depth_cut`).
`examples/checks/agg-lattice-wall-data.rofl`
is the wall's: a negative cycle under min, a positive one under max, a
zero-weight cycle beside an improvement, a fault, and two graphs whose cells
improved through one another and settled, one with the short path arriving
late. tests/lattice_scale.rs adds deep zero-weight ties (30 000 nodes, every
back edge self-support), a hole withdrawing a 64 000-fact chain, and two
oracles for self-support, one per judgment (dominators; the fact-by-fact
fixpoint). A proof world
the budget cuts is a failure of the harness now, not a green
(f_a_proof_world_cut_by_the_budget_passed).

## The threshold, as built

w_agg_threshold, in the Rust engine; decisions in
f_a_threshold_is_a_monotone_premise_closed_with_its_conclusion,
f_a_quorum_is_a_lower_bound_so_an_error_drops_a_member,
f_a_threshold_never_counts_what_an_open_lattice_can_withdraw; corrected by
review in f_a_threshold_cell_is_one_group_at_one_n,
f_a_quorum_member_is_as_low_as_its_lowest_derivation and
f_a_recursive_threshold_solves_only_what_its_news_reaches.

**Syntax.** A body element, read by `rust/rofl/src/rofl_parse.rs`,
`src/parser.ts` and ring 1 alike:

    trusted(C) :- claim(C), at_least(2, W : vouch(W, C, _)).
    thm(P) :- step(S, P), need(S, N), at_least(N, K : needs(S, K, Q), thm(Q)).

    thrselem := 'at_least' '(' term ',' termlist ':' body ')'

`at_least` is a word: without a colon at depth one, `at_least(2, x)` is a
literal. The counted terms are the projection and the key, so there is no
`;` (`at_least takes no key`), and the threshold N is a term, never an
expression. It is reflected as `$agg(at_least, N, Vals, $nil, Body)` and
spelled canonically `at_least(N, ?W : ...)`, byte for byte in both engines.

**The door and safety.** N is an integer literal or a variable bound by a
premise written before the threshold (`program.rs`); a threshold reads N and
binds nothing but the variables it shares, so safety.rofl seeds it an empty
`agg_res` slot. The body must bind what it counts (`member_unbound`), the
rule be range-restricted, and its head not demand-backed. A threshold may
not count what an open lattice can still supersede or withdraw
(`threshold_lattice`): it reads no lattice, and nothing `lat_live` on one (a
relation whose facts can rest on the lattice's values before it closes);
it concludes no lattice and sits inside no lattice's recursion. Reading a
lattice through a rule of its own from outside the recursion is allowed,
since that rule fires once the lattice is closed.

**Monotone, so recursive.** "N distinct projection tuples satisfy the body"
stays true as facts are added, so a threshold is reflected as the rule
would read its body inlined: `premise_pos` for a positive literal inside (a
trigger, a positive dependency edge), `premise_neg` for a negation (strict),
and no `premise_agg`. The rule is a monotone rule and may recurse through
its own threshold (`at_thm`, `at_believed` in
examples/checks/agg-threshold-data.rofl); news on a relation it reads inside
fires the rule again (`thr_rels`, `propagate`), and only the groups that
news reaches are solved again (below). A negation inside a
threshold of its own conclusion is a negative cycle and refused. The
recursion gate is the algebra flag: `AggOp::recursive` is the threshold
class alone.

**Evaluation.** A cell is ONE GROUP AT ONE N: `$cell(Rule, At, Tick, Key)`,
its key the shared variables' values and then N (`thr_cell_key`), so
`need(s, 1), need(s, 5)` over one member reaches `(s, 1)` and never `(s, 5)`,
and an N that is no integer holes its own cell, never one an integer N
reached. Solved in full (the rule's first firing, and a firing on news
outside the threshold), the element asks, per group, how many distinct
projection tuples the body has; a group that has reached N gets its cell,
holding `true`, once, and is never asked again (`thr_cells`). A group short
of N gives no row and no cell. Fired on news read inside it, the rule
solves only what the news reaches (`thr_focus_of`): each inner positive
literal with news, joined with the body's other positive literals, names
the groups it can touch; a group short of N is grown by the news alone,
solved with the news at that literal (`ThrAcc`, a group solved in full once,
when first touched), and yields only a cell reached in this round, an older
one having been concluded from when it was reached. A correlation or group
the positive literals do not bind is solved in full. So a belief that grows
one node a round costs steps linear in its depth, not quadratic
(`a_deep_recursive_quorum_costs_steps_linear_in_its_depth`). N at most 0 is reached with no
member, so `at_least(0, ...)` holds for a correlation bound from outside, as
the need_count trick needs for a step with no premise. N that is not an
integer is `hole($cell(...), agg_type_error)` and no row. A member a builtin
drops for an error, or one left open, is not counted and the rule's hole is
written as for any builtin; the group is NOT holed, unlike count's: a
threshold is a lower bound, and a member missing can only make it unreached,
never falsely reached, whatever order the members arrive in.

**Closed with its conclusion.** A cell's members are provisional while what
it reads can grow. Before each level whose round is past the threshold's
conclusion and inner relations (`close_thresholds_below`; every one at the
end of the evaluation, and at a budget cut), each open cell is asked again
over the closed relations for all its members; the members' facts and the
open quorums are given heights as one least fixpoint
(`Store::quorum_heights`, Knuth's generalisation of Dijkstra with a quorum's
height the Nth lowest of its members'), because inside the recursion a
member may rest on a conclusion another quorum supports. A member is every
distinct derivation of its projection, each a way into the fixpoint: its
height is the lowest of theirs, and it is founded if any of them is, so a
text-least derivation that rests on the quorum it would join neither
unfounds nor raises it. Then `Store::reseal_cell` keeps the first N
(`cell::quorum`), each citing its least-signature derivation among those at
its height, and the cell is reflected. The kernel writes a threshold's cells at its close, so the peel
and rules/strata.rofl rank the cell relations and `hole` strictly above
every threshold's conclusion.

**Witness: Quorum.** Exactly N members, the first N in the canonical order —
height, then projection text — each at the least height of its derivations,
with the premises of the least-signature derivation at that height; the
cell's height is its highest member's; no seal (a threshold
reached stays reached however its input grows). A member that rests on the
belief it would support is higher than the quorum it would join, so the
canonical order never picks it (m's quorum is a and b, never v, in the
data). Rules read it as `agg_cell(Cell, true, Height)`, `agg_member` and
`agg_member_prem`; a threshold writes no `agg_sealed`.

**why and whynot.** `why` prints `at_least(2, ?W : vouch[main](?W,c1,?_$0))
[quorum: the first 2 members]` and each member, `#1 (w1) h=1`, with its
derivation. `whynot` says how far a group got and names what it has:
`at_least(2, ...) reached 1 of 2 [threshold]: #1 (w1) h=1`, adds `a member was
dropped: hole(Reason)` where a builtin dropped one, says `has no value:
hole(agg_type_error) [threshold]` where N is no integer, and with no member
at all goes on to ask why its one literal has no match.

**Proofs.** Seven cells, seven worlds, each red under a planted fault in
scripts/agg_breaks.ts (`thr_*`): `agg_threshold_syntax`, `_reflect`,
`_strata` (with `proves_recursion`), `_safety`, `_eval`, `_witness`, `_why`;
`agg_threshold_strata_stock` is coverage of the stock evaluator. The data is
examples/checks/agg-threshold-data.rofl (independent witnesses, the need_count
trick beside its old spelling, a recursive belief over a cycle, a negation
and a builtin inside, a threshold that is no integer, two Ns for one group
closed and inside the recursion with an N that is no integer beside one that
is, and members with two derivations whose text-least one rests on the
quorum or is higher) and
examples/checks/agg-threshold-raft.rofl: a Raft commit quorum whose N is the
cluster's majority, counted below it, a leader counting only its own term's
entries, an election by a majority of up-to-date votes, and the never-alarm
`lost_commit` (Leader Completeness), with the threshold held to a count both
ways. rust/rofl/tests/threshold.rs holds a 3 000-node recursive belief to a
fixpoint and its quorums and heights to an oracle computed in the test, the
quorums to the order the input arrives in, every budget cut to closed
quorums, a belief whose members have one to three derivations to an oracle
of least heights, and a 4 000-deep belief to steps linear in its depth.

**The old trick.** examples/goof walks a step's premises by index
(`need_count`, `holds_from`) and examples/moot a clause's requirements
(`req_count`, `ok_from`), because "every premise holds" over an open set was
a negation in a cycle. It is `need(S, N), at_least(N, K : needs(S, K, Q),
thm(Q))` now, and the eval world requires the two spellings to agree. The
examples are not retired here: that is w_agg_demo_quorum and
w_agg_retire_workarounds.

## The holistic aggregates, as built

w_agg_holistic, in the Rust engine; decision in
f_a_holistic_value_is_read_from_the_sorted_group.

**Syntax.** The body aggregate's own production, with three more operation
words, read by `rust/rofl/src/rofl_parse.rs`, `src/parser.ts` and ring 1 alike:

    M is median(V ; K : lat(G, K, V))            -- the key is mandatory
    Q is quantile(90, V ; K : lat(G, K, V))      -- the percent first
    Q is quantile(P, V ; K : lat(G, K, V))       -- P bound before it
    R is rank(S, V : score(_, V))                -- S bound before it; no key

quantile's percent and rank's subject are a first term READ FROM OUTSIDE, like
a threshold's N: an integer literal or a variable bound by a premise written
before the aggregate (the load door, `program.rs`), and a literal percent
outside 0..100 is refused there. They are never a member's: the projection is
the terms after them and the keys (`AggOp::params`). A variable one is shared,
so it is part of the correlation and of the cell's key. Reflected as
`$agg(quantile, Q, [P, V], [K], Body)` and `$agg(rank, R, [S, V], $nil, Body)`,
spelled canonically `?Q is quantile(90,?V ; ?K : ...)` in both engines.

**Shape**, judged by safety.rofl: median and quantile name a key
(`holistic_needs_key`: the values are a multiset, so two equal values under two
keys are two members); median takes exactly one value (`one_value`); quantile
and rank exactly two terms, the percent or subject and the value
(`param_and_value`); rank no key (`key_on_rank`: it ranks among distinct
values). The body binds what the aggregate projects (`member_unbound`), as for
count.

**Values, exactly.** Over the members' values sorted ascending, n of them, with
duplicates kept (they are distinct projection tuples):

- `quantile(P)` is the nearest-rank percentile, the r-th smallest with
  r = max(1, ⌈P·n/100⌉): quantile(0) is the least, quantile(100) the greatest,
  and the value is always a member's value, never an interpolation.
- `median` is quantile(50), the ⌈n/2⌉-th smallest: the **lower** median when n
  is even (`[10,20,30,40]` gives 20). That is the tie rule.
- `rank(S)` is S's position, from 1, among the **distinct** values in
  ascending order (`[2,2,9]`: rank 1 for 2, 2 for 9); a subject that is none of
  them has no row. A descending rank ranks the negations:
  `N is 0 - S, R is rank(N, M : score(_, V), M is 0 - V)`.

The value is computed from the sorted values (`AggOp::holistic`), so it is a
function of the member set and not of the order members arrive in; a law
battery in `cell.rs` holds it to a sort done in the test over random
multisets and shuffles.

**Holes and empty groups.** A member, a percent or a subject that is not an
integer, and a percent outside 0..100 held by a variable, is
`hole($cell(R, At, Tick, Key), agg_type_error)` and no row; a bad percent holes
even a group with no member. A member a builtin drops for an error holes the
group, as for count, and so does a member a hole outside left unknown ("What a
hole leaves out, read by an aggregate"): for a median, quantile or rank the
value of the members that survived is neither an upper nor a lower bound. An empty group has no row, correlated or grouped: the
holistic operations have no identity (no `empty_zero`).

**Stratified.** Class `Holistic` (`AggOp::class`): not `recursive`, so the
aggregate reads its inner relations as `premise_agg`, a strict edge, and a
median, quantile or rank through its own conclusion is refused (`reads a
closed relation`). There is no ⊕ and no Δ: a group is sealed once, after its
input closes, from every member at once.

**Witness: Group.** Every distinct projection tuple is a member, kept in
full whatever the value — (V, K...) for median and quantile, the distinct
values for rank — in the canonical order (height, then projection), with the
premises of its least-signature derivation, the cell's height its highest
member's. A rank whose subject is none of the values keeps its members and
holds no value. Rules read it as `agg_cell`, `agg_sealed`, `agg_member`,
`agg_member_prem`.

**One group, many percents or subjects.** The percent or subject is no member,
so when it is a variable the inner body does not read, every cell of one
correlation less it has the same group: it is solved and sealed once, and each
later cell shares its members, seals and height (`hol_share_key`,
`seal_shared`, `Store::add_cell_sharing`), its value answered from the group
sorted once (`Sorted`) by a binary search. The dump and the snapshot write the
shared members once, at the first cell in key order, and the others name it
(`mem K = K0`, `"membersOf"`); `agg_member` is still written per cell for a
rule that reads it. A percent the inner body reads (`V > P`) makes a group per
percent, and nothing is shared.

**why and whynot.** `why` prints `quantile(29,?V ; ?K :
ah_line[main](godd,?K,?V,?_$0)) = 4 [aggregate: 7 members, sealed
ah_line@2]`, then the digest of five members and `[2 more members: why all
...]`. `whynot` says `= 6, not 99 [aggregate]`, `has no value:
hole(agg_type_error) [aggregate]`, `has no value: empty group [aggregate]`, or
for a rank `has no value: 5 is not one of its 6 distinct values [aggregate]`.

**Proofs.** Seven cells, seven worlds, each red under planted faults of
scripts/agg_breaks.ts (`median_upper`, `quantile_floor`, `quantile_domain`,
`holistic_unsorted`, `rank_insertion`, `hol_*`, `plain_*`,
`strata_agg_edge`, `whynot_unranked_empty`, and twelve older ones). That rank
counts a value held twice once is held by the law battery in `cell.rs` only:
a rank member is its distinct value already, so no fault there can be seen
through the engine (f_a_holistic_value_is_read_from_the_sorted_group).
The worlds:
`agg_holistic_syntax`, `_reflect`, `_strata` (with `proves_refusal`), `_safety`,
`_eval`, `_witness`, `_why`. The data is examples/checks/agg-holistic-data.rofl
(odd and even counts, equal values under two keys, one pair from two sources,
a source dropped two negations deep, the two least values of a group arriving
last, one member, negatives, a zero divisor, a value that is no integer, an
empty group, a percent of 101, and subjects in, out of and outside the
integers, and a percent read inside the body), and the expected values are
written by hand, with their derivation, in agg-holistic-eval-check.rofl. The
eval world also loads agg-holistic-holes-data.rofl and -holes-check.rofl (a
member rule holed by a builtin's error, a max holed for a value that is no
integer, one group of two holed, and a conclusion that holds by a rule a
stratum higher, each read by a median, quantile, rank or count) and
agg-holistic-scale.rofl (a rank per member and a quantile at every percent
over one group of 2 000 values, which the default space wall cut when each
subject stored its own group: `hol_unshared`).

**Cost.** A group is solved, stored and sorted once per correlation less the
percent or subject: n members and n log n. A rank asked per member
(`place(P, R) :- score(P, S), R is rank(S, ...)`) is then n cells over that
one group, O(log n) each, so O(n log n) time and O(n) members for the whole
group (2 000 values in 0.1 s, 50 000 in 3 s). Before the sharing each subject
re-solved and stored the whole group, O(n²) in both, and one group of about
710 values reached the default space wall of 500 000 rows
(f_a_rank_per_member_stored_its_group_per_subject). Two things stay per cell:
`agg_cell` and `agg_sealed`, and `agg_member` when a rule reads it, which a
rule asking the members of every per-member rank cell pays n² for.

**Not built.** Interpolated quantiles, and any carrier but Int.

## Well-founded worlds and ticks, as built

w_agg_wfs_ticks, in the Rust engine; decisions in
f_no_cell_under_the_alternating_fixpoint_the_well_founded_world_is_read_from_below,
f_a_cell_carried_across_a_tick_is_read_as_of_its_tick,
f_a_lattice_value_crosses_a_tick_as_a_contribution and
f_a_kind_not_built_owes_its_wfs_and_ticks_to_the_item_that_builds_it.

**No cell under the alternating fixpoint.** Under `semantics(well_founded)`
every round derives under an assumption, the generous one and the mean one in
turn, and the rounds close on each other. A cell sealed in a round counts
facts that the next round may withdraw, and a member whose truth is
undefined leaves the value an interval, not a value: three wins and two
positions undefined is a count of 3, 4 or 5. A sound three-valued cell would
carry that interval; nothing asks for it, and a count of 3 with no
qualification would be a lie. So a program with a body aggregate (count,
sum, min, max, or, and, median, quantile, rank), a threshold or a lattice
declaration is refused when it is evaluated under well-founded semantics,
naming the construct and its rule and saying what to do instead
(`run_well_founded`):

    program rejected: count is not evaluated under well_founded semantics (rule r…): a cell
      sealed under an assumption counts facts that may not hold; evaluate the well-founded
      world below and feed its true and unknown rows to a stratified world that aggregates
      them (rofl-load --below)

The TypeScript engine refuses in the same words (src/aggeval.ts
`runWellFounded`).

**The world below.** What a well-founded world answers is two-valued once it
is done: the rows that hold and the `unknown(Atom)` rows of what is
undefined. `Session::feed_below(below)` feeds a world evaluated on its own to
this one before it evaluates: every live row, in a program's book, of a
relation a rule of the world below concludes (a rule both worlds hold, boot's,
is not its own), asserted rows of it included, and every `unknown` row, each
asserted as base by `below`. A row that holds is an answer however it came
to hold, so `p(a).` beside `p(X) :- q(X).` is fed with `p(b)`; what is not
fed is input alone, a relation no rule of the world below concludes (`q`:
the world above loads what it needs), and what its rules conclude into a declaration the kernel reads (`semantics`,
`sealed`, `stratum`): fed, `semantics(well_founded)` would make the world
above well-founded and refuse the very cells it exists for. A world below
that is not evaluated is refused. What it has no answer for, what a hole left
out, an undefined atom, or everything a wall cut, is fed as a shrug
(`$below` holes, "Shrugs, as built"), never as base, where it would read as
false. The world above reads `unknown(wg_win(X))` as a closed relation and
decides what an undefined atom counts as itself, reading `wg_win(X)` with
`not unknown(wg_win(X))` beside it: a draw, in the minimax demo. `rofl-load --below F` (repeated) builds the world below from
boot.rofl and the files F, under the run's `--budget`, `--space` and
`--strata`: a world below the space wall cuts is refused, never fed from
outside the wall; a file of a world loaded together names its world below
with a line `-- below: <path>.rofl`, which scripts/goldens.ts,
scripts/agg_select.ts and rust/rofl/tests/agg_worlds.rs read (the
TypeScript engine feeds it with `Rofl.feedBelow`), and a world below is
declared as a world of its own too (`agg_wfs_game`).

**A cell across a tick.** A conclusion staged `@next` at tick T is a base
fact at T+1 whose firing, stamped T+1, cites the cell sealed at T,
`$cell(Rule, At, T, Key)`. At T+1:

- the cell is data under its own name: `agg_cell`, `agg_sealed` and, when
  read, `agg_member` rows of every cell carried in are written at the start
  of the evaluation, beside the cells T+1 seals itself; a cell sealed at T+1
  for a conclusion `@next` is data at T+2, where its conclusion arrives,
  and not at T+1, where no reader of the reflection could be ranked above it;
- `why` reads a firing that cites a cell of an earlier tick, and a carried
  lattice value's firing, as staged: its premises, and the members of every
  cell of an earlier tick, are the facts of that tick, printed
  `tk_w[main](c,5)  <= r3883b70d @tick 0 [past tick]` with the rules its
  frozen `derived_by` rows name, or `[past tick]` alone for a fact that was
  base, and never explained by what the store holds under the key now
  (`render_past`); before, a member re-derived at T+1 printed T+1's
  derivation;
- the cell lives as long as a firing cites it, and a firing lives one
  boundary: a fact staged at T holds at T+1 for what staged it at T and for
  nothing it was staged by before, so a fact staged again drops the firings
  it arrived with and takes the new tick's. `why` at T+2 of a count staged
  at T and again at T+1 names the cell of T+1 and its members as of T+1,
  never the cell of T over a group that has since changed. The cell of T
  goes with its tick once no firing cites it. (A program with no cell keeps
  the reference's accumulation, src/store.ts `advanceTick`: both engines
  render its `why` alike, f_a_plain_staged_firing_is_explained_in_the_tick_it_arrived_in.)

`retain_ticks` (rofl-load `--retain N`) drops completed ticks' `derived_by`
rows, but never one of a fact a cell cites from a past tick while a firing
that crosses the boundary cites that cell, nor one of a premise of a carried
lattice value (`cited_past`, a third gate beside the two of `frozen_retention`).
It walks each cited cell's members once, however many firings cite it, and
`why` reads the frozen rows once per explanation, by fact and tick
(`past_rows`): both are linear in what is kept, not in its product with what
cites it (tests/tick_scale.rs).

**A hole across a tick.** A conclusion `@next` a hole reaches is not staged,
and it is not absent at T+1 either: it is unknown there, as it was at T.
The boundary writes each as a hole of the tick it would arrive in,
`hole($next(Rel, Persp, T+1, Args), Reason)` (`Args` a lattice cell's key or
a tuple's arguments, `$unknown_value` where one is not known, `$any` where
the perspective or the key was not bound; `support_withdrawn`, or
`fault_left_out` when only plain holes reached it), and T+1's evaluation
reads those rows back (`carried_unknowns`, so a snapshot reopened carries
them too) and carries each on as a hole of its own would be: a lattice cell
is a hole at its close, `support_withdrawn`, and the contributions staged
beside the unknown one go with it (a min over what was staged would be a
bound, not the value); a tuple is carried to what reads it, plainly or not
as it was reached. So over `lattice dist(A, C, min D)` with a weight that is
no number, the cells the fault holed at T are holes at T+1 and a count of
`dist(a, C, _)` there is a hole, not the number of cells that were staged;
and `best(k, Y)@next :- x(_, Y).` over an `x(b, _)` a fault left unknown
stages 6 and 8 beside it, and `best(k)` at T+1 is a hole, not 6. The next
tick is quiescent only if it carries the same unknowns as well as the same
facts. A conclusion `@next` a fault in its own rule's builtin kept from being
staged is carried the same way (`plain_fault`).

**A lattice across a tick.** `dist(A, C, D)@next :- dist(A, C, D).` stages a
contribution, not a fact of the lattice: the staged fact is a base fact of
`dist@next` at T+1 (a relation no program can write, since `@` is no letter
of a name), and the engine's rule `dist@next`, `dist(K..., V) :-
dist@next(K..., V)` in any book, makes it a contribution there like any
other (`carry_rule`): a worse value is dropped, a better one improves the
cell, and T+1's own rules improve on it in turn. Two values staged for one
key are both carried and folded; `whynot` lists the carried contributions as
`4 <= dist@next: dist@next[main](x,y,4)`, and `why` prints the carry, the
value staged, and the value of T it was staged from, as of T. The rule is the
engine's, so it is not reflected and safety.rofl does not judge it; the
staging rule itself reads the lattice from outside its recursion (a head
`@next` is no edge), so it fires once the lattice is closed.

**Proofs.** Sixteen cells, sixteen worlds, each red under a planted fault:
`agg_<kind>_wfs` for cell, count, sum, minmax, holistic, threshold, empty and
lattice (a fixture per operation refused inside a well-founded world, and the
kind over the game fed from below, by hand), and `agg_<kind>_ticks` for the
same rows, over examples/checks/agg-ticks-data.rofl and agg-ticks-holes.rofl
(the lattice over agg-lattice-ticks-data.rofl) with `check_opt(W, retain, 0)`
and `--explain` after the last boundary: the value staged at tick 0 is the
one read at tick 1 beside the value tick 1 computes, `why` names tick 0's
cell and its members as of tick 0, the carried cell is reflected under its
name and a cell tick 1 seals for a conclusion `@next` is not (the threshold
world stages a quorum that holds in both ticks so it has one); and what a
hole at tick 0 left unstaged is unknown at tick 1, so each kind's cell over
it there is a hole with no row (a threshold over one a lattice's hole
reached, since a plain one leaves a threshold silently short, as within a tick).
agg_cell_ticks runs three ticks: the cell of tick 0 is gone at tick 2 once
nothing cites it, tick 1's is here and keeps its members' tick-1 rows under
`retain 0` while an uncited row of tick 1 goes (`-- expect-row:`), and a
count of 1 staged at ticks 0 and 1 over two different members is explained
at tick 2 by tick 1's cell and member. agg_cell_wfs feeds an asserted row of
a concluded relation and not a relation that is input alone. The faults:
`wfs_admits_body_aggregate`, `wfs_admits_threshold`, `wfs_admits_lattice`,
`below_drops_shrugs`, `below_feeds_declarations`, `below_drops_unknown`,
`below_drops_concluded_input`, `carry_into_lattice`, `carry_why_present`,
`cell_why_present`, `retain_prunes_cited`, `carried_cells_unreflected`,
`next_cells_reflected_early`, `carry_drops_hole`,
`restaged_keeps_old_firing`.

**A plain staged firing** (f_a_plain_staged_firing_is_explained_in_the_tick_it_arrived_in),
one of a rule concluding `@next` that cites no cell, read tick T as a cell's
does, and both engines explain its fact premises as of T (`render_past`,
`renderPast` in src/api.ts): `tk_n[main](3)  <= rf5c64e22 @tick 1 [past
tick]` for the carry `tk_n(N)@next :- tk_n(N).` at tick 2, where it printed
`[cycle]`; `retain_ticks` keeps the rows it names while it crosses the
boundary. A fact staged again drops its old firings in every program, not only
one with a cell (src/store.ts `advanceTick`, and Rust's restage).

**The kinds built later** own their `wfs` and `ticks` cells in the item that
builds them: the join lattice's are in "The join lattice, as built", the
widening's in "Widening, as built", the tags' in "Tags, as built",
subsumption's in "Subsumption, as built".

## Holes, as built

w_agg_overflow_holes, in both engines where the construct exists in both;
decisions in f_a_negation_of_what_a_hole_left_out_succeeds,
f_a_plain_unknown_reached_a_rule_before_it_closed,
f_the_engines_placed_a_wildcard_negation_apart,
f_the_space_wall_cut_the_world_without_saying_so,
f_a_settled_lattice_was_holed_for_the_round_it_shared,
f_a_budget_cut_seals_no_partial_group,
f_arithmetic_wraps_past_the_term_range,
f_a_kind_not_built_owes_its_holes_to_the_item_that_builds_it,
f_a_wall_closed_a_lattice_a_plain_hole_had_not_reached,
f_the_carry_of_unknowns_ran_past_the_walls and
f_a_negation_scanned_every_unknown_of_its_relation.

**A value is an Int of [-2^60, 2^60), exactly, in both engines.** Arithmetic
past the range has no value: the premise fails and the rule is holed
`arith_overflow`, never a wrapped or rounded number, and -2^60 is a value. The
TypeScript engine holds an integer as a number where one is exact (within
±(2^53-1)) and as a bigint past that, one spelling per value (`normInt`,
src/unify.ts); literals, the dense reader and snapshots carry it exactly, and
`evalArith` computes a result that might pass 2^53 again as a bigint. A sum or
count past the range is `agg_overflow` on its cell, decided by the total
(accumulated in i128), a value of the wrong type `agg_type_error`, a lattice
value past the range a hole on its cell. `agg_int_range`, a world with no
aggregate that both engines answer, holds each of these: + - * / past the
range at both ends and through an intermediate (`X + X - X`), -2^60 a value,
results past 2^53 exact (`94906267 * 94906267`, which a double rounds), `/`
truncating and `mod` taking the dividend's sign, a negation above an overflow
undecided, and a literal of 2^60 refused; a planted fault in either engine's
range check, exactness guard, `mod` or literal reader reds it (`arith_wraps`,
`int_literal_wide`, `mod_floor`, and the TypeScript faults `ts_arith_range`,
`ts_arith_float`, `ts_mod_floor`, `ts_literal_range`, planted in a copy of
src/ by scripts/agg_breaks.ts).

**What a hole leaves out is not known to be false.** A rule holed by a
builtin's error leaves its conclusion under the failed solution unknown: a
tuple, `$unknown_value` where an argument was not bound. So does a fault below
a call to a relation answered on demand (the call's head under the solution it
was met in, and one call up at a time each call that read it: `demand_fault`,
`demandFault`), a body aggregate's cell holed, and a conclusion a hole kept
from being staged at the tick before. One algorithm, in `rust/rofl/src/engine.rs`
and `src/aggeval.ts`:

- A pending unknown is carried once its relation is closed (`plain_flush`,
  `plainFlush`), unless the tuple holds as a fact.
- It reaches a rule only once the rule's head relation is closed
  (`close_plain_rules`, `closePlainRules`): before level lv fires, every rule
  below lv is solved against every unknown carried so far, and one carried
  later reaches the closed rules at once. A rule still open could conclude
  another way the tuple an unknown would reach through it, and a monotone rule
  whose other premise closes later would find no solution yet; solved once
  closed, the set is a function of the program and not of the firing order.
- A positive rule solved over an unknown (its other premises over the facts
  and the unknowns; a builtin reading an unknown or an unbound variable passes,
  what it binds unknown) concludes an unknown, silently: its rule is not holed.
- A negation whose literal matches no fact but could match an unknown, or whose
  own call to a relation answered on demand faulted, is undecided: the solution
  is not concluded, the rule is holed `support_withdrawn` where its conclusion
  does not hold another way, and the conclusion is unknown in turn. A fact
  that matches still decides it. Below a call answered on demand such a
  negation gives no solution, and the call's head under it is unknown.
- A body aggregate that could read one is a hole on each group it could
  change ("Precise holes, as built"); a threshold a quorum reached without it stands, and one short of it is
  unknown; a lattice holds it as its cell's fault.
- A literal asks for the unknowns it could read by looking them up: each is
  indexed by relation, argument position and the value there (a value not
  known under `$unknown_value`, a whole relation apart), and the literal's
  most selective bound argument names the few to try, in the order they were
  noted (`unknown_cands`, `unknownCands`).
- A conclusion `@next` reached from one is not staged, its rule is holed, and
  the boundary writes `hole($next(Rel, Book, T+1, Args), fault_left_out)`
  (`support_withdrawn` when a lattice's hole reached it), which T+1 reads back
  as an unknown of its own; a tuple staged for certain writes none. Both
  engines write it, and quiescence compares the unknowns as well as the facts.
  So does a conclusion staged before a lattice's hole withdrew what it read
  (`settle_staged`, Rust, where lattices are): it stands on another firing
  over what stands, or is that unknown
  (f_a_staged_conclusion_outlived_what_a_lattice_withdrew).

Over `x(C, Y) :- d(a, C, D), k(C, K), Y is D + K.` with `k(c, oops)`,
`nx(C) :- node(C), not x(C, _).` concludes nx(e) and not nx(c), and holes its
rule; across a tick `absent(q) :- key(q), not y(q, _).` is neither concluded
nor staged when y(q, _) was not staged for a hole. Under well-founded
semantics what a hole leaves out is possibly true and not certainly: carried
through the model each round derives, and never withdrawn by the alternation,
it leaves the negation over it neither true nor undefined in any round: nx(c)
is a shrug inherited from the fault, not `unknown(nx(c))` (`wfs_unknowns`,
`wfsUnknowns`; "Shrugs, as built"; it was an `unknown` row until
f_a_negation_of_a_shrug_under_well_founded_semantics_is_no_paradox).

`unknown(A)` names what the alternating fixpoint leaves undefined: an atom its
generous round derives and its certain round does not, a paradox, and never
what rests on a hole. What a hole leaves out is not derived by
either round, so it has no `unknown` row: `x(c, _)` and `y(c) :- x(c, _)`
above are named by the rule's hole, as in a stratified world, and so is a
position whose one move is not known. Beside a hole, `unknown` is therefore
not every atom that may hold, and a rule that reads it, positively or under
`not`, would read it as if it were: `decided(X) :- pos(X), not
unknown(win(X))` would conclude `decided(c)` for the position whose move a
fault left out. A program with a rule reading `unknown` is refused when its
world holds a hole, in both engines ("unknown is read in a world a hole
reached", f_unknown_is_read_as_complete_beside_a_hole); a world with a hole is
refused as a world below for the same reason. The refusal holds under the
default stratified semantics as well: there `unknown` has no row at all, and
`not unknown(win(X))` beside the overflow hole that left out c's move
concluded `decided(c)` in both engines until the check left the well-founded
path (f_unknown_beside_a_hole_was_guarded_only_under_well_founded). **These
refusals are gone**, replaced by propagation ("Shrugs, as built"): what a hole
left out, A, makes `unknown(A)` a shrug, read positively or under not; a world
below is fed what it has no answer for; and `agg_unknown_beside_hole`
(`_strata` for the stock evaluator) now holds the four programs' answers. So
is the refusal of a negation of `unknown` under well-founded semantics
(f_a_negation_of_unknown_was_judged_before_unknown_was_written): the rules
reading `unknown` run as a level above the alternation.

*Where holes are more conservative than they need be* (sound, not complete).
A threshold is now decided under every completion where it can be ("Shrugs,
as built"). A lattice cell any unknown candidate reaches is holed,
though a known value may bound it: a min over a finite path and an overflowing
one is a hole and not the finite value, because an overflow does not carry its
sign, and an unknown value does not carry a bound. Each is the unknown taken
at its widest, which holes more than needed and never less
(f_holes_are_wider_than_the_unknown_they_carry).

**A wall is a hole on the world.** Either wall, the budget or the space,
writes `hole($adhoc, budget_exhausted | space_exhausted)` (`$load(N)` or
`$tick(T)` for the TypeScript host's own evaluations), leaves the evaluation
partial and not dirty, and stops the rules of the world: what they would have
concluded is absent, and the world hole says why. A budget cut is a hole,
never a smaller value: the wall unwinds from wherever it falls, a body
aggregate fires only after its input round has closed, and a cell sealed
before the cut read a closed relation, so no count, sum, best, median,
quantile, rank or empty group's 0 is read from a group cut short; a quorum
reached before the cut stands (it is monotone). Every lattice not yet closed
is holed with the wall's reason, its values bounds, but one the wall did not
reach: a lattice none of whose dependency cone is unsettled where the wall fell
(no rule into it unfired in the batch being fired or not yet activated, no
relation of it with news in the front being propagated or built) had fired
every rule on every fact and is closed as it would have been
(`close_settled`). What a plain hole left unknown and no carry has reached yet
(`plain_pending`, `plain_undecided`, `lat_undecided`) could still reach a
lattice, so the relations it names unsettle what reads them.

**The carry is work, and the walls bound it.** Carrying what a hole leaves out
runs inside closes that lift the walls, and it can be far larger than the
program's facts (one fault read by a rule over three `n` premises is n^3
conclusions not known). It is charged against the walls the evaluation started
with, on a count of its own: every solution it extends or produces and every
unknown a lookup looks at is a step, every unknown it stores a row
(`carry_charge`, `carry_check`; `carryCharge`, `carryCheck`). A wall that
falls in it cuts the world as any wall does. A carry the wall broke into
leaves what it would have reached not known, so at that cut no lattice is
closed as settled (`carry_broken`). The cut's own carry is charged afresh
against the same walls; when it too runs out, every lattice not closed is
holed whole, `hole($lattice(Rel), Reason)`, with no value (`lattice_cut`).

**Kinds not built** (the sugar) owe their `holes`
cells to the item that builds each (the tags' and subsumption's are in their
own sections): a value past the range is a hole on its
cell, a cut the relation's hole with its values bounds, avg's rounding and
empty group follow sum and count. The join lattice's are in "The join
lattice, as built", the widening's (its marker a hole) in "Widening, as
built".

**Proofs.** Eight cells, sixteen worlds, each red under a planted fault:
`agg_<kind>_holes` for cell, count, sum, minmax, holistic, threshold, empty and
lattice, over `examples/checks/agg-holes-data.rofl` (a group with a member not
known, one whose sum leaves the range and whose successor does, one whose only
member is not known, and one empty for certain; the lattice's own data in its
check file), each kind and a negation above it; `agg_cell_holes` also loads
`holes-negation.rofl`, `agg_cell_holes_ticks` `holes-negation-ticks.rofl` and
`agg_cell_holes_wfs` `holes-negation-wfs.rofl`, the worlds both engines
answer (`holes_negation`, `holes_negation_ticks`, `holes_negation_wfs`, one
golden for the two); `agg_<kind>_budget` for count,
sum, minmax, holistic and empty over `agg-budget-data.rofl`, cut at 500
steps while the closure their aggregate reads is still being derived, and
`agg_lattice_budget`, a settled lattice beside a diverging one;
`agg_lattice_plain_budget` and `agg_lattice_plain_space`, a lattice over what
a plain hole left out, cut before it was carried; `agg_lattice_carry_cut`, a
wall inside a carry, and `agg_lattice_cut_fallback`, a cut whose own carry
runs out; `agg_carry_budget`, `agg_carry_space` and `agg_carry_plain_budget`
(`agg_carry_plain_budget_ts` in the TypeScript engine), a carry far wider than
its facts; `agg_cell_holes_scale` (`holes_negation_scale` in both engines),
1001 negations over 500 unknowns inside a budget a scan runs past. A decided
answer is a row the state must hold (`-- expect-row:`), never an alarm
`not answer`, which is undecided and silent exactly when the answer is wrongly
held unknown (f_a_missing_row_check_goes_quiet_over_a_hole). The faults:
`plain_neg_decides`, `plain_neg_unholed`, `plain_reader_unclosed`,
`demand_fault_unspread`, `wfs_unknowns_decide`, `arith_wraps`, `wrap`,
`plain_rule_hole_unspread`, `agg_seal_at_wall`, `lattice_settled_cut`,
`space_uncut_world`, `plain_unknown_settles`, `carry_unwalled`,
`carry_broken_settles`, `cut_carry_unrenewed`, `cut_fallback_off`,
`unknown_scan`, `neg_unknown_unbound`, `plain_positive_holed`.
`tests/agg_worlds.rs` cuts a world with every kind at every budget from one
step to the whole evaluation and requires each row of the cut state to be a
row of the whole one (`a_budget_cut_never_seals_a_partial_group`), cuts three
lattices over what holes left open at every budget and every space and
requires each lattice row to be the whole evaluation's or to stand under its
lattice's wall hole (`a_cut_never_publishes_a_lattice_value_a_hole_left_open`),
and holds every world's `expect-row` lines, a walled world's to its cut
state.

Both engines hold all of it, the aggregates' and the lattices' holes as the
plain unknowns, the negation, the walls and the integers (w_agg_ts).

## Shrugs, as built

w_agg_shrug, decided by the owner 2026-09-29; decisions in
f_a_shrug_is_the_third_answer, f_a_negation_of_a_shrug_under_well_founded_semantics_is_no_paradox,
f_a_threshold_under_every_completion_is_decided,
f_a_threshold_counted_a_member_a_negation_could_not_decide and
f_rules_that_read_shrug_fire_after_the_rows.

**Three answers.** A literal holds; is unentailed, a definite closed-world
no; or is a **shrug**: no answer, with a reason and structured meta. The shrug
is a kernel relation, `shrug(Target, Reason, Meta)` in `[$kernel]`, written
after every evaluation (`write_shrugs`, `writeShrugs`) and read by rules like
any other: `faulty(T) :- shrug(T, fault, _).` The reasons are a closed
vocabulary with their text, `shrug.rofl`, compiled into `src/kernel-dense.ts`
(`SHRUG_DENSE`) and read by both engines (`rust/rofl/src/shrug.rs`,
`src/shrug.ts`); extending it is one fact:

| Reason | Meta | From |
| --- | --- | --- |
| budget | `spent(Kind, Spent, Limit)`, Kind `steps`, `rows`, `depth` or `alternations` | a wall, on the evaluation (`$adhoc`) and on each lattice it left open |
| fault | the cause: `arith_overflow`, `arith_type_error`, `agg_overflow`, ... | a builtin's or a fold's error, on its rule, cell or lattice cell |
| divergence | `cycle(Cells)`, the cells of its own improving cycle: one component of the graph of first firings, never another cycle's | `improving_cycle` |
| paradox | `cycle(Rels)`, the relations it rests on that lie on a negative cycle (a component of the rules' dependency graph with a negation or a strict aggregate read inside it; a positive recursion is none); `below` when the world below fed its `unknown` row (`asserted_by(F, below, _)`): its cycles are that world's, named by that world's rows | an atom the alternating fixpoint leaves undefined (`unknown`) |
| given | `stated` when a book asserted the row as a fact, `concluded` when a rule of a book concluded it | an `unknown(A)` row the alternating fixpoint did not write and no world below fed (`wfs_written`, `wfsWritten`): a book's own word that A is not known, resting on no cycle (f_a_hand_asserted_unknown_row_reads_as_a_paradox_with_no_cycle) |
| conflict | `parties(Ps)`, the values in conflict in canonical order | a subsumptive cell whose dominance is no strict partial order over its values (`dominance_cycle`, `dominance_intransitive`; "Subsumption, as built") |
| federation | `at(Address)` | a cold volume (`cooled_to_disk`), a sealed relation |
| widened | `within(V)`, the value the cell closed on, an enclosure of its least value | a cell of a relation declared `widen N` that was widened (`widening_forced`; "Widening, as built") |
| inherited | `from(Roots)`, `earlier(T)`, `below` | what reads a shrug; `support_withdrawn`, `fault_left_out`, `left_out_below` |

Each hole cause is a `shrug_cause(Cause, Reason, Text)` fact; a cause the
vocabulary does not declare is a defect (`Halt::Bug`), never a row. A target
is the hole's (`$rule(R)`, `$cell(...)`, `$lattice(...)`, `$next(...)`,
`$below(...)`, `$adhoc`) or the atom itself, a position not known holding the
unknown value (`x(c, _)`, stored `x(c,$unknown_value)`), `in(Book, Atom)` in
another book, `every(Rel)` for a whole relation.

**Roots.** An inherited shrug names the root targets it rests on, sorted:
every hole target it reaches back to that nothing reached, over the edges the
carry recorded as it went (`unk_edges`, `unkEdges`: an unknown from the
unknown or hole it was reached from, a withdrawn rule or cell from what it
read; a cell the settle withdraws, from the fact its lost firing cited, never
from whatever unknown the carry last worked on). The edges are a function of
the program and the unknowns, so the roots are, and both engines write the
same rows: two programs alike but for how their constants sort name the same
roots (`agg-shrug-lattice-roots.rofl`, `withdrawn_cell_stale_src`,
f_a_withdrawn_cell_rested_on_the_last_unknown_the_carry_met). They are computed for every node at
once, over the edges condensed into strongly connected components
(`root_sets`, `rootSets`): a row per unknown is as wide as the carry
(f_a_shrug_per_unknown_is_as_wide_as_the_carry). A shrug staged across a tick rests
on its `$next` hole, `earlier(T)`; one fed from a world below on its `$below`
hole, `below`. A threshold group left open rests on every unknown its members
that are not certain read, whichever reached it last (`thr_open_unknowns`).
Under well-founded semantics an undefined atom is a root too: what a hole
left out and a paradox both reach (`mix() :- p(), not h(z).`) names the
fault's target and `p`, each undefined atom a derivation of it reads over the
facts, the unknowns and the undefined atoms, positively or under not
(`paradox_edges`, `paradoxEdges`, solved once as the rows are written).

**Propagation.** `not` succeeds only on unentailed. A negation, a builtin, a
body aggregate, a threshold or a lattice that reads a shrug is a shrug,
inherited; "Holes, as built" is the machinery, the carry of what a hole left
out. What changed:

- **`unknown(A)`** of what a hole left out is a shrug too, noted with A
  (`meta_of`, `metaOf`) and carried as it is: a rule reading `unknown`,
  positively, under not, or in an aggregate's body, gets a shrug, never a
  definite row. The relations that read `unknown` or `shrug` sit above every
  other: `peel_rounds`/`peelRounds` rank them after the rest, and the stock
  evaluator lifts them above what its table ranks (`rank_unknown_cone`,
  `rankUnknownCone`), with a relation its table does not rank just below them.
  A strict reader (`not`, an aggregate) that could read an `unknown(A)` of a
  relation that itself reads `unknown`, noted after it fired, is refused
  (`meta_late`). This replaces the refusal of a program that read `unknown`
  beside a hole.
- **Rules reading `shrug`** fire after the rest of the first level that holds
  one, and after the rows are written once (`shrug_snapshot`); the rows are
  cleared when an evaluation starts. A row the readers' own shrugs add at the
  end, or one they withdraw (a reader's conclusion made the row's target hold,
  so what it read is not the final state: `b(X) :- shrug(a(X), _, _).` with
  `a(X) :- b(X).`), that a reader could read (its literal takes the row and
  the rest of its body has a solution), refuses the program. Not when a wall
  fell after the readers fired: the rows at the end are the cut's, the hole
  says so, and the evaluation is cut short rather than refused
  (`write_shrugs(cut)`, `writeShrugs(cut)`;
  f_a_wall_after_the_readers_of_shrug_was_refused_as_a_late_shrug).
- **Under well-founded semantics** what a hole left out is carried through the
  alternation and never withdrawn by it, and the alternation settles only when
  the carry does, so it is in neither limit: an inherited shrug, and no
  `unknown` row. A paradox is a cycle's alone. Since the carry only grows, a
  fault met under an over-estimate the alternation later leaves behind would
  stay carried (`f(z) :- not w(z), <overflow>` faults in the first round,
  where w(z) is not yet known, though w(z) holds); so an alternation that
  settles with anything carried runs again from the under-estimate it settled
  on, its carry, roots and hole rows forgotten, until a run settles where it
  started (`alternate`): every fault then carried was met under the final
  estimates, and f(z) is unentailed. A program with a hole thus alternates at
  least twice over. The rules reading `unknown` are a level above: the
  alternation runs without them, its undefined atoms are fixed as `unknown`
  rows, and it runs again with them, from the lower level's under-estimate
  (nothing below reads the level, so it is one of the upper level's too): a
  level that took a hundred alternations is not paid again, but a program
  with one reader of `unknown` pays at least two more alternations of the
  whole program, hole or none. `unknown(A)` of an atom the upper level leaves
  undefined is refused.
- **A world below** is fed what it has no answer for, not refused: each atom
  it names a shrug (a paradox included) as `hole($below(Rel, Book, Args),
  left_out_below)`, and every row of a relation it feeds when a wall cut it;
  the world above carries each as what a hole left out. An undefined atom
  below is thus a shrug above as well as an `unknown` row; read it through
  `unknown`: `count(X : win(X), not unknown(win(X)))` counts the certain wins,
  and is decided.
- **The structure around an unknown value is known**: `unknown(v(b, _))` does
  not match `unknown(lose(b))` (`unify_unknown`, `unifyUnknown`). A nullary
  atom is named bare, `unknown(q)`: `q()` is a literal and never a term, and
  both parsers refuse it in argument position.

**Decided under every completion**, only where soundly decidable:

- A **threshold** (Rust): if the members that hold for certain (facts, and no
  negation that could read an unknown) reach N, it holds; if even every member
  that could hold (the inner body over the facts and the unknowns, a negation
  that could read one passing) is short of N, it is decided short,
  unentailed; between, a shrug. A member whose value is not known could be
  any number of members, so a group with one is never decided short
  (`thr_verdicts`, `thr_short`, `thr_uncertain`). A group with no member
  under any completion, certain or possible (`at_least(1, Y : e(a, Y),
  p(Y))` with p(d) out of reach), is short of any N above zero, correlated or
  not, and so is what a recursive threshold builds on one.
- A **body aggregate** whose inner body reaches an unknown only through a
  solution the rest of the body refuses is decided: `count(X : p(X), w(X), X
  != c)` with w(c) left out counts the rest (`agg_possibles` with
  `poison_solve_plan`). And a group the unknowns cannot change is decided,
  whatever they do to the others ("Precise holes, as built").
- A **negation** of an atom that holds another way, and a positive rule whose
  other premise fails for certain, are decided, as they were.
- **Not decided** (a shrug, sound, not complete): a min or max a member
  reaches whose value is not known, though the known value is below every
  known candidate, since a value a hole left out carries no bound (an
  overflow does not carry its sign); a comparison over a count or
  a sum a shrug reaches, though the value lies in an interval; `unknown(A)` of
  a fault's left-out atom under stratified semantics, though a stratified
  completion leaves nothing undefined: it is read as no answer about A.

The **completions oracle** (`agg-shrug-oracle.rofl`) enumerates by hand the
two unknowns of a small threshold program, four completions, and holds every
verdict of the engine to them (groups with members, and groups with none,
correlated, uncorrelated and recursive): holds only if it holds in all, unentailed only
if in none, a shrug only if they disagree.

**Surfaces.** `?` lists the shrugs a literal names beside the rows that hold,
with the bindings they give (`_` where a value is not known) and the line
`L is a shrug: Reason, reason text; Meta` (TypeScript `QueryResult.shrugs`
and the repl; Rust `Answer::shrugs` and rofl-serve's `ask`). `why` of a shrug
is that line, then each root with its own line, and a rule root's text.
`whynot` of a shrug says `no answer, a shrug` and why, then the
demonstration; of an unentailed literal, the failed premises as always. The
sentence form is `phrase(shrug, ...)` in `facts/phrases.rofl` ("The sentence
form, as built").

**Proofs.** The `shrug` column (`obligation(shrug)`, authorised by
`obligation_authorised` in `rules/agg.rofl`): `agg_cell_shrug` (both engines:
roots, inheritance through a positive rule, a negation and `unknown`, a
structure decided, rules over the rows, both late refusals, a volume cooled
to disk),
`agg_cell_shrug_wfs`, `_wfs_upper` and `_wfs_history` (both), `agg_cell_shrug_ticks` (both),
`agg_cell_shrug_strata` (the stock evaluator, both), `agg_cell_shrug_why`
(Rust, the explain bridge), and `agg_<kind>_shrug` for count, sum, minmax,
holistic, empty, threshold (with the oracle) and lattice
(`agg_lattice_shrug_wall` for the budget and divergence reasons). The
converted worlds `agg_unknown_beside_hole`, `holes_negation_wfs`,
`wfs_unknown_negated` and `agg_cell_wfs` hold answers where refusals were.
The TypeScript surfaces are asked by `scripts/goldens.ts` (`shrugSurfaces`),
since a world cannot call a host verb. The faults: `shrug_meta_off`,
`shrug_rows_off`, `shrug_unknown_unranked`, `shrug_structure_wild`,
`shrug_wfs_one_level`, `shrug_wfs_carry_reset`, `shrug_thr_neg_decides`,
`shrug_thr_bound_off`, `shrug_late_unrefused`, `shrug_meta_late_unrefused`,
`shrug_wfs_upper_unrefused`, `shrug_edges_off`, `shrug_whynot_as_failure`,
`shrug_snapshot_off`, `shrug_standing_off`, `below_drops_shrugs`,
`shrug_withdrawn_unrefused`, `shrug_thr_empty_undecided`,
`shrug_wfs_history_kept`, `shrug_paradox_any_cycle`, `shrug_cycle_merged`,
`below_paradox_meta_off`, `shrug_thr_cosource_off`, `shrug_thr_first_root`,
`withdrawn_cell_stale_src`,
`shrug_paradox_root_off`, `shrug_paradox_neg_off`, `nullary_compound_term`,
and the TypeScript `ts_shrug_*`.

The aggregates' shrugs and the kernel's (plain rules, negation, builtins,
walls, well-founded semantics, ticks) are both engines', and so is the explain
bridge (`Rofl.explainRequests`, w_agg_ts). The kinds not built owe their
`shrug` cells to the items that build them. No glyphs: the rows and the text
are the surface.

## Precise holes, as built

w_agg_precise_holes, 2026-09-30, in both engines; decisions in
f_a_hole_reaches_the_groups_it_could_change and
f_a_median_a_member_could_join_was_held_open; the question left open,
f_a_member_whose_group_is_not_known_reads_as_every_group.

**What changed.** A body aggregate whose inner body could read something a
hole left out held its whole correlation a hole: no cell at all, every group
of a grouped aggregate withdrawn and every key of a counting tag with it
(f_a_counting_tag_fault_holes_every_key_of_the_tag). Now a hole reaches
exactly the groups whose value it could change; every other group is sealed
with its value, and what reads it is decided, a negation above it too.

**The possible solutions.** Before a correlation is sealed, each literal of
the inner body is solved over each unknown it could read, the rest of the
body over the facts and the unknowns (`poison_solve_plan`), as before; each
solution is kept as a POSSIBLE member (`agg_possibles`, `aggPossibles`): the
group it would fall in (a position `None` where the unknown leaves it open),
its projection (`None` where that is not known) and whether it passed a
negation that could read an unknown, so that a member the group holds might
be out. A solution the rest of the body refuses is none, as before; so is one
whose negation a fact decides (`neg_decided`, `negDecided`: `not p(K, _)`
with p(k, 1) held takes k away in every completion, whatever the unknown
p(k, ?) beside it is), asked with the negation's own variables left open and
only where every other argument is known.

**Decided under every completion, per group** (`reach_of`, `reachOf`). The
group's known members hold in every completion (one a negation may take away
is a possible of its own), and so does its value over them. So does a fault
they make (`fault_certain`, `faultCertain`): a member no fold reads, or a
percent or subject none reads, is `agg_type_error` whatever joins it (the fold
stops at the first; a sum's total is checked only at its finish), and a sum's
`agg_overflow` stands when the total is out of range at both ends of what the
possibles could add or take away. Such a group keeps its fault's hole and
shrug (f_a_fault_every_completion_keeps_was_withdrawn). Otherwise a possible
in the group's pattern changes it when it may take a member away or its
projection is not known; one whose projection a count, sum or holistic group
already holds (they are sets of projections) does not. A new projection
carries every unknown that could add it, and a group it moves rests on each of
them (f_a_projection_two_unknowns_add_named_one). The new ones are decided
together, by the kind's algebra:

| Kind | Unmoved by every subset of the new members when |
| --- | --- |
| count | there is none |
| sum | each is 0, and the group has a value already (a 0 makes a group with no member: f_a_zero_made_sum_group_was_decided_absent) |
| min, max, or, and | none is better than the value (a tie is not) |
| median, quantile | the value is the same with every lower one added, and with every higher one added: the rank the value is read at moves by at most one a member, so these two are its extremes |
| rank | the value is the same with all of them added: a rank only grows, and a subject absent stays absent unless one of them is it |

A group so decided is sealed with its value; a group changed is sealed as
`CellValue::Hole(support_withdrawn)` with its known members, its hole row
`hole($cell(Rule, At, Tick, Key), support_withdrawn)` resting on the unknowns
that change it (their shrug `inherited`, rooted where they are). A group only
a possible could make, its key known, is a cell of its own with no member and
the same hole. A possible whose group is not known holes the correlation
beside the groups sealed, `$cell(Rule, At, Tick, Corr)`, and each sealed group
it could change on its own cell. A holistic group sealed under unknowns is its
own, never shared across percents or subjects.

**What the rule concludes.** At every firing, not only the one that sealed
(the aggregate is sealed once per correlation and read by each solution of
what precedes it), each sealed group the possibles change is undecided for
the unknowns it rests on with its group bound, and each possible no sealed
group names, with what it binds (`agg_reach_undecided`,
`aggReachUndecided`): the conclusion is unknown, `cnt(g1, $unknown_value)`,
and carried as any other. What that is, is decided ONCE PER CORRELATION, at
the firing that first reads it (`ReachMemo`, `reach_memo_of`,
`reachMemoOf`): the possibles, each group they change with the unknowns
`seal_cells` sealed it under (`cell_reach`, never judged again against the
withdrawn value, which every possible would move), and the patterns no sealed
group names; every later firing binds and pushes. The possibles are indexed by
their group (`PossIndex`), and an undecided solution carries every unknown
that leaves it undecided, so the rest of the rule's body is solved once for
all of them (f_a_undecided_was_decided_again_at_every_firing;
`agg_precise_scale`: 401 firings over 401 unknowns inside a budget of 20 000,
160 801 steps when decided again at every firing).
A group's own cell hole is not carried a second time (`plain_agg_holes` skips
`support_withdrawn` cells).

Over `x(G, K, Y) :- v(G, K, X), Y is X + 1.` with `v(g1, b, oops)`,
`cnt(G, N) :- N is count(K : x(G, K, _))` holds `cnt(g2, 2)` and is a shrug on
g1 alone; a counting tag with one derivation off its carrier keeps every
other key's count.

**The completions oracle** (`agg-precise-oracle.rofl`) enumerates what
`agg-precise-data.rofl`'s holes left out: seven tuples whose truth is not known
(g7's member of 0 on g3's bit: no aggregate reads the two groups together),
the group of a member whose group is not known and a group variable of
another, 1024 completions, each aggregate recomputed in each over what is
certain. For every aggregate and group: a value held is every completion's; a
value every completion agrees on is held and not a shrug (the precision
claimed: `agreed_not_held`, `agreed_but_shrug`); a shrug on a group's own key
is one the completions split on; a group they split on is a shrug, by its key
or by a key left open. It covers count, sum, min, max, median, quantile, rank,
a negation in the body (one an unknown decides and one a fact does), a group pair with one position open, a group left
open whole, the correlated count and sum with an empty group's 0, a
counting tag, and a group only a member of 0 could make (a sum of it 0 or
none, a correlated sum 0 either way). A group whose known members fault is
held by `agg_precise_holes` instead (e1 to e4: a type error and an overflow
kept, an overflow a possible could mend withdrawn): the oracle's own
recomputation of it would fault in every completion.

**Not decided** (sound, not complete). A possible member whose group is not
known makes the conclusion of the group it could make unknown with that group
open, `wc($unknown_value, $unknown_value)`, which a reader downstream matches
against every group, a decided one too (f_a_member_whose_group_is_not_known_reads_as_every_group).
Several possibles resting on one unknown are judged as if independent, which
may hold open a group no completion moves. A comparison over a count or sum a
shrug reaches stays a shrug, as before.

**Proofs.** The holes and shrug cells of count, sum, min_max_strat,
holistic, empty_group and tag_counting are closed again by
`agg_precise_holes` (a hole on each group the unknowns could change and on no
other, the others' values and the negations above them decided, a group only
a possible could make, the correlation of an open pattern, every firing
undecided) and `agg_precise_oracle`; the tag's worlds (`agg_tagc_holes`,
`agg_tagc_shrug`, `agg_tagc_ticks`) are rewritten from every key withdrawn to
its own. The faults: `agg_reach_whole`, `agg_reach_neg_certain`,
`agg_reach_neg_fact_ignored`,
`agg_reach_dedup_any`, `agg_reach_bound_any`, `agg_reach_sum_zero`,
`agg_reach_holistic_low_only`, `agg_reach_fresh_off`, `agg_reach_first_only`,
and, from the review, `agg_reach_fault_relabel`, `agg_reach_overflow_kept`,
`agg_reach_sum_empty`, `agg_reach_alias_first`, `agg_reach_redecide`,
`agg_reach_unmemo` (`agg_precise_scale`), and their `ts_agg_reach_*` twins.

## The join lattice, as built

w_agg_join_lattice, in the Rust engine; decisions in
f_a_join_value_is_a_canonical_term_the_join_builds,
f_a_join_contribution_is_a_fact_of_its_own,
f_a_cover_is_taken_lowest_first_and_ranked_by_height and
f_a_join_grows_by_what_it_is_given.

**Syntax.** A declaration names a join where an order lattice names an
order, read by `rust/rofl/src/rofl_parse.rs`, `src/parser.ts` and ring 1
alike, and two builtins read a join's value:

    lattice reach(X, union S).         -- sets
    lattice range(N, hull I).          -- intervals
    lattice flags(N, bitor B).         -- bitsets

    E in S          -- E is a member of S; enumerates E when E is not bound
    A subset S      -- A is below S

    latdecl := 'lattice' ident '(' [ term ',' ]* latop term ')' '.'
    latop   := aggop | union | hull | bitor

`union`, `hull`, `bitor`, `in` and `subset` are words, not keywords: `in` and
`subset` are operators only where an operator can stand, as `is` is, and all
five are names everywhere else. A join is named only by a declaration: there
is no body aggregate `S is union(...)` (the parser refuses it), and `not X in
S` is refused, since `not` negates a literal. Both builtins have their `mode` row, `in`
binding its left from its right as `is` does, so the kernel's own audit finds
every builtin moded.

**Values, canonical.** A value is a term of its carrier in one spelling, so
that two equal values are one hash-consed term and one fact key, and
`canonical_state` and the hash agree (`AggOp::join_canon`, rust/rofl/src/cell.rs):

| Join | Value | ⊔ | ⊑ |
| --- | --- | --- | --- |
| `union` | `set(E, ...)`, at least one ground element, in the kernel's order (the order of their canonical text, so `set(10,9,a)`), no repeat | the set of both sets' elements, merged in that order | every element of one is the other's |
| `hull` | `iv(Lo, Hi)`, two integers, `Lo <= Hi` | the least interval holding both | inside |
| `bitor` | an integer of [0, 2^60) | bitwise or | every bit set in the other |

A contribution written in another order or with a repeat is that one value
(`set(b, a, b)` is `set(a,b)`).

**A set has one spelling wherever it is written**
(f_a_set_is_one_spelling_wherever_it_is_written). Every ground set a program
writes is its canonical value before anything runs, inner sets first: a fact
of a plain relation, a pattern in a body or under `not`, an operand of `=`,
`in` or `subset`, a term an aggregate counts, an `explain_request`, and a
question, `why`, `whynot` or asserted fact at the session's doors
(`canon_set_literals`, rust/rofl/src/cell.rs, through `program::to_clause`;
`canonSets`, src/unify.ts, through `addClause` and every question). So
`r(k, set(b, a))` reads the cell holding `set(a,b)`, `S = set(f(a), -5,
"str")` holds of `set("str",-5,f(a))`, `q(set(b, a)). q(set(a, b, a)).` is
one fact, and `why r(k, set(b, a))` explains the value. The TypeScript engine
does the same for a plain relation, so a set held in one is one fact in both
engines. A set written with a variable and more than one element has no
spelling until it is bound (`set(Y, b)` would match `set(a,b)` and not
`set(b,c)`, by the order its variables fall in), so it stands only where the
kernel makes it canonical as it reads it: a join head's value (its
contribution, canonicalised as it is given), either side of `subset` and the
right of `in`. Anywhere else, the left of `in`, an element of another set, a
body pattern, an `=`, a plain relation's head, a question, it is refused
(`is a set written with a variable`; `set_pattern` for a head the safety pass
finds is no join); `set(X)` has one spelling and stands anywhere. A join's value slot in a body, positive,
negated or in an aggregate, takes a variable, a value of its carrier, `set(T)`,
or `iv(A, B)` of variables and integers; anything else could never hold and is
refused (`join_value_off_carrier`: `r(k, oops)` of a union, `r(k, iv(3, 1))`,
`r(k, -1)` of a bitor). There is no empty set and no empty interval:
the bottom of a join lattice is a cell with no fact, so a block no variable
is live into has no `live_in` row. A contribution outside its carrier (an
atom where a set is due, `iv(3, 1)`, a negative bitset) is a fault the close
decides, `agg_type_error`, and the cell's hole, as an order lattice's is.
The three joins are total, so no join gives two answers for one key: a
`conflict` comes from a subsumptive cell alone ("Subsumption, as built").

**The join builds a new value.** A rule's conclusion into a join lattice L is
a *contribution*, a fact of `L@join` (a relation no program can write, as
`L@next` is), with the firing that made it and its `derived_by` row. It is
folded into L's cell: the first makes the cell's fact; one below the value
changes nothing; any other supersedes the value with the join of the two, a
value neither was (`set(y)` carried across a tick and `set(z)` concluded
there are `set(y,z)`). The superseding fact is concluded by the engine's
rule `L@join`, from the value it replaced and the contribution that widened
it (from the contribution alone when that is the join): a step of the
history, as an order lattice's superseded values are its history. Readers
inside the recursion fire again on the new fact, as they do on an improved
min.

**Recursion, monotone reads** (safety.rofl, LATTICES). A join is idempotent
(`idempotent_op(union)`, `hull`, `bitor`), so the recursion gate lets it
recurse. Inside its recursion its value may be used only
(`better_move(union, grow_set)`, `grow_iv`, `grow_bits`, `join_move`,
`join_read`):

- as the value of a head of the same join, directly;
- as S in `E in S`, whose E is then an element and may be used any way at
  all (a membership stays true, and enumerates more, as S grows), and in
  `A subset S`, A not reading the value.

Refused, `lattice_nonmonotone`: an equality on the value, arithmetic on it
(the steps `V + E`, `min(V, E)` are an order's, `order_move`), a comparison,
the value on the left of `subset`, a constant in the value slot, a value of
another carrier (a set into an interval's head), and an order lattice's value
made into a set (`set(M)` of a max: the set of every value the max passed
through). `E in S` binds E only from a bound S (`binds_at`, `unsafe_rule`).
An order lattice may read a join by membership inside one recursion, and a
join may read an order lattice by a comparison that stays true: `aj_near` and
`aj_dist` in agg-join-data.rofl are one recursion. After every fixpoint, a
contribution read from a value since widened must be answered by a
contribution of the same rule at the same key, at least as large, from values
that stand (`join_refired`), or it is a defect: the monotonicity argument
checked, not assumed.

**Finite height.** A cell improves only by a contribution that adds something
to it, so its improvements are at most the elements (union), bits (bitor, at
most 60) or distinct ends (hull) contributed to it: a join lattice converges
whenever what is contributed to it is finite, which holds wherever the rest
of the recursion terminates. What is not finite diverges as a plain
recursion that invents terms does (`grow(N, set(V1)) :- grow(N, S), V in S,
V1 is V + 1`): the wall cuts it, and its value is a bound under the
relation's hole. A cell reached from its own earlier value is how every join
over a cycle is reached, so a join cell is never withdrawn as an
`improving_cycle`; a join whose contributions compute new bounds from its own
value (the interval analysis of a loop counter) needs a declared widening
("Widening, as built").

**Witness: Cover.** At the close, each cell's fact is concluded, by its one
firing, from its Cover (`join_covers`): of the contributions lower than the
fact, taken in the canonical order — height, then the contribution's text —
each that counts something the ones before it did not (a set's elements, a
bitset's bits, of an interval the two ends of the value it reaches), then, in
the same order, none the rest already count in full. So the Cover joins to
the value, every member is below it, it is irredundant, and among the
contributions it is the lowest: `aj_pick(k, set(x,y,z))` is covered by
`set(x)`, `set(y)` and `set(z)` and not by the pair `set(x,y)` above the
singletons. The heights are taken once, before any cell's firing is replaced:
the contributions a value was reached by are all lower than it and together
count all of it, so a Cover of lower ones always exists; a member is
explained only by its lowest firings (one reading a fact no lower than itself
is dropped, and with it any that rests on the cell, as the self-loop at
`aj_comp(s)` does); and those heights rank every fact of the new graph
strictly, so the Cover is well-founded by height. What no Cover and no
standing fact rests on, a contribution or a value the cell passed through, is
dropped (`join_gc`). A Cover is canonical over the contributions and their
heights, not over the order they arrived in; which contributions exist, as
which values a cell passed through, is the evaluation's own where a value was
reached through its own history (a cycle), as for an order lattice's Best.
Rules read a Cover as `lattice_member[$kernel](Fact, 1, Height, L@join)` and
`lattice_member_prem[$kernel](Fact, 1, $fact(L@join, Book, [K..., C]))`, one
row per member.

**why and whynot.** `why reach(a, set(a,b,c,d))` prints
`reach[main](a,set(a,b,c,d)) [lattice union: a cover of 3 contributions] <=
reach@join @tick 0`, then each member by its value and height, `#1 set(a)
h=1`, explained by the firing that contributed it; a digest of `members` at
the top, the first below it. A value the cell passed through is marked `an
earlier value, improved on since: the join of the value before it and a
contribution`. `whynot` of a value above the cell's says `W would widen it,
and no contribution reaches it` and lists the contributions the rules make at
the key over the final facts; of one below, `W is not its value: union joins
every contribution, and they join to V`; of a term outside the carrier, `W is
no value of union`; of a holed cell, the hole and the path back to the fault.

**Holes and shrugs.** A join never wraps a number: an element or a bound past
the term range is its rule's fault, `arith_overflow`, and the cell's hole; a
membership of what is no set, interval or bitset is its rule's fault,
`set_type_error` (a new cause in shrug.rofl). A read passes the test a
contribution passes (`join_canon`, through `join_read`): an inverted
interval on either side of `in` or `subset`, a negative bitset, an empty
set, or two carriers against each other are `set_type_error`, never a
silent false or true; a set built out of order at run time is read as its
canonical value. A holed cell has no value and no
Cover: its contributions go with it. Everything else is the order lattice's
machinery unchanged: a cell a withdrawn contribution reached is withdrawn,
`support_withdrawn`; what reads a holed cell is unknown (`E in S` over an
unknown S binds E to an unknown value), a negation over it undecided, a count
over it a hole; a wall holes the open joins with their values bounds and
closes a join it did not reach; and each of these is a shrug with its root.
The members of an interval are enumerated one step each against the budget,
so a wide one meets the wall, never a silent cap and never a prefix.

**Well-founded worlds and ticks.** A join under `semantics(well_founded)` is
refused like every lattice, and a join reads a well-founded world fed from
below. A join value staged `@next` is a contribution at the next tick
(`L@next`, `carry_rule`), joined with that tick's own; `retain_ticks` keeps
the rows its carried value cites; a hole at tick 0 is a hole at tick 1.

**Proofs.** Eleven cells, fourteen worlds, each red under a planted fault:
`agg_join_syntax`, `_reflect`, `_strata` (`proves_recursion`), `_safety`,
`_eval`, `_witness`, `_why`, `_wfs`, `_ticks`, `_holes`, `_budget`,
`_span_budget`, `_shrug`, `_shrug_wall`, over
examples/checks/agg-join-data.rofl (components as sets over a graph with a
cycle, a self-loop and a lone node; live variables over a flow graph with a
loop; a hull and a bitset around a cycle; an order lattice and a join in one
recursion; two covers of one value; a contribution built out of order; a
set written in every place a program writes one, in another order, with
repeats, nested and mixed; a hole) and each world's own data, every value
enumerated by hand, and `set_spelling`, both engines: five spellings of three
sets held in a plain relation, read by pattern, `=` and negation, and a set
with a variable refused in a head, an `=` and a nested pattern. The faults:
`join_set_unsorted`, `join_iv_inverted`, `union_left`, `hull_low_only`,
`bitor_and`, `in_iv_open_high`, `in_iv_uncharged`, `in_first_only`,
`subset_iv_low_only`, `join_read_unchecked`, `join_leq_reversed`, `join_no_retire`,
`join_cover_text_order`, `join_cover_every`, `join_cover_redundant`,
`join_self_firing_kept`, `join_cycle_named`, `join_hole_keeps_contributions`,
`join_why_ghost_unmarked`, `join_why_one_member`, `join_whynot_below`,
`set_literal_as_written`, `set_pattern_admitted`, `join_value_unchecked`,
`lattice_join_unread`, `word_ops_is_only`, the TypeScript edits
`ts_set_literal_as_written` and `ts_set_pattern_admitted`, the safety.rofl edits
`join_not_idempotent`, `join_read_refused`, `join_arith_step`,
`in_binds_nothing`, `join_moves_shared`, the ring 1 edits
`ring1_join_unread`, `ring1_in_unread`, and the order lattice's faults the
join shares (`lattice_op_min`, `lattice_arity_short`, `wfs_admits_lattice`,
`carry_into_lattice`, `carry_why_present`, `retain_prunes_cited`,
`lattice_poison_off`, `shrug_edges_off`). Four of the join faults
(`union_left`, `hull_low_only`, `bitor_and`, `join_leq_reversed`) are caught
by the monotonicity check before any alarm could be: the world does not
evaluate. `rust/rofl/src/cell.rs` holds the laws (idempotent, commutative,
associative, `⊑` exactly `⊔ = b`, one term per value, a literal the value
the join builds); `tests/join_scale.rs` holds every session door reading a set
by its value, components against a search, live variables against the iterative
solver, and a hull and a bitset against the fold over what a search reaches,
over seeded random graphs, and bounds the cost of a 400-node chain held as
one set (the ids merged across every absorb, the rule firings, the clock).

**Not built, or not yet.** A join value copied through `=` is no move (as an order lattice's is not);
write the head with the value directly. A set over a large component is a
term for every value the cell passed through, so a component of n nodes held
as one set takes O(n^2) contributions of O(n) elements: O(n^3) work, measured
on 2026-09-30 at 0.26 s for a 200-node chain and 2.4 s for 400 (a 400-node
cycle 2.9 s, against 1.9 s for the relation `comp(X, Y)`, which stays the
cheaper encoding as n grows). The store adds nothing on top: a superseded
value leaves its relation's canonical run at the next merge
(`Store::absorb`), and two facts are ordered at their first differing byte
without rendering either (`cmp_args_rendered`); before that fix the same
chain took 27.6 s, about n^4.5. Widening, and interval arithmetic with it,
are in "Widening, as built".

## Widening, as built

w_agg_widening and w_agg_widening_tail (narrowing), in both engines; decisions in
f_a_widened_value_is_an_enclosure_and_a_shrug,
f_a_widening_stops_at_the_bounds_its_loop_is_written_with,
f_narrowing_is_a_descent_the_monotone_fixpoint_cannot_take,
f_narrowing_is_a_descending_pass_that_holds_the_widened_cells,
f_a_rule_that_faulted_in_the_descent_leaves_its_recursion_widened and
f_the_loop_counter_is_answered_by_an_enclosure_not_a_value.

**Why it exists.** A join converges when what is contributed to it is finite
("The join lattice, as built", finite height). An interval analysis of a loop
counter is the case where it is not: `i = i + 1` makes every value [0, n]
contribute [1, n + 1], and the hull grows for ever. The finding
f_the_aggregate_is_needed_only_where_an_infinite_set_must_be_compressed named
that case; a declared widening is the compression, and it says what it lost.

**Syntax.** A hull may declare a widening after its value, read by
`rust/rofl/src/rofl_parse.rs`, `src/parser.ts` and ring 1 alike:

    lattice loop(P, hull I) widen 2.       -- widened after 2 improvements
    J is ivadd(I, 1)                       -- the interval functions of `is`
    J is ivsub(I, E)    J is ivsub(E, I)    J is ivmul(I, K)    J is ivmeet(I, E)

    latdecl := 'lattice' ident '(' [ term ',' ]* latop term ')' [ 'widen' int ] '.'

`widen` is a word and N an integer literal of at least 0; `lattice_widen(Rel,
N)` is the kernel row (reserved, in the kernel's book, beside `lattice_decl`).
An interval's ends may be infinite: `iv(Lo, Hi)` with Lo an integer or `ninf`,
Hi an integer or `inf`, Lo <= Hi, so `iv(ninf, inf)` is the top and `iv(inf,
_)`, `iv(_, ninf)` are no values. The four functions take intervals or
integers (an integer is its point); `ivmul` multiplies by an integer; an
infinite end stays infinite, a finite end past the term range is
`arith_overflow`, never clamped to an infinity; `ivmeet` of disjoint
intervals is no value and no fault (the rule does not fire). `ring 1` reads
`$widen(int(N), $lattice(Op, Lit))`. Anywhere but the right of `is` the four
functions' names are names.

**Safety** (safety.rofl, "A DECLARED WIDENING"). Only an interval hull
declares one (`widen_not_hull`: a union's top is no set, a bitor has finite
height, an order lattice that never settles is an improving cycle); one
widening per relation (`two_widenings`). The interval functions are monotone
in every interval operand, so a hull's value may flow through one inside its
recursion into a head of a hull (`iv_op`, a `grow_iv` step; `ivmul` only with
the value first and an integer after; never from an order lattice's value,
never into a plain relation). Because they compute new ends from the value, a
recursion through one need not settle: every cycle an interval function lies
on must pass a relation declared `widen N`, or the rule is refused,
`lattice_unwidened` (`unw_edge`, `unw_reach`). The cycles are over relations,
as every safety rule's are: two program points of one hull are that hull
reading itself, so a loop written as one relation declares its widening on
that relation, and one written as a head relation and a body relation
declares it on the head, where it belongs. A ground interval is a clean
operand (`iv(ninf, 9)`); an interval built from variables is named first,
`G = iv(ninf, B)`.

**Evaluation** (`Eval::widened`, `widen_iv` in rust/rofl/src/cell.rs). A cell
of a relation declared `widen N` joins its first N improvements in a tick as
any hull does; from then on each end the join moved past the old value's goes
to the next **threshold** beyond it, or to its infinity when there is none; the
others stay. The thresholds are the integers written in the rules of the
widened relation's recursion (its own rules and those of the relations it
reaches and is reached from), so a loop widens to the bounds it is written
with: `i < 10` as `ivmeet(I, iv(ninf, 9))` with an exit at `iv(10, inf)`
settles within `[0,10]` instead of `[0,inf)`. **Only an
improvement along the recursion counts** (`Eval::widen_back_edges`): one made
by a rule that reads a relation of the widened relation's own recursion, as
standard widening applies at a loop's back edges. A contribution from below
the recursion is one of finitely many; it is joined and counts toward
nothing, so a widened relation fed only from below keeps its exact value (the
points 0, 1 and 2 of a `widen 0` hull are exactly `[0,2]`), and a cell whose
entry values arrive one by one is not widened for their number. Every cycle an
interval function lies on passes a widened relation (below), so an unbounded
chain of improvements is a chain along a cycle, and it is counted. N is the
number declared: the engine counts to it with no cap. An end
only ever moves to a further threshold or to its infinity, and the thresholds
are finitely many, so a cell improves at most one more time per threshold and
end after its widening starts: **termination is per cell and does not depend
on what its rules compute**. A recursion terminates when every new end it can compute
passes a widened head, which is what safety requires of the interval
functions; a recursion that invents values by membership and plain
arithmetic (`N in I, M is N + 1`) is no interval step and diverges as any
plain recursion that invents terms does, and the wall cuts it
(agg-widen-budget.rofl shows both side by side). The count is per cell and
per tick: a value carried `@next` arrives as a contribution and the count
starts again. A widening that changes nothing (the join already reached an
infinity) is no widening.

**A widened value is an enclosure, and a shrug.** Widening trades the value
for termination: the cell settles on a value above its least value, and
nothing the engine knows says by how much, or whether at all (`i < 10`
settles on `[0,10]`, which is its least value, yet only the thresholds put it
there and nothing proves it least; `i < 3` with `widen 2` on `[0,inf)`, its
only written bound below the value the join reached, where `[0,3]` would
itself have settled, and which the descending pass below then brings to
`[0,3]`: it is still not proved least). The recursion runs on the widened values
until it settles — a post-fixpoint, so each of its cells is above its own
least value — and at the close of its lattice each widened cell is a hole,
`hole($lattice(Rel, Book, Tick, Key), widening_forced)`, its value withdrawn
with what rested on it, and a shrug `shrug($lattice(...), widened,
within(V))` whose meta is the value it closed on: the enclosure, the one
thing known. What read it, in the recursion or outside it, is a shrug
inherited from it. Nothing definite is ever concluded from an
over-approximation; a rule that wants the enclosure reads it off the row, as
data (`bound(R, Lo, Hi) :- shrug[$kernel]($lattice(R, main, 0, [head]),
widened, within(iv(Lo, Hi)))`), where an infinite end is an atom and `Lo >=
0` is asked of a finite one. `widened` is a reason of its own in shrug.rofl,
with the causes `widening_forced` and `unbounded_members`.

**Witness: Widened.** A widened value is joined by no set of contributions
(none reaches the end it was widened to), so it has no Cover. Its witness is the record
of how it was reached: N, and each widening in order — the value before, the
contribution, their join, the value widened to — with the enclosure it closed
on. `why` of the cell, or of anything resting on it, shows it under the root:

    aw_loop(head, _) is a shrug: inherited, ...; from([$lattice(aw_loop, main, 0, [head])])
      root $lattice(aw_loop, main, 0, [head]) is a shrug: widened, ...; within(iv(0, 10))
        [widened: after 2 improvements each end the join moved went to the next bound its rules
         write, or to its infinity; the least value lies within iv(0, 10), which is an
         over-approximation of it]
          iv(0, 2) joined with iv(1, 3) is iv(0, 3), widened to iv(0, 9)

`whynot` of a value of the cell says it has no value, `hole(widening_forced)`,
and the same record; of a point that read it, the path back to it. A cell of
the same recursion that never came to its widening keeps its value and its
Cover. The widened value is the engine's iteration's: which contributions
arrived before the N-th improvement decides where the widening falls, as the
order a cycle was walked decides which values a join passed through. That is
why it is only ever an enclosure.

**Holes and shrugs.** Beside `widening_forced`: an interval function's
overflow is its rule's fault and the cell's hole (`arith_overflow`), an
`ivmul` by what is no integer `arith_type_error`, and `E in S` enumerating an
interval with an infinite end is `unbounded_members`, a fault at once and
never a walk to the wall. A fault on a value that replaced an older one (the
doubling counter overflowing long before its widening is due, the members
of a value widened to `inf` enumerated inside the recursion) is the cell's
hole exactly as on a first value: the firing on the replacing value made no
contribution to compare the stale one against, and what it would have made
is unknown (`Eval::fault_stands`, `Eval::faulted_refire`), never an engine
defect. A widened cell that also takes a fault (a contribution off the
carrier, a contributing rule's overflow) has no value to enclose: the fault
is its one reason, and no `widened` row is written. A widened cell under a
wall that did not reach its lattice closes as it would have. **A cell widened
before a wall stops its recursion** has no enclosure to give: a widened value
encloses the least value only once the recursion has settled on it, and the
wall came first (`[0,inf)` from a walk that one step later reaches `-1`).
The wall is its reason, `hole($lattice(Rel, Book, Tick, Key),
budget_exhausted)` (or `space_exhausted`), with no `within(V)` and no Widened
witness in `why`. Under `semantics(well_founded)` a widened
hull is refused like every lattice, and it reads a well-founded world fed from
below. A cell widened at a tick is a hole there, and what it staged is not
known at the next (`earlier(T)`).

**Narrowing** (`narrow_descend`, `seed_narrowing`, `narrow_gathered`; `narrowDescend` in
src/aggeval.ts; `narrow_iv`, `narrowIv`). The widening settles each widened
cell on a post-fixpoint x, above the least value by an amount nothing says. A
narrowing step replaces an end the widening raised with what the rules
contribute from x, which is a descent: the cell's value shrinks, and what
rests on it must be derived again from the smaller. The store never shrinks a
value (f_narrowing_is_a_descent_the_monotone_fixpoint_cannot_take), so the
descent is not made in it: **the world is evaluated again, with the widened
cells held.** A descending pass is a run of the whole evaluation, from base
facts as every run is, in which each widened cell is seeded as a fact at its
value and takes no contribution: a rule concluding into it joins what it
concludes into a `fresh` value and folds nothing. Everything else, the plain
relations of the recursion and its unwidened hulls, is computed from the
held values alone, the cycles cut at the widened relations, so `fresh` is F(x),
the join of what the rules contribute from x, base contributions included.
The pass stops when the lattices of the widened relations come to close,
every contribution made, and the evaluation is thrown away.

An end the widening **raised** (one a recorded widening step moved past the
join: an infinity, or a threshold) comes down to `fresh`'s end where that is
inside it (`narrow_iv`: never below `fresh`, every other end stays). x is a
post-fixpoint and F monotone, so F(x) is inside x and above the least value,
and the narrowed x is still above F(x): a post-fixpoint, so still an
enclosure. The cell stays what it was, a hole `widening_forced` and a shrug
`widened`, now within(V) with the narrowed V; no value is held, readers
inherit as before, and the shrug row is what a rule reads. Passes repeat
until no cell moves, **at most four** (`NARROW_PASSES`, a fixed default and
not syntax: f_narrowing_is_a_descending_pass_that_holds_the_widened_cells).
A pass narrows one cell further along a dependency among widened cells, one
that reads another's range, so a chain of five (agg-narrow-data.rofl,
`an_chain`) stops with its last two as the widening left them, still
enclosures; a program that wants more cuts the chain. The loop of the example
below needs one pass and a second to see that nothing moves.

    i = 0; while (i < N) i = i + 1        N a fact, 7

is `[0,inf)` after the widening, no integer written in its rules reaching it,
and `[0,7]` after: body is the meet with `(-inf,6]`, [0,6], plus one [1,7],
joined with the entry [0,0]. The bound as an expression (`i <= N * 2`, [0,15]),
a widening that landed on a threshold the loop does not stop at (10 where it
stops at 3, `an_thr`) and the doubling counter of agg-widen-data.rofl ([1,198])
come down the same way.

**A rule that faulted in the pass leaves its recursion widened.** A rule
whose premise is `E in [0,inf)` faults on the widened value and contributes
nothing, what it would have is unknown, so the join of what is left (`an_fault`:
[0,0]) is below the least value. Every relation of the widened cell's
recursion that met a fault in the pass is left as the widening closed it; the
others narrow (f_a_rule_that_faulted_in_the_descent_leaves_its_recursion_widened).
A wall met in a pass leaves what narrowed so far. The evaluation that follows
is the first again with the narrowed values handed to the marks: the shrug rows
are written from the marks and rules read the rows, so patching them after
would leave readers on the old value; that it closes on the same value is
checked (`Halt::Bug`). A world with no widened cell makes no pass; one that has
them makes 1 + P + 1 evaluations of the world, each of the P passes stopping at
the close of the widened lattices.

**Witness.** The record gains one line per narrowing step after the
widenings, the value before, the value it came down to and the join of what the
rules contribute from it that it came down by:

          iv(0, 2) joined with iv(1, 3) is iv(0, 3), widened to iv(0, inf)
          narrowed iv(0, inf) to iv(0, 7) by iv(0, 7), the join of what its rules contribute from it

and the header's enclosure is the narrowed one. A cell narrowing left alone
has the widenings and no such line.

**Proofs of narrowing.** `agg_narrow_eval` and `agg_narrow_why`, the work_proof
worlds of w_agg_widening_tail, over examples/checks/agg-narrow-data.rofl:
every widened cell closes within the enclosure derived by hand in
agg-narrow-eval-check.rofl, none lies inside its least value, and the why of a
narrowed cell, its `whynot` and what rests on it say each step. Each is red
under a planted fault: `narrow_off`, `narrow_once`, `narrow_more` (the bound),
`narrow_overshoot` (below the fresh join), `narrow_fresh_first` (not their
join), `narrow_meta_stale`, `narrow_why_bare`, `narrow_fault_ignored`, and the
TypeScript `ts_narrow_*` of each; `rust/rofl/src/cell.rs` holds the law that
`narrow_iv` stays between the value and the fresh join and moves only raised ends.

**Proofs of widening.** Eleven cells, thirteen worlds, each red under a planted fault:
`agg_widen_syntax`, `_reflect`, `_strata` (`proves_recursion`), `_safety`,
`_eval`, `_witness`, `_why`, `_wfs`, `_ticks`, `_holes`, `_budget`, `_cut`,
`_shrug`,
over examples/checks/agg-widen-data.rofl (loop counters: `while (i < 10)`
through a head relation and a body relation, `while (true)`, a counter that
moves both ways, a doubling counter, a loop widened at its last improvement
and one that settles under its N; each interval function over constants) and
each world's own data, every value derived by hand in agg-widen-eval-check.rofl.
The faults: `widen_unread`, `widen_row_late`, `widen_row_unread`,
`widen_late`, `widen_never`, `widen_unmarked`, `widen_both_ends`,
`widen_meta_first`, `widen_why_one_step`, `widen_whynot_bare`,
`widen_why_root_bare`, `widen_steps_carried`, `ivsub_same_ends`,
`ivmeet_keeps_high`, `iv_overflow_typed`, `in_iv_unbounded_walked`,
`iv_operand_unchecked`, `join_fault_unexcused`, `refire_fault_unexcused`,
`widen_fault_both`, `widen_cut_encloses`, `widen_counts_base`, the
safety.rofl edits `widen_cycle_unchecked`, `widen_any_lattice`,
`widen_two_admitted`, `iv_step_off`, `iv_mul_either`, the ring 1 edit
`ring1_widen_unread`, and `wfs_admits_lattice`. `rust/rofl/src/cell.rs` holds
the laws: each function sound over random points and monotone in its
operands, an interval one term ends and all, the widening above both values
and moving only the ends the join moved, and a cell widened on every
improvement changing at most twice.

agg_widen_cut's budget (115 steps, boot.rofl's included) falls in a window
of a few steps between the widening and the settle; a change to boot.rofl's
cost moves the window, and the world goes red rather than passing vacuously.

**Not built, or not yet.** A point that reads a widened cell is an inherited
shrug and keeps no enclosure of its own, though its value at the close is
one (a post-fixpoint's every cell is above its least value); only the widened
cells' rows carry `within(V)`. The widening is per relation: a program that
wants only its loop heads widened writes them as a relation of their own.
Narrowing is bounded at four passes, so a chain of widened cells longer than
that keeps the widening's enclosure for the tail.

## Tags, as built

w_agg_tags, in the Rust engine; decisions in
f_a_semiring_tag_runs_as_the_cell_its_algebra_already_is,
f_viterbi_in_millionths_rounds_down_and_associates_to_a_unit,
f_a_weight_that_reads_a_multiplied_tag_counts_it_twice and
f_the_kernel_tags_are_the_host_fold.

**Syntax.** A declaration in the lattice's shape, the value slot written with
its semiring, read by `rust/rofl/src/rofl_parse.rs`, `src/parser.ts` and ring 1
alike:

    tag cost(A, C, tropical T).        -- cheapest: ⊕ min, ⊗ +
    tag pr(A, C, viterbi P).           -- most probable: ⊕ max, ⊗ times, in millionths
    tag tr(A, C, trust T).             -- most trusted: ⊕ max, ⊗ min, in millionths
    tag paths(A, C, counting N).       -- how many derivations: ⊕ +, ⊗ times

    tagdecl := 'tag' ident '(' [ term ',' ]* tagalg term ')' '.'
    tagalg  := tropical | viterbi | trust | counting

`tag` is a word as `lattice` is: it declares only when a second name follows,
so `tag(x, hot).` is still a fact, and the four semirings are names
everywhere else. The kernel row is `tag_decl[$kernel](Rel, Arity, Alg)`,
reserved, in the kernel's book, the arity the whole head's.

**The cell is keyed by the whole head, and ⊗ runs through the body.** The tag
is the last argument; a rule into a tag leaves it to the engine:

    tag step(A, B, tropical W).
    step(A, B, W) :- e(A, B, W).                     -- the weight: the body binds it
    tag cost(A, C, tropical T).
    cost(A, C, T) :- step(A, C, _).                  -- T: step's tag
    cost(A, C, T) :- cost(A, B, _), step(B, C, _).   -- T: cost's ⊗ step's
    cost(A, C, W) :- cost(A, B, _), e(B, C, W).      -- W ⊗ cost's

A firing's tag is its **weight** — the head's tag slot where the body binds
it (or a constant), else `one` — ⊗ the tags of the body's positive premises
of the same semiring, left to right. Premises of plain relations, of another
semiring, negations and aggregates contribute nothing: another semiring's tag
is a value like any other. ⊕ merges the firings of one fact. A weight that
reads, through `is` or `=`, a tag the engine multiplies in would count it
twice and is refused (`tag_weight_reads_tag`); the body may read a multiplied
tag any other way, and a rule outside the tag reads it as a value.

| semiring | carrier | ⊕ | ⊗ | one | flags |
| --- | --- | --- | --- | --- | --- |
| tropical | Int | min | + | 0 | idempotent |
| viterbi | [0, 10^6], a probability in millionths | max | ⌊a·b / 10^6⌋ | 10^6 | idempotent |
| trust | [0, 10^6] | max | min | 10^6 | idempotent |
| counting | Int >= 1 | + | · | 1 | invertible |

(`TagAlg`, rust/rofl/src/cell.rs.) A tag never changes which facts exist: a
fact holds when it is derivable, and its tag says how; a viterbi product of
two millionths rounds to 0 and the fact still holds, tagged 0.

**What runs** (`tag::lower`, rust/rofl/src/tag.rs). A rule is reflected and
named as written; the engine rewrites the clause it runs before safety.rofl
judges it, and safety.rofl is seeded with the rewritten clause's reflection
under the rule's own id, so what is judged is what runs. ⊗ becomes a chain
`X is $alg(Acc, T)` from `one` over the weight and the factors: one function of
`is` per semiring (`$tropical`, `$viterbi`, `$trust`, `$counting`, names no
program writes), which checks both operands are in the carrier — anything
else, a probability past 1, a trust below 0, a count of 0, an atom, is
`tag_off_carrier`, a new cause in shrug.rofl — and whose result past the term
range is `arith_overflow`. Then:

- **an idempotent tag** (tropical, viterbi, trust: `TagAlg::order`) is the
  order lattice of its ⊕, min for a cost, max for a probability or a trust.
  Its ⊗ is monotone in both operands on its carrier, so safety.rofl reads each
  step as it reads `V + E` (`tag_step`), and everything else is the order
  lattice's: recursion, the monotonicity check of every inner read, the Best
  witness, faults decided at the close, walls, improving cycles, `@next`
  carried as a contribution, the well-founded refusal ("The order lattice, as
  built");
- **counting**, the one ⊕ that is not idempotent, is a sum. Each rule
  concludes a derivation, `p@count(K..., $firing(Rule, Vars), N)` (a relation
  no program can write; `Vars` every variable the body binds: a positive
  premise's, an `in`, `is` or `=` step's, an aggregate's result and group
  variables, never one local to a negation or an aggregate; so two firings
  are two derivations, the members a generator enumerates and the groups of
  an aggregate included), and the engine's rule `p@count` sums
  them per key, `p(K..., N) :- N is sum(V ; F : p@count(K..., F, V))`: a
  body aggregate, stratified, its witness the Group of its derivations.

**Recursion.** The recursion gate reads the flag, `TagAlg::idempotent`: an
idempotent tag recurses, and converges where its order lattice does (tropical
over non-negative cycles, viterbi and trust always, since ⊗ never improves on
an operand); a negative cycle under tropical never settles, and at the wall
its cells are `improving_cycle` shrugs. Counting is refused inside its own
recursion, directly, through another counting tag or through a plain
relation, by name: `tag p (counting) is inside its own recursion` — the
counting semiring is not p-stable, and a derivation count through a recursion
need not settle, even where the data has no cycle. rules/strata.rofl ranks an
idempotent tag as a lattice and a counting tag above what its rules read (as
an aggregate reads), and the stock evaluator puts `p@count` between the two
(`rank_counting`: every rank doubled, `p@count` one below its tag).

**One algebra per relation.** A relation tagged twice, in two semirings or at
two arities, or tagged and declared a lattice, is refused; a tag read or
written at another arity (`tag_arity`, and the lattice's `lattice_arity`); an
asserted fact in a tag (the cell holds what its rules conclude: assert the
input elsewhere and conclude it with its weight); a body aggregate of another
operation as an idempotent tag's weight (a count into a tropical tag); a
counting rule whose head key its body does not bind (its idempotent twin is
refused as a lattice). A `tag_decl` or `lattice_decl` row written by hand is
judged like the declaration it spells: a row not (relation, arity of one or
more, operation) declares nothing and is refused, and so is a tag naming no
semiring; neither is read as a plain relation.

**Witness.** An idempotent tag's is the Best of its order lattice: the
firings that reach its value — its best derivations — canonical by height,
less self-support (a zero-weight loop), read as `lattice_member` and
`lattice_member_prem`. A counting tag's is the Group of its derivations, every
one kept, each a fact of `p@count` explained by the rule that made it, read
as `agg_member` and `agg_member_prem` of the cell of its key.

**why and whynot.** `why cost(e, f, 2)` prints `cost[main](e,f,2) [tag
tropical: 2 members]`, each best derivation with its premises and the ⊗ steps
the engine ran (`2 is $tropical(1,1) [builtin]`); `whynot cost(a, d, 5)` says
`cost[main](a,d) is a tag cell (tropical) holding 9 [tag]`, that 5 would
improve it and no contribution reaches it, and lists what the rules
contribute; of a worse value, `tropical keeps the best contribution`. `why
paths(s, t, 3)` prints `[tag counting: the sum of 2 derivations] <=
paths@count`, each derivation `#i xN h=H` with its fact and rule; `whynot` of
another count says what the cell holds and lists every derivation `xN by
Rule`; of a key with no derivation, the rules and the premise that failed.

**Holes and shrugs.** An idempotent tag's faults are the order lattice's: a
cell a contribution off the carrier reaches is `hole($lattice(...),
tag_off_carrier)`, a shrug `fault`, and what rested on it is withdrawn,
inherited. A counting tag's fault is its rule's plain hole, and the grouped
sum over its derivations is withdrawn on the key the fault was met under
alone, as a group whose member could not be computed: `hole($cell(p@count,
1, T, [k, Book]), support_withdrawn)`, the fact of that key a shrug
inherited from the fault, the other keys' counts decided (w_agg_precise_holes,
"Precise holes, as built"; until then every key of the tag was withdrawn,
f_a_counting_tag_fault_holes_every_key_of_the_tag); a sum past the range is
`agg_overflow` on its own key alone. A budget cut
while a counting tag's input is derived leaves no row, never a partial count.

**Well-founded worlds and ticks.** A tag under `semantics(well_founded)` is
refused, `tag p (alg) is not evaluated under well_founded semantics`, and a
tag reads a well-founded world fed from below. An idempotent tag concluded
`@next` is a contribution at the next tick; a counting tag's derivation
concluded `@next` is a derivation of the next tick, its count added to that
tick's own. A hole at a tick is not known at the next.

**The 74 831 facts.** f_semiring_needs_parameterized_evaluator recorded
tropical costs simulated in plain rules over a cycle: every path length a
fact, 74 831 of them before the budget stopped it. Over the 12-node graph of
tests/tag_scale.rs the plain rules are cut at 102 202 facts by a budget of
200 000; tagged, the same rules without the arithmetic settle in 309 steps,
one fact per pair, 144, Floyd's (`agg_tag_bounded`, under a budget of 2000).

**Proofs.** Twenty-four cells, twenty-six worlds, each red under a planted
fault: `agg_tag_syntax`, `agg_tag_ts` (both engines: each refuses a tag, for
a reason naming it), `agg_tag_reflect`, `agg_tag_strata` (`proves_recursion`),
`agg_tagc_strata` (`proves_refusal`), `agg_tagc_strata_stock`,
`agg_tag_safety`, `agg_tagc_safety`, `agg_tag_eval`, `agg_tag_bounded`,
`agg_tagc_eval`, `agg_tag_witness`, `agg_tagc_witness`, `agg_tag_why`,
`agg_tagc_why`, `agg_tag_wfs`, `agg_tag_ticks`, `agg_tagc_ticks`,
`agg_tag_holes`, `agg_tag_budget`, `agg_tagc_holes`, `agg_tagc_budget`,
`agg_tag_shrug`, `agg_tag_shrug_wall`, `agg_tagc_shrug` and `agg_tag_demo`,
every value derived by hand in its file. **The demo** is the tagged world
equal to the host fold on the same store: agg-tag-demo-plain.rofl run by the
TypeScript engine, its support folded by src/semiring.ts in each semiring,
and the kernel's tags over the same facts, fact for fact in all four
semirings round two cycles; the host's answer is a block `npm run docs`
writes into agg-tag-demo-host.rofl and `docs --check` holds fresh. The
faults: `tag_counting_idempotent`, `tropical_max`, `tag_carrier_open`,
`count_carrier_open`, `viterbi_rounds_up`, `trust_max`, `tag_unread`,
`tag_arity_short`, `tag_lattice_admitted`, `tag_times_skipped`,
`count_firing_rule_only`, `count_firing_premises_only`, `count_folds_max`,
`count_demand_admitted`, `tag_alg_unknown_skipped`, `decl_row_skipped`,
`tag_judged_as_written`,
`tag_asserted`, `counting_recursion_admitted`, `wfs_admits_tag`,
`count_why_plain`, `count_whynot_plain`, `count_unranked`,
`tag_label_lattice`, the safety.rofl edit `tag_step_off`, the ring 1 edit
`ring1_tag_unread`, the rules/strata.rofl edit `strata_counting_unranked`,
the TypeScript edit `ts_tag_admitted`, and the lattice's `height_min`,
`lattice_why_one_member` and `agg_seal_at_wall`. `rust/rofl/src/cell.rs`
holds the laws (grafema's `derive/tag.rs` battery in this carrier: the
idempotent and invertible markers, ⊕ — folded by `fold(TagAlg::plus(), ...)`,
the insert the engine runs — commutative, associative and idempotent
where marked, ⊗ commutative with `one` its identity, associative — viterbi to
within a unit — monotone and distributive over ⊕, faults off the carrier and
past the range); `tests/tag_scale.rs` holds the 74 831 case, viterbi and
trust against their fixed points on a 40-node cyclic graph, and counting
against A² and A³.

**Not built, or not yet.** The boolean semiring is a plain relation and needs no tag. Counting over a
recursion (which the counting semiring's closure, ∞ on a cycle, would answer)
is refused, not computed. A counting tag's fault holes every key of it (the
finding above). Viterbi rounds each product down; the log-scale reading of
runtime/semirings.ts, exact and tropical with max, is not a tag. A tag cannot
be asserted into; its input is weighed in by a rule.

## Subsumption, as built

w_agg_subsumption, in the Rust engine; decisions in
f_a_dominance_is_a_cell_whose_order_is_rofl,
f_the_front_is_checked_against_every_value_given,
f_what_a_dominated_value_concluded_is_withdrawn,
f_a_program_monotone_in_its_own_order_is_checked_on_its_data,
f_a_conflict_is_a_dominance_that_is_no_order, and the review's
f_a_monotone_consumer_an_improvement_reached_back_through_was_refused,
f_a_staged_conclusion_outlived_what_a_lattice_withdrew,
f_the_dominance_door_read_its_body_in_no_order and
f_whynot_asked_less_than_the_close_would.

**Syntax.** A dominance rule, Souffle's form, read by
`rust/rofl/src/rofl_parse.rs`, `src/parser.ts` and ring 1 alike: the fact on
the left is dominated by the fact on the right wherever the body holds.

    route(A, B, C1, T1) <= route(A, B, C2, T2) :- C2 <= C1, T2 <= T1, C2 < C1.
    route(A, B, C1, T1) <= route(A, B, C2, T2) :- C2 <= C1, T2 <= T1, T2 < T1.
    dist(X, Y, D1) <= dist(X, Y, D2) :- D2 < D1.
    pick(K, V1) <= pick(K, V2) :- prefers(V2, V1), qualifies(V2).

    domrule := lit '<=' lit ':-' body '.'

`<=` after a head is no comparison; in a body it is the comparison it always
was. The door (`check_dominance`, program.rs) requires: one relation on both
sides, no kernel relation, the same arity, no book (a rule orders the facts
of every book, each book's a cell of its own), no tense; every argument a
variable; the key the longest prefix where both facts write the same
variable, the values after it a fresh variable each (`_` is one), at least
one. The body is ordinary rofl over the two facts: range-restricted over
them in the order the engine solves it (`plan_order`, which keeps a rule's
written order and moves a negation to where its variables are bound): a
positive literal binds, `is` and `in` bind their left from a bound right, `=`
one side from the other, anything else reads only what is bound before it,
and a wildcard under `not` is existential. `Z is W + 1, W = 3` is refused, as
the same body is unsafe in a rule. No aggregate (a count or a min
belongs in a rule of its own, which the body reads), nothing `@next`, and
never the relation itself. Several rules for one relation are one dominance,
their union; they agree on the arity and the key (safety.rofl, below).

**Reflection.** A dominance rule concludes nothing, so it is no `rule`: it is
`dominance[$kernel](R, Rel, Arity, KeyLen)`, its two facts
`dominance_lit[$kernel](R, 1, Lo)` and `(R, 2, Hi)`, and its body a rule
body's rows (`has_premise`, `premise_lit`, `premise_pos`, `premise_neg`,
`uses_builtin`, `reads_from`), with `has_conclusion(R, 1)` and `writes_to(R,
Book)` so that the kernel's audits read it as what it is. Its id is the fnv of
its canonical spelling, `Lo <= Hi :- Body` (`dominance_canon`, and
`canonClause` in src/reflect.ts), so the engines agree on it
(scripts/goldens.ts holds the ids). `decode_dominances` reads the rows back,
and refuses a row of no dominance rule's shape with a sentence.

**The cell is an antichain.** A subsumptive relation is one of the engine's
lattices, its algebra `AggOp::Dominance` (class `partial_order`, witness
Antichain): it closes, is cut, holes, carries and crosses a tick as a lattice
does. Its cell at a key holds every value given to it that none of the
values given dominates (`sub_cur`, several facts per key). A conclusion into
it (`sub_admit`): a value standing is a tie, another firing; a value
dominated earlier in the evaluation stays dominated; a value that dominates
itself is a conflict; otherwise it is compared with each value standing at
its key (a dominance question is each rule's body solved with the two facts
bound, `dominated`), dropped if one dominates it, and else joins the front,
each value it dominates superseded: no answer, its firings kept as the
cell's history, as an improved lattice value's are, the firings that read it
settled at the close (`settle_stale`), its `derived_by` rows withdrawn. On a
total order this is the lattice of that order: `D2 < D1` is `min`, fact for
fact and member for member, a value reached only through its own history
(a decrement floored at 0 round a ring) included.

**Checked, not assumed** (f_the_front_is_checked_against_every_value_given).
Every value a cell was given is kept (`sub_seen`, one row each against the
space wall) and at the close (`sub_check`) the front A is held against them
all, D: each value not in A must be dominated by a member of A, the first in
canonical order its witness, and no member by any value given. Then A is
exactly the values of D nothing in D dominates, whatever order they came in,
and with a strict partial order that is always so. When it fails (rock,
paper and scissors each beating the next), or a value dominates itself (`Y
<= X` written for `Y < X`), the cell is a hole, `dominance_intransitive` or
`dominance_cycle`, and a shrug `conflict` whose meta is every value in
conflict (`parties(Ps)`, canonical order): the first producer of that reason.
The insert costs 2|A| dominance solves a value; each answer is kept for the
evaluation (`sub_memo`, by the two values' places in `sub_seen`), so the
close solves only the pairs the insert never compared, at most |D| |A|.

**Strata.** What a dominance body reads is closed before any value is
compared: a strict edge from the relation to each relation its bodies read,
like a negation's, in `peel_rounds` and in `rules/strata.rofl`
(`dep_neg` over `dominance` and the body's `premise_pos` and `premise_neg`),
so a comparison never changes its answer; a rule into a subsumptive relation
whose dominance reads a relation fires at its level, not in phase A. A
dominance that reads what rests on its own relation is refused by name. The
relation is recursive (the algebra flag `partial_order`), read inside its
recursion like a lattice, from outside it strictly, and `dominated_by` and
the members the kernel writes sit above it. The stock evaluator closes it
where its table ranks it; a program ranks its own outer readers, as for a
lattice (`agg-sub-strata-ranks.rofl`).

**Safety.** safety.rofl reads `dominance` (SUBSUMPTION): `lattice_rel(P) :-
sub_rel(P)`, so a negation of the relation inside its recursion, a count of
it there, and a threshold reading it are refused as a lattice's are; one
algebra (a relation with dominance rules and a lattice or a tag declaration
is refused), one arity, one key; a rule writing it at another arity is
refused (`lattice_arity`, over `lit_arity` rows the host seeds for it). The
values may be used any way inside the recursion: the order is the program's
own rofl, and no rule can say which uses are monotone in it
(f_a_program_monotone_in_its_own_order_is_checked_on_its_data). The engine
checks it on the facts it made, after every fixpoint:

- *What a dominated value concluded is withdrawn* (`sub_withdraw`,
  f_what_a_dominated_value_concluded_is_withdrawn). Everything resting on a
  value dominated since, through any relation of the recursion, is a region;
  a fact of no cell founded by no firing that cites a dominated value is
  retired, known not to hold (no hole: what it read is known to be no
  answer), and the firings citing it go. A copy of the value into a plain
  relation inside the recursion (`q(A, B, D) :- p(A, B, D)`) so holds the
  front's values and no other. A firing that cites a dominated value still
  founds its fact when the same rule concluded that fact again with a value
  that dominates it in its place (the values that beat it, `sub_beaten`, in
  turn): the consumer is monotone along that step, and the dominated value is
  the fact's history as it is its cell's. So `at(X) :- d(X, _)` inside the
  recursion, whose improvement comes back through `at` (x reached at 5
  unlocks y, which reaches x at 1), keeps `at(x)`, as the min lattice does.
- *A conclusion staged `@next` from what was withdrawn* (`settle_staged`,
  at the end of the tick, for every lattice): it stands on another firing
  that read only what stands, or it is not staged when what it read is known
  not to hold (a dominated value, what one alone concluded), or, when a hole
  withdrew it, it is an unknown of the next tick, `hole($next(...),
  support_withdrawn)`, as it would be had the hole come first.
- *A consumer not monotone in the dominance is refused* with the rule, the
  fact, the value it read and what dominated that (`sub_nonmonotone`): a cell
  value whose only firings read values since dominated, from whose
  dominators nothing as good was concluded; and a cell value resting only on
  what a dominated value concluded. The refusal depends on the data.

Also refused: an asserted fact in a subsumptive relation, a rule concluding
one that is not range-restricted, a program that reads `derived_by` beside
one, and a subsumptive relation under `semantics(well_founded)` (a value
dropped for one that holds under an assumption); it reads a well-founded
world fed from below.

**Witness: Antichain.** A member of a front is explained by its members, the
Best of a lattice fact (`lattice_member`, `lattice_member_prem`: its firings,
over values that stand where those found it, through its history where they
did not, less self-support), and the front is the cell's facts. Every value
the cell was given and does not hold is named with the member that dominates
it, the first in canonical order, and the dominance rule that says so:
`dominated_by[$kernel](Value, By, Rule)`, written when some rule reads it, and
sealed with the provenance.

**why and whynot.** `why route(a, c, 3, 3)` prints `route[main](a,c,3,3)
[subsumption: 1 member; 2 of 3 in the front of its cell]`, its members, and
`dominates route[main](a,c,7,7) by r...` for every value it is the witness
of (a digest of `members` at the top); a value dominated since, read as
history, says `an earlier value, dominated since by ...`. `whynot` of a value
given and dominated: `... was given, and is dominated by route[main](a,c,3,3):
r... (the rule written out)`; of a value no rule gives, the questions the
close would ask of it, in its order: that it dominates itself (a conflict,
`dominance_cycle`), that comparing it with itself or a member faults (a
hole, with the reason) or reads an unknown (not known), the member that
would dominate it (and a conflict, `dominance_intransitive`, when it would
dominate another), or, where none would, that it `would join the front, and
no rule gives it` and every value the rules give at the key; of a holed cell,
the hole, the parties of a conflict, and the path back to a fault; of a key
with no front, the ordinary exploration. Which values a cell was given, and
which member is each one's witness, are the evaluation's: a snapshot reopened
without evaluating says whether the front would dominate a value, not that it
was given.

**Holes and shrugs.** A dominance body that fails for an error leaves
unknown which value dominates: the cell is a hole with the fault's reason,
and the dominance rule's `hole($rule(R), Reason)`; one that reads what a hole
left unknown (under `not`, or positively with no solution besides) is not
decided, and the cell is `support_withdrawn`, a shrug inherited from that
unknown. A rule concluding into the relation that faults holes its cell, as a
lattice's; a front member withdrawn holes its whole cell (what it dominated
may be the front). A wall holes the relation, its values bounds, and names a
cell some value of which came back through its own (`improving_cycle`,
`divergence`); a front the wall did not reach keeps its values.

**Ticks.** A value staged `@next` is a value given to its cell at the next
tick (`L@next`), compared with that tick's own: a carried value can be
dominated there. `retain_ticks` keeps what a carried value cites; a hole at
tick 0 is a hole at tick 1. A plain fact inside the recursion that a rule
staged `@next` from and that was withdrawn later in the tick stages nothing
at tick 1 when a dominated value alone concluded it, and an unknown when a
hole withdrew it.

**Proofs.** Twelve cells, sixteen worlds, each red under planted faults:
`agg_sub_syntax` and `agg_sub_ts` (both engines refuse a dominance under
well-founded semantics), `_reflect`, `_strata` (`proves_recursion`), `_strata_stock`,
`_safety`, `_eval`, `_witness`, `_why`, `_demo`, `_wfs`, `_ticks`, `_holes`,
`_budget`, `_shrug`, `_shrug_wall`, over `examples/checks/agg-sub-data.rofl`
(the Pareto fronts of routes over a cycle, each enumerated by hand; a
dominance on a total order beside the min and max lattices, a decrement
floored at 0 included; a partial order over names with no join, decided by a
closure and a negation closed first; one front with no key; a cell per book;
a copy of the value withdrawn) and each world's own data. The demo,
`agg-sub-demo-check.rofl`, is the Pareto front of flight itineraries over a
positive cycle, held against fronts from London enumerated by hand and, for
every pair, the front of every itinerary of up to four flights taken by
stratified negation, with no subsumption at all. The faults: `dominance_*`
(`unread`, `key_long`, `lits_swapped`, `as_rule`, `row_unread`,
`keep_dominated`, `no_retire`, `consequences_kept`, `nonmonotone_is_bug`,
`unchecked`, `by_last`, `conflict_ignored`, `fault_is_no`,
`unknown_decides`, `hole_keeps_front`, `edge_positive`, `rules_early`,
`why_ghost_unmarked`, `why_one_member`, `why_beaten_off`, `whynot_plain`,
`sub_rel_off`, `two_keys_admitted`, `history_unfounded`,
`self_fault_ignored`, `whynot_unasked`, `body_unordered`),
`staged_keeps_withdrawn`, `wfs_admits_subsumption`,
`shrug_conflict_parties_off`, `strata_dominance_unranked`,
`ring1_dominance_unread` and `ts_dominance_admitted`, and the lattice's
`shrug_cycle_merged` the wall shares. `tests/sub_scale.rs` holds, over seeded
random graphs with cycles, the Pareto fronts equal to the fronts of every
simple path a search enumerates (whatever order the facts are written in), a
dominance on a total order equal to the min lattice, with and without its
improvements flowing back through plain relations, and inclusion of bitsets
keeping exactly the maximal sets.

**Not built, or not yet.** For a custom dominance rule, monotonicity is
checked on the evaluation's own facts, not proven from the rules: a program
can be refused on one input and not on another, and a consumer non-monotone
only on values the pruning never produced is not seen. A declared order
("Declared orders, as built", next) is judged statically instead, and keeps
the data check beside it. Transitivity of a custom dominance is checked over
the values each cell was given and the front, not over every value the rules
could give. The cost of the close's check is at most |D| |A| dominance
solves a cell, less the pairs the insert answered. `why` finds a cell's front
through the relation's index on its key and the values a member dominates
through `sub_by_of`, not a scan of the relation.

## Declared orders, as built

w_agg_subsumption_orders, in both engines;
f_a_declared_order_is_a_dominance_judged_statically settles what
f_a_program_monotone_in_its_own_order_is_checked_on_its_data left to the data.

**Syntax.** A word and a head, as `lattice` and `tag` are: the key is every
argument before the first direction, and each value after it is `min` or
`max` and a variable of its own. `pareto` and `lex` are words, not keywords:
one declares only when a second name follows it, so `lex(x).` is still a fact.
Read by `rust/rofl/src/rofl_parse.rs`, `src/parser.ts` and ring 1 alike.

    pareto route(A, B, min C, min T).        no worse in both, better in one
    lex    route(A, B, min C, max Q).        the least C, of those the greatest Q

    orderdecl := ('pareto' | 'lex') ident '(' [ term ',' ]* dir term [ ',' dir term ]* ')' '.'
    dir       := 'min' | 'max'

The door (`lower_order`, program.rs; `lowerOrder`, aggeval.ts) requires: a
relation that is no kernel relation and no book, every argument a variable
written once (`_` for a value nothing reads), at least one value. A custom
dominance rule is still `p(K..., V1...) <= p(K..., V2...) :- Body.`, read,
evaluated and checked exactly as in "Subsumption, as built"; a relation has
either a declaration or rules of its own, never both (`order_and_rules`), one
declaration (`two_orders`), and no lattice or tag beside it (`two_algebras`).
The sentence form says `` `route` is ordered by Pareto dominance, the least C
and the least T for each A and B. `` and `` `route` is ordered
lexicographically, the least C then the greatest Q for each A and B. ``
(rofl-render writes it, scripts/read_md.ts reads it).

**Lowering.** The declaration is lowered at the door to the dominance rules it
stands for, as source text the ordinary door then reads, one rule strict in
each value, so the engine, the cell, the Antichain witness, why and whynot see
dominance rules and nothing in them is new. For values 1..m with direction
d_i (the other fact's value is the variable with `_` after its name):

    pareto:  p(K, V1..Vm) <= p(K, V1_..Vm_) :- ok_1, .., strict_j, .., ok_m.     for j = 1..m
    lex:     p(K, V1..Vm) <= p(K, V1_..Vm_) :- V1_ = V1, .., V(j-1)_ = V(j-1), strict_j.

where `strict_i` is `Vi_ < Vi` for min and `Vi_ > Vi` for max, and `ok_i` the
same with `<=` and `>=`. Both are strict partial orders for every input
(irreflexive: a tuple is strictly better in some value than itself in none;
transitive: the componentwise order, and the lexicographic order, are), so a
declared order cannot raise `dominance_intransitive` or `dominance_cycle`; the
close's check and the engine's data checks still run, and never fire. The
declaration is also the kernel row `order_comp(Rel, Kind, I, Dir, Rule)` for
each value, `Rule` the dominance rule strict in it (`reflect.ts` /
`reflect.rs`: reserved, arity 5). A whynot of a dominated value names the
member that dominates it and writes the lowered rule out, as for a custom rule
(`C_ < C, T_ <= T`). On one value a declared order is the lattice of its
direction, fact for fact (agg_sub_order_eval).

**Judged statically.** safety.rofl reads `order_comp` and judges every rule
that reads the relation inside its recursion, or concludes it, with the order
lattice's own analysis, value by value ("MONOTONE IN THE VALUE"): the host
seeds `premise_var(R, K, oval, I, V)` for the variable at the I-th value of a
read (K) or a head (K = 0), and `order_bad_read(R, K)` for a read whose values
are no distinct variables of their own (a constant, a repeated variable, or one
that is also a key). Each value is tainted and moves the way its direction
improves it (`lat_mv`: min and the like improve down, max up); the uses that
keep a rule monotone are the lattice's (`V + E`, `V - E`, `E - V`, `min(V, E)`,
`max(V, E)`, a copy, a comparison that stays true as the value improves: `V < N`
for min, `V > N` for max), and a value of the head must improve the way its
own direction does. A rule that is not monotone is refused at load with the
reason `order_nonmonotone`, whatever the data (agg-sub-order-safety-N-refused-*).

- *pareto*: a better tuple is no worse in every value, so each value is judged
  on its own: it may flow into any value of a head of the same direction (the
  cost into the time's place included), or into a lattice head of its
  direction, and into the comparisons above.
- *lex*: a better tuple is better in its first differing value only, so the
  later values may be worse. Only the first value may be compared. A later
  value (`lex_late`) is no operand of a comparison, no value of a lattice head
  and no value of a head that is not lex. A lex head's values but the last,
  when the rule reads the relation at all, are each computed STRICTLY (`+`,
  `-` or a copy; `min` and `max` are not strict) from the value at their own
  place; the last may be computed from any earlier one or left as it is.
  Refused: a first value `min(C0, 5)`, a second (not last) value that does not
  track its own place, a first value taken from the second read.
- A read of the relation in a rule that concludes a PLAIN relation is not
  constrained here, as an order lattice's is not: the copy is withdrawn with
  the dominated value (`sub_withdraw`), and a consumer behind it is held by the
  data check. Two reads inside one rule are judged each on its own.

The analysis is conservative: it refuses some monotone rules (a lex head from
a pareto read in swapped places, a head whose value is a sum of two tainted
values) and admits none that is not. What it cannot say is left to the engine's
checks.

**Proofs.** Seven worlds over `examples/checks/agg-sub-order-data.rofl`
(declared fronts of routes over a cycle, equal fact for fact to the same front
written by hand as dominance rules; directions that differ; the total orders
beside the min and max lattices; no key; a cell per book; lexicographic bests
enumerated by hand, a third value breaking a tie) and each world's own data:
`agg_sub_order_syntax` (both parsers, ring 1, nine refused forms),
`_reflect` (the lowered rules, premise by premise), `_eval`, `_safety`
(`agg-sub-order-safety-1-ok.rofl`, accepted and evaluated, and sixteen
refusals, each by its reason: direction, comparison, mixing, product, later lex
value compared or put first, a first value not strict, a middle one, a constant
in a read, a value reaching a key, rules beside a declaration, two orders, a
lattice beside one, a negation, a lex value into a pareto head), `_witness`,
`_why` and `_demo` (the flights of agg_sub_demo declared, held against the
brute force with no declaration, and the lexicographic bests against min
aggregates). Each is red under planted faults: `order_unread`,
`ring1_order_unread`, `ts_order_unread`, `ts_order_lex_as_pareto`,
`order_pareto_weak`, `order_lex_as_pareto`, `order_max_as_min`,
`order_row_rule_first`, `order_row_unread`, `order_head_unseeded`,
`order_dir_ignored`, `order_head_fit_ignored`, `order_taint_dropped`,
`order_bad_read_ignored`, `order_and_rules_admitted`,
`order_two_kinds_admitted`, `order_lex_late_compared`,
`order_lex_strict_unchecked`, `order_lex_late_into_pareto`, and the
dominance why faults for `_why`. They close cells of the subsumption row
beside the custom-rule worlds (syntax, reflect, safety, eval_rust, eval_ts,
witness, why, demo); the phrase cell's world for the declared sentences is not
built (the sentences read back, scripts/read_md.ts, unproven by a world).

## The sentence form, as built

Built 2026-09-30 in the reader (`scripts/read_md.ts`) and rofl-render
(`rust/rofl/src/bin/rofl_render.rs`), w_agg_phrase. Every kind is a condition
that names its result, what it takes, and its own body in parentheses; a
declaration is a sentence of its own. The reader reads each into the rofl on
the right, and rofl-render writes that rofl back as the sentence on the left.

| Kind | Sentence | Rofl |
| --- | --- | --- |
| count | `N is the number of B such that (B votes for C)`; several, `(B, C)` | `N is count(B : vote(B, C))` |
| sum | `S is the sum of V over K such that (K scores V)` | `S is sum(V ; K : score(K, V))` |
| min, max | `M is the least V such that (...)`, `the greatest` | `M is min(V : ...)`, `max` |
| or, and | `F is the disjunction of X such that (...)`, `the conjunction` | `F is or(X : ...)`, `and` |
| holistic | `the median of V over K`, `the quantile P of V over K`, `the rank of S among V` | `median(V ; K : ...)`, `quantile(P, V ; K : ...)`, `rank(S, V : ...)` |
| threshold | `at least N of B such that (...)` | `at_least(N, B : ...)` |
| order, join lattice | `` `dist` keeps the least D for each X and Y. `` (greatest, disjunction, conjunction, union, hull, bitwise or) | `lattice dist(X, Y, min D).` |
| widening | `` `loop` keeps the hull I for each P, widened after 2 improvements. `` | `lattice loop(P, hull I) widen 2.` |
| join reads | `E is a member of S`, `I is a subset of J` | `E in S`, `I subset J` |
| tags | ``Each `cost` fact of X and Y carries a tropical tag T.`` (viterbi, trust, counting) | `tag cost(X, Y, tropical T).` |
| subsumption | `A fact that <p D1> is dominated by one that <p D2> if D2 < D1.` | `p(.., D1) <= p(.., D2) :- D2 < D1.` |
| declared order | `` `p` is ordered by Pareto dominance, the least C and the greatest T for each K. ``, `lexicographically` and `then` | `pareto p(K, min C, max T).`, `lex p(K, min C, max T).` |
| shrug | `p(a, some value) has no answer for the reason R with some meta` | `shrug[$kernel](p(a, _), R, _)` |

**The sugar** exists only as sentences and is exactly what the reader lowers
it to (f_the_sugar_is_its_lowering_with_the_rounding_stated), so its
evaluation, safety, holes, shrugs and `why` are those of count, sum and a
comparison:

    Y is the average of E over M such that (B) rounded toward zero
      Total0 is sum(E ; M : B), Count0 is count(E1, M1 : B'), Count0 > 0, Y is Total0 / Count0
    ... in tenths rounded toward zero         (hundredths, thousandths, millionths)
      ..., Count0 > 0, Scaled0 is Total0 * 10, Y is Scaled0 / Count0
    every M such that (D) satisfies (S)
      Domain0 is count(M : D), Holding0 is count(M1 : D', S'), Domain0 = Holding0
    every M such that (C ranks M at R) satisfies (R > 2)
      Domain0 is count(M, R : rank(C, M, R)), Holding0 is count(M1, R1 : rank(C, M1, R1), R1 > 2), ...
    at most N of M such that (B)              Count0 is count(M : B), Count0 <= N
    exactly N of M such that (B)              Count0 is count(M : B), Count0 = N

- **The average is an integer division, rounded toward zero**, which is what
  `/` does in both engines, and the sentence must say so: one that does not
  is not read (`an average states its rounding`). A fixed-point scale is
  stated the same way and multiplies the total before the division. The
  explicit pair, a total and a count as two results, is the core written out
  and needs no sugar.
- **An empty group has no average**: its count is 0 and `Count0 > 0` fails,
  so there is no row and never a division by zero; `whynot` says `0 > 0`.
- **A total past the term range** is the sum cell's hole (`agg_overflow`), a
  scaled total past it the rule's (`arith_overflow`), and the average a shrug
  inherited from it, never a wrapped number. every, at most and exactly count
  and never sum, so they stay decided where an average of the same group has
  no answer.
- **every is count-equality over a domain bound from outside**: an empty
  domain holds vacuously. It is over each row of the domain, not each value
  of what it names: both counts also take every variable the domain writes
  that the satisfies clause reads and nothing outside the pair writes, so one
  failing rank of a member fails it beside a passing one
  (f_every_counted_members_where_its_sentence_says_rows); rofl-render writes
  every only where the reader would complete the sentence's tuple to the
  counts', and two counts of the member alone are written as the counts they
  are. Bound by nothing outside, the two counts would group
  by each other, and safety refuses the rule (`is bound by another aggregate
  after the aggregate`), as it refuses at most a number nothing binds.
- **at most and exactly N count within a group bound before them**: a
  variable of the count written elsewhere in the rule must be written by a
  premise before it, or the sentence is not read (`at most and exactly N count
  within a group the rule binds before them`). Bound by the count alone, a
  group with no member would have no count and no row, though at most 1 holds
  of it, and `exactly 0` would never hold
  (f_at_most_left_out_the_groups_it_never_counted). `exactly N` with N written
  nowhere else would bind N to the count and hold of every group, and is not
  read either; with N in the conclusion it is the count, 0 for an empty group
  bound before.
- **at most and exactly N are not monotone** and are refused inside their own
  recursion, as the count they are (`reads ..., which depends on the rule's
  own conclusion`); so is an average.
- **The second aggregate of a pair takes its own names**: every variable the
  pair alone writes, taken or not, is renamed in the copy (`M` becomes `M1`,
  `X` in `G lists M at X` `X1`), since a variable two aggregates share is
  refused (f_the_sugar_shared_what_it_takes_between_its_two_counts,
  f_the_sugar_shared_the_variables_its_body_joins_through). A variable written
  outside the pair, in the conclusion or a premise, is the same in both: bound
  before, what the sugar takes is asked per value, as it is of any aggregate,
  so `G lists M at some number and Y is the average of X over M such that
  (G lists M at X)` is each member's own average
  (f_the_sugar_counted_the_whole_group_for_a_member_bound_before). rofl-render
  recognises a pair only up to that renaming (`apart_map`): the copy's
  variables mapped one to one onto the first's through what each takes and its
  body, one written outside the pair onto itself and one the pair alone writes
  from a name of the copy's alone onto one of the first's alone, a wildcard its
  own in each; a sum and a count over different bodies, one asked per key
  beside one over every key, or two different counts compared, are written as
  what they are, and two aggregates' results compared stay compared when they
  are read back.
- **Each aggregate's variables are its own**: a letter two aggregates of one
  rule write and nothing outside them does (not the conclusion, a premise, or
  an aggregate's result) is two variables, renamed apart in the later one
  (`unitsApart`, a sugar's pair counting as one), so two averages may use the
  same letters (f_two_aggregates_with_one_letter_were_one_variable).
- **`X is X` is read as written**, not folded into nothing
  (f_a_self_equality_was_read_back_as_nothing), and a capital `A`, `An` or
  `The` inside a conclusion is a variable, not an article, wherever it stands:
  at the end, before a word (`is A in whole units`) or before words and a
  capital (`puts A above M`); the sentence's opening article is lower-cased
  before it is read, and only a lower-case `a` or `an` opens a typed hole
  (f_a_bare_capital_a_in_a_conclusion_was_read_as_an_article,
  f_a_capital_a_before_a_word_was_still_read_as_an_article).
- **The round trip is counted against the source too**: each phrase world's
  sentences are read once more beside the rofl they were written from
  (`npm run read -- X.rofl.md X.rofl`, `scripts/sentences.ts` `through`), and
  every rule, fact and declaration must come back exactly
  (`sentence_exact`, alarm `sentence_inexact`). `rofl-render --facts` writes
  an aggregate whole (`aggj`), a dominance's dominating fact (`dom`) and a
  declaration as one (`decl`), and the count compares an aggregate's result,
  values, keys and body, not its operator alone
  (f_the_round_trip_count_saw_an_aggregate_as_its_operator_alone).

**A sentence that is not read is refused.** A world's `.rofl.md` file is
read into rules, and what the reader could not read is kept beside it
(`scripts/sentences.ts`, `unreadOf`); both engines' answer paths then load the
file as refused, `not read: <fragment>`, which a fixture expects with
`<!-- expect-refusal: ... -->`, instead of loading the rules that happened to
read (f_an_unread_sentence_vanished_from_its_world). A refused reading goes no
further round. A reading is kept only for what it read: the reader's code, the
vocabulary and model it loads beside itself (`libFiles`, from the reader's
own tree, so a fault planted in a copy of them reaches it) and the worlds its
front matter reads are all in the key of its cache, which a vocabulary edit
with the cache warm once outlived
(f_a_reading_outlived_the_vocabulary_it_was_read_in).

**The answer model's sentence** is `phrase(shrug, ...)` in
`facts/phrases.rofl`, the vocabulary every reading loads, with no comma, which
would end a condition (f_the_shrug_sentence_was_written_and_never_read). A
reason is a name, so a constant one is backticked: ``has no answer for the
reason `inherited` with a meta M``.

rofl-render writes a declaration and a dominance rule each as a sentence of
its own, never merged with a neighbour into `a/b keeps ...`
(f_a_declaration_merged_with_its_neighbour_read_as_nothing), and introduces
the variables of both facts of a dominance before its body
(f_a_dominance_named_its_dominating_values_twice).

**Proofs.** The `phrase` column is swept by w_agg_phrase: for each kind a
world `agg_<kind>_phrase` (`check_opt(W, sentences, 1)`) states its rules in
sentences and in rofl in one `.rofl.md` file, reads it, writes both as
sentences with rofl-render and reads them back, and
`examples/checks/agg-phrase-check.rofl` holds that nothing was lost or
gained (every rule by its id, every declaration), that each relation was
written in the kind's own words (`sentence_of`, which `scripts/sentences.ts`
takes from what rofl-render wrote, against the check's `sentence_word`; a
rule written back as rofl reads back too, so the round trip alone cannot
say this), and the kind's check that both readings answer as the kind does.
The sugar row: `agg_sugar_phrase` (the forms, and the shapes that are no
sugar, a body joining through a variable of its own, what the sugar takes
bound before it, and a sum and a count one of which alone is asked per key),
`agg_sugar_eval` (rounding toward zero told from rounding down, the four
scales, an empty group, every vacuous, at most and exactly, exactly N as the
count, a body joining through `X`, and a member's own average and every),
`agg_sugar_safety` (nine refusals), `agg_sugar_why` (`why` names the sum, the
count, `> 0` and the division; `whynot` the empty group and the holes),
`agg_sugar_holes` and `agg_sugar_shrug` (the shrugs asked in the answer
model's sentence, round-tripped, and the roots they name), all over
`agg-sugar-forms.rofl.md` and `agg-sugar-data.rofl`. The faults: rofl-render's
`phrase_*` (`subset_as_member`, `inner_unread`, `sum_as_median`,
`max_as_min`, `count_tuple_first`, `quantile_swapped`,
`threshold_as_atmost`, `lattice_op_lost`, `widen_off_by_one`,
`tag_alg_lost`, `decl_twinned`, `dom_reintroduced`, `avg_rounding_lost`,
`atmost_as_exactly`, `sugar_unseen`, `avg_copy_unchecked`, `apart_takes_only`,
`apart_first_bound`, `apart_copy_bound`), the reader's `reader_*`
(`sugar_shared`, `rounding_optional`, `avg_empty_divides`,
`every_domain_dropped`, `atmost_strict`, `scale_off`, `results_folded`,
`apart_takes_only`, `apart_bound_too`, `exactly_unbound`, `alone_ungrouped`,
and `shrug_phrase`, a fault in `facts/phrases.rofl` the reading must see with
its cache warm), the engine's `div_floor`, and `wrap`, `plain_neg_decides`, `shrug_rows_off`,
`whynot_hole_empty` and `no_agg_edge` for the sugar worlds too.

**Not built, or not yet.** The repl prints a shrug positionally in either
mode, not in a sentence. The average
rounds one way, toward zero; rounding down or half to even is not a sentence.
A head with no argument is not read (`The ballots are valid`). The round trip
compares rules by id with variables renamed in the order they are written,
so a sentence that reorders conditions is a different rule.

## The TypeScript engine, as built

w_agg_ts, 2026-09-30: every kind the Rust engine builds evaluates in the
TypeScript engine, and on every aggregate proof world the two reach one
canonical state, byte for byte: facts, witnesses, cells and their members,
holes, shrugs, and the `explained` rows `why` and `whynot` write. Best-effort
for small scale, as decided; exact wherever it answers.

**One evaluator, transliterated.** `src/aggeval.ts` (class `AggEval`) is
`rust/rofl/src/engine.rs` function for function: the planner and the peel,
the safety answer, the fixpoint, the body aggregates and their cells, the
thresholds, the order and join lattices with their widening, the tags,
subsumption, the carry of unknowns, the shrug rows, the alternating fixpoint,
the tick boundary, and `why` and `whynot`. `src/cell.ts` is
`rust/rofl/src/cell.rs` (the fold, the holistic value, the join carriers, the
interval functions, the widening, the semirings, the Quorum) and `src/tag.ts`
`rust/rofl/src/tag.rs` (reading the declarations and lowering a tagged rule).
A transliteration and not a second design, because the answer is
canonical state and not only the facts: which firing is kept, which member
stands for a group, which root a shrug names, in what order a carry meets its
unknowns. Written from the Rust source, the first world compared came out
byte for byte, and all 193 aggregate worlds did within the day.

**Why, walked.** `why` and `whynot` walk with a stack of their own in every
evaluator (`render_tree` and `explain_tree`; `renderTree` and `explainTree`
in `AggEval` and in `Rofl` for the plain one): each step pushes, in order,
the lines and premises the recursive form wrote and recursed into, so the
text is the recursive form's, a derivation takes no frame per level, and a
line is written once. Recursive, the TypeScript engine ran out of stack
under 1000 lattice levels, the plain one's `why` threw out of the host at
3000, and each level copied its subtree's text again, cubic in depth in both
engines: 2000 levels took 16.7 s in Rust, 0.4 s now
(f_why_took_a_frame_per_level). `deepExplain` in scripts/goldens.ts and
`a_derivation_thousands_deep_is_explained_to_its_bottom` in
rust/rofl/tests/explain.rs hold both TypeScript evaluators and the Rust one
to one text, to the byte, 3000 deep; the output itself is quadratic in depth,
since each line is indented by its level.

**Where it runs.** `Rofl` hands a store to `AggEval` when it declares a
lattice, a tag or a dominance rule, reflects an aggregate, a join read, an
interval function or a head writing a set with a variable, or holds a cell
(`storeHasAggregates`); every other program runs on it too, as a *plain* program
(`AggEval.plain`): planned with the cross-product hold and explained as the plain
explainer always did. The evaluator is kept past its run, since
the tick boundary, `why`, `whynot` and the explain bridge read what it met
(its unknowns, the widenings, a conflict's parties). `load`, `assert` and
`assertClauses` admit every construct: a declaration is its kernel row
(`lattice_decl`, `lattice_widen`, `tag_decl`), a dominance rule its
reflection (`encodeDominance`), and the door checks the Rust door makes
(`checkAggregatesDoor`, `checkSetPatternsDoor`, `checkOrderableAgg`,
`checkLatticeDecl`, `checkDominance`), in the same words where a fixture names
them. A snapshot carries its cells in the Rust format (`cells`, a shared
holistic group written once as `membersOf`), and one the Rust engine saved
reopens here to the state it saved.

**Where the two differ in shape and not in answer.** A fact is its key
string here and a `FactId` there; wherever the Rust engine orders by
`FactId` only for determinism, this orders by the key, which is the order the
state prints. A cell is named by its `$cell(Rule, At, Tick, Key)` text. The
store keeps a record withdrawn (`dead`) and one superseded with its firings
kept as a lattice's history (`ghosts`), as the Rust store keeps a dead id; a
ghost's firings print as witnesses, and are dropped when its key comes back
or its tick ends. A firing list is oldest first here and newest first there,
and every walk that picks the first of a kind walks it newest first. An
integer an aggregate folds is a bigint, the i128 of the Rust side, so a total
past 2^53 is exact and one past 2^60 is `agg_overflow`; a term is a number
where one is exact and a bigint past it (`normInt`), as before.

**What a wall leaves.** The Rust engine does not restore the batch a wall
fell in, nor the front it was propagating: the cut reads both to decide which
lattices settled before it (`close_settled`). A `finally` that restored them
here closed a lattice the wall had cut; they are left standing on a wall in
both engines.

**The harness.** Every aggregate proof world is `check_opt(W, together, 1)`
(what `one_engine, rust` was): its files load before it is evaluated once,
as `rofl-load` runs a world, and a refusal fixture is offered alone, refused
at the door (`load`) or by the evaluation (`eval`). Both engines answer it
that way (`answerTSTogether` in scripts/goldens.ts, `Rofl.load` with `defer`)
and must reach the golden's one hash; its alarms, its `-- expect-row:` lines
and its refusal texts are read in either engine. The TypeScript host feeds a
world below (`Rofl.feedBelow`), answers `explain_request` rows
(`Rofl.explainRequests`, re-evaluating a plain program with `AggEval` so its
unknowns are known), keeps `retainTicks` and a `space` wall as `rofl-load
--retain` and `--space` do. `aggregateDoors` holds each door: `load`,
`assert` and `assertClauses` of a count, a lattice, a threshold, a join, a
join read, a widening, an interval function and a dominance rule give one
state, the Rust engine's, and a snapshot the Rust engine saved of each
reopens and evaluates again to it.

**Proofs.** Twenty-eight cells. `eval_ts` of a kind by its eval world, and
`parity` by its why world (its witness members and its explanations, the
most format-bound thing a kind writes), each red under a planted fault of
the TypeScript engine alone: `ts_max`, `ts_no_agg_edge`, `ts_no_empty_zero`,
`ts_median_upper`, `ts_thr_n_minus_one`, `ts_lattice_no_retire`,
`ts_union_left`, `ts_widen_both_ends`, `ts_trust_max`, `ts_count_folds_max`,
`ts_dominance_no_retire`, `ts_div_floor`; `ts_digest_off`,
`ts_no_sealed_text`, `ts_empty_text`, `ts_thr_text_order`,
`ts_lattice_why_one_member`, `ts_join_why_one_member`,
`ts_widen_whynot_bare`, `ts_tag_label_lattice`, `ts_count_why_plain`,
`ts_dominance_why_one_member`, `ts_whynot_hole_empty`,
`ts_withdrawn_cell_stale_src`, `ts_why_depth_cut`. `Rofl.strataPlan` of an
aggregate program is the plan `AggEval` ran (`AggEval.strataPlan`: the
peel's round, or the ranked stratum), held by `aggregateDoors`.

**One evaluator.** `AggEval` answers every program, as the Rust engine does: the
stock evaluator (`engine.ts` and `rounds.ts`) is deleted, and its reuse
across evaluations (`src/reuse.ts`), its `stop` callback, its naive mode and its
plain explainer are `AggEval`'s own
(f_the_two_typescript_evaluators_copy_each_others_methods). The pure helpers of
the unknown value (`holdsUnknown`, `bindUnknown`, `unifyUnknown`, in
src/unify.ts) and `sameKeys` (src/store.ts) are one copy for it and for
src/shrug.ts.

**Not built, or not yet.** Small
scale: a world the Rust engine answers in seconds at its walls can take the
TypeScript engine far longer. The Rust `compact_wits` reverses a firing
list when it compacts, which no world here reaches; an answer that depended
on it would differ.

## The witness of a cell

As built (`store.rs`, `engine.rs` `seal_cells`):

- A conclusion that used an aggregate records ONE premise for it,
  `PremRef::Cell(CellId)`: the id of an immutable sealed record, so the value
  the conclusion used is the record's value. There is no separate value in the
  premise and no `PremRef::Sealed`: what the cell sealed (each relation it
  read, with the round it closed in) is the record's `seals`, printed as
  `sealed=[rel@round]` and reflected as `agg_sealed`.
- The cell record holds its key, its value (a value, `none` for an empty group
  of an operation with no identity, or a hole with its reason), its height,
  its tick, its members, and its seals.
- A **member** is a Group's distinct projection tuple (count, sum, median,
  quantile, rank) or a Best's
  distinct derivation (min, max, or, and), with its height and the premises of
  its representative derivation, one per inner body element in written order.

| Kind | Holds |
| --- | --- |
| Best | every tied member that reaches the final value; the seals are the record's |
| Group | every member, each distinct projection tuple; shown as a digest of the first 5 members and a count, stored in full |
| Best of a lattice fact | its firings that reach the final value, over final values where those found the fact and over the earlier values it was reached through where they did not, less self-support; read as `lattice_member` and `lattice_member_prem` ("The order lattice, as built") |
| Quorum | a threshold's first N members, canonical at its close, and no seal ("The threshold, as built") |
| Cover of a join fact | its one firing, by the engine's rule `L@join`, from the canonical irredundant set of contributions (facts of `L@join`) lower than it whose join it is, lowest first ("The join lattice, as built") |
| Best of a tag fact | an idempotent tag's order lattice Best: its best derivations ("Tags, as built") |
| Group of a counting tag | every derivation, a fact of `p@count` with the rule that made it ("Tags, as built") |
| Widened | the record of a widened cell's widenings ("Widening, as built") |
| Antichain of a subsumptive cell | its front, each member a Best of its derivations, and every value the cell was given and does not hold with the first member that dominates it and the rule, `dominated_by` ("Subsumption, as built") |

Invariants:

- **Canonical at seal time.** Members are ordered by height, then projection
  text (Group) or the sorted premise signature (Best); within one member
  identity the representative is the derivation with the least signature.
- **Final values only.** A Best keeps only members that reach the final value.
- **Well-founded by height.** A member's height is 1 + its highest fact or cell
  premise; a fact's height is its lowest firing.
- **Stored in full, shown as a digest.** `why` shows a digest, `why all` the set.
- **Stored once when shared.** Cells over one holistic group share one
  member range ("The holistic aggregates, as built"); compaction keeps it
  shared.

## Ready for the incremental engine, as built

The next engine maintains a world by deltas, and aggregates must not need a
format change for it. `w_agg_incremental_ready` owns the column and closes it
in every row; each line says where it stands, and the retraction path is
built, so that what the format promises is used and held to a fresh
evaluation. Decisions in `f_a_retraction_updates_the_cells_it_supports`,
`f_a_lattice_contribution_is_named_by_its_firing`,
`f_a_retraction_is_a_fresh_evaluation_or_it_is_evaluated_again` and
`f_a_delta_has_no_promise_over_a_history_the_schedule_wrote`.

- **The algebra is recorded**: with a cell (`CellRec::alg`, set from
  `AggOp::algebra` as flags: idempotent, invertible, holistic, lattice, and `tag`
  for the cell of a counting tag), and with a lattice relation, whose facts are
  its cells and so have no record of their own: every lattice, tag and
  subsumptive relation, a join's contributions (`L@join`) and a counting tag's
  derivations (`p@count`) are registered when the program is prepared
  (`Store::lat_regs`, `Store::tag_rules`; both persisted by a snapshot) and printed as
  `lat REL OP alg=FLAGS use=STRATEGY` (`min`, `union`, `tag:tropical`,
  `tag:counting`, `subsumption`). The strategy is what the flags give
  (`Algebra::strategy`): an invertible cell subtracts, a holistic one
  recomputes its group, anything else is derived again, and a **widened** join
  (`widening` among the flags) is `full`: what a widening holds depends on the
  number and the order of the iterations that made it, so no delta promises it.
- **A member has an id that survives a re-seal**: `Store::member_id`, FNV-1a
  over `rule@at|key|identity`, where the identity is a Group's distinct
  projection tuple and a Best's distinct derivation (its premises, sorted).
  Never the record's id, the tick, the position or the height. Printed on the
  member's line: `mem K #2 id=af25... (5,2)`.
- **A lattice contribution is a firing, and has one too**: `Store::firing_id`,
  FNV-1a over `rule@tick|premise; premise`, premises as `canonical_state` spells
  them and sorted, so it is a function of what made the firing and of nothing
  the schedule decides, the same in both engines. Every firing of a fact of a
  registered relation is printed, in canonical order, whether its fact holds or
  was superseded (a value kept as the history another was reached through):
  `fir FACT id=H RULE@TICK [PREMISES] live|superseded`. The member id leaves
  the tick out on purpose (a cell is sealed once per tick and its members are
  the same across them); a firing is a fact of its tick.
- **The height is kept**, per cell and per member; a cell's identity is
  (owner, key, tick), without the value; `PremRef::Cell` names an immutable
  record, so it records the value at use, within a tick and across ticks.
- **The seal is a field of the record, not a premise of its own** (a
  deliberate difference from the first draft's `PremRef::Sealed`): a
  retraction replaces the record, and with it the seal.
- **The support index** (`Eval::support_index`, engine/delta.rs): fact -> the
  cells some member of which cites it, built from the sealed cells the first
  time a retraction asks and kept as cells are replaced; dropped when an
  evaluation runs. A member cites the facts of its representative derivation
  only, which is all a retraction needs: a derivation that is not the
  representative decides nothing about the member while it stands or falls.
  For a lattice the back-index is the citer index the lattice close already
  keeps (`Store::citers_of`), and a value no fact holds (a dominated one) is
  remembered with the premises of the firing that gave it (`sub_prems`).

### The retraction path

`Session::retract_delta(fact)` (rofl-load `--retract`) takes a base fact out of
an evaluated world and brings what it supported to what a fresh evaluation
holds, without evaluating the world again:

| What rests on the fact | What happens | Uses |
| --- | --- | --- |
| count, sum (Group, invertible) | the members whose representative cites the fact are derived again, each alone (the inner body with the group and the member's projection bound); one with no derivation left is dropped and its value taken from the total, one with another derivation keeps its place under the least signature left; the survivors are ordered again by height and projection | `AggOp::subtract` |
| counting tag | the derivations (`p@count`) whose only firings cite the fact go, and the tag's sum subtracts them: nothing is derived again | `withdraw_firings`, `AggOp::subtract` |
| min, max, or, and, median, quantile (constant percent) | no inverse (or a value that is a function of the whole group): the one cell is derived again with its key bound | `seal_cells` |
| at_least | the group asked again over the facts; where it still reaches N the cell is reached and closed as a Quorum is, the first N members by height and projection, and reflected; below N it has no cell | `thr_reach`, `close_thresholds_below` |
| an order lattice, an idempotent tag | the CONE: the lattice facts whose firings cite the fact, those whose firings cite them, and so on, are taken out with their firings and provenance (a cycle supports itself, so a fact is not kept for a firing inside the cone); the rules into the cone's relations are fired again over what stands, which is how the evaluation concluded them, and the relations close again: a key holds the best value its rules reach and every firing of that value over final facts | `activate`, `close_lattices_below` |
| a subsumptive relation | the cone by KEY: the front of a key one of whose values rests on the fact, and every key a value was given to from the fact, are taken out whole and derived again, since what each value dominated is decided against every value the key was given | the same, with the state a key keeps of its values (`sub_seen`, `sub_memo`, `sub_by`, `sub_prems`) forgotten with it |
| what read a cell, or a lattice | the firings that cited the old cell record go, the facts they concluded with their last firing, and the rule is solved with the cell's key bound against the new record; the facts of PLAIN RULES that rested on a replaced cell's conclusion or on the cone, through each other and around a cycle, are taken out whatever else they have, and the rules fired again once the cells are replaced and the lattices closed | `solve_body`, `conclude`, `consumer_facts`, `activate` |
| a rule that NEGATES or AGGREGATES what changed (a cell's conclusion, the cone, or the retracted fact itself, read outside an aggregate) | a retraction can make a `not` newly true and a count gain a member, which no subtraction does, so the rule is read again WHOLE: every fact of its head relation goes (with whatever rests on them), its cells go with their reflection, and it is fired again with the rules that conclude the same relation, in a full evaluation's order, the plain ones at once and the others level by level (`round_of`), each over what the levels below concluded; the back-index is dropped and rebuilt at the next retraction. The reader's own algebra is not used: a sum over a changed cell could subtract what went, but not add the member a new conclusion makes | `reset_facts`, `reset_cells`, `refire`, `rule_level` |

It answers `Delta` (what it did) or `Full(reason)`: the world as a full
evaluation takes it, evaluated again at the next question. The reasons are
named: a later tick, a hole, a wall or the well-founded mode; a rule that
concludes the fact's relation too; a rule that reads the ledgers
(`asserted_by`, `agg_*`, `derived_by`, `hole`, `lattice_member`,
`dominated_by`); a cell holding a hole; **a join or a widening** (its
contributions are the history of the schedule that read them, which a fresh
evaluation writes and a delta cannot promise); **a value kept as history** (a
fact no firing over final values founds: the close of its relation decides
again which superseded values are still needed, so the whole relation is
decided again); a rank, or a quantile whose percent a rule hands it (the
group is stored once and shared across its parameter); a rule whose second
aggregate is asked for what its first reached (a result, a group, or only the
groups it had a value for: the cells there are depend on the first); a threshold or a
rule that stages what rests on the fact; a cell the fact supports that a rule
reading what changed also owns (it is read again whole, and cannot be
subtracted too); a dominance rule that reads it; and a delta that would write a hole, seal a cell nothing
indexes or meet a wall (a hole is written with its shrugs after a whole
pass). Each is a named reason; none changes what a full evaluation answers.

It is held three ways. `rust/rofl/tests/incremental.rs` is a differential over
twenty-one sweeps (the body aggregates; the median, quantile and threshold; a
counting tag; order lattices and an idempotent tag with a saturating chain that
keeps a history; a Pareto front and total-order dominance; plain rules over
cells and over lattices; cells, lattices and tags in one world; a world with a
rule per refusal): random asserts and retracts, loaded facts and asserted
ones, each step compared with a world built from the same facts and evaluated
from nothing, byte for byte in `canonical_state`, and the explanations (`why
all` of every fact that holds, `whynot` of the facts that held) compared too,
because they read what an evaluation left in the engine. 7 440 edits, 4 328
retractions, 3 410 by delta and 918 evaluated again for a named reason, none
of them a different state, over 296 000 explanations. The worlds
`agg_incr_sum`, `agg_incr_minmax`, `agg_incr_holistic`, `agg_incr_lattice`,
`agg_incr_tag`, `agg_incr_tagc`, `agg_incr_join`, `agg_incr_widen`,
`agg_incr_sub`, `agg_incr_readers`, `agg_incr_stacked` and the gate worlds retract facts after
the evaluation (`check_opt(W, retract, "fact")`: Rust by the path, TypeScript
by evaluating again) and state the rows that must hold after, so both engines'
hash is the same state. The registry lists retractions in text order, and a
retraction that is evaluated again evaluates the world whole, so the ones that
are evaluated again sort first in a world that proves a delta. And
thirty planted faults (`retract_*`, `retract_stacked_*`, `firing_id_tickless`, `fir_superseded_live`,
`tag_flags_off`, `widening_flag_off`, `member_id_position`, `alg_flags_off`,
`stale_holes_kept`, ...) turn them red.

The TypeScript engine stays a full recompute: its `retract` marks the store
dirty and the next evaluation is the whole one, and its `canonicalState` prints
the same flags, ids and lattice lines, so parity is checked on the result of
both.

A world evaluated again must be a fresh one. It was not: a hole is a base,
frozen row, which the cleaning of derived facts keeps, so a retraction that
removed the member that made a hole left the hole, and with it every later
retraction refused (the world holds a hole). The hole rows an evaluation
writes are now its own (`Store::eval_holes`): they go when the next evaluation
of the tick starts, and stay for good once the tick ends. In both engines.

Both risks the first draft of this section named are closed ("Well-founded
worlds and ticks, as built"): a cell staged `@next` keeps its tick and its
members' premises of that tick, and `retain_ticks` keeps the provenance a live
cell cites. A fact staged again takes the new tick's firings and drops the
old, so neither its firings nor the cells they cite accumulate across ticks.

What stays evaluated again, and why: a join or a widening (the history is the
schedule's); a value kept as history (the close of its relation decides which
superseded values are needed); a rank or a quantile with a percent from
outside (the group is shared across its parameter, and a delta would have to
re-derive the family); chained aggregates; a delta that writes a hole; the
tick of a world that is not the first; and a consumer that negates or
aggregates what changed (its cells, or the facts a negation would add, are a
second delta stacked on the first). The first three are decisions: the
reason is the state a fresh evaluation writes and no delta can reproduce, not
the work.

## Where it lands in the engine

- **Parse and reflect.** `rofl_parse.rs` (`Elem::Agg`, `AggSrc`), `src/parser.ts`
  (`AGG_OPS`, a `t: 'agg'` body element), ring 1's `belem` for `$agg`.
  `reflect.rs` holds `BodyElem::Agg(Agg)` with `at` and `shared` filled by
  `annotate_aggs`, its canonical spelling (the same bytes as
  `canonBodyElem` in src/reflect.ts, so rule ids agree), `$agg` reification
  and the `premise_agg` rows of `encode_rule`. The load door is
  `check_aggregates` in `program.rs`.
- **Engine** (`engine.rs`). `plan_order` plans a rule body or an aggregate's
  inner body; `agg_plan` (per rule, in `prepare`) splits correlation from
  group; `agg_premise` and `seal_cells` solve, bucket, fold and seal;
  `peel_rounds` draws the aggregate edges; `render_why`'s `render_prem` and
  whynot's `explore_body` explain a cell; `run_well_founded` refuses;
  `carry_rule`, `cited_past`, `render_past` and the carried cells'
  reflection at the start of `run` cross a tick; `Session::feed_below` reads a
  world from below.
- **The algebra** is `cell.rs` (`AggOp`: class, witness kind, lift, insert
  into an i128 accumulator, `finish` (the range check on the total),
  subtract, `holistic` (the value of a whole group from its sorted values),
  `params`, the joins `join_canon`, `join`, `join_leq` over canonical terms,
  law battery).
- **Lattices** (`engine.rs`): `lattice_admit` and `supersede` at `conclude`,
  `lattice_settle` after each fixpoint, `close_lattices_below` before each
  level (`apply_lattice_holes`, `settle_stale`, `close_lattice` with
  `recursion_dominators`), `sink_builtins` in `classify`, `lattice_fault`,
  `refuse_lattices`, `check_lattice_strata`, `render_lattice` and
  `whynot_lattice`; for a join, `conclude_join`, `join_fold`,
  `join_refired`, `join_covers`, `join_gc`, `withdraw_contributions`,
  `render_join`, and the reads `eval_builtins`, `join_read`, `join_member`,
  `join_subset`; the declaration at the door is `check_lattice_decl` in
  `program.rs`; `Store::retire_keeping_firings`, `sweep`, `track_citers`,
  `drop_firings_citing`, `heights_where`, `dominators`, `founded_without` and
  `remove_firing` in `store.rs`; the judgement in safety.rofl's LATTICES
  section.
- **Subsumption** (`engine.rs`): `sub_admit` at `conclude`, `dominated` (a
  dominance question), `sub_withdraw` and `sub_nonmonotone` in
  `lattice_settle`, `sub_check` before a close, `render_sub`, `whynot_sub`;
  `cell_keylen` wherever a cell's key is taken; the rule at the door is
  `check_dominance` in `program.rs`, its rows `encode_dominance` and
  `decode_dominances` in `reflect.rs`; `Store::get_any` and
  `heights_where_head` in `store.rs`; the judgement in safety.rofl's
  SUBSUMPTION lines.
- **Store.** `store.rs` holds the cells (`CellRec`, `Member`, `Seal`,
  `PremRef::Cell`), their gc, heights, and their lines in `canonical_state`
  and `derivations`; `seed.rs` carries them through a snapshot.
- **Safety.** `safety.rofl`'s AGGREGATES section, compiled into
  `src/kernel-dense.ts` and signed into `ROFL_KERNEL_HASH`.
- **Prior art**, in the separate grafema repository, not this tree: `grafema:
  packages/rfdb-server/src/derive/tag.rs` (Idempotent and Invertible marker
  traits, with a battery of law tests) and `grafema:
  _ai/research/rfdb-datalog-engine-v2-spec.md` §4 and §6.

## The loop

Every closed cell is proved by a world that goes red under a planted fault,
and checking that is minutes of wall time, not hours (w_agg_fast_loop,
f_a_planted_fault_is_a_switch_in_one_build).

- **Engine edits.** `npm run test:fast` rebuilds `rofl-load` with the cargo
  profile `fast` (release semantics: no overflow checks, no debug assertions;
  no LTO, 256 codegen units, incremental) and runs `npm test` on it
  (`ROFL_PROFILE=fast`). A code edit in `engine.rs` rebuilds in about 9 s
  against 36 s for `--release`, which stays the default for the goldens,
  `rust/run_corpus.sh` and every gate; both take `ROFL_PROFILE`.
- **`npm test`** runs the worlds over a pool of node workers
  (`scripts/pool.ts`, `ROFL_JOBS`, default the machine less two), the Markdown
  worlds read at once, and the document, `[checks]` and fault-census checks
  beside them; the report is in world order whatever finishes first. About
  20 s.
- **Planted faults.** A fault in the engine is a switch,
  `brk!("id" => broken; original)` (`rust/rofl/src/breaks.rs`). Without
  `--features breaks` the macro is `original` and nothing else, so a normal
  build carries no fault and no switch. `scripts/agg_breaks.ts` builds
  `rust/target/breaks/rofl-load` once (profile `breaks`), turns one fault on
  per run with `ROFL_BREAK=id`, and runs each break's worlds in parallel. A
  fault in `safety.rofl` is that build reading a `kernel-dense.ts` compiled
  from the edited text (`ROFL_KERNEL_OVERRIDE`); a fault in another `.rofl`
  file is a copy loaded in its place; a fault in the TypeScript engine (an
  entry whose edits are to `src/`, census kind `ts`) is a copy of every file
  src/api.ts imports, edited, from which each world's TypeScript answer is
  taken, so it reds a world both engines answer. A world both answer says its
  alarms and its `-- expect-row:` and `-- expect-refusal:` lines through
  either engine, in `npm test` and here. Before any verdict the run checks that
  every switch has a site and every site a break, that every edit is found
  once, that `src/kernel-dense.ts` is current, and that every world, run with
  nothing switched on, equals its golden and raises nothing. About 30 s for
  all of them, most of it one world `lattice_keep_dominated` runs to its
  budget. `--legacy` plants each fault in the source and rebuilds, as before;
  29 breaks were run both ways over every agg world and agreed byte for byte.
- **A new fault** is a `brk!` site plus an entry with no `edits` in
  `scripts/agg_breaks.ts`; then `node --experimental-strip-types
  scripts/agg_breaks.ts --census --write`. The census is the world
  `agg_breaks_census`, which raises `switch_unplanted`, `site_orphan`,
  `site_not_switch`, `brk_expects_nothing` and `proof_world_unbroken` (a
  world `handled` closes a cell with that no fault turns red); `npm test`
  fails while it is stale.
- **Selection.** `npm run test:agg -- --item w_agg_threshold` (or `--world`,
  `--cell K:L`, `--file`) runs that item's proof worlds against the golden and
  the faults that must turn them red; `scripts/agg_breaks.ts --changed[=REF]`
  runs the faults a change since REF can move: all of them when the engine,
  the kernel or the harness changed (every script it runs, followed through
  its imports and the scripts they start), else those whose worlds load a
  changed file, or whose worlds facts/checks.rofl declares, or
  facts/goldens.rofl expects, differently than at REF (all of them when either
  file at REF does not load). A selected world no fault reads is red only when
  it closes a cell; otherwise the run says so and is green. A selection that
  checks a world reading a generated pack (the census, facts/spec-census.rofl)
  regenerates and compares that pack, as `npm test` does.
- **No fault from the shell.** `npm test`, `npm run bless` and the breaks
  refuse to run with ROFL_BREAK or ROFL_KERNEL_OVERRIDE set, and bless refuses
  the `breaks` profile or any rofl-load built with `--features breaks`.

## The matrix

A row is a kind (`agg_kind`) and a column is an obligation (`obligation`);
every pair is a cell. The counts are the queries below, not numbers here:
`? verdict[audit](agg, K, L, V)` is the matrix and `? open_cell[audit](agg, K,
S, L)` what is left.

**Rows:** `cell`, `count`, `sum`, `min_max_strat`, `threshold`, `order_lattice`,
`join_lattice`, `widening`, `tag_idempotent`, `tag_counting`, `holistic`,
`subsumption`, `sugar`, `empty_group`.

- `cell` is the substrate, the one cell engine. It is a row because its obligations are owned before any kind can use them. Its `strata` and `safety` cells are the cross-kind rules (a consumer of a recursive cell is monotone in it, a non-monotone read comes from a higher stratum, one algebra per predicate), owned by `w_agg_order_lattice`.
- The tag is two rows because the algebra splits it: an idempotent ⊕ may recurse and the counting one may not.
- `empty_group` is a row rather than a property of count and sum. It has its
  own witness (Sealed with no members), its own safety rule (the key is bound
  from outside), its own hole (a group cut short by the budget must not read
  0) and its own incremental hazard (the first member invalidates a sealed
  zero). Making count work on a group that has members tests none of these.

**Columns:**

- `syntax`: the Rust parser, the TS parser and the ring 1 grammar.
- `reflect`: encode, canon and reify, with the same rule ids in TS and Rust.
- `strata`: the dependency edge, `peel_rounds`, `rules/strata.rofl`, and the recursion gate on the algebra flag.
- `safety`: the slot kind, the projection key, monotone consumers, one algebra per predicate.
- `eval_rust`, `eval_ts`: evaluation in each engine.
- `witness`: the cell witness kind and its invariants.
- `why`: why and whynot.
- `wfs`: the well-founded mode policy.
- `ticks`: `@next` staging and `retain_ticks`.
- `holes`: overflow, budget and widening markers, each as a hole.
- `shrug`: the kind under the answer model: what it reads a shrug of is a
  shrug inherited from its roots, unless decided under every completion
  ("Shrugs, as built"). The columns are the owner's (`obligation_authorised`).
- `parity`: the goldens agree between engines.
- `phrase`: the sentence form.
- `incremental_ready`: the checks in the section above.
- `demo`: an acceptance demo from the catalogue.
- `retire`: the workaround it replaces is removed from the tree.

**Waivers** are scoped: `waiver_applies(Reason, K, L)` in `rules/agg.rofl`
says which cells each reason may waive, and any other use is `bad_waiver`.

- `no_surface`: the substrate's `syntax` and `phrase`.
- `no_own_syntax`: the empty group's `syntax` and `reflect` (it is written with count's).
- `sentence_form_only`: the sugar's `syntax`.
- `lowers_to_core`: the sugar's `reflect`, `strata`, `witness`, `wfs`, `ticks`, `incremental_ready`; never its evaluation or its safety.
- `no_workaround`: any `retire` cell with no site.

An open `retire` cell must name its site (`workaround_site`), and a waived one must have none.

**Off the queue.** A reason that is not work (`out_of_scope`,
`budget_exhausted`) takes a cell off the queue only with
`decided_not_work(agg, K, L, Finding)`, and in `agg_proofs` the finding must be
a recorded `decision`.

**Acceptance demos:**

- SLO burn rate across several windows, with proof rows and an `excise` of the budget: sum, holistic.
- Critical path and shortest taint path: order lattice.
- The linter as rules, replacing the counting-semiring hack in `scripts/lint.ts`: count.
- Voting with pivotality: empty group.
- A quorum of at least two independent witnesses, replacing `req_count`/`need_count` in `examples/moot` and `examples/goof`: threshold, sugar.
- Game of Life: cell.
- Minimax tic-tac-toe, with the draws computed by a well-founded world and read by the aggregating world above it (the composition from below, built by `w_agg_wfs_ticks`: `rofl-load --below`, `Session::feed_below`): min/max, stratified.
- Interval analysis with widening: join lattice, widening.
- A Pareto front of its own: subsumption.
- A tagged world whose tag equals the host fold on the same store: both tag rows.

### Extending it

- **A row:** `agg_kind(K).` and `algebra_class(K, C).`
- **A column:** `obligation(L).`
- `npm test` then fails with `unqueued` for every cell the new fact opened.
  Own each cell with `claim(queued, agg, K, none, L, W)`, or waive it with
  `ignored(agg, K, L, Reason)`.
- An item that carries a column across every row writes `work_sweeps(W, L)`.
  A named claim beats a sweep.

### Closing a cell

Write `handled(agg, K, L, "world")`, and in `facts/checks.rofl` declare the
world and what it proves:

    check_world("agg_count_syntax").
    check_file("agg_count_syntax", "examples/checks/agg-count-syntax.rofl").
    proves("agg_count_syntax", agg, count, syntax).

- The world's alarms must establish the property. A world proves only the
  cells `proves` names (`proof_unbound`), so a world written for one cell
  cannot close another.
- At least one of its files is `examples/checks/agg-*` (`proof_off_convention`),
  so an unrelated check world cannot be borrowed, and none is the ledger or its
  registry (`proof_is_ledger`), so `agg_proofs` cannot prove itself.
- A `strata` cell of a stratified kind also needs `proves_refusal(World, K)`, a
  world in which K inside recursion is refused; a recursive kind needs
  `proves_recursion(World, K)` (`strata_without_refusal`, `strata_without_recursion`).
- An item that owns no cell, or owns `contradiction_site` prose, is done only
  with `work_proof(Item, "world")` and `proves_work("world", Item)`
  (`done_by_assertion`, `work_proof_unbound`).
- A walked golden world does not work as a proof: its name exists only in
  `facts/goldens.rofl`, and a world that loads the golden it is hashed into
  never blesses.
- `handled` with `none`, or with no fourth argument, raises `closed_without_proof`.
- A proof file is named for the world it was written for, not for the column
  it covers: `agg-holistic-holes-check.rofl` is agg_holistic_eval's, and the
  holes column's holistic file is `agg-holistic-holes-column.rofl`. Look
  before writing into `examples/checks/`; most of it is untracked on the
  branch, and git cannot give back a file it never held
  (f_a_new_proof_file_overwrote_an_old_one_of_the_same_name).

Two worlds load the ledger:

- `rules_agg` is walked and loads `facts/agg.rofl` and `rules/agg.rofl`. A
  registry or findings row there was written by the ledger about itself and
  raises `registry_in_ledger`; a proof is counted as `proof_unverified`.
- `agg_proofs` is declared in `facts/checks.rofl` and also loads the registry
  and `facts/findings.rofl`, whose `registry_file(checks)` sentinel turns the
  proof and decision checks on. The one forgery left is writing that sentinel
  into the ledger, which is a line in a diff and nothing else.

`npm run test:agg` plants one fault per alarm in a copy of the ledger or the
registry (`scripts/agg_mutants.ts`), in both engines, and checks that each
alarm fires and that a cell closed the right way raises none, over a worker
pool in about 8 s; it is not part of `npm test`.

### Alarms

An alarm fails `npm test` whatever the golden says. These are alarms:

- queue: `unqueued`, `queue_stale`, `double_owned`, `false_done` (a done item with any claimed cell not closed by a proof), `done_by_assertion`;
- claims: `double_claimed`, `orphan`, `unknown_ledger`;
- reasons and waivers: `stale_reason`, `bad_reason`, `bad_waiver`, `undecided_not_work`, `decision_stale`, `decision_not_a_finding`, `reason_unclassified`;
- proofs: `registry_in_ledger`, `closed_without_proof`, `proof_not_a_world`, `proof_world_empty`, `proof_unbound`, `work_proof_unbound`, `proof_is_ledger`, `proof_off_convention`, `binding_not_a_world`, `binding_orphan`;
- algebra: `algebra_undeclared`, `algebra_unknown`, `two_algebras`, `strata_without_refusal`, `strata_without_recursion`;
- retire column: `retire_unsited`, `retire_waived_sited`;
- blockers: `blocker_unknown`, `blocker_stale`;
- work items: `needs_unknown`, `work_needs_cycle`, `work_unstated`, `work_stateless`, `work_bad_state`, `work_sweeps_nocolumn`, `held_unknown`.

`next_work`, `blocked`, `nothing_workable` and `in_flight` are expected to
have rows, so they are not alarms.

## How to query the queue

    npm run repl -- facts/agg.rofl rules/agg.rofl
    ? next_work[audit](W)
    ? owner[audit](agg, K, S, L, w_agg_cell_store)
    ? unqueued[audit](agg, K, S, L)
    ? verdict[audit](agg, count, L, V)

Output as of 2026-09-30, after w_agg_subsumption, queried again after the
full gates (cargo, `npm test`, `test:agg`, `test:agg:breaks`, docs, textcheck)
passed on the finished tree:

- Items: 15 done (`w_agg_baseline`, `w_agg_session_tests`, `w_agg_cell_store`,
  `w_agg_body_strat`, `w_agg_order_lattice`, `w_agg_threshold`,
  `w_agg_holistic`, `w_agg_wfs_ticks`, `w_agg_fast_loop`,
  `w_agg_overflow_holes`, `w_agg_shrug`, `w_agg_join_lattice`,
  `w_agg_widening`, `w_agg_tags`, `w_agg_subsumption`), 13 open, none taken.
- Cells: 238 (14 kinds by 17 obligations). 143 modelled, each closed by a proof
  world; 16 waived; 79 not modelled.
- `next_work` returns `w_agg_phrase`, the takeable item something else waits
  on. Also takeable: the demos
  `w_agg_demo_critical_path`, `w_agg_demo_interval`, `w_agg_demo_life`,
  `w_agg_demo_linter`, `w_agg_demo_minimax`, `w_agg_demo_slo` and
  `w_agg_demo_voting`, then `w_agg_reconcile_docs` and
  `w_agg_retire_workarounds`.
- `blocked` returns `w_agg_demo_quorum`.
- `in_flight`, `nothing_workable` and `unqueued` are empty.
- `eval_ts` and `parity` are modelled on every row (w_agg_ts); `demo` is modelled for the
  tags and subsumption alone; `holes` and `shrug` are modelled for every kind
  built and claimed by the item of the one not (the sugar, whose `eval_rust`,
  `safety`, `why`, `holes` and `shrug` wait on `w_agg_phrase`);
  `phrase` and `retire` are open wherever not waived, and `incremental_ready` is closed in every row
  (w_agg_incremental_ready, 2026-10-02). Not
  modelled on any column: `sugar`, apart from its waivers.

## Contradictions still in the tree

The prose that says there is no aggregation is `contradiction_site(Item, Path,
What)` in `facts/agg.rofl`, and an item that owns any is done only with a proof
world. `w_agg_reconcile_docs` owns `LIMITS.md` (`l_no_aggregation`),
`START.md` section 8, `docs/roadmap.md` 1.1, `facts/spec.rofl`
(`s8_out_of_scope`), `facts/deviations.rofl` (rendered into `README.md`) and
`rules/worklist.rofl`. `w_agg_retire_workarounds` owns the prose beside each
workaround in `examples/`, which goes when the workaround goes.

The retire column owns the workarounds themselves (`workaround_site`): the
counting-semiring linter in `scripts/lint.ts`, the fold in `examples/wtf`,
the sums in `examples/slop`, `examples/spat`, `examples/aka` and
`examples/blam`, `seq_later` in `rules/js-dataflow.rofl`, the quorum counts in
`examples/moot` and `examples/goof`, the host argmin in `examples/rip`, the
interval merge in `examples/spat` and the set search in `examples/moot`, the
host semiring folds (`runtime/semirings.ts`, `examples/huh`, `examples/spat`),
and the rankings in `examples/huh` and `examples/blam`.
`examples/notebook/gen_ledger_facts.ts` is not one: it measures a string's
length and asks the filesystem, neither an aggregate.

As built, 2026-10-02 (`w_agg_retire_workarounds`, proved by the world
`agg_prose`, whose census is red while a `workaround_marker` still matches a
site the ledger does not keep): the sites above are retired except two, kept
with their reason as `workaround_kept` rows. `examples/slop` keeps its `SUM`
chain, because a sum is refused where the relations it reads are in the same
recursive component as its conclusion, and a sheet's formulas read each other
(`f_an_aggregate_is_refused_by_relation_and_not_by_data`); and
`runtime/semirings.ts` stays, because it is the fold of a support with its
declared discipline, which a kernel tag does not replace. The host folds
follow a sealed cell now (`src/semiring.ts`: a group cell is the product of
its members, a best cell the sum of those that reach the value, a quorum the
product of its N members), which is what let `aka`, `wtf`, `goof` and `moot`
keep their provenance and counts through an aggregate
(`f_the_semiring_fold_followed_a_cell_as_one`). A quorum has N members, so a
fold over a threshold is a lower bound when more than N support
(`f_a_deduplicated_member_keeps_one_derivation`).

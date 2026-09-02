# BLAM — what a diff hits, and why

Affected targets in a monorepo build graph, **with the derivation**.

Bazel, Nx and Turborepo compute the affected set correctly and fast. This
computes the same set. What it adds is the part none of them have: two
questions that get asked every day and have no answer in any build tool,

- *why did CI rebuild this, I never touched it* — and the answer is a chain of
  edges, not the word "affected";
- *why did CI **not** rebuild this, I just broke it* — and the answer is the
  front where the reachability walk stopped, which is what a missed regression
  looks like before it becomes an incident;

plus two the tools do not even have a place to put:

- *how many independent routes lead from the diff to this target* — the
  counting semiring, folded over the support the kernel already recorded;
- *which single edge should we cut so this stops happening* — the provenance
  semiring, folded over the dependency edges alone.

The first two are `why` and `whynot`. The second two are semirings over the
same five rules. Nothing here is written for a particular carrier.

## How to run

```sh
node --experimental-strip-types examples/blam/demo.ts     # the full transcript
node --experimental-strip-types --test test/example-blam.test.ts
```

Or drive it by hand:

```sh
npm run repl examples/blam/blam.rofl
changed("packages/utils/src/str.ts").
? affected(T)
why affected(t(web, build))
whynot affected(t(docs, build))
```

## The model

Eight packages, eleven dependency edges, sixteen targets, twelve files.
Small enough to hold on one screen, which a real build graph is not, and
that is the whole argument for a toy: every number below can be checked by
hand as well as by the oracle.

```
                 config
                /   |   \
          core -+   |    +- docs
         /   \      |      /
        |     utils-+-----+
        |     /   \
        |   ui     +-- api
        |    \        /   \
        +-----+-- web      cli
```

Four things in that shape are load-bearing:

- **the diamond** `utils -> {api, ui} -> web`. Two branches converge on `web`,
  so a change in `utils` reaches it by two routes and the counting semiring
  answers 2 rather than 1 without anyone arranging it.
- **the global config**. Every package reaches `config`, so one line in
  `config/build.config.json` rebuilds all sixteen targets. That is the
  commonest real pathology in a monorepo and the one an affected-set tool
  reports as a single word.
- **`docs`**, which a `utils` diff cannot reach. Without an unreachable target
  there is nothing to point `whynot` at.
- **`shared/schema/events.json`**, owned by **two** targets (`api:build` and
  `ui:build` both code-generate from it). Ownership is many-to-many; a
  package-per-directory model cannot say that.

Each package has a `build` and a `test` target, and the test target needs its
own build. Test targets own files too — `packages/utils/test/str.spec.ts`
belongs to `utils:test` — and nothing depends on a test target, so changing
that file rebuilds exactly one thing.

`minutes/3` is a declared cost table from CI history. **No rule reads it**:
v0 has no aggregation (LIMITS.md), so the money arithmetic in section 6 of the
transcript is host-side, over an engine-computed provenance fold. It lives in
`blam.rofl` because it is a property of the repository, not of the script.

## The rules

Five clauses, and the carrier is named in none of them. Two build the target
graph from the package graph — which is exactly what Nx and Turborepo do
internally — and three are the inquiry:

```prolog
needs(t(P, test),  t(P, build))  :- package(P).
needs(t(P, build), t(Q, build))  :- pkg_dep(P, Q).

reaches(F, T)  :- owns(T, F).
reaches(F, T)  :- needs(T, U), reaches(F, U).

affected(T)    :- changed(F), reaches(F, T).
```

`changed/1` is not in `blam.rofl`. A build graph outlives any particular diff,
so the diff is asserted per run — which is also why swapping scenarios costs
nothing.

`needs(T, U)` is named in the body of the recursive rule on purpose: because
it is a premise, it appears as a node in every `why` tree, and the answer is
the chain of edges rather than a verdict.

### Acyclicity, and why counting is safe here without a closure operator

A build graph is acyclic by construction. A cycle in `pkg_dep` is a
configuration error that Bazel, Nx and Turborepo all reject at load, and so
does any build that terminates. So the support hypergraph of `reaches` has no
cycle, the counting fold converges by plain Kleene iteration, and the number
it reports is the number of distinct dependency **paths** from the changed
file to the target. Finite, exact, meaningful.

**Do not copy that reasoning into a domain with cycles.** The instance used
here (`runtime/semirings.ts` `countingSemiring`) is declared CLOSED and carries
a `star`; on cyclic data it multiplies every fact on a cycle by `star(one)` and
correctly answers `infinitely many`, because a fact on a cycle really does have
unboundedly many derivations. That is the engine being right, and it is a
useless metric.

The rule file says so, and the demo proves both halves rather than asserting
them: it reports `cyclic: 0` on this graph, then loads one forbidden edge
(`pkg_dep(utils, ui)`, closing `utils <-> ui`) and shows the same instance
answering `infinitely many` for every target that reaches the cycle, with the
Boolean verdicts unchanged. `examples/nope/` is the sibling case: an
assume-role graph *has* cycles, and the count there is only a number because
the model carries the path inside the fact so that the *support* graph is
acyclic even though the role graph is not. Here no such trick is needed, and
the reason is a property of build graphs, not of these rules.

### What the count means here

`f_counting_reads_oppositely_by_domain` asks every example to say which
reading of "number of derivations" applies to it, because the same metric
reads in opposite directions across domains. In BLAM the count is
**coupling**, and a high one is a **defect**.

Two routes from a diff to a target mean the target is dragged into the
rebuild by two independent chains, so removing either one changes nothing and
the rebuild is that much harder to stop. Five routes mean it is wired into
everything. That is the opposite sign to `examples/nope/` and
`examples/oops/`, where independent supports mean a conclusion *survives*
losing one, and opposite again to AKA, where many routes mean ambiguity.

Operationally the number and the cut analysis are the same fact: the count is
how many routes a cut would have to break, and a count of 1 is the only case
a single edge can fix. The metric is one metric; its sign belongs to the
domain, and here the domain says lower is better.

## The transcript

Real output of `node --experimental-strip-types examples/blam/demo.ts`,
pasted whole. Nothing below was composed by hand.

```
BLAM — what a diff hits, and why.
affected targets in a monorepo build graph, computed by the ROFL kernel

graph   8 packages, 11 dependency edges, 16 targets, 12 files
rules   examples/blam/blam.rofl — 2 build the target graph, 3 are the inquiry
diff    packages/utils/src/str.ts

== 0. the repository =========================================================
  api     needs core utils      60+ 90 min
            packages/api/src/client.ts shared/schema/events.json
  cli     needs api             20+ 25 min
            packages/cli/src/main.ts
  config  needs —                1+  1 min
            config/build.config.json config/tsconfig.base.json
  core    needs config          40+ 55 min
            packages/core/src/index.ts
  docs    needs config core     35+ 10 min
            packages/docs/src/gen.ts
  ui      needs utils           70+ 45 min
            packages/ui/src/button.ts shared/schema/events.json
  utils   needs config core     25+ 30 min
            packages/utils/src/num.ts packages/utils/src/str.ts
            packages/utils/test/str.spec.ts [test]
  web     needs api ui         240+310 min
            packages/web/src/app.ts
  16 targets in all; every package has a build and a test target, and the
  test target needs its own build. Files marked [test] belong to the test
  target, so nothing downstream depends on them.

  shared/schema/events.json has 2 owners: api:build and ui:build.
  Ownership is many-to-many (both code-generate from it), which is exactly
  what a package-per-directory model cannot say.

== 1. what CI will rebuild ===================================================
one file changed. 10 of 16 targets are affected:
  api:build api:test cli:build cli:test ui:build ui:test utils:build
  utils:test web:build web:test
spared: config:build config:test core:build core:test docs:build docs:test
cost:   915 minutes of the repository's 1057

Bazel, Nx and Turborepo print this set too, and it is the same set.
Everything below is what they do not print.

== 2. why did CI rebuild web:build? I never touched it =======================
$ why affected(t(web,build))
affected[main](t(web,build))  <= ra23d9c41 @tick 0
  changed[main]("packages/utils/src/str.ts") [axiom]
  reaches[main]("packages/utils/src/str.ts",t(web,build))  <= re402eac5 @tick 0
    needs[main](t(web,build),t(api,build))  <= rb7a77a0d @tick 0
      pkg_dep[main](web,api) [axiom]
    reaches[main]("packages/utils/src/str.ts",t(api,build))  <= re402eac5 @tick 0
      needs[main](t(api,build),t(utils,build))  <= rb7a77a0d @tick 0
        pkg_dep[main](api,utils) [axiom]
      reaches[main]("packages/utils/src/str.ts",t(utils,build))  <= r41cf71f6 @tick 0
        owns[main](t(utils,build),"packages/utils/src/str.ts") [axiom]

every edge is named. Read the axioms upward and that is the sentence a
build tool cannot produce: the file is owned by utils:build, api needs
utils, web needs api.

== 3. why did CI NOT rebuild docs:build? I am sure I broke it ================
the dangerous half. An empty result is not an answer — this is the front
where the reachability walk stopped, and it is what a missed regression
looks like before it becomes an incident.

$ whynot affected(t(docs,build))
whynot affected[main](t(docs,build)):
  rule ra23d9c41: affected[main](?T)@now :- changed[main](?F)@now, reaches[main](?F,?T)@now
    failed premise: reaches[main]("packages/utils/src/str.ts",t(docs,build))
      rule re402eac5: reaches[main](?F,?T)@now :- needs[main](?T,?U)@now, reaches[main](?F,?U)@now
        failed premise: reaches[main]("packages/utils/src/str.ts",t(config,build))
          rule re402eac5: reaches[main](?F,?T)@now :- needs[main](?T,?U)@now, reaches[main](?F,?U)@now
            failed premise: needs[main](t(config,build),?U#2)
              rule rb7a77a0d: needs[main](t(?P,build),t(?Q,build))@now :- pkg_dep[main](?P,?Q)@now
                failed premise: pkg_dep[main](config,?Q#3)
                  no rule concludes 'pkg_dep' and no matching base fact exists
              rule r9c7a66bc: head does not unify
          rule r41cf71f6: reaches[main](?F,?T)@now :- owns[main](?T,?F)@now
            failed premise: owns[main](t(config,build),"packages/utils/src/str.ts")
              no rule concludes 'owns' and no matching base fact exists
        failed premise: reaches[main]("packages/utils/src/str.ts",t(core,build))
          rule re402eac5: reaches[main](?F,?T)@now :- needs[main](?T,?U)@now, reaches[main](?F,?U)@now
            failed premise: reaches[main]("packages/utils/src/str.ts",t(config,build))
              rule re402eac5: reaches[main](?F,?T)@now :- needs[main](?T,?U)@now, reaches[main](?F,?U)@now
                failed premise: needs[main](t(config,build),?U#7)
                  rule rb7a77a0d: needs[main](t(?P,build),t(?Q,build))@now :- pkg_dep[main](?P,?Q)@now
                    failed premise: pkg_dep[main](config,?Q#8)
                      no rule concludes 'pkg_dep' and no matching base fact exists
                  rule r9c7a66bc: head does not unify
              rule r41cf71f6: reaches[main](?F,?T)@now :- owns[main](?T,?F)@now
                failed premise: owns[main](t(config,build),"packages/utils/src/str.ts")
                  no rule concludes 'owns' and no matching base fact exists
          rule r41cf71f6: reaches[main](?F,?T)@now :- owns[main](?T,?F)@now
            failed premise: owns[main](t(core,build),"packages/utils/src/str.ts")
              no rule concludes 'owns' and no matching base fact exists
      rule r41cf71f6: reaches[main](?F,?T)@now :- owns[main](?T,?F)@now
        failed premise: owns[main](t(docs,build),"packages/utils/src/str.ts")
          no rule concludes 'owns' and no matching base fact exists

docs:build owns no changed file, and neither of the two targets it
needs is reached; config:build has no dependencies at all, so the walk ends
there. If docs really does import utils, THAT is the bug: the edge is
missing from the build graph, and CI has been silently not testing it.

== 4. how many independent routes? (counting) ================================
  api:build      1
  api:test       1
  cli:build      1
  cli:test       1
  ui:build       1
  ui:test        1
  utils:build    1
  utils:test     1
  web:build      2
  web:test       2

web:build is reached TWICE: web needs api, api needs utils; and web needs
ui, ui needs utils. That is the diamond, and the number is why no single
dependency removal will keep web out of this rebuild (section 6).

the counting fold reports cyclic: 0 — no fact in this store lies on a
cycle of the support hypergraph, because a build graph is acyclic by
construction. THAT is what makes the number finite and meaningful, not
anything about these rules. The same semiring instance on a cyclic graph:

  $ load pkg_dep(utils, ui).      -- one forbidden edge: utils <-> ui
  cyclic: 14
  api:build      infinitely many
  api:test       infinitely many
  cli:build      infinitely many
  cli:test       infinitely many
  ui:build       infinitely many
  ui:test        infinitely many
  utils:build    infinitely many
  utils:test     infinitely many
  web:build      infinitely many
  web:test       infinitely many

the instance is CLOSED and carries a star, so it answers "infinitely many"
rather than growing forever. Correct, and useless — which is the reason to
state the acyclicity in the rule file instead of relying on it silently.

== 5. in what order? (tropical) ==============================================
  wave 0   utils:build                                25 min
  wave 1   api:build ui:build utils:test             160 min
  wave 2   api:test cli:build ui:test web:build      395 min
  wave 3   cli:test web:test                         335 min

4 waves. Wave 0 can start the moment CI has the diff; everything else
waits on the wave above it. Min-plus gives the EARLIEST wave a target can
be reached in — a lower bound on when it may start, not a schedule: a real
scheduler wants the longest path, and that is a different semiring.

== 6. which single edge should we cut? (provenance + tropical) ===============
the question that turns the report into a design decision. An edge whose
removal disconnects a target from a file is one that lies on EVERY route:
the intersection of the provenance polynomial, folded over `pkg_dep` alone.

over every single-file diff this repository admits:
  edge              pairs cut   minutes no longer triggered
  ui -> utils           10         575
  web -> api             2         550
  web -> ui              2         550
  api -> utils           8         390
  cli -> api            14         315
  core -> config         4         190
  utils -> core          4         170
  docs -> core           2          45
  api -> core            0           0
  docs -> config         0           0
  utils -> config        0           0

cut ui -> utils and 575 minutes of rebuild stop being triggered
across the 12 single-file diffs — more than any other single edge. It is
NOT the edge that decouples the most PAIRS: that is cli -> api, at 14 pairs
and 315 minutes. Counting couplings and counting money rank the graph
differently, and only one of them is the question anybody actually has.
Three edges score zero: cutting api -> core, docs -> config, utils -> config
decouples nothing at all, because every route they carry has an alternative.

for the diff at hand (packages/utils/src/str.ts):
  cut api -> utils     frees api:build api:test cli:build cli:test  195 min
  cut ui -> utils      frees ui:build ui:test                    115 min
  cut cli -> api       frees cli:build cli:test                   45 min

  web:build appears in no row: the intersection of its two routes is
  0 edges wide. No single cut removes it — and the count of 2 in
  section 4 and this empty intersection are the same fact seen twice.

  $ retract pkg_dep(api, utils)   -- and re-run the fixpoint
  affected: 10 targets / 915 min  ->  6 targets / 720 min
  ui:build ui:test utils:build utils:test web:build web:test
  oracle: AGREE — the predicted blast radius of cutting api -> utils
  waves: 4 -> 4. The critical depth does not move, because
  web:build is still reached — through ui. To take web out of a utils diff you
  must cut both branches of the diamond, which is what the 2 was telling you.

== 7. the other diff: one line in the global config ==========================
$ changed("config/build.config.json")
affected: 16 of 16 targets — the whole repository, 1057 minutes.
routes from that one file to each target:
  api:build      3
  api:test       3
  cli:build      3
  cli:test       3
  config:build   1
  config:test    1
  core:build     1
  core:test      1
  docs:build     2
  docs:test      2
  ui:build       2
  ui:test        2
  utils:build    2
  utils:test     2
  web:build      5
  web:test       5

web:build is reached FIVE ways. "Delete one dependency and the config stops
rebuilding web" is false, and the number says how false: you would have to
cut five routes. This is the commonest real pathology in a monorepo, and
it is the one an affected-set tool reports as a single word.

$ why affected(t(config,test))
affected[main](t(config,test))  <= ra23d9c41 @tick 0
  changed[main]("config/build.config.json") [axiom]
  reaches[main]("config/build.config.json",t(config,test))  <= re402eac5 @tick 0
    needs[main](t(config,test),t(config,build))  <= r9c7a66bc @tick 0
      package[main](config) [axiom]
    reaches[main]("config/build.config.json",t(config,build))  <= r41cf71f6 @tick 0
      owns[main](t(config,build),"config/build.config.json") [axiom]

== the oracle ================================================================
the same transitive closure computed a second time in plain TypeScript,
sharing only the base facts — no rules, no derived relations, no semiring.
Every file of the repository taken as a single-file diff, against every
target, on both the verdict and the route count.

  sample: 12 files x 16 targets = 192 (changed file, target) pairs
  verdict mismatches: 0
  route-count mismatches: 0
  oracle: AGREE — 192 (changed file, target) pairs, verdict and route count

== summary ===================================================================
2 comparisons against an independent closure:
  AGREE     the predicted blast radius of cutting api -> utils
  AGREE     192 (changed file, target) pairs, verdict and route count

the engine and the hand-written closure compute the same sets and the same counts.
(1193 ms)
```

## What this gives over Bazel

Honestly: **by result, nothing.** It computes the same affected set, and it
computes it on a toy graph with an engine that re-runs the whole fixpoint from
scratch on every change (LIMITS.md: there is no incremental maintenance). On
throughput, Bazel wins and it is not close.

By question, four:

1. **Why did this rebuild.** The chain, with every edge named, down to the
   ownership axiom. `bazel query 'somepath(//web, //utils)'` gives you *a*
   path through the target graph; it does not tell you which file in the diff
   started it, and it is a separate command you have to know to run against a
   hypothesis you have already formed. `why affected(t(web,build))` is the
   same query the tool already ran, printed instead of discarded.
2. **Why did this NOT rebuild.** No build tool answers this at all, because
   the absence of a target from a set carries no information about why it is
   absent. `whynot` walks the same rules downward and returns the front where
   the walk stopped: this target owns no changed file; neither of the two
   targets it needs is reached; and `config:build` has no dependencies at all,
   so there is nowhere further to look. If the code really does import the
   thing you changed, the missing edge in the build graph is the bug — and
   this is how you find it *before* the regression ships.
3. **How coupled is this target.** One route means removing one dependency
   stops the rebuild. Five routes mean the target is wired into everything.
   No build tool reports connectivity, because computing the affected set
   does not require it — but the kernel already recorded the support, so the
   number costs one fold.
4. **Which single edge to cut.** The practical one, and the least obvious.
   An edge whose removal disconnects a target from a file is an edge that
   lies on *every* route to it: the intersection of the provenance polynomial.
   That turns the tool from reporting into design.

Two results from (4) that are worth stating because they are not what one
guesses:

- The edge that decouples the most **couplings** (`cli -> api`, 14 pairs) is
  not the edge that saves the most **time** (`ui -> utils`, 575 minutes).
  Ranking a graph by counting is not the same as ranking it by money, and only
  one of the two is anybody's actual question.
- Three of the eleven edges (`api -> core`, `docs -> config`,
  `utils -> config`) decouple *nothing*: every route they carry has an
  alternative. They are free to keep and free to delete. A graph-shaped
  dependency review would spend time on them; this ranking says not to.

And the counting answer and the cut answer are the same fact seen twice: for
`web:build` under a `utils` diff, the polynomial has two monomials sharing no
edge, so the intersection is empty and no single cut removes it — which is
exactly what the 2 in section 4 meant.

## The oracle

Free and independent: the same transitive closure computed a second time in
plain TypeScript (`oraclePaths` in `demo.ts`), memoized depth-first over the
target graph, sharing **only the base facts** — no rules, no derived
relations, no semiring. Then every file of the repository is taken as a
single-file diff and compared against every target, on the verdict *and* on
the route count.

```
sample: 12 files x 16 targets = 192 (changed file, target) pairs
verdict mismatches: 0
route-count mismatches: 0
```

A second, smaller oracle rides along in section 6: the provenance fold
*predicts* the affected set after cutting `api -> utils`, and the demo then
actually retracts the edge and re-runs the fixpoint. The prediction and the
re-evaluation agree, which is the only reason to believe the polynomial
intersection means what the prose says it means.

The oracle also refuses to answer on a cyclic package graph — it throws rather
than returning a wrong finite number — which is what makes it a usable check
on the cyclic variant.

## Where the kernel fought us

Four things, all worth knowing before writing the next model.

**1. `dep/2` is boot.rofl's, and nothing tells you.** The obvious name for a
build-graph edge is `dep`. `boot.rofl` concludes into `dep/2` for its own
rule-dependency graph, and relations are global: loaded together, the target
edges and boot's stratification edges become one relation. Boot's `reach`
then closes over both, the counting fold reports facts on a cycle that are
not yours, and `why` on a domain fact starts quoting rules about
`concludes`/`premise_pos`. Nothing errors. The audits stay empty. The answers
just quietly stop meaning what they say — the first version of this example
reported `cyclic: 11` on an acyclic build graph, which is the symptom that
led back to the collision. The edge relation is called `needs` for that
reason, and `test/example-blam.test.ts` asserts no target term ever appears in
`dep/2` when both files are loaded.

**2. `query` takes one literal, and a conjunctive query fails as data.**
`r.query('owns(T, F), T = t(config, K)')` returns `rows: []` with
`error: "line 1: expected 'eof', got ','"`. A caller that reads `.rows` and
not `.error` prints an empty column and calls it a result — which is what the
first draft of section 0 of the transcript did. Every read in `demo.ts` now
goes through a helper that throws on `error`. The pattern query
`owns(t(config, K), F)` does the same job, so the limitation costs nothing
once you know about it; silently returning zero rows for a parse error is the
part that costs.

**3. Query bindings come back in canonical term form, quotes included.** A
file binding is the seven-character-longer string `"packages/…"`, not
`packages/…`. Building a fact key with `JSON.stringify` on a binding
double-quotes it, the `Map.get` misses, and the fold reads as "this pair has
no routes" — a silent zero, not an error. The whole first cut-ranking table
came out as zeros for exactly this reason. Canonical form is what travels
between queries and fact keys; unquoting is for the transcript only.

**4. `whynot` explores every rule that could conclude the literal, including
the ones whose head cannot unify.** `rule r9c7a66bc: head does not unify` in
the section 3 tree is the `needs(t(P,test), t(P,build))` rule being ruled out
against `t(config,build)`. That is honest and it is the right default — a
demonstration that silently skipped candidate rules would be a weaker
demonstration — but it does mean the tree has structural noise in it that the
prose has to name. The recursion terminated on its own here: no depth or node
bound fired, which the test asserts, because a front that was truncated by a
budget is not a front.

Nothing in the semiring layer fought us at all. The counting, tropical and
provenance folds needed no coaxing: one `evaluateSemiring` call each over the
support the kernel had already recorded, with a base annotation for
provenance and a unit weight for tropical. The `@next` carry idiom that
`examples/oops/` found poisoned counting never came up, because nothing in
this model is temporal — and it no longer poisons anything: the fold is about
one tick, so a carried fact is a given in the tick that reads it.

## Limits of this model

- **The graph is asserted, not scanned.** A real deployment reads `pkg_dep`
  and `owns` out of `package.json`/`BUILD` files and a path map; `scanners/`
  is where that would live. Nothing about the rules changes.
- **No incremental maintenance** (LIMITS.md). Every diff is a fresh fixpoint
  over the whole graph. That is fine at 16 targets and is not fine at 16,000;
  the answer there is not this engine.
- **Ownership is exact-path.** Real build tools match globs. Glob expansion
  would be data, the way `action_in`/`resource_in` are data in
  `examples/nope/` — the kernel has no string builtins, so the expansion is
  the host's job either way.
- **Min-plus gives the earliest wave, not a schedule.** `wave k` is the
  shortest dependency distance from the diff, so it is a lower bound on when
  a target may start. A scheduler wants the *longest* path (nothing may start
  before all of its dependencies finish), which is a different semiring, and
  a max-plus instance would be BOUNDED only because this graph is acyclic —
  the same caveat as counting, one step further along.
- **The cost table is declared, not measured.** The minutes are plausible
  numbers, not observations, and the section 6 ranking is only as good as
  they are. The ranking by *pairs* in the same table needs no cost model at
  all, and the two disagreeing is itself the finding.
- **Single-edge cuts only.** The intersection of the polynomial answers
  "which one edge", and answers "none" for the diamond. It does not search
  for minimal edge *sets* — that is the same boundary `whynot` has against
  multi-fact abduction (LIMITS.md), for the same reason.

## Files

- `blam.rofl` — the graph as facts, plus the five rules.
- `demo.ts` — the runnable transcript above, and every helper the test uses.
- `page.html` — the same story for a reader who is not going to run it, at two
  levels: plain and engineer.
- `../../test/example-blam.test.ts` — ten tests, 2.8 s: the four queries, the
  diamond at count 2, the stopping front (asserted to be a front and not a
  truncation), the cyclic variant answering `infinitely many`, the cut
  prediction confirmed by re-evaluation, the 192-pair oracle, range
  restriction (`every rule .safe`, `demandRels.size === 0`), and the
  `dep/2` collision regression.

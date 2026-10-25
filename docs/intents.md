# Intents: a world that wants, and adapters that do

PRD, decisions and spec in one file. Designed with the owner on 2026-10-23;
every decision below is his or was accepted by him in that conversation, and
the open questions at the end are not decided. Nothing here is built yet. The
phases and their order are in `facts/worklist.rofl` (`w_intent_*`).

## 1. Why

A ROFL world today reads what it is given, plus one kind of request it can
make itself: `scan_request(Kind, Path)` runs a scanner and loads what it
prints (docs/cli.md, *A world that asks for its own input*). Everything else a
world might need from outside — a row of a database, the state of an issue in
a tracker, a page of a remote API — has to be pulled in whole beforehand by a
script the world knows nothing about. And a world never acts: what it
concludes an agent or a person should do stays a relation somebody else must
read and carry out by hand, without the world knowing whether it happened.

**The goal (CLAUDE.md) this serves.** The engine is for agents. An agent that
can ask a world "what should be done, and why" and then cannot let the world
do it — or cannot let the world fetch the one fact it is missing — has to
rebuild that loop outside, where nothing explains it. With intents:

- a world fetches only what its question needs (a query to a database instead
  of the database imported), which is the cone of docs/demand-cones.md carried
  past the edge of the store;
- a world's conclusion that something should be done becomes a request with a
  why-tree, executed by an adapter, and the outcome comes back as facts the
  world reasons about, failure and "we do not know if it happened" included;
- every external call is explained (which rule, which facts asked for it) and
  every fact that came back says where from and when.

**What it is not.** Not a scripting layer, not a call stack, not a way for a
rule to write into the world directly. A rule declares a need; whether and
when the need is met is visible as facts, never assumed.

## 2. The words

Four things are easily read as one ("a plugin", "an effect", "a library", "an
external call"). They are four, and three of them get names:

| what | name |
|---|---|
| a derived row: "the world wants X with these arguments" | **want** |
| a declared form of something the world can want: its arguments, what comes back, its class | **capability** |
| what executes capabilities: a remote server, a program, a database connection, a renderer | **adapter** |
| what comes back | **facts** — ordinary facts whose provenance names the adapter and the want |

- **Effect** is not a name: it is the *class* of a capability, one of
  `reads`, `shows`, `does`.
- **Library** stays the word for rules (`rules/net/`, ...). A library may
  require capabilities; it never executes anything.
- **A scanner is an adapter** whose capabilities all read. Nothing new is
  added beside `scanner`/`scan_request`; they become the first case of the
  general form (phase 3).

Rejected names, with the reason: `invoke` (a rule invokes nothing: between it
and the call stand permission, deduplication and possibly a missing adapter;
"invoked" is the word of the execution journal, where it is true); `receipt`
(what returns is facts, not a separate entity); `ask` and `demand` (taken by
`rofl ask` and by demand cones).

## 3. Decisions

### D1. An adapter's manifest is a ROFL book, and using it is importing it

To call a capability the world must know it exists, which is a fact read from
somewhere; reading it is importing the adapter's book. So the manifest is that
book, written in ROFL, versioned in git like any rule.

```
-- adapters/tracker.rofl — generated from the server's tools/list, 2026-10-23
adapter(tracker, mcp, "https://mcp.tracker.example").
adapter_auth(tracker, env, "TRACKER_TOKEN").
capability(tracker_transition, tracker, does).
arg(tracker_transition, 1, issue_key, text).
arg(tracker_transition, 2, to, text).
idempotent(tracker_transition, engine).
```

Discovery is not a runtime mechanism but **an engine feature that generates
the book**: `rofl adapter mcp URL` (and `openapi URL`, `exec CMD --describe`)
prints it. Pinning a version is git; a server that changed its schema is a
diff in a PR after regeneration. Books of adapters that cannot describe
themselves (a program, a database, a renderer) are written by hand.

*Alternatives:* a declaration written only by hand beside the rules (drifts
from the adapter); a manifest file in a foreign format (only for adapters we
ship); live discovery at connect time (the world depends on whatever the
server answers today). The book subsumes all three.

**Declared is not connected.** The book says a capability exists. If the
secret is missing or the server is down, a want is refused with *declared, not
connected*, not *no such capability*. A world never holds a secret: only its
name (`env`, a secret store key).

### D2. Three classes, and only one of them may change the world outside

| class | examples | where it runs |
|---|---|---|
| `reads` | a scanner, a database query, GET on an API, another ROFL world | as part of evaluation: wants of a tick are sent, answers arrive, evaluation goes on until nothing new is asked (as `scan_request` today) |
| `shows` | a UI card, a chart, a notification draft | after the fixpoint; never feeds back |
| `does` | an issue transition, a merge, a message sent | only through the dispatcher, only if permitted (D6), never inside a fixpoint |

A capability whose class an adapter cannot prove is `does`. MCP's
`readOnlyHint` is the server's word, not ours: a generated book marks such
tools `does` and a person changes the line to `reads`.

### D3. An adapter is a standing book: a small world of its own

A want is a message into the adapter's inbox; the adapter's book changes as it
works; the main world reads that book like any other (`issue_state[tracker](K, S)`).
The main world never waits. It may run 300 ticks before an answer arrives;
"waiting" is a fact:

```
pending(W) :- want_key(W), not answered(W).
```

and the continuation of a want is an ordinary rule that reads the answer,
fired when the answer's facts arrive by delta. There is no call stack and no
suspended evaluation. *Rejected:* requests pinned with `@next` and kept on a
stack until answered — it brings control flow into the language, makes answers
depend on who waited for whom, and cannot live in a kept world.

This is a federation of books, the same shape as Roflenox's signed per-owner
books and as Erlang/Elixir processes with mailboxes, with one difference from
the latter: the state of the process is not hidden, it is facts with a why.
One mechanism serves an adapter in the process, a remote service and a
colleague's ROFL world.

### D4. Negation across a book boundary is about the current tick

docs/time-and-continuity.md decided on 2026-08-30 that `not p` means "p is
not derivable in the current tick's store". That is exactly the closed
snapshot a federation needs: `pending(W)` at tick 300 means "at tick 300 no
answer had arrived", and its why says so. Monotonic rules over an adapter's
book give the same answer whatever order its facts arrive in (the CALM
theorem); a rule that negates an adapter's book is a statement about a tick,
and the journal (D5) makes that tick reproducible.

### D5. Bitemporal journal: when the world learned it, when it happened

The engine runs ticks continuously; each tick has a wall-clock stamp. A fact
of an adapter's book is journaled as an interval of ticks — *appeared at tick
253, gone at tick 752* — with `tick_at(253, "2026-10-23T11:40:07Z")`. That is
transaction time. A source that knows when something happened says so in the
fact itself (a deploy at 11:38 learned at 11:40): valid time.

- A past moment is replayed from the journal: the state at tick t is the
  world's own inputs plus every adapter book's facts whose interval covers t.
  Determinism makes the replay the same state, not an approximation (the OOPS
  measurement in docs/time-and-continuity.md).
- **The journal of `does` is history, not cache.** A scan's output can be
  thrown away and rebuilt (the storeroom of scans); the outcome of a call with
  an effect cannot be obtained again by calling again. It is append-only and
  `--anew`, a re-evaluation or a replay never executes a `does` want again.

### D6. A want is executed only if permitted, and the permission is a rule

```
permit(W) :- want_key(W), capability_class(W, reads).
permit(W) :- want_key(W), approved(W).          -- approved: a fact from a person, via an adapter
```

A veto the model can express belongs in the model (docs/time-and-continuity.md,
*Where a veto belongs*), so the dispatcher sends only wants with `permit`, and
"why was this not done" has an answer. A person's approval is itself a fact
arriving from an adapter (a UI, a tracker), never typed into the world. The
rules that grant permission are protected: an agent that proposes rules may
not change `permit` or anything it reads (phase 6).

### D7. The idempotency key is part of the adapter's contract

The engine computes the key: a hash of the want's row and the version of the
adapter's book. An adapter honours it (an `Idempotency-Key` header, a
transaction keyed by it) or declares `idempotent(Cap, engine)`, and then the
engine's journal deduplicates and a lost answer is the outcome *unknown* until
a read of the world settles it. A want that disappears before it is sent is
cancelled; after it is sent nothing is undone — compensation is a new want.

### D8. The unit of exchange is a batch

Each tick the engine hands an adapter all permitted wants of one capability at
once; the adapter answers per key, and a partial answer is allowed (some
answered, some failed, some still in flight). How the adapter executes a batch
is its own business: one `IN (...)` query, N HTTP calls, one MCP call each.
This is what keeps a recursive rule through a database from being N+1 round
trips, and what lets thousands of reads at the reference scale go as a few
calls.

### D9. Outcomes are facts, and there are five

| outcome | fact |
|---|---|
| not sent: no adapter, not permitted, awaiting approval, declined, duplicate of a sent want | `want_held(W, Why)` |
| sent, no answer yet | `pending(W)` (derived) |
| failed: error, refused by the far side, timeout before sending | `failed(W, Reason)` |
| answered | the capability's answer facts, keyed by W, plus `answered(W)` |
| unknown: sent, the answer lost | `outcome_unknown(W)`, settled only by a later read of the world |

An adapter's answer is a fact about **the call** ("sent, 200, issue id X").
What the world became ("the issue is done") comes from the source's ordinary
reading adapter when it sees it — an adapter does not declare the world's
state, just as an agent does not close a stage by saying it did. `whynot` on
anything downstream walks into these: *the want was sent, the adapter answered
`failed(W, "no permission on project")`*.

### D10. Where answers go is declared by the capability, not by the want

Each adapter's facts live in its own book and volume; the capability declares
the relations it answers with. A want carries only arguments and its key. A
rule that could choose where an answer is written could write into the world
anywhere, past its sources.

## 4. Spec

How to write an adapter, for its author rather than its designer, is
[guide/ADAPTERS.md](../guide/ADAPTERS.md).

### 4.1 Syntax

```
-- in an adapter's book (D1)
adapter(Name, Kind, Address).                 -- Kind: mcp | openapi | exec | sql | render | rofl
adapter_auth(Name, Store, Key).               -- Store: env | secret
capability(Cap, Adapter, Class).              -- Class: reads | shows | does
arg(Cap, Position, Name, Type).               -- Type: text | number | atom | time | json
answers(Cap, Relation, Arity).                -- the relation its facts arrive in, first column the want's key
idempotent(Cap, adapter | engine).
query(Cap, Template).                         -- sql: a parameterised template; never a string from a rule
returns_schema(Cap, Json).                    -- mcp/openapi: the output schema the book was generated from

-- in a world
want tracker_transition(K, done) :- stage_done(W, N), issue_of(W, K).
```

`want Cap(Args) :- Body.` is a rule whose head is a request, not a fact. The
engine gives every want a key and the rows `want_key(W)`, `want_of(W, Cap)`,
`want_arg(W, I, V)`, written by nothing but a want head, so other rules can read *that* a want
exists — never in the same stratum as the rule that derived it.

### 4.2 Checks at load, each a refusal naming the place

1. Every `want Cap(...)` names a capability of an imported adapter book.
2. Arity and types match `arg`.
3. No rule reads an adapter's `answers` relation and also derives a want it
   depends on within one tick's stratum (a want's answer is always a later
   tick).
4. A `shows` capability's answers are read by no rule.
5. No rule an agent submitted (phase 6) defines `permit` or a relation `permit`
   reads.

### 4.3 The adapter protocol

The common form of all kinds, local or remote:

- **in**: a batch `{capability, book_version, wants: [{key, args}]}`;
- **out**: ROFL facts (the same text a scanner prints), each answer fact
  carrying the want's key, plus `failed(Key, Reason)` rows; `-- reads: PATH`
  lines as scanners print them today, for the storeroom's stamps.

Built-in kinds translate this form: `mcp` (one `tools/call` per want, answers
by `outputSchema` when the tool has one, otherwise the book names a parse rule
and without one the answer is `failed(K, "no way to read the answer")`),
`openapi` (operation per capability, GET `reads`, the rest `does`), `exec` (a
command; `scanner(...)` today), `sql` (a long-lived connection; answers stamped
with the transaction's snapshot), `rofl` (another world's `serve`), `render`
(in process).

### 4.4 CLI

- `rofl adapter mcp|openapi|exec ADDRESS` prints a generated adapter book.
- Every verb that evaluates (`load`, `ask`, `why`, `whynot`, `serve`) runs
  `reads` wants as `scan_request` runs today.
- `does` wants are sent only by a long-running `rofl serve` with a journal
  directory; a one-shot verb lists them (`--json` included) and sends nothing.
- No new knob: the journal directory is the kept world's place.

## 5. Scale (the five questions of a brief, CLAUDE.md)

1. **What it moves.** "A repeated question answered in about a second" and
   "an edit costs in proportion to the edit" extended to inputs that are not
   files: a world asks for the rows a question needs instead of loading a
   source whole. Measured as facts loaded and seconds against importing the
   same source whole, on the same question.
2. **How inputs change.** An agent edits one file of 11 100 and asks again;
   wants derived from unchanged facts are unchanged rows and are not sent
   again (D7); only the delta's new wants go out.
3. **At the reference scale.** A want per file is 11 100 rows and, batched per
   capability per tick (D8), a few calls; the journal is append-only and grows
   with calls, not with the world. A world must not hold an adapter's whole
   source; the cap on a batch and on wants per tick holds the reference scale.
4. **What it blocks.** Nothing that works today: `scanner`/`scan_request` keep
   their behaviour and become the first adapter kind (phase 3), checked against
   their current tests byte for byte.
5. **Acceptance measures the goal.** Each phase's acceptance below is a number
   on a corpus, or a planted fault that must turn red, not "the code does what
   this file says".

## 6. Phases

Each is an item in `facts/worklist.rofl`, in this order; each needs the ones
before it.

0. **`w_intent_tick_journal`** — the journal of D5 in the Rust engine: base
   facts carry the tick they appeared and the tick they went (`asserted_by`
   already carries the first, engine.rs), `tick_at(T, Time)`, and a past tick
   rebuilt from the journal. *Acceptance:* a sequence of ticks with assertions
   and retractions replayed to any tick equals, byte for byte, the state the
   live run had there; planted: an interval closed one tick late is red.
1. **`w_intent_want_syntax`** — `want` heads, the kernel rows, the load checks
   of 4.2 in both engines (TS checks wants; executing is Rust only, per the
   engine rule). *Acceptance:* each check refuses its planted program with the
   place named; worlds without wants are unchanged in every golden.
2. **`w_intent_adapter_book`** — the vocabulary of 4.1 and the protocol of
   4.3 with the `exec` kind; `reads` wants run per tick in batches; outcomes of
   D9 as facts. *Acceptance:* a recursive rule through an `exec` adapter sends
   one batch per tick, not one call per want (counted); a killed adapter gives
   `failed`, a lost answer `outcome_unknown`.
3. **`w_intent_scanner_as_adapter`** — `scanner`/`scan_request` become the
   `exec` adapter's reading capability, the storeroom of scans its cache.
   *Acceptance:* every world that uses them today gives the same golden; the
   kept-world and storeroom tests unchanged.
4. **`w_intent_sql_adapter`** — the `sql` kind: parameterised templates,
   snapshot-stamped answers, batched wants. *Acceptance:* on a database of
   the order of the reference corpus, a question answered from wants loads the
   rows it needs (counted) against importing the table whole; a planted raw
   SQL argument is refused at load.
5. **`w_intent_mcp_adapter`** — `rofl adapter mcp URL` generates a book;
   the `mcp` kind executes it. *Acceptance:* a book generated from a test MCP
   server, regenerated after the server changed a tool, differs by exactly that
   tool; a `does` tool runs once per key across a re-evaluation and a replay.
6. **`w_intent_does_dispatch`** — the dispatcher of D2 and D6 in `rofl serve`:
   `permit`, approvals as adapter facts, the append-only `does` journal, the
   protection of permission rules. *Acceptance:* `--anew` and a replay execute
   no `does` want again (planted re-execution is red); a want without `permit`
   is never sent (planted bypass is red).
7. **`w_intent_scenarios`** — the examples of section 7 as worlds in
   a new directory `intents` under `examples`, each checked by `npm test`.

**Blocker of all of it:** phase 0. Without dated inputs and intervals neither
replay nor the negation of D4 is reproducible.

### Phase 0, as built (2026-10-23)

`rust/rofl/src/journal.rs`, `Session::replay`, `rust/rofl/tests/journal.rs`.

- **What is journaled.** Every call that tells a world something (`load`,
  `load_delta`, `assert`, `assert_delta`, `retract`, `retract_delta`, a set
  taken out, one by one), with whether the world was evaluated when it came;
  the base facts it brought, by id (a fact keeps its id when it dies and gets
  it back when it comes again, so one word each); the base facts it took out;
  every tick boundary, with its wall-clock time. A load that brings rules or
  declarations is kept whole as text. Derived facts are not in it. The
  journal is kept with the world's volume and goes on when the world is
  opened again; an overlay writes only what it gained.
- **The calls, not only the facts.** A delta verb that falls back writes
  `evaluated_again(Request, Why)` into the world, and what it does depends on
  whether the world was evaluated; so a replay makes the same calls in the
  same state, and then the rows are the same.
- **The interval of a fact.** It appeared in the tick of its entry
  (`asserted_by(F, Who, T)` says so in the world). It went at its `Gone`
  entry, or, for a fact of the tick (every fact a program asserts except the
  kernel's declarations), at the next boundary: the boundary drops it, so the
  journal does not repeat it.
- **`tick_at` is the journal's, not a fact of the world.** A wall-clock time
  in the state would make every ticking world's golden move on every run and
  the replay of a tick differ from its live run by the time. A rule that
  needs the time reads it from a clock adapter (phase 2).
- **A world opened from a seed or an image** holds facts the journal was not
  told: its replay is refused, saying so.
- **Cost.** 4 bytes per base fact told, plus a few words per call and 8
  bytes per tick.
- **Acceptance.** Five ticks with loads, asserts, plain and delta
  retractions, a delta that falls back, `@next` carries, negation and an
  aggregate, the world kept and opened again after the third: replayed to
  each tick it equals the live state there byte for byte. Planted
  `journal_closed_late` (a retraction written one boundary late) is red.
- **Not done.** A fact of an adapter's book that stays from tick 253 to 752
  is, today, either timeless or told again each tick: which one is phase 2's
  question. The TypeScript engine has no journal (Rust first).

## 7. Scenarios the design must carry

Chosen to be as unlike each other as possible; each becomes a world in
a new directory `intents` under `examples` (phase 7).

1. **A database queried on demand** (`sql`, `reads`): which tenants' orders
   break an invariant, asking only for the orders of tenants the question
   reaches; recursion through the database batched per tick.
2. **A remote MCP server** (`mcp`, `does`): a tracker issue moved when a rule
   says its stage is done; once per key; failure and unknown outcome visible
   to whynot.
3. **A local program** (`exec`, `reads`): today's scanners, unchanged in
   behaviour.
4. **A UI** (`render`, `shows`): a screen as `show`/`fill`/`click` rows over a
   kit whose components are capabilities with slots; a click is a fact from the
   UI adapter (the slot form is sketched outside this repository).
5. **Another ROFL world** (`rofl`, `reads`): a colleague's world served by
   `rofl serve`, its answers facts of a signed book; why stops at the boundary
   unless that world grants its own why.
6. **An HTTP API without MCP** (`openapi`): a book generated from a spec, GET
   capabilities `reads`, the rest `does`.

## 8. Prior art

- **Dedalus and Bloom** (Alvaro, Hellerstein et al., Berkeley): Datalog in time;
  an `@async` rule's conclusion arrives at some later tick. D3 and D4.
- **The CALM theorem** (Hellerstein, Alvaro): monotonic programs need no
  coordination. D4.
- **Algebraic effects and handlers** (Eff, Koka, OCaml 5): an operation's
  signature (capability), its handler (adapter), an unhandled effect refused
  before running (4.2, check 1).
- **Erlang/Elixir processes**: a mailbox, no shared waiting, a crash is a
  message to whoever watches. D3, with the process state as facts.
- **Bitemporal stores** (XTDB, Datomic's history): valid and transaction time.
  D5.
- **MCP**: `tools/list` with input and output schemas, tool annotations as
  hints. D1, D2, 4.3.

## 9. Open questions

1. The `want` syntax: a keyword before the head (as above), or a head in an
   adapter's book (`tracker_transition(...)` written as a rule head, the book
   making it a want)?
2. A cap on wants per tick and per batch: a world's budget like `--budget`, or
   declared per capability in the adapter's book? DECIDED 2026-10-24 by the
   owner, after recursion through an adapter was tried: per capability in the book,
   `max_wants(Cap, N)`, 1000 an evaluation when not said; a want over it is
   held and the world partial (guide/ADAPTERS.md).
3. Valid time: a convention for answer facts (`at(Fact, Time)`), or a column
   each capability declares? DECIDED by the owner, 2026-10-24: a column,
   `event_time(Cap, Column)` in the book (guide/ADAPTERS.md); the engine does
   not read it yet.
4. An adapter's book signed (Roflenox) from the start, or plain until a second
   owner appears? DECIDED by the owner, 2026-10-24: a book on Roflenox is
   signed. BUILT 2026-10-25: `roflenox://HOST/IDENTITY/BOOK` where a file would
   go, each clause a `rofl:book` fact, every batch checked by the engine
   (src/roflenox.rs, guide/ADAPTERS.md); a book in a file stays plain.
5. Recursion through an adapter: allowed and measured (the owner, 2026-10-23:
   try it and see where it spoils things and where it opens new ways of
   programming), with the per-want call count in the cost report. TRIED
   2026-10-24 (f_a_recursion_through_an_adapter_never_met_the_budget): cycles
   end, a doubling tree meets the space wall, and an endless chain now meets
   the budget the rounds share; question 2 gave the cap.

### Phase 1, as built (2026-10-23)

`rust/rofl/src/program.rs` (`lower_want`), `rust/rofl/src/engine/want.rs`,
`src/want.ts`, `rust/rofl/tests/want.rs`, the world `want_checks`
(`examples/checks/want-*.rofl`), both engines.

- **A want is three rules.** `want note(P) :- stage_done(W), owner(W, P).`
  is `want_key($want(note, P)) :- stage_done(W), owner(W, P).`, with
  `want_of(W, note)` and `want_arg(W, 1, P)` read from the key. The key is the
  term `$want(Cap, Args)`; the hash and the book version of D7 come with the
  adapters (phase 2).
- **The rows are in the main book, not the kernel's.** A rule of the world
  writing the kernel's book is a walk `main -> $kernel` that boot.rofl's
  `leak[audit]` reports, in every world with a want. They are protected by name
  instead: a clause or a fact that writes `want_key`, `want_of` or `want_arg`
  and is not a want head is refused at the door. `want_key` and not `want`,
  because `want/4` is a relation of examples/spat.
- **The checks run when the world is evaluated** (and when a program is added
  by delta), not per file: a world may load the adapter's book after the rule
  that wants from it. Each refuses the world, naming the want or the rule:
  1. the capability is declared (`capability(Cap, Adapter, Class)`);
  2. the want has as many arguments as the capability has `arg` rows, the
     positions run from 1 without a gap, and a constant is of its type
     (`number`, `atom`; `text`, `time` and `json` are strings);
  3. no rule concludes a relation a declared capability answers in: an answer
     is the adapter's, at a later tick, so no want can depend on its own
     answer inside one tick;
  4. no rule reads what a `shows` capability answers.
  Check 5 (rules an agent submitted) is phase 6's.
- **Acceptance.** Seven fixtures, one world each engine agrees on: a world of
  two wants and its rows, and six programs each refused with its place named.
  Planted `want_capability_unchecked`, `want_arity_off_by_one`,
  `want_types_unchecked`, `want_answer_concluded`, `want_shows_read`, each
  red. No world without a want moved.
- **Cost.** One pass over the rules and the `capability`, `arg`, `answers`
  rows per evaluation; a world with none of them pays a look at two
  relations.

### Phase 2, as built (2026-10-23)

`rust/rofl/src/adapter.rs` (`Session::adapter_wants`), `rust/rofl/tests/adapter.rs`. Rust only, as the engine
rule says; the TypeScript engine checks wants (phase 1) and sends none.

- **When.** `Session::evaluate` runs the world to its fixpoint, then sends the
  `reads` wants not yet settled, loads what comes back by delta and evaluates
  again, until nothing new is wanted: the loop `scan_request` already had, and
  both run in it.
- **A batch.** Per capability per round, one run of the program
  `adapter(Name, exec, Command)` names, all capabilities at once. On its
  standard input: `{"capability", "book_version", "wants": [{"key", "args"}]}`,
  the key the want's row as ROFL text (`$want(next_of, a)`), the arguments by
  the names of their `arg` rows, `book_version` a digest of the adapter's rows
  for that capability. It prints ROFL facts: its answers, the key first;
  `answered(K)` for a want answered with no fact; `failed(K, Reason)`.
- **Where answers go (D10).** An answer `next(K, b)` is loaded as
  `next[graph](K, b)`, in the adapter's book; a world that reads it imports
  that book (`imports(main, graph)`) or boot.rofl's leak audit names the walk.
  Only a relation the capability `answers` with, at its arity, keyed by a want
  of the batch, is taken; anything else fails the batch.
- **Outcomes (D9)**, rows of the main book, each settling its want for the
  tick: `answered(W)`; `failed(W, Reason)` (refused by the program, or each
  want of a batch whose program exited badly, was killed, printed what does
  not parse or answered outside its relations); `outcome_unknown(W)` (the
  program ended well and said nothing of it); `want_held(W, Why)` (no adapter,
  or a kind not built yet). `pending(W)` is the world's own rule.
- **Phase 0's question.** Answers and outcomes are facts of the tick, as a
  scan's are: the next tick sends its wants again. Keeping them across ticks
  is the storeroom's work, phase 3.
- **Acceptance.** A tree of six nodes reached by a recursive rule through the
  adapter: three runs of 1, 2 and 3 wants, every want answered, nothing sent
  when evaluated again. A program killed mid-batch fails its wants; a want it
  says nothing of is `outcome_unknown`; a world with no adapter holds its want.
  Planted `adapter_one_call_per_want` and `adapter_lost_answered` are red.
- **Not done.** The kinds other than `exec`; a cap on a batch and on wants a
  tick (open question 2); `adapter_auth`; the kept-world delta path of
  `rofl ask` (`rust/rofl/src/bin/rofl/delta.rs` runs scans only); `-- reads:` stamps.

### Phase 3, as built (2026-10-23)

`run_program` in `rust/rofl/src/session.rs`, the one runner of a scanner and
an exec adapter.

- **One runner.** A scanner is run with its request as the last argument; an
  exec adapter with its batch on its standard input. Everything else is the
  same code: how the program is started, what a bad exit or a kill says, the
  storeroom.
- **The storeroom is the adapter's cache.** An adapter that prints
  `-- reads: PATH` for what it read has its answer to that batch kept under
  `~/.cache/rofl/scans`, as a scan's is, and the same batch is answered from
  there while every stamp holds. A tick that sends its wants again (phase 2)
  then costs no run of the program.
- **The world's words stay.** `scanner`, `scan_request`, `scan_done` and
  `scan_failed` are kept as the scan form. Written as wants, they would move
  the golden of every world that scans, and the kept-world delta path of
  `rofl ask`, which follows each scan's facts in and out; the acceptance
  forbids both, and nothing a world can say is gained.
- **Acceptance.** The scan worlds' goldens, `tests/scan.rs` and the kept-world
  cases unchanged; an adapter that names what it read runs once for two
  worlds, and again when what it read changes.

### Phase 4, as built (2026-10-23)

`run_sql` in `rust/rofl/src/adapter.rs`, on SQLite (the `rusqlite` crate with
SQLite built in, so nothing to install and nothing to start for a test);
`rust/rofl/tests/sql.rs`.

```
adapter(shop, sql, "shop.db").
capability(orders_of, shop, reads).
arg(orders_of, 1, tenant, text).
answers(orders_of, order, 3).
query(orders_of, "SELECT id, amount FROM orders WHERE tenant = ?1").
want orders_of(T) :- asked(T).
```

- **A template, never a string from a rule.** A want's arguments are bound to
  the template's parameters, in the order of its `arg` rows; nothing a rule
  derives is written into the SQL. A rule that concludes `query(Cap, T)` is
  refused when the world is evaluated (check 5 of `engine/want.rs`, and in
  `src/want.ts`), so a template is always a line of the adapter's book.
- **A batch is one read transaction** on a connection opened read-only and
  kept for the process; every query of the batch sees one snapshot, and each
  want is stamped `sql_snapshot(W, N)` with the database's `data_version`
  there. A row is `order[shop](W, Id, Amount)`; a want with no row is
  `answered(W)`; a query that fails, a database that is not there, a column
  count that does not match the `answers` arity fail the batch.
- **Acceptance.** 11 100 orders of 1 110 tenants; a question about three
  tenants loads 30 rows and gives the answer the same rules give over the
  table imported whole (11 100 facts). A tenant named like an injection
  (`t1' OR '1'='1`) reads nothing. Planted `sql_arguments_spliced` (the
  arguments written into the template) and `sql_query_from_rule` are red.
- **Not done.** PostgreSQL and other databases; a batch as one `IN (...)`
  query; closing a kept connection with its world.

### Phase 5, as built (2026-10-23)

`rust/rofl/src/mcp.rs`, the `mcp` kind in `rust/rofl/src/adapter.rs`;
`rust/rofl/tests/mcp.rs` with a node script as the server. The stdio
transport only (one JSON-RPC message a line), on the standard library: no new
dependency.

```
$ rofl adapter mcp node tracker.js
-- generated by `rofl adapter mcp` from the server's tools/list; every tool is `does` until a person changes its line to `reads`
adapter(test_tracker, mcp, "node tracker.js").

-- tool get-user: A user by id
capability(test_tracker_get_user, test_tracker, does).
mcp_tool(test_tracker_get_user, "get-user").
arg(test_tracker_get_user, 1, id, number).
answers(test_tracker_get_user, get_user, 3).
mcp_field(test_tracker_get_user, 2, "admin").
mcp_field(test_tracker_get_user, 3, "name").
returns_schema(test_tracker_get_user, "{...}").
```

- **The book is the server's `tools/list`**, every page, one block per tool,
  sorted by tool name, nothing dated, nothing about the whole list: a book
  regenerated after the server changed one tool differs in that tool's block
  alone, whatever order the server lists them in. The adapter is named after
  the server's `serverInfo.name`, a capability `adapter_tool`; an argument is
  every property of the input schema, in name order (`string` text,
  `integer` number, `boolean` atom, the rest json); every tool is `does`.
- **The `mcp` kind** starts the server once per batch and sends one
  `tools/call` per want. A tool with an output schema answers by
  `structuredContent`, one column per property (`mcp_field`), the key first;
  one without answers `mcp_text[adapter](W, Text)` for a parse rule of the book
  to read, or is `failed(W, "no way to read the answer")` when the book does
  not answer in `mcp_text`. `isError` is `failed(W, Text)`. A json argument is
  sent as JSON, an atom `true`/`false` as a boolean.
- **Acceptance.** Two versions of a test server, the second listing the tools
  in the other order and changing one: the books differ only in that tool's
  block. Two users wanted, two calls in one server; a settled want is not sent
  again. Planted `mcp_book_digest` (a digest of the whole list in the book)
  and `mcp_does_sent` (a `does` want sent while evaluating) are red.
- **Moved to phase 6.** "A `does` tool runs once per key across a
  re-evaluation and a replay" needs the dispatcher that sends `does` at all;
  until it exists no evaluation sends one, which the test checks.
- **Not done.** The streamable HTTP transport (it needs an HTTP and TLS
  client, a dependency to choose); `adapter_auth`; a server kept between
  batches; optional arguments, which are positional like the rest.

### Phase 6, as built (2026-10-23)

`Session::dispatch` and `Session::guard_permit` in `rust/rofl/src/adapter.rs`,
the `dispatch` request of `rofl serve`; `rust/rofl/tests/dispatch.rs`.

```
{"op":"dispatch","session":1,"journal":"world.d"}   -> {"loaded":n}
```

- **Only by request, only with `permit`.** Evaluation never sends a `does`
  want; `dispatch` sends those with `permit(W)` in the main book, in batches
  as `reads` wants go, through any kind (exec, mcp). A want without `permit`
  stays as it is, and `whynot` on its outcome walks into the missing permit.
- **The journal of `does`** is `does.journal` in the given directory, one
  JSON line `{"sent": K, "want": W}` written and synced before a want goes,
  and `{"done": K, "out": Text}` with the facts of its outcome after. `K` is
  the idempotency key of D7, a digest of the want's row and its adapter's book
  version, and goes with the want (`idempotency_key` in an exec batch, `_meta`
  `rofl/idempotency_key` in an mcp call). A want whose key the journal holds is
  never sent again: its outcome is loaded from the journal. One sent with no
  outcome (the process died between) is `outcome_unknown(W)`.
- **Permission is protected.** `assert` and `load` on a running world refuse a
  fact or rule that concludes `permit` or anything a `permit` rule reads, near
  or far (the rows of a want head aside), once the world has a `permit` rule:
  an approval comes in through an adapter, never typed in (D6).
- **Acceptance.** Two wants, one approved: one call. A second dispatch, the
  world evaluated anew over the same journal, and a replay of it send nothing
  again, and the world anew reads the outcome back from the journal. A journal
  cut after the `sent` line gives `outcome_unknown`. An approval typed into the
  running world is refused. Planted `does_unpermitted_sent`,
  `does_journal_ignored` and `permit_unguarded` are red.
- **Not done.** A one-shot verb listing the wants it would send (they are
  `want_key` rows a question can ask); cancelling a want that disappears
  before dispatch; the journal kept beside a kept world by default.

### Phase 7, as built (2026-10-23)

Four of the six scenarios of section 7 are worlds in `examples/intents/`,
checked by `npm test` on the Rust engine (`intents_sql`, `intents_exec`,
`intents_mcp`, `intents_rofl`): an adapter runs a program or opens a
database, which the TypeScript engine never does.

1. `sql.rofl` over `shop.db` (built from `shop.sql`): acme's resellers whose
   orders break their cap. The subtree is asked a level a round; globex,
   whose order breaks its cap too, is never read.
2. `mcp.rofl` with `tracker.cjs`: a does tool and `permit`; the world shows
   which wants wait for approval. `rofl load` sends nothing; the dispatch of
   the approved one, once, is in `rust/rofl/tests/dispatch.rs`.
3. `exec.rofl` with `deps.cjs`: the imports `main.js` reaches, a file a
   round, as the scan world asks them, the program naming what it read.
5. `rofl.rofl` over `colleague.rofl`: the `rofl` kind, built for it. The
   colleague's world is evaluated in the process once while its files are
   unchanged; a want binds the first columns of the relation its capability
   answers in, and the rows come back as facts of the colleague's book, so a
   why stops at that boundary. Served by `rofl serve` across processes is not
   built.

Scenario 4 and scenario 6 were built after, below.

### Scenario 4, a screen, as built (2026-10-24)

`examples/intents/screen.rofl`, world `intents_screen`, both engines. A
`render` adapter's `shows` capabilities are the components of its kit, each
named by `component(Cap, Kind)`: heading, text, card, button, field. A
capability's `arg` names are the component's slots. A `want` of one is a
component on the screen, and evaluation never sends it.

The web workbench draws the screen of the last run above the cells
(`notebook/screen.ts` reads it, `workbench/page.ts` draws it). What a person
does on it comes back as a fact of the adapter's book, and the notebook runs
again with it:

- a press of a button is `clicked[A](W)`;
- a field typed in is `filled[A](W, Text)`, and only the last text is kept.

`W` is the want's key, so a rule reads the press of one button:
`approved("deploy") :- clicked[ui]($want(ui_button, "Approve deploy")).` These
facts are kept for the visit until "start over". `npm run test:workbench`
checks the screen, a press and a typed field, with two planted faults: the
events not run, and a want's capability taken as the notebook's own.

### The post, as built (2026-10-23)

Phases 2 to 7 sent a round's batches and waited for their answers before the
evaluation went on, which D3 rules out for an adapter that answers in an hour.
`Post` in `rust/rofl/src/adapter.rs`, `Session::collect`; `rust/rofl/tests/post.rs`.

- **A world with a post does not wait.** A batch for a program or a server
  (exec, mcp) goes on a thread of its own and the evaluation goes on; the
  answer comes back to the post's inbox, and `Session::collect` loads it by
  delta whenever it has come, then sends what the world wants next. A want in
  flight is neither sent again nor settled, so `pending(W) :- want_key(W), not
  answered(W)` holds while it flies. A database and another world in the same
  process are answered at once, as before.
- **`rofl serve` gives every session a post.** Each request first loads what
  came back since; `{"op":"inbox","waitMs":n}` waits up to n ms for a first
  answer and says how many wants are still in flight; `{"op":"evaluate",
  "wait":false}` answers as soon as the world is evaluated. Without
  `"wait":false` an evaluate waits for its answers, as a one-shot verb does,
  so the hosts that read a finished world (the notebook, the playground) are
  unchanged.
- **One-shot verbs wait**, as their question asks: `rofl load`, `ask`, `why`
  have no post.
- **Acceptance.** A program that answers after 0.6 s: the evaluation returns
  in under 0.4 s with the want pending, two evaluations while it flies send it
  once, and the tree comes in by delta over three rounds. Planted
  `post_resends_flying` is red.
- **The HTTP client** (the owner's choice: reqwest + tokio) belongs to this
  layer and never to the engine's core.

**Build features.** `sql` (SQLite) is a cargo feature, on by default;
`cargo build --no-default-features` builds the engine with no C code, and a
want of a sql adapter in it is `want_held(W, "this build has no sql adapter
(cargo feature `sql`)")`. The HTTP client is the feature `net`, below.

### Scenario 6 and mcp over HTTP, as built (2026-10-23)

`rust/rofl/src/openapi.rs`, `rust/rofl/src/net.rs`, the HTTP transport in
`rust/rofl/src/mcp.rs`; `rust/rofl/tests/openapi.rs`.

- **`rofl adapter openapi SPEC`** prints the book of an OpenAPI document (JSON,
  a file or a URL): `adapter(Name, openapi, BaseUrl)` from `info.title` and
  `servers[0]`, then a block per operation sorted by capability. GET and HEAD
  are `reads`, every other method `does` until a person changes the line.
  Each parameter (path, query, header) and each property of a JSON request
  body is an `arg`, placed by `http_in(Cap, Pos, Where, Name)` with its name on
  the wire; `http_op(Cap, Method, PathTemplate)`. The first 2xx JSON answer,
  an object or an array of objects (`$ref`s followed), answers a column a
  property (`http_field(Cap, Pos, Name)`); any other answer is
  `http_body(K, Text)`.
- **The `openapi` kind** sends one request per want; an array answers a row
  per element, an empty one `answered(K)`, a status outside 2xx
  `failed(K, "HTTP N: ...")`. A dispatched `does` want carries its key in
  `Idempotency-Key`. It runs in the post like exec and mcp.
- **mcp over HTTP**: an mcp adapter whose address is a URL is spoken to over
  the streamable HTTP transport: each message POSTed, the answer one JSON
  message or an event stream, `Mcp-Session-Id` kept from `initialize`.
  `rofl adapter mcp URL` generates its book. A tool property whose name is not
  an atom (`petName`) is sent under that name, `mcp_arg(Cap, Pos, Name)`.
- **Book version** now covers the kind's own rows (`mcp_tool`, `mcp_arg`,
  `mcp_field`, `http_*`), so a changed path or field changes a does want's key.
- **The feature `net`** (reqwest, blocking, rustls with ring; on by default)
  holds the HTTP. The calls block on the adapter's own thread; reqwest keeps
  its tokio inside and the engine never sees it. Without it an openapi want is
  `want_held(W, "this build has no http (cargo feature `net`)")`.
- **Acceptance.** A node service with a document: the book regenerated after
  one operation changed differs by that block alone; a GET want answered by
  the service, an array as rows, a 404 as failed; the POST sent only by
  dispatch with permit, its body and key on the wire; an MCP server over HTTP
  answering in an event stream. Planted `openapi_book_digest` and
  `openapi_does_get` are red.
- **Credentials** (2026-10-23, `w_intent_http_credentials`). The book names
  a key, never holds it: `http_auth(Adapter, Scheme, How, Name, Env)` from
  `components.securitySchemes` (an apiKey in a `header` or the `query`,
  `bearer` for http bearer, oauth2 and OpenID Connect, `basic` with
  `user:password` in the variable), `http_needs(Cap, Scheme)` from the
  operation's or the document's first `security` requirement. The adapter
  reads the variable when it sends; a want whose key the environment does
  not give is `want_held(W, "declared, not connected: the environment has
  no ENV ...")` and is not sent. An mcp adapter over HTTP carries every
  `http_auth` row of its adapter, written by hand. A key never enters a fact:
  an error that would quote it is masked. YAML documents are read too.
  Planted `http_key_ignored` is red.
- **OAuth2 and keys on the command line** (2026-10-24, the owner: «Авторизацию
  докручивай»). `client_credentials` is a fifth way (`http_auth(A, S,
  client_credentials, TokenUrl, Env)`, Env holding `id:secret`, scopes after a
  space in TokenUrl): the adapter gets the token (RFC 6749 4.4, client secret
  basic), keeps it until a minute before it expires, and fetches it again once
  when a service refuses it (401). A document's oauth2 clientCredentials flow
  generates it. A 401 from an MCP server is read as its authorization spec
  says: `WWW-Authenticate` names the resource metadata (RFC 9728), that names
  the authorization server, whose metadata (RFC 8414) names the token
  endpoint, and the error gives the line to write. `rofl adapter mcp URL KEY...`
  and `rofl adapter openapi SPEC KEY...` take keys as `HOW[:NAME]=ENV`
  (bearer, basic, header, query, client_credentials), read from the
  environment; an mcp book gets an `http_auth` row for each. Planted
  `token_kept_refused` is red.
- **Open.** The authorization code flow with a person at a browser (PKCE,
  dynamic client registration): a token a person got goes in as `bearer=ENV`.

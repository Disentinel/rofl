# Writing an adapter

An adapter lets a world ask the outside: a database, a program, an MCP
server, an HTTP API, another ROFL world, a screen. The world writes a `want`.
The engine sends it, and the answer comes back as facts in the adapter's
book. The design and its reasons are in [docs/intents.md](../docs/intents.md).
This page is how to write one.

## The book

An adapter is a book of facts. A world uses it by importing it.

    imports(main, deps).                          -- the world reads the book deps
    adapter(deps, exec, "node deps.cjs").         -- name, kind, address
    capability(imports_of, deps, reads).          -- what it can do: reads, shows or does
    arg(imports_of, 1, file, text).               -- its arguments: position, name, type
    answers(imports_of, file_import, 2).          -- where answers arrive; the first column is the want
    max_wants(imports_of, 20000).                 -- at most this many wants an evaluation (1000 if not said)

The argument types are `text`, `number`, `atom`, `time` and `json`.

A world asks with a `want`, a rule whose head names a capability:

    want imports_of(F) :- needed(F).

The world then reads the answers in the adapter's book, `file_import[deps](W, F)`.
`W` is the want's key, `$want(imports_of, "main.js")`, so a rule can tell which
question an answer belongs to.

## The three classes

- **reads** asks and changes nothing outside. Every evaluating verb sends it:
  `load`, `ask`, `why`, `whynot`, `serve`.
- **shows** puts something in front of a person. It is never sent, and no rule
  reads its answers. A host draws it; the web workbench draws a `render`
  adapter's screen.
- **does** changes the world outside. Only `rofl serve` with a journal sends
  it, and only with `permit(W)`. It is sent once: the journal remembers it.

## How a want ends

Each want ends in one of these facts:

- `answered(W)`, or any fact of its `answers` relation;
- `failed(W, Reason)`;
- `outcome_unknown(W)`: the adapter ended well and said nothing about it;
- `want_held(W, Why)`: the adapter cannot be reached, or a key is missing.

A world that waits says so in its own rule:
`pending(W) :- want_of(W, _), not answered(W), not failed(W, _)`.

## The kinds

| kind | address | what the book adds |
|---|---|---|
| `exec` | a command line | nothing; the program reads a batch on stdin and prints facts |
| `sql` | a SQLite file | `query(Cap, "SELECT ... ?1")` for each capability |
| `mcp` | a command (stdio) or a URL | `mcp_tool`, `mcp_arg`, `mcp_field`; generated |
| `openapi` | the API's base URL | `http_op`, `http_in`, `http_field`; generated |
| `rofl` | another world's files | the relation a capability answers from |
| `render` | `"workbench"` | `component(Cap, Kind)`: heading, text, card, button, field |

`rofl adapter mcp CMD|URL` and `rofl adapter openapi SPEC` print a book from
the server's own description. Regenerate it when the server changes; the
book's version changes with it.

### exec

The program gets one batch per capability per round on stdin, as JSON:
`{capability, book_version, wants: [{key, args: {name: value}}]}`. It prints
ROFL facts, each answer with the want's key first. It may print `failed(K, "why")`
and `answered(K)`. A `-- reads: PATH` line names a file the answer depends on,
so the answer is kept until that file changes.

<!-- BEGIN file examples/intents/exec.rofl -->
```
-- SCENARIO 3 (docs/intents.md 7): a local program. The scanner of today, unchanged, beside an exec adapter that
-- answers the same kind of question as wants: what main.js imports, a file a round, as the scan world asks.
imports(main, deps).
adapter(deps, exec, "node examples/intents/deps.cjs").
capability(imports_of, deps, reads).
arg(imports_of, 1, file, text).
answers(imports_of, file_import, 2).

needed("main.js").
needed(F) :- file_import[deps](_, F).
want imports_of(F) :- needed(F).
```
<!-- END file -->

<!-- BEGIN file examples/intents/deps.cjs -->
```
// The exec adapter of scenario 3: the files each file it is asked about imports, from examples/scan/src.
const fs = require('fs');
const path = require('path');
const batch = JSON.parse(fs.readFileSync(0, 'utf8'));
const root = path.join(__dirname, '..', 'scan', 'src');
for (const w of batch.wants) {
  const file = path.join(root, w.args.file);
  console.log(`-- reads: ${file}`);
  const found = [...fs.readFileSync(file, 'utf8').matchAll(/from\s+['"](\.\/.+?)['"]/g)]
    .map(m => path.relative(root, path.join(path.dirname(file), m[1])));
  for (const f of found) console.log(`file_import(${w.key}, ${JSON.stringify(f)}).`);
  if (found.length === 0) console.log(`answered(${w.key}).`);
}
```
<!-- END file -->

### sql

The template is the book's, never a string a rule builds. `?1`, `?2` are the
want's arguments in order, and each row of the result is one answer fact.

    adapter(shop, sql, "examples/intents/shop.db").
    capability(children_of, shop, reads).
    arg(children_of, 1, tenant, text).
    answers(children_of, child, 2).
    query(children_of, "SELECT id FROM tenants WHERE parent = ?1").

## Keys

A key is never a fact. The book names where to find it, and the engine reads
it from the environment when it sends:

    http_auth(Adapter, Scheme, How, Name, Env).   -- How: bearer, basic, header, query, client_credentials
    http_needs(Cap, Scheme).                      -- which capabilities need it

For `client_credentials`, `Name` is the token URL and `Env` holds `id:secret`;
the adapter gets and renews the token itself. A missing variable holds the want:
`want_held(W, "... the environment has no ENV ...")`. On the command line, a key
is `HOW[:NAME]=ENV`: `rofl adapter mcp URL bearer=TRACKER_TOKEN`.

## When the event happened

An answer has two times. One is when the world learned it, the tick, which the
engine keeps by itself. The other is when the thing happened outside: a tracker
answers at tick 500 that a ticket was closed, and it was closed yesterday at
14:00.

That second time is an ordinary column of the answer. The book says which one:

    capability(ticket_closed, tracker, reads).
    answers(ticket_closed, closed, 3).            -- closed(W, Ticket, At)
    event_time(ticket_closed, 3).                 -- column 3 of closed is when it happened

The column holds an ISO 8601 text, the type `time`. Rules compare it like any
other value. Do not wrap facts in a separate `at(Fact, Time)`. This is a
convention of the book (the owner's choice, 2026-10-24). The engine does not
read `event_time` yet.

## Recursion

A want may depend on the answers of earlier wants: a tree in a database, the
imports of imports. The engine sends one round at a time, a batch per
capability, until no new want appears:

    reaches("acme").
    reaches(T) :- want_arg(W, 1, _), child[shop](W, T).
    want children_of(T) :- reaches(T).

- Each level of the tree is one round, and each round is one query or call per
  capability, never one per node.
- A want is sent once per evaluation, by its key, so a cycle in the data ends.
- A capability sends at most 1000 wants an evaluation, or as many as its book
  says: `max_wants(Cap, N)`. A want over the limit is held,
  `want_held(W, "over the limit of N wants of Cap an evaluation: ...")`, and
  the world's answers are partial (exit 5). This is what stops an answer that
  always asks one more question: each round costs a call, and the limit is the
  number of calls the book's author will pay for.
- The rounds also share the evaluation's budget and its space wall, so one that
  grows too wide stops there with a hole, as a rule does.

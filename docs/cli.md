# The `rofl` binary

One native binary, `rust/target/release/rofl` (built by `cargo build --release` in
`rust/`, shipped with every release). A world is the files named after the
flags, `boot.rofl` first.

**Install** with no checkout and no Rust: `npm i -g @grafema/rofl` (or
`npx @grafema/rofl ask ...`). Its `rofl` runs the binary of the package
`@grafema/rofl-<os>-<cpu>` npm installed for this machine (`npm/rofl.ts`):
the same arguments, streams, directory, environment and exit, so a world
it keeps is the one the bare binary keeps (`docs/npm.md`). Exit 127:
no engine of this package's version is installed for this platform, said on
stderr with the package to install.

```sh
rofl ask    'reaches(a, X)'      boot.rofl world.rofl    # the rows, one per line
rofl why    'reaches(a, c)'      boot.rofl world.rofl    # what proves it
rofl why --all 'total(a, 7)'     boot.rofl world.rofl    # every member of every cell
rofl whynot 'reaches(c, a)'      boot.rofl world.rofl    # what stops it: the nearest failure; --depth N --nodes N bound the walk
rofl whynot --all 'reaches(c, a)' boot.rofl world.rofl   # every failure the walk met
rofl excise 'calls(a, b)'        boot.rofl world.rofl    # what taking the base fact out changes: - gone, + new
rofl load                        boot.rofl world.rofl    # the whole state
rofl serve [FILE...]                                     # one JSON request a line, one answer a line; the files are session 1
rofl render --out DIR            world.rofl ...          # the sentence form
rofl render --out DIR            world.rofl.md           # back into rules: DIR/world.rofl, DIR/world.phrases.rofl, the report on stdout
rofl nb [--cell N] [--all]       notebook.rofl.md        # run a notebook, printed as `npm run nb` prints it
rofl adapter mcp COMMAND... | URL [KEY...]               # the adapter book of an MCP server, over stdio or HTTP (docs/intents.md, phase 5)
rofl adapter openapi SPEC [KEY...]                       # the adapter book of an OpenAPI document, JSON or YAML, a file or URL (scenario 6)
                                                         # a KEY is HOW[:NAME]=ENV: bearer, basic, header:NAME, query:NAME, client_credentials:TOKEN_URL; or login:ISSUER
rofl adapter login ISSUER [CLIENT_ID]                    # a person signs in at a browser (OAuth 2.1, PKCE); a book's login key sends that token
```

A question verb is `rofl load` with that one question, so every flag of
`rofl load` applies to it (`--ticks`, `--budget`, `--space`, `--strata`,
`--retract`, `--below`, `--kept`). `rofl load --ask L --why L --whynot L --excise F`
asks several in one run, the answers in that order with an empty line after
each.

**A whynot prints the nearest failure.** The walk goes down every rule that could
conclude the literal and every candidate it follows, as far as `--depth` and
`--nodes` let it; it prints one chain of it: at each literal the rule, and at
each rule the failed premise, that leave the fewest premises unmet (those after
the one it failed at, and one at the chain's end: a premise nothing supports, a
negation blocked, a builtin false; a chain the bounds cut is farther than any
that ends), the first of equal ones, with the `followed 16 of N` lines of the
rules it keeps. `  (every failure: --all)` closes it when it left something
out. `rofl whynot --all`, `rofl load --whynot-all L` and the protocol's
`"all": true` print the whole walk; `explain_request(whynot, L)` stores the
whole walk, and a notebook prints it under `--all`.

**The text is the reference's.** `why`, `whynot` and `excise` print what
`src/api.ts` prints; `ask` prints what the REPL's `?` prints with the
sentences off: `V = x, W = y` a row, sorted, `(empty)` for none, `? row  line`
a shrug, and `[partial: ...]` when the rows may be short of an answer.
`npm run whycheck` holds every one of them to the TypeScript engine byte for
byte over every world `npm test` loads, refusals included.

**`--json`** prints each answer as one line in the shape `rofl serve` answers:
`{"ok":true,"vars","rows","keys","shrugs","partial"}` for an ask,
`{"ok":true,"text"}` for a why, `{"ok":true,"holds","text"}` for a whynot,
`{"ok":true,"removed","added"}` for an excise, `{"ok":false,"error"}` for a
refused question. With no question it prints `{"ok":true,"state","partial"}`.
A run that ends before answering prints `{"ok":false,"error","exit"}`.

**A `.rofl.md` file** is a world written as executable Markdown: wherever a file is named, the
binary reads it into rules natively, after the worlds its `reads:` names, as `scripts/read.ts` does
(`npm run mdcheck` holds the two to the byte). Its vocabulary comes from the tree: the nearest directory
above the file holding `boot.rofl` and `facts/phrases.rofl`, else the tree the command came with (below). A plain `.md`
is a document and is refused (exit 2).

**`rofl nb`** runs a notebook the way `npm run nb -- FILE` does and prints the same text and exit code
(0 ok, 1 a never fails, 2 not everything was read, 3 blind or cut), with `--cell N` and `--all`. `draw`, a
notebook over code (`code:`, `model: js`) and `--json` are not native yet: it says so on stderr and exits 2.
`npm run nbcheck` holds it to the TypeScript kernel byte for byte over every notebook in its slice.
`npm run nb` evaluates only the cone of what a notebook's lines ask (docs/demand-cones.md); it has no setting.
`rofl ask`, `rofl why` and `rofl whynot` do the same: the world asks the relations
their question names (`asks(R)`), so only the rules those reach run; asked later
about a relation outside what its kept world asked, that world grows its cone by
delta. `rofl excise`, `--state`, `--ticks`, `--retract` and `--explain` keep every
rule, and so does `rofl load`, whose answers whycheck holds to the reference. At
700 vscode files with the JS model: 49 s and 2.1 GB against 104 s and 3.4 GB.
A world is kept only when the memory the process may still use holds about three
times its volume (indexing it for a delta and writing it); otherwise it is
answered and not kept, said on stderr.

**`@LIST`** stands for the files LIST names, one a line, each read from LIST's
directory. `@rules/js.files` is the JS model, the files the notebook host
loads (`notebook/front.ts` `MODEL_FILES`; `npm test` fails when the two differ).
A LIST that is no file from the current directory is read from the tree the
command came with: the tree above the path the binary was called by (the npm
package calls it by a path inside itself), else the one above the binary. So
`@rules/js.files` works from any directory, and a `.rofl.md`'s vocabulary is
found the same way.

**`roflenox://HOST/IDENTITY/BOOK`** stands for the book BOOK as IDENTITY signed
it on that Roflenox node, every batch of the chain checked (guide/ADAPTERS.md,
*A book on Roflenox*). A book that fails a check is refused, exit 2.

## A world kept on disk

**A question verb keeps its world by itself.** `rofl ask`, `why`, `whynot`
and `excise` with no `--kept` keep the world they evaluated under
`$XDG_CACHE_HOME/rofl/worlds` (else `~/.cache/rofl/worlds`, beside the kept
scans), named by its walls and files, the environment the engine reads and the
engine. The same question, or another, over the same files is answered from it
without evaluating; when something it was computed from has changed, the run
says so in one line on stderr (`the kept world ... is stale: rules/x.rofl
changed since it was kept; computed anew`), evaluates, answers, and keeps the
new world over the old. A world that cannot be kept (a cache that cannot be
written, a scanner that named nothing it read) is answered all the same, with a
line on stderr. The kept worlds together never hold more than `ROFL_CACHE_GB`
gigabytes (50 by default, two worlds of the reference scale: a volume measured
at 0.36 and 0.80 of the evaluation's peak memory, 89 and 76 bytes a fact on
cost_shapes_model and agg_minmax_strata, so up to ~23 GB for a world evaluated
in ~23 GB): a world kept pushes out the older ones, least recently used first;
the volume is written no further than the cap and than the disk can give above
a 5 GB floor.

**A world larger than its cache stops there** (w_disk_wall). While a question
verb's world evaluates, the bytes its volume would take are counted (from the
lengths of what the store and the heap hold, never less than the volume: 0.76
to 0.99 of it over the 96 worlds of the tree, tests/disk.rs) and checked at
every step beside the step budget. Where they would pass eight ninths of what
the cache gives it (the ninth is room for what the cut keeps of the evaluation
in flight), the evaluation stops as at a step wall, with
`hole($adhoc, disk_exhausted)`: its answers are partial (exit 5), the world is
kept as it stood, and asked again it answers from there, saying on stderr that
it stopped at the disk cap (`the world reached the disk cap of its cache, 4.0 GB
(ROFL_CACHE_GB), and stopped there: its answers are partial; a larger cap goes
on from where it stopped`). Asked under a larger cap, it goes on from where it
stopped, not from the start, and reaches byte for byte the world a run under
that cap from the start reaches; where the wall fell in a place no step wall can
be gone on from (a lattice, a threshold, a closure kernel, an unfolding on
demand: docs/staged-evaluation.md) it is evaluated again, said so. A world
whose given facts already take more than the cache gives is evaluated whole and
not kept, as is a cut world whose cut does not fit after all: then it goes on
to its end and is answered whole (`... it was evaluated to its end, and is not
kept`). A world that ticks, retracts or explains is evaluated whole as before.
A kept world that stopped at the cap is never taken by delta: an edit computes
it anew. Each process writes under a name of its own and renames it
into place, so cold runs of one question at once keep one world; what a process
killed while it wrote leaves is removed by the next run that keeps a world,
before it starts to write, and the cap counts every file of the directory. Writing the volume costs about 5% of the evaluation it
saves (agg_minmax_strata: 0.83 s on 16.9 s). `rofl load`, `rofl serve` and every harness never read nor
write them: a gate computes. Nothing to turn on or off; the cap is the one knob.

**A world larger than memory stops there.** Every `rofl` process watches the
memory it may use: the least memory limit of its cgroup less a quarter, against
the cgroup's anonymous memory (so the Node of a notebook in the same container
counts); without a limit, what the machine has available down to a quarter of
it; on macOS, four fifths of the machine against the engine's own heap
(src/bin/rofl/memory.rs). Past it, an evaluation stops as at a step wall, with
`hole($adhoc, memory_exhausted)`: a question verb answers partial (exit 5), says
on stderr `the world reached the memory this process may use and stopped there:
its answers are partial, and it is not kept`, and keeps nothing; `rofl serve`
answers the request with `"stopped":"heap"`, as under a caller's `limit.bytes`,
and refuses every later request but `close` while the memory stays spent, so a
host is told instead of finding the engine killed. The wall is checked between
steps: a phase that takes no steps (reading the files, one firing that solves
more than the reserve) can still pass it. Nothing to turn on or off.

`--kept F` with any verb names the kept world yourself, under the owner's
stricter rule: computed once, asked many times, each question a new process that
does not evaluate again, and refused, never recomputed, once stale.

```sh
rofl ask 'reaches(a, X)' --kept world.vol boot.rofl world.rofl   # no world.vol: evaluated, kept there, answered
rofl why 'reaches(a, c)' --kept world.vol                        # answered from world.vol, files and walls as kept
rofl whynot 'reaches(c, a)' --kept world.vol boot.rofl world.rofl  # the same, the files named must be the ones kept
rofl ask 'reaches(a, X)' --kept world.vol --anew                 # evaluated again from its files and kept over it
```

F is a volume (docs/staged-evaluation.md, decision 2): opening it maps the
file, the facts, names and witnesses are read where they lie, and nothing is
evaluated. Every verb answers from it exactly as from the files: `why`,
`whynot` and `excise` keep their witnesses, a `sealed(provenance)` world
answers a `why` as it does fresh (by solving the firing again, or by the same
refusal where it cannot), and a world that declares `asks(R)` refuses outside
its cone as it does fresh.

**A kept world is refused when it is stale** (the owner, 2026-10-21): when
anything it was computed from has changed since it was kept, the run exits 2,
answers nothing, and names what changed:

```
world.vol is stale: rules/x.rofl changed since it was kept; run again with --anew to compute it anew
```

What it was computed from: the files named and every file read on the way to
the rules (a `.rofl.md`, what its `reads:` names, the vocabulary of its tree),
each by its bytes; every path a scanner named as read (`-- reads:`), a file by
its bytes and a directory by its names, and the directory the scanners ran in;
the walls (`--budget`, `--space`, `--strata`, `--ticks`, `--explain`,
`--retain`, `--retract`, `--below` and its files); the engine, by the bytes of
the binary; and `ROFL_KERNEL_OVERRIDE`, `ROFL_NO_VCLOSURE`. A file touched but
not changed, or a file the world never read, leaves it fresh. A run that names
files or walls must name the ones it was kept from; a run that names none takes
them from F. Nothing stale is ever loaded, and nothing is evaluated again
unless `--anew` says so.

A world one of whose scanners named nothing it read is not kept (exit 2):
whether it went stale could not be told. A world refused when evaluated is not
kept either. A file at F that is cut short, changed after it was written or not
a kept world is refused with a sentence (exit 2): the volume ends in the sum of
its bytes, read whole before it is opened. Once a volume settled (a second after
it was last changed) has been found whole, its sum, length and change time are
noted under `$XDG_CACHE_HOME/rofl/seen`, and while all three are as noted it is
opened without being read whole again; the files a world was kept from are
stamped by the sum of their bytes, noted there the same way. A run whose files
are more than eight away from every kept world's, and more than one in eight of
the world, is evaluated whole rather than taken by delta from the nearest.

Measured on `cost_shapes_model` (the JS model over `examples/shapes`, 310 368
facts, release build, three runs each, a loaded machine): a `why` takes 2.9-3.1 s
from the files and 0.12-0.14 s from the kept world (a 27.7 MB volume), the same
448 bytes of answer; the run that keeps it, 3.0 s.

**An edit goes by delta.** When the files a question verb's kept world was
computed from have changed (no `--kept`), the run opens that world and takes the
change by delta instead of evaluating again: the base facts of each file
changed or gone are taken out in one pass (DRed: what rests on them is
overdeleted and what another firing still makes is derived again), the facts of
the new texts are added, and the world is kept again. A file the world was kept
from with other files beside it (one added or removed) is found by the same
rules and walls. A scanned source changed is scanned again alone; a scan the
rules newly ask for is run; one no longer asked for has its facts taken out.
The run says so in one line on stderr:

```
the kept world took 1 file by delta: db.rofl (35 facts out, 409 overdeleted or derived again; opened and taken in 201 ms, kept again in 12 ms, 9367080 bytes written)
```

**The world kept again is an overlay over the one before it**
(f_a_kept_world_is_written_whole_by_each_edit,
f_an_overlay_held_every_edit_since_its_base). The volume the world was opened
from stays on disk beside the slot under its sum (`<slot>.<sum>.vol`), and the
slot gets an overlay: a file that names the volumes it is kept over, the whole
one first and the overlays after it in order, and writes only what changed
since the last of them. An arena the edit did not change is named where it was
made: a span of one of those volumes and the changes the overlays after it
wrote over it. One it changed is that and one change more: the values put over
it and what came after, or, where values went out of the middle, the spans it
keeps and the values between (a copy of a mapped arena is compared with what it
was made of to find them). The cells of the aggregates, the citations and the
firings since the whole volume, and the top of an argument index over the
whole volume's are written the same way. Opening an overlay maps those volumes
and makes each changed arena once, its unchanged pages mapped privately from
the file. So an edit writes about what it changed, not what changed since the
whole volume: at vscode 250 a 402-fact file is 1.1 MB where the one overlay
over the base held 46 MB after eight edits; kept again in 0.09-0.27 s where
it rose to 0.63 s. After 64 overlays, or once they
together would pass a quarter of the whole volume, the world is written whole
again and that is the new base (the line ends `bytes written over the world it
was kept from` while it is an overlay). A volume pushed out of the cache takes
the overlays kept over it; an overlay one of whose volumes is gone or changed
is refused and computed anew.

It evaluates whole instead, the reason after `not by delta:` in the stale line,
when the rules changed (a file that changed holds a rule, or a file gone held
one), the world was not
read from its files alone (a `.rofl.md`, a world `--below`), a scanner ran in
another directory, a file changed that is neither named nor read by a scanner,
or the engine refuses the delta (a fact read on demand, a world kept with no
witnesses, a well-founded world, an edit that makes a rule fault anew).
`rofl load --retract F` and `rofl serve`'s `retract` take one fact by the same
pass where the engine's one-fact delta refuses it; stderr's `Delta { .. set:
Some(..) }` says so. A world holding a hole is taken by delta: what
the holes and the shrugs may move that the edit reaches is evaluated again
after it, the rest kept with what the holes left unknown in it. The
answer is the fresh evaluation's either way (rust/rofl/tests/retract_set.rs:
200 random edit, add and remove steps over a JS corpus, each equal to a fresh
evaluation byte for byte, and one in ten to the same step taken a fact at a
time; tests/kept.rs for the command line).

Measured (release build, the JS model; worlds of the delta fixture with
scanned files beside it, and the bench's vscode subset, 250 files of
vscode's base directory, each its own facts file):

| world | whole | an edit by delta | facts touched |
|---|---|---|---|
| 6 files, 603 base facts | 1.4 s | 0.24 s | 434 |
| 14 files, 15 807 | 2.0 s | 0.33 s | 438 |
| 30 files, 109 194 | 5.9 s | 1.08 s | 449 |
| vscode 250 files, 1 588 642: a function added to one file | 49.1 s (60.1 s keeping it) | 9.7 s | 0 (no fact out) |
| the same, the file gone | | 15.8 s | 6 983 |
| the same, the file back | | 11.9 s | 0 |

A node's id is its place in the tree, so a function added at the end of a file
takes no fact out. What an edit touches stays flat with the world; its time
does not yet. At vscode 250 (1 595 714 base facts, each file scanned alone) a
function added and taken out again is opened and taken in 0.63-0.98 s (whole
run 0.93-1.7 s), and the same question asked again of the kept world takes
0.27-0.35 s: a volume and the files found whole are not read whole again, and
a declared tree's forest is kept in the volume and built again only in the
trees an edit reaches (f_an_edit_by_delta_paid_for_the_world_in_six_places,
f_opening_a_kept_world_read_every_byte_it_was_kept_from).
Writing it again took 5.4 s for the
whole 1.25 GB volume; as an overlay (release, 2026-10-23, the same subset, four
edits in a row over a 1.17 GB base) it takes 0.17 s and 49 MB for a function
added (nothing out), 0.33-0.39 s and 193-201 MB once an edit had taken facts out.
Now a relation a fact went out of is written as the base's runs spliced with
what changed, and the record names each file's facts as runs of ids: 0.16-0.5 s
and 35-56 MB for the same four edits, the answer the same. The rows of trees
and their citers are spliced likewise, and a large argument index the base
does not hold (built for the edit since) is not written: it is built again
where a later edit asks for it; likewise a forest of a declared tree built
again whole. 5-8 MB for the same edits.

Records of facts gone stay in the world (a reader skips them) until it is
evaluated whole: once they are more than a quarter of its records, the next
edit says `of facts gone: it is evaluated whole to drop them` and is not taken
by delta.

## Exit codes

| code | meaning |
|---|---|
| 0 | answered, whole |
| 1 | the call is wrong: a flag, a value, a file that cannot be read |
| 2 | a file is refused: it does not parse or does not load; or the kept world (`--kept F`) is stale, damaged, or cannot be kept |
| 3 | the world is refused when evaluated: a broken promise, a negation through a cycle |
| 4 | a question is refused: not ground for a why, not a base fact for an excise, outside the cone |
| 5 | answered from a world the budget, the space or the memory cut short, or a scan failed, or an ask whose rows may be short |
| 70 | a defect: the engine failed (a panic, or an evaluation that says `defect:`) |

A refusal wins over a partial answer: a run with a refused question exits 4.
A state dump of a cut world exits 0; its holes are in the dump.

## JS code, through the Rust engine

Two commands, a directory of JS or TS in, an answer out:

```sh
npm run scan -- path/to/src --out code.rofl          # installed from npm: rofl scan path/to/src --out code.rofl
rofl why 'flows[code]("api/server.js", "api/users.js")' @rules/js.files code.rofl
```

From the npm package `rofl scan` is `npm run scan --`, and a world that asks for
its own input names it as its scanner: `scanner(js, "rofl scan path/to/src")`.

| stage | runs on | reads | writes |
|---|---|---|---|
| `npm run scan` | node: `scanners/cli.ts` | every `.js .ts .tsx .mjs .cjs .jsx .mts .cts` under the directory, `node_modules`, dot directories, `.d.ts` and `.min.js` left out | `code.rofl` |
| the scanner | `rust/tools/oxc_scan` (oxc, parallel; built by cargo on first use, else the one beside the installed engine) | one file's text, named by its path from the directory | `node[ast_oxc](Id, Kind, File)`, `line[ast_oxc](Id, Line)`, `start[ast_oxc](Id, Offset)`, `child[ast_oxc](Parent, Field, Index, Child)`, `attr[ast_oxc](Id, Key, Value)`, `file[ast_oxc](Root, File)`, `parse_error[ast_oxc](File, Message)`; the contract is the header of `rust/tools/oxc_scan/src/main.rs` |
| the host facts | `playground/host.ts` `hostFacts` | the paths, and every string a file holds | `has_file[fs](Dir, Name)` and `has_dir[fs](Parent, Name)` (the files and directories in their own ledger, a directory named by its path, `"."` the root; the model joins a path with `concat`) and `str_segs`, `str_seg`, `str_char0`, `str_scheme` (each string cut the way a module specifier is read); the strings `[code]` |
| the model | `rofl`, Rust | `@rules/js.files` and `code.rofl` | the model's relations: `calls`, `flows`, `effect_of`, ... (`docs/js/` renders each file of it in sentences). `models/lang/js/oxc-roles.rofl` reads the raw tree into the roles of `roles.rofl`; the rules read the roles |

`npm run scan` prints the facts to stdout without `--out`, names every file no
parser read on stderr and then exits 2. The facts are the ones the notebook
host gives a `.rofl.md` with `model: js` (`npm run nb`, the VS Code worker): both scan with oxc, the notebook host and the
browser page (playground, workbench) through `rust/tools/oxc_scan` compiled to wasm (`scanners/oxc_wasm.ts`, the facts of
`--no-start` byte for byte; `oxc_scan.wasm` is built by `cargo build --release --lib --target wasm32-unknown-unknown` in
`rust/tools/oxc_scan`, and `rustup target add wasm32-unknown-unknown` is its one prerequisite), `scanners/cli.ts` for a
directory through the native binary. A notebook also reads `ast_node`, `ast_child`, `ast_attr` over oxc's tree
(`models/lang/js/oxc-to-code.rofl`).

Where the JS model cannot be exact it says so in a relation, not by an empty
answer: `unresolved_call[code](C, Shape)` and `frontier_at` name every call it
did not resolve; `may_call[code](A, F)` holds what `o[k]()` with an untraced key
may reach (the functions its receiver holds, never folded into `calls`);
`merged_param[audit](F, I, N)` names a parameter handed N functions, whose
answers are their union, not per call. Code under `require.main === module` is
read as the library's: `runs_as_script("path.js")` reads one file as the script
node runs, `reads_the_file_as(script)` every file. A notebook cell whose rule
reads a relation at an arity or in a book nothing writes says so on the cell.

Measured on `examples/services/src` (3 files, 1051 facts), five questions, two
whys, a whynot and two asks: every answer the same text as the TypeScript
engine's. The TypeScript engine took 12.4 s for the world and the five; the
Rust release build 1.5 s for the world and the five in one `rofl load` run,
and as much for each `rofl why` run alone, since each builds the world.

### The roles layer (w_l2_roles), which the model reads

`models/lang/js/` is the next layer under the JS model: `roles.rofl` is one
vocabulary of roles (`ref`, `binds`, `callee`, `nth`, `executes_if`, ...) in
two worlds, `[value]` and `[type]`, over one tree, `[tree]`; `oxc-roles.rofl`
writes them from oxc's tree in `[ast_oxc]` (the raw relations are `node`, `child`, `attr`,
`line` and `file`: a ledger is named by its book, not by a prefix). `rules/js-*.rofl` read
the roles of the oxc converter (`rules/js.files`); `npm run test:roles` drives the layer, and
`rofl load @models/lang/js/oxc.files code.rofl` writes the roles of a corpus scanned by `npm run scan`. Pass `--budget` and `--space` at hundreds of files: the
default budget cuts the state without saying so.

### The second parser: oxc, in Rust

```sh
npm run scan:oxc -- path/to/src --out oxc.rofl
```

`rust/tools/oxc_scan` (its own cargo workspace, so the engine's build never
compiles oxc) reads the same files as `npm run scan` through oxc and writes
oxc's own tree, the Rust structs of `oxc_ast` and not its ESTree output, raw
and without judgement into the `[ast_oxc]` perspective: `node(Id, Kind,
File)`, `line(Id, Line)`, `start(Id, Offset)` (in UTF-16 units, as a JS
parser counts), `child(Parent, Field, Index, Child)`, `attr(Id, Key, Value)`,
`file(Root, File)`, or `parse_error(File, Message)` alone for a file oxc
reports an error in. A program's id is its file prefix and `root`, so a second
parser that does the same names a file's program alike. A
kind is the struct's name (`static_member_expression`, `class`), a field the
Rust field's; an enum wrapper that names it otherwise is the attribute
`variant` (`class` under `"ClassDeclaration"`). Every other id is a hash of its parent's id and its step, under the file's
prefix: code added above a node leaves its id. Files
are parsed in parallel and printed in path order, the same bytes for the same
tree. The JS model reads `[ast_oxc]` through its converter into the roles
of `roles.rofl` is `models/lang/js/oxc-roles.rofl` (`rofl load
@models/lang/js/oxc.files oxc.rofl`), checked by the world `oxc_roles` over
`models/lang/js/fixtures/all.ts`.

A node's id is its scanner's: stable under edits, each parser's own
(f_role_ids_name_a_node_by_its_roles); both name the program `<prefix>root` and
give `pos[tree]` in UTF-16 units.
The host facts (`has_*`, `str_*`) are `npm run scan`'s own, written after oxc's facts.

Measured on vscode src (11 055 files, 4 cores, release): 72 s and 99.5 M
facts, 8.9 GB of text, most of the wall writing it; on vscode src/vs/base (499
files) 1.1 s against 18.7 s for `npm run scan`, 304 MB against 241 MB.

### The lifecycle of a resource: use after death, leaks, a process with no stop

```sh
npm run scan -- path/to/src --out code.rofl
rofl ask 'leaks_at[lifecycle](Kind, How, File, Line)' @rules/js.files models/lang/js/lifecycle-host.rofl models/lang/js/lifecycle.rofl code.rofl
```

`models/lang/js/lifecycle.rofl` is the world `[lifecycle]` over the JS model
(w_lifecycle_world), for the host's resources that `lifecycle-host.rofl` lists
(an fd, a stream, a watcher, a server, a socket, a child process, an interval:
which call bears it, which kills it, which needs it alive, which keep the
process alive). Its answers, each with the kind and the lines:
`used_after_death_at(Kind, File, Born, Killed, Used)`; `leaks_at(Kind, How,
File, Line)`, How `once` or `accumulates` (born in a request handler, an
interval, an event handler or a loop); `leak_unknown_at(Kind, File, Line,
ViaLine)`, a resource that leaves its function there; `no_shutdown_at(Kind,
File, Line)`, a resource that keeps the process alive where no
`process.on('SIGTERM' | 'SIGINT' | 'SIGHUP', F)` exists; `outlives_stop_at(Kind,
File, Line)`, one the stop handler does not reach. The worlds `lifecycle_leaky`,
`lifecycle_clean` and `lifecycle_forgetful` check them over
`models/lang/js/fixtures/lifecycle/`.
`overwrites_at(Name, File, Line1, Line2)`: the write of a binding at Line1 is
overwritten at Line2 before anything reads it (both writes whole steps of one
sequence, the binding read by no other function); the world
`lifecycle_overwrites` checks it.

The words of behaviour the model derives live in their worlds (the doc «Словарь
ролей модели JS», «Миры поведения»): `suspends[execution](Seq, I)`,
`hidden_call[execution](N, How)`, `transfers[execution](X, Kind)`,
`fallback[execution](F, Name, Init)`, `coerces[execution](N, X)`,
`narrows[type](O)`; ask them with `@rules/js.files` alone.

## A world that asks for its own input

A world can ask for facts it does not have yet. It names a scanner for a kind
of input and asks for paths; each evaluation runs every new request at once,
loads what the scanner prints, and evaluates again, until nothing new is asked.

```
scanner(js, "node --experimental-strip-types scanners/cli.ts examples/scan/src").
scan_request(js, "main.js").
scan_request(js, F) :- depends[code](_, F).
```

`rofl load @rules/js.files examples/checks/scan-world.rofl` scans `main.js`,
then `lib/greet.js` that it imports, then `lib/shout.js`, and never
`lib/unused.js`. A scanner is any command: the path is its last argument and
what it prints is loaded as ROFL, rules as well as facts. Each request runs
once and leaves `scan_done(Kind, Path, Clauses)`, or
`scan_failed(Kind, Path, Message)` when there is no scanner for the kind or the
command fails. It works wherever the world is evaluated: `rofl load`, the
question verbs and `rofl serve`. A scan that failed (no scanner for the kind,
a command that cannot be started or that exits non-zero) leaves out the facts
it would have brought, so a question verb answers partial: each failure said
on stderr, `[partial: a scan failed ...]` under the rows (`"partial":true` in
`--json`), exit 5. The world itself holds `scan_failed` to ask about.

**A scan is kept.** A scanner that names what it read, a `-- reads: PATH` line
for each file and directory (`scanners/cli.ts` names the file it parsed and
every directory it listed), has its output kept under
`$XDG_CACHE_HOME/rofl/scans` (else `~/.cache/rofl/scans`), each read stamped:
a file by its bytes, a directory by the names in it. The next run takes the
same command for the same path from there while every stamp holds, and runs
the scanner again when one does not. The world cannot tell the two apart. On
`examples/checks/scan-world.rofl` the second run is 2.4 -> 1.7 s, the rest
being the model's evaluation.

A file scanned again for a kept world (`rofl ask` after an edit) is handed
its previous output, the stale kept one, in `ROFL_SCAN_PREVIOUS`, and
`scanners/cli.ts` gives a node it matches there its old id: a local renamed
moves the facts that hold its name, not those of every statement naming it.
What it prints then is kept marked `-- inherited` and answers only such a
rescan; a world evaluated from its files (`rofl load`, `npm test`) scans from
nothing and gets the same ids whatever ran before it.

**Between two rounds the world goes cold.** While the scanners of a round run,
the evaluated world is kept as a volume in the temporary directory and mapped
back: what the rounds before brought in lies in the file, not on the heap, and
the heap it held is given back. The state is the same fact for fact. Measured
on a walk over this repository's `src/` from `repl.ts` (18 files, 4 rounds,
fast build): 75 -> 78 s, and the heap held between rounds falls from 0.6-0.8 GB
to about 0.15 GB. The peak, 2.9 GB, is not lowered: it is the round that adds
14 files at once. Adding them one a round lowers it to 1.4 GB, the largest file
alone, but each small file added to that world costs about 15 s
(`f_a_walk_goes_cold_between_rounds`).

## Lemma stages

**A book the plan names in `cut[fixpointplan](B)` is a world of simpler lemmas.** The engine takes the rules that
read or conclude `[B]`, and below them every rule concluding what one of them reads: that is the lower stage, closed
downward, so it reads nothing the rest concludes (`engine/stages.rs`). It is evaluated first and whole; what it
concluded outside `[B]` and a rule above it reads are its lemmas, kept as given facts; `[B]`'s facts are dropped, and
so is what it concluded that nothing above reads; the rest of the program is evaluated over the lemmas. A question
about a dropped relation is refused, naming why (exit 4), never answered empty. The answers are the whole world's. The JS model cuts oxc's raw tree,
`cut[fixpointplan](ast_oxc)` in models/lang/js/oxc-roles.rofl: about 390 rules below (a relation is below or above
whole: every rule concluding one goes with the first taken), the roles and a few more above.
stderr says it: `diag: stage: N rules below, L lemmas, D facts of [B] cut, U nothing above reads; widest below: …`, the last naming the
rules whose own cone pulls most into the lower stage (a rule of the upper model that reads `[B]` drags its whole
cone down with it, and the cut comes late: read the raw tree through a lemma instead, as `in_place[flow]` does).

`rofl ask` and `rofl why` evaluate a world that cuts a book by volumes (below) from 32 MB of corpus on (under
32 MB it is staged in place and kept whole, its answer read back fastest so): the lower stage a file at a time, each in a fork of the core of its own, the worker given only the
file's lemmas and its facts outside `[B]`, so the raw tree of the corpus is never held at once. A lower stage that
reads or concludes `[surface]` is refused there (it runs before anything crosses files), and the world is evaluated
whole. `rofl load` and the other verbs stage the world in place: the lower stage over every file, then `[B]` dropped.

`why` stops at a lemma: `mark[value](n…,class) [lemma roles/types.ts:6]`, the site read off the plan's
`site[fixpointplan](Rel, Book)` (`at[tree](N, File, Line)` for the JS model: the first fact whose first argument is
one of the lemma's; a world that asks has the site in its cone whatever it asks). What is a lemma is the whole program's
lower stage, not the asked cone's. `why --all` (`--why-all`) unfolds each lemma: its file's lower stage is evaluated again in a
fork of the world and its proof set in the lemma's place. A world that cut a book holds lemmas no file names, so it
takes no retraction (refused with the reason); a kept world whose file changed is computed anew, not by delta.
The volumes of a world name what their rules make in one dictionary (`rust/rofl/src/dict.rs`), kept beside them as `<slot>.q<sum>.names`: a term reads the same in every volume and none is spelled to cross.
The kept volumes of `rofl ask`/`why` (from 32 MB) are the exception, as each file below the cut is a world of its own: the
volumes are kept with their registry (`<slot>.q<sum>.scroll`: how many volumes, the sum of the core's text, each file with its sum and the volume that holds it; written last, so a set half written is no kept world), and when at most one file in eight moved and the rules
did not, only the moved files' volumes take the edit, by delta: the file's lower stage evaluated again alone, the
lemmas and facts it no longer gives taken out of its worker and the new ones put in (`volumes: X of Y files taken
by delta in Z ms`). What the edit moves in other volumes is passed on by delta too, round by round
(`, what they show the others in R rounds`): first everything the facts gone reach is taken out at once in every
volume (what cites them, and the copies laid elsewhere of what a volume made, and what cites those), then what
still holds where it is made is laid again, and what was made anew goes where its readers' keys say. A cycle
through the volumes (a fact one derives from a copy of what another derived from it) so keeps nothing alive.
Each worker remembers what was laid in it and for which rules (`<slot>.w<i>.laid`).
Measured, vscode 250 (fast build, 4 workers): half of one file's nodes gone (an edit that removes answers in
other files), 6.3 s of delta in 7 rounds, 10.5 s the run against 13.5 s anew; an exported function renamed,
1.6 s of delta; the answers byte for byte the fresh ones.
Measured, vscode subset S, fast build, 4 cores: 250 files by volumes 3 771 MB peak against 3 264 MB cut, 34.6 s
against 35.6 s, 252 301 answer lines byte for byte; 100 files whole (`ROFL_VOLUMES=0`) 1 598 MB against 1 279 MB.
Stages are Rust only: the TypeScript engine evaluates the world whole, and the worlds of the JS model are checked
on Rust (`check_opt(W, one_engine, rust)`). The engine does not yet derive a stage from what is read and asked; a
stage is the plan's mark.

## A corpus larger than one heap

**`rofl ask` and `rofl why` answer a corpus by volumes, by themselves.** When
the world's facts name two or more files (a node id's prefix, `n<16 hex>_`) and
hold 32 MB or more between them (below that the whole world is as fast), the
facts are cut by file and the files dealt to a worker a core, balanced by bytes;
each worker is a fork of the core (the model, the question, the facts naming no
file), which is frozen once and shared, not copied, and evaluates its files on
its own thread. A level at a time, what a worker made is laid into the workers
that read it and fired on there, until none makes more (`engine/volumes.rs`).
Nothing in the model declares what crosses files: who reads a fact comes from
the rules, any relation. A fact is at home in the volume of its first node's
file, and a rule fires only where the first premise of its body's largest join
(its anchor) is at home. Every other premise reads by a key: the fact goes to a
volume holding, in the premise nearer the anchor it is joined with, the values
it carries in every variable the two share, and only where the premise's
constants match. A reader under a negation or in an aggregate is keyed by what
is closed below its rule, and fires once all it is to see is laid; a part of a
body no variable joins to the anchor goes to every worker. Measured at vscode
250 (4 workers): 72 000 facts laid across the workers (522 000 when a key took
one shared variable at a time), the answers byte for byte. An
answer is the union of the workers'; a relation with a fact naming no file (a
count over every file) is concluded again in a world over the core and the
workers' facts it reads. A `why` is the proof in the worker that holds the fact,
each axiom another worker laid replaced by its proof there. stderr
says it: `volumes: N files on K workers, L levels, R rounds laying S
facts`. The volumes are kept beside the question's slot under
`~/.cache/rofl/worlds` (`<slot>.q<sum>.core.vol`, `.w<i>.vol`): the next
question over the same files is answered from them; an edited file is taken by
delta (*Lemma stages*, above). **Past a quarter of the memory the process may use** (the memory wall's
measure, below), the workers are cooled before the next level: each writes its
facts and names to a volume under the system's temporary directory and goes on
mapped from it, so what no rule reads again lies in pages the system takes
back, and only what the next levels make is on the heap
(`volume::cool_in_place`). A worker cooled before writes only what changed as
an overlay over its earlier volumes; they are removed with the worker. Stderr
says before how many levels, how many volumes and how many MB of disk. A disk too
full to write one leaves that worker on the heap, said on stderr. A wall that
cuts one worker, the memory wall above all, stops them all: the answers are
partial (exit 5) and not kept. Measured on vscode subset S, 4 cores, release:
250 files 18 s against 50 s whole, 500 files 32 s against 71 s, the answers
byte for byte; 1 000 files, which the whole world does not fit on a 15 GB
machine and the workers on the heap reach its wall at, answer whole in 167 s
of evaluation, cooled before 5 of 16 levels (the first cooling about 0.9 GB a
worker, the last three 3 to 12 MB), 6.7 GB of disk, at most 8.9 GB of heap
(`f_a_question_verb_answers_a_corpus_by_volumes`,
`f_volumes_cooled_under_pressure_answer_a_thousand_files`). `whynot`, `excise`,
`--state`, `--ticks`, `--retract`, `--explain`, `--below`, `--kept` and
`rofl load` evaluate the world whole, on one heap; at the reference scale (CLAUDE.md,
*The goal*) that is the 23 GB the owner measured.

**The design the owner agreed** (2026-10-25): a file is scanned into a volume of
its own, the volume is cooled to disk and stays there until a question needs
it, and beside it lives the file's `[surface]`, a thin volume of what escapes
the file (`rules/js-surface.rofl`). The design is in
docs/volumes-and-residency.md (why a corpus can stay cold),
docs/surface-split.md (what crosses files, the book, the driver) and
docs/staged-evaluation.md (stages, kept volumes, resume, the planner).
The volumes of the question verbs no longer need that book: what crosses files
comes from the rules' keys (above), and `[surface]` is a book like any other to
them; the driver of `runtime/split.ts` and its gate still exchange it alone.
**The question verbs evaluate by volumes and cool them under pressure (above);**
what they do not do yet is keep a cooled volume closed: a worker's volumes stay
mapped through the evaluation, so the disk holds what the heap would, and an
arena a later level writes to is copied whole back to the heap. The other parts and the harnesses that drive
them, each over `rofl serve`:

| what | how to run it | measured | status |
|---|---|---|---|
| a volume per file, cooled, the surface resident (the driver) | `runtime/split.ts`; `node --experimental-strip-types scripts/vscode_curve.ts DIR N split [--hot K]` over a corpus of `scripts/vscode_corpus.ts`; its gate over the JS model was retired with the [surface] mirrors (2026-11-09): unchecked since | 500 vscode files: the whole world's answers exactly, 2.0 GB against 2.5 GB, but 6 335 s against 40 s: each volume reads ~10% of the surface and is evaluated again whole 7.6 times (surface-split.md §7) | correct, not an economy; what it needs next is in §7 |
| the ingest loop: parse a batch, evaluate, cool volumes under pressure | `node --experimental-strip-types runtime/ingest.ts ROOT SUB N [--batch K] [--pressure F]` (boot and `rules/ingest.rofl`, no JS model) | eslint, 1 426 files: 29.9 s, 1 290 volumes cooled to 200 MB, the world never above 1.94 M facts (docs/scaling-a-corpus.md) | the AST only; the JS model is not evaluated |
| stages that fit a memory limit, each a process over the last volume (a TypeScript driver, to give way to the plan's stages, *Lemma stages*) | `node --experimental-strip-types scripts/stage_plan.ts FACTS LIMIT_MB [--files N] [--run] [--check]` | 100 vscode files in 4 stages equal the whole; a ring of files importing one another is one stage (vscode 223 files) | built (staged-evaluation.md, item 4) |
| an evaluation in pieces of a fixed time, each a process resuming the last volume | `node --experimental-strip-types scripts/vscode_pieces.ts FACTS N MS [--state FILE]` | the same state as one run | built (item 3) |
| a question added above an evaluated lower stage | `node --experimental-strip-types scripts/stage_by_asks.ts FACTS N LOWER,... [kept\|volume]` | 0.38 s against 5.2 s whole at 20 files | built |
| files added to an evaluated world one by one | `node --experimental-strip-types scripts/ingest_by_delta.ts FACTS N` | byte for byte the whole world; ~3x a file's share at 20 files | built |
| a level evaluated at a time, other workers' facts admitted between (for workers) | `rofl serve`: `evaluate` with `wall`, `admit`, `evaluate_on` (below), tests/level_wall.rs | 4 workers over vscode 250: the union is the whole world, the slowest worker 12.5 s against 22.8 s | built; the master and shared volumes are the thread *first evaluation in 5 minutes* |

A scan already lies per file: a world that asks for its own input
(`scan_request`, above) keeps each file's scan under `~/.cache/rofl/scans`,
stamped by its bytes. `rofl scan DIR --out F` does not; it writes one file.

Before a run of more than a few hundred files: say which of these it uses, and
if it uses none, that its world is one heap and how large that heap will be:
the JS model over vscode is linear in the base facts, 0.92 GB at 250 files
without a question, so ~12 GB over the 4 308 files of subset S
(w_reference_scale_in_five_minutes in facts/findings.rofl).

## `rofl serve`, the protocol

`rofl serve` reads one JSON request a line and answers one a line. The list of
operations and their fields is the header of
`rust/rofl/src/bin/rofl/serve.rs`; `runtime/port.ts` is the TypeScript client
every harness above uses. Besides the question verbs: `open` (a seed, a kept
image or a volume), `fresh`, `fork`, `load` and `assert` (by delta), `retract`,
`evaluate` and `resume`, `keep` (an image or, with `volume`, a volume),
`cool`, `cool_many` and `reheat` (a volume by its key prefix, to disk and
back), `view` (what a volume's world wrote above its base), `evaluate` with
`wall`, `evaluate_on` and `admit` (a level at a time), `rows`, `fact`,
`firings`, `cell`, `books`, `holding` (the store read piece by piece),
`inbox` and `dispatch` (adapters, docs/intents.md), `tick`, `state`, `facts`,
`close`, and `spans` (no session: `{"op":"spans","text":MD}` answers `{"spans":[[a,b],...]}`,
the lines [a,b) of a `.rofl.md` the reader reads as sentences, and each prose
line that asks; the VS Code extension cuts its bare cells by it). Any request may carry `"limit":{"ms":n,"bytes":n}`.

**The profile of an evaluation** is the book `profile`, written by the Rust engine after an evaluation in which a rule reads
one of the relations below there (the book is shared with rules/profile.rofl, whose relations do not ask for it), and read in the round after (as a scanner's facts are: `Session::profile_wants`, `Eval::profile_text`).
A world that reads none pays nothing, and a world given profile facts (another world's, the reflection over it) is written none: the profile it holds is read as it is. Per rule `R` (its id, as `premise_lit` names it): `fires[profile](R, N)` firings,
`conc[profile](R, N)` solutions concluded, `fresh[profile](R, N)` rows that were new, `fresh_whole[profile](R, N)` of them those new at the rule's whole firing, `again[profile](R, N)` solutions that added nothing, neither a row nor a witness (where witnesses are kept a solution not new is mostly a new witness, and this is the waste), `delta_fires[profile](R, N)`
firings solved news first, `activation[profile](R, I)` the place of its firing over the whole store in the run's sequence of them (from 1: at that firing a relation is live only where a rule concluding it fired whole before, or it is a closure), `order[profile](R, At, Order, plan | greedy)` the order the rule was solved in on the news at
written position `At` (0 the firing over the whole store), as a `$cons` list of written positions, and whose it was (below,
*The plan as facts*), `written_order[profile](R, Why)` why the planner kept the rule in written order (
`aggregate`, `closure`, `lattice`, `demand`, `negated_demand`, `threshold`, `next`, `one_premise`, `naive`); `lattice`
means the rule reads or concludes a lattice relation, so a rule beside a lattice that touches none is planned as it
would be without it. Per premise
`K` (its written position, from 1, as `premise_lit` counts it): `width[profile](R, K, N)` partial rows that reached it, `width_at[profile](R, At, K, N)` the same by the news position `At` the firing was solved from (0 the whole evaluation; a plan is given per `At`, so the refine loop judges it by these),
`read[profile](R, K, N)` rows read from the store there, `yield[profile](R, K, N)` rows that left it,
`widest[profile](R, K, N)` its widest single read. Per relation of a user's book: `rows[profile](Rel, Book, N)` live rows
and `distinct[profile](Rel, Book, Pos, N)` the distinct values at argument `Pos` (from 1), the planner's own measure; a
relation a rule reads and nothing holds is censused with 0 rows and 0 distinct, so a plan knows it is empty; a constant a rule writes in a column is censused as `selects[profile](Rel, Book, Pos, Const, N)`, the rows that hold it, since the column's average misses the skew a constant picks. A premise writing constants in two columns or more is censused as `picks[profile](R, K, N)`, the rows that hold them all, since the fewest of its columns misses their conjunction.
**The heap** is the one part that is not: a world with a rule that reads `bytes`, `peak_bytes` or `peak_rule` there is
written `peak_bytes[profile](heap, B)`, the most the `rofl` binary's counting allocator held during the evaluation,
`peak_bytes[profile](resident, B)` the most of the process that was resident (`getrusage`), `peak_bytes[profile](Part, B)` what each part held at the last check where the heap had grown by a sixteenth (the store's
`recs`, `args`, `tup_*`, `by_key`, `idx`, `wit`; the names `h_*`; `heights`), `peak_bytes[profile](unaccounted, B)` the
rest of the heap then (partial solutions, a walk's own tables), `peak_rule[profile](R)` the rule firing at the peak where
one was, and `bytes[profile](Part, B)` the parts at the end; models/engine/memory.rofl reads them as `mem_peak`,
`mem_end` and `mem_peak_rule` beside its forecast. Without asking: **`peak:` on stderr** of `rofl load` and `rofl ask`,
where the heap passed a gigabyte, says the same in one line, the largest six parts first (vscode at 250 files with
witnesses, the whole world: `peak: the heap held 3776 MB (3135 MB resident at most); at 3685 MB: wit 1276, idx 500, unaccounted 499, recs 384, args 256, by_key 256 (MB)`).
A world answered by volumes (`rofl ask`'s default over a corpus) says the process's peak, and the parts summed over
the core and each volume at its own peak, with no `unaccounted`, since the heap is shared by the workers' threads
(the same 250 files: `peak: the heap held 4003 MB (3761 MB resident at most); the core and 4 volumes at their own peaks: wit 1278, idx 539, recs 390, args 264, by_key 260, h_syms 237 (MB)`).
A part is what was asked of the allocator, a vector's whole capacity with it; a capacity never written is not resident,
which is why the heap is above the resident peak (reserving the witnesses' vectors whole beforehand moved the resident
peak by nothing). They vary with the allocator: no golden reads them.
Rows read are deterministic, so the same world profiles the same on every machine; no time is written. The numbers are
the evaluation's before the profile's readers ran, and are written once per session. examples/profile/chain.rofl asks
the questions a rule's author asks of it (a rule kept in written order, a premise that scans where it should look up, a
rule fired once per round); the TypeScript engine writes no profile, so a world that reads it is Rust's alone
(`check_opt(W, one_engine, rust)`). **The kernel's own program is profiled with the world's**: safety.rofl judges every world in an
evaluation of its own (`Eval::safety_answer`), and that evaluation's profile is written to the same book, its rules named
`program[profile](R, safety)` with `kernel_head[profile](R, L)` and `kernel_premise[profile](R, K, L)` their reflection
(the kernel's rules are in no world's `premise_lit`; a builtin premise is written `$builtin(Op, $nil)`, an aggregate
`$agg`), and its relations censused under the book `safety`, so a hypothesis pack judges the kernel's rules as it
judges the world's; its text is built only when the profile is asked, from the kernel's evaluation kept for it, so a world that asks no profile pays nothing for it. A question meant for the world's rules alone joins `concludes(R, _)`, as examples/profile/chain.rofl does. The plan pack plans none of the kernel's rules (`pl_own(R) :- program[profile](R, safety)`): the engine obeys no plan there, and planning its 213 rules cost a small world twice its time. That is how the kernel's quadratic was
found (f_a_lattice_beside_the_js_model_trips_the_kernel_safety_budget): a lattice beside the JS model made
`unw_reach` close the whole lattice-edge graph, 445 036 rows read of 2.3 million in the run.

**The hypotheses over the profile** are models/engine/profile.rofl, a pack loaded beside any world (`rofl load
models/engine/profile.rofl WORLD...`), everything it says in the book `profile`. Verdicts on a rule `R` or its premise
`K`: `scan(R, K, Rel, Read, Out)` a premise that read more than three times what it let through, with `scan_why(R, K,
small_relation | selective)`; `rescan(R, K, Rel)` a premise read whole on every firing (read = fires x rows);
`rederives(R, Conc, Fresh)` a rule most of whose conclusions were known; `barren(R, Read)` a rule that read and
concluded nothing; `hot(R, Pct)` a rule that read a quarter or more of all rows read. Forecasts of a head's size from the
shape of its rules and the `rows` and `distinct` of what they read, each an upper bound: `forecast(Rel, N, projection |
join | product | closure | chain)`, judged by the head's `rows`: `forecast_off(Rel, Kind, N, Actual)` where the head
holds more (the hypothesis is false), `forecast_loose(Rel, Kind, N, Actual)` where it holds under a quarter. `growth(R,
per_row | per_round | kernel)` is the class of a recursive rule, which only two runs of different sizes judge
(rust/rofl/tests/profile_model.rs). The pack's own rules are profiled and left out of what it says. World
`profile_model` over examples/checks/profile-hub.rofl (a chain, a hub, a ladder, each planted for one verdict or forecast),
Rust only.

**A delta as facts** is the book `delta`. It has no command yet: a harness sets `ROFL_DELTA_FACTS=FILE` on a
`rofl ask` that takes a kept corpus by delta, and the engine writes there what the delta did (`engine/meter.rs`),
counts and no time: per relation `out[delta](Rel, N)` facts taken out with what they rested on, `kept[delta](Rel, N)`
facts that lost a firing and stood on another, `back[delta](Rel, N)` facts taken out and derived again,
`tries[delta](Rel, N)` attempts to derive one again; per rule `whole[delta](R, Head, N)` times it was withdrawn and
fired over the whole store and `keyed[delta](R, Head, N)` times it was asked again at the keys a change named; between volumes `taken[delta](Rel, N)` copies taken out of a volume, `owed[delta](Rel, N)` of them
those not laid again when the rounds ended though a volume still makes what they copy, `orphan[delta](Rel, N)` copies
that stand though no volume makes what they copy (the last two are defects where not zero: `copy_owed`, `copy_orphan`); `seed[delta](Step, Cause,
Rel, N)` the facts a step began taking out and what began it (`removed`, `negation`, `nearest`, `tree`, `whole`, `keyed`),
`walked[delta](What, N)` the records a pass over a whole volume walked, `counted[delta](What, N)` what the crossing between volumes did N times (`term_asked` of a neighbour, `term_named_again` where it was numbered otherwise there: none since the volumes name in one dictionary), `spent[delta](What, Ms)` the time of each part of the delta (the one fact that differs from run to run; `time_unforeseen[delta](What, Ms, Pct)` is a part of a twentieth of the time or more whose rules read no row), `read[delta](Step, R, Head, N)` the rows rule `R` read in a step, the delta's weight (`heavy[delta](Step, Head, Rows, Pct)`
names what reads a twentieth of it or more); per
step of a volume `step[delta](takes_out|takes_in|lays, N)` and `moved[delta](Step, Facts)`.
models/engine/delta-model.rofl holds the hypotheses, each a forecast from the shape of the rules and a verdict against
these facts: loaded beside the rules of the world and the file, with no corpus (it reads the reflection), it answers in
seconds `whole_held[delta](Head, R, Rel, N)` (an aggregate whose key a change of `Rel` does not name was fired whole,
as forecast), `returns_held[delta](Rel, Out, Back)` (a relation recursive with itself went and was derived again),
their `_off` (the forecast was false) and `_unforeseen` (the delta did what no hypothesis says).

**The plan as facts** is the book `fixpointplan`: `plan[fixpointplan](R, At, Order)` gives rule `R` (its id, as
`premise_lit` names it) the order to solve its premises in when fired on the news at written position `At` (0 the firing
over the whole store), `Order` the written positions of every premise as a `$cons` list, from 1. The engine takes the
order as it is, whatever its own estimate says, once it holds up (whether a round fires from the news in that order or
in the written one stays the engine's choice, costed over the given order as over its own: taken free, a given order
fired from every news row where the written firing was cheaper, 296 319 rows greedy against 7 381 348 given for one
order of member_value at 250 files), once it holds up: every premise once, the news first, a negation after what binds
the variables it shares, a builtin after one of the sets that run it and where the written order has it. A fact that does
not hold up is left alone and the greedy order is built; a rule kept in written order (`written_order[profile]`) reads
none. The profile says which order was taken and whose it was (`order[profile]`), so the width that order cost
(`width[profile]`, the partial solutions each premise was solved from) judges the fact. examples/checks/plan-given.rofl
(world `plan_given`, Rust only) is the world where the greedy order loses: `out(X, Y, Z) :- a(X), b(Y), c(X, Z), d(Z, Y)`
reaches its premises with 1 + 9 + 90 + 900 partial solutions as the planner orders it (b first, then a) and 1 + 10 + 100 + 100 under the
fact `plan[fixpointplan](r815c0a08, 0, $cons(1, $cons(3, $cons(4, $cons(2, $nil)))))`. The pack that computes the plan
from a profile is `models/engine/plan.rofl`, loaded beside models/engine/profile.rofl, the rule files and the measured
world's profile **in a world of its own** (the reflection reads the measured world's `activation`, and a plan computed over
another world's schedule is a plan for the wrong firing): it costs every order of each rule's premises (a rule of two to seven; an order is a number in base 9) by the engine's own fanout law, the added premise's rows over the distinct values of the columns the premises before it bind, taken together (the census's per column, multiplied and capped at the rows), a declared `function` whose key is bound one row, a premise sharing nothing its rows, a premise holding nothing zero; the cost of an order is the partial solutions each premise is solved from, summed, and the cheapest is `plan[fixpointplan](R, At, Order)`, At 0 and, for a recursive rule, each news position, with `plan_cost[fixpointplan](R, At, C)` the width it forecasts. The firing at 0 is costed in two phases: the full phase, where a premise's rows are those live at the rule's `activation` (base facts, a closure, or a relation a rule fired whole before it concluded, which it did only where every premise of its own was live then, recursively; an alias where its source is, where the world reads it from the source, and as any rule's conclusion where witnesses are kept and its rule fires; a rule whose book is a variable concludes in every book it is read in, productive where its premises are live in that book; a live premise's rows bounded by its base facts plus what the producers fired before concluded, `conc`, summed), else its `base`; and the delta phase, the store as it fills (`rows`), which decides where the full phase ties (every order from an empty premise costs one). In the rounds a rule fires only on the facts its whole firing did not see (the store's length at that firing is its watermark); a relation with a revived fact is delivered whole. A rule whose premises are news at two places fires once from each, and the premise before the one fired from reads the store less this round's news there, so a solution with news at both is found once. A reader of a closure whose tree is empty at its activation (its edges concluded by a rule activated later) fires whole again on the round the tree is complete, under the same order: a third phase, `refire`, judged at the last edge rule's activation, is added to its full cost, a closure is live where its edges are, and where the two firings want different orders no plan is written, since the engine plans each from the live sizes and one fixed order loses to it. The independence estimate folded over sets under a lattice min (a shortest path over the subsets, dividing by the most distinct of a shared variable) was the hypothesis before it and lost to the greedy order where the data is skewed, and the pessimistic end (the fewest distinct) raised every cost alike and moved no choice. The
world is then run with those facts and `width[profile]` judges them. Over plan-world.rofl (world `plan_dp`) it finds b,
d, c, a for `out` and `alt` alike at a forecast of 208, under the hand-given 211, and the world measures 210 under it
(rust/rofl/tests/plan_dp.rs). It is the second of the two modes the owner asked for: reflection in a world of its own,
the answer in the world as it is. `npm run refine -- <files> [--out F]` runs the loop once (scripts/refine.ts): ask,
with a meter beside the world, for the order and width of every rule and for the profile itself; reflect, the two packs beside the rule files (those with a `:-`, and `@` lists) and the profile written as facts, without the data (the pack reads the reflection of the rules and the profile's numbers; a lattice beside the data had the world solved whole again, and the reflection at 250 files of vscode did not answer in 900 s); refine,
the plan facts written to F (or stdout) to be loaded with the world from then on; ask again, the width under them. The first ask, the measure of the world as it is, is kept in .cache/rofl under the hash of the files, the engine binary and the meter (scripts/keep.ts), so a run of the loop over an unchanged world pays the reflection and the measure under the plans alone. The
report on stderr sets before, forecast and after side by side per rule and marks `worse` a plan that cost more than the
order it replaced: that is the estimate's hypothesis false there, and a finding, not a thing to hide. `-- --check`
runs it over plan-world.rofl and judges it. The reflection world asks its two answers alone (`asks(plan)`, `asks(plan_cost)`), and the plan pack's estimate saturates at 10^15: integers are i64 and a product past them is an `arith_overflow` hole, which made every plan a shrug at 250 files (f_the_reflection_at_the_reference_size_overflowed_and_shrugged). Measured 2026-11-01 at 250 files of vscode: the world 88 s, the reflection 45 s. The reflection runs under walls of its own (the packs' world is 2^N x N rows
per rule of N premises, past the default space at the JS model's size) and a partial answer stops the loop with its
text. The facts it writes are the plans the measurement confirmed, the rules whose width fell; a plan that cost
more is in the report and never a fact (keep or revert, per rule), and the last line counts planned, kept, worse and
how many forecasts came within 2x of the measure, and the line after it what was computed and thrown away, before and with every plan: partial solutions dropped at a premise (`width` less `yield`) and solutions concluded that were not new (`conc` less `fresh`), with the wall time of each run beside them, since the aim is both at zero only while the clock falls too. Every run of the loop is under walls of its own (`--space 200000000 --budget 20000000000`), the reference world being past the default space. Measured over the JS model on vscode mini (2026-11-01): the
independence estimate loses to the greedy order on most rules the data's functional dependencies touch
(f_the_join_order_is_a_fact_the_engine_obeys), so what the loop keeps there is the few it confirmed. The agent's skill for the loop (when to run it, how to read the report,
where the facts live) is .claude/skills/refine-plan/SKILL.md.

**What a world holds, forecast from its rules.** Two more packs read the same reflection as plan.rofl, in a world of
their own beside models/engine/profile.rofl, the rule files and a measured world's profile, and have no command yet:
`models/engine/sols.rofl` (`sols_bytes(now|flat, T)`, `sols_blocks(now|flat, T)`, `sols_widest(R, At, K, W, B)`: the
partial solutions a join makes and the widest level it holds, from the variables each premise is reached with in the
order the profile names, times `width_at`) and `models/engine/memory.rofl` (`memory(K, T)`: the witnesses, their nodes
and premises, from `conc` less `again` and the premise count; and the pattern indexes, from the columns each premise is
reached with, the relation's `rows` and the partial rows that asked through them, `idle_*` those asked by one at most).
The profile to read is a world's own, dumped with a rule that asks for it (`refine_profile(Rel, A) :-
asserted_by($fact(Rel, profile, A), _, _).` beside one that reads a relation of the book, as scripts/refine.ts writes
it). At vscode 250 files the witnesses were forecast 13.63M against 13.56M stored, and the pattern indexes matched the
engine's on 555 of its 622, 95% of their bytes (f_the_memory_of_a_world_is_forecast_from_its_rules). The agent's skill for an engine change priced this way first and measured after is
.claude/skills/forecast-engine-change/SKILL.md.
**`hot:` on stderr** is the engine naming a rule that reads far more rows than
it concludes, while it runs (`engine/cost.rs`): the rule, the premise it is
reading and the binding. It is a diagnostic for the rule's author, not an
error; docs/optimising-a-world.md is what to do about it. `evaluate` returns
the same as `hot`.

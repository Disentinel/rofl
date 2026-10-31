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
or the engine refuses the delta (a fact read on demand, a base fact a rule
reads as an `edb` or authority row, a world kept with no witnesses). The
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
| the scanner | `scanners/js_ast.ts` (Babel) | one file's text, named by its path from the directory | `ast_node[code](Id, Kind, File), ast_line[code](Id, Line)`, `ast_child[code](Parent, Field, Index, Child)`, `ast_attr[code](Id, Key, Value)`, `ast_file[code](Root, File)`, `ast_parse_error[code](File, Message)`; the contract is the header of `scanners/js_ast.ts` |
| the host facts | `playground/host.ts` `codeFacts` | the paths, and every string a file holds | `fs_dir`, `fs_file`, `fs_parent`, `fs_dir_of`, `fs_dir_in`, `fs_file_in` (the files and directories, `"."` the root) and `str_segs`, `str_seg`, `str_char0`, `str_scheme` (each string cut the way a module specifier is read), all `[code]` |
| the model | `rofl`, Rust | `@rules/js.files` and `code.rofl` | the model's relations: `calls`, `flows`, `effect_of`, ... (`docs/js/` renders each file of it in sentences) |

`npm run scan` prints the facts to stdout without `--out`, names every file no
parser read on stderr and then exits 2. The facts are the ones the notebook
host gives a `.rofl.md` with `model: js` (`npm run nb`), so a question has the
same answer in a notebook and here.

Measured on `examples/services/src` (3 files, 1051 facts), five questions, two
whys, a whynot and two asks: every answer the same text as the TypeScript
engine's. The TypeScript engine took 12.4 s for the world and the five; the
Rust release build 1.5 s for the world and the five in one `rofl load` run,
and as much for each `rofl why` run alone, since each builds the world.

### The roles layer (w_l2_roles), not yet read by the model

`models/lang/js/` is the next layer under the JS model: `roles.rofl` is one
vocabulary of roles (`ref`, `binds`, `callee`, `nth`, `executes_if`, ...) in
two worlds, `[value]` and `[type]`, over one tree, `[tree]`; `babel-roles.rofl`
writes them from the scanner's tree in `[ast_babel]` (`ScanSet().scan(src,
{file, persp: 'ast_babel'})`). It has no command for an agent yet and
`rules/js-*.rofl` do not read it; `npm run test:roles` drives it, and
`rofl load @models/lang/js/roles.files sealed.rofl FACTS` writes the roles of
a corpus scanned so. Pass `--budget` and `--space` at hundreds of files: the
default budget cuts the state without saying so.

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

## A corpus larger than one heap

**Every verb above holds one world on one heap.** `rofl scan` writes one file
of facts, and `rofl ask`, `rofl load` and `rofl serve FILE...` load it whole
and evaluate it whole; only the finished world is kept as a volume. At the
reference scale (CLAUDE.md, *The goal*) that is the 23 GB the owner measured.
A run over more files than fit one heap does not go this way without saying so.

**The design the owner agreed** (2026-10-25): a file is scanned into a volume of
its own, the volume is cooled to disk and stays there until a question needs
it, and beside it lives the file's `[surface]`, a thin volume of what escapes
the file (`rules/js-surface.rofl`). The design is in
docs/volumes-and-residency.md (why a corpus can stay cold),
docs/surface-split.md (what crosses files, the book, the driver) and
docs/staged-evaluation.md (stages, kept volumes, resume, the planner).
**It is not the engine's default yet.** The owner wants it to be what
`rofl scan` and the question verbs do by themselves, not a command of its own;
today none of them scans into a volume per file, cools it and keeps its surface. What exists are its parts and the
harnesses that drive them, each over `rofl serve`:

| what | how to run it | measured | status |
|---|---|---|---|
| a volume per file, cooled, the surface resident (the driver) | `runtime/split.ts`; `node --experimental-strip-types scripts/vscode_curve.ts DIR N split [--hot K]` over a corpus of `scripts/vscode_corpus.ts`; `npm run test:split` is its gate | 500 vscode files: the whole world's answers exactly, 2.0 GB against 2.5 GB, but 6 335 s against 40 s: each volume reads ~10% of the surface and is evaluated again whole 7.6 times (surface-split.md §7) | correct, not an economy; what it needs next is in §7 |
| the ingest loop: parse a batch, evaluate, cool volumes under pressure | `node --experimental-strip-types runtime/ingest.ts ROOT SUB N [--batch K] [--pressure F]` (boot and `rules/ingest.rofl`, no JS model) | eslint, 1 426 files: 29.9 s, 1 290 volumes cooled to 200 MB, the world never above 1.94 M facts (docs/scaling-a-corpus.md) | the AST only; the JS model is not evaluated |
| stages that fit a memory limit, each a process over the last volume | `node --experimental-strip-types scripts/stage_plan.ts FACTS LIMIT_MB [--files N] [--run] [--check]` | 100 vscode files in 4 stages equal the whole; a ring of files importing one another is one stage (vscode 223 files) | built (staged-evaluation.md, item 4) |
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

**`hot:` on stderr** is the engine naming a rule that reads far more rows than
it concludes, while it runs (`engine/cost.rs`): the rule, the premise it is
reading and the binding. It is a diagnostic for the rule's author, not an
error; docs/optimising-a-world.md is what to do about it. `evaluate` returns
the same as `hot`.

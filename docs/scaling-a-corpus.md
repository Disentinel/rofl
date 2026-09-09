# Scaling a corpus: what changed between 16 files and 1,426

## Status

Measured 2026-09-09 on the whole of eslint. Every number below is from a run's
own output, and the four lessons are each a defect that a run found and a
reading did not. This is about the shape of an ingest loop and the instruments
that watch it; the volumes mechanism it rests on is `docs/volumes-and-residency.md`,
and what to do when the world is too big for a reason is
`docs/normalisation-and-profiling.md`.

## The result

| | |
| --- | --- |
| Files indexed | 1,426 (the corpus holds 1,479 `.js` files, 531,766 lines) |
| Wall | 29,934 ms — 21.0 ms/file |
| Ticks | 179 |
| Volumes cooled | 1,290, to 200,124,993 bytes on disk |
| Largest the world ever got | 1,938,540 facts, against a ceiling of 2,000,000 |

The last row is the point. The world never grows with the corpus; it oscillates
under a ceiling and the corpus goes to disk behind it. A run over ten thousand
files differs from this one in how long it takes, not in how much it holds.

Where the time goes, which is not where it feels like it goes:

| Phase | ms | share |
| --- | --- | --- |
| load (handing facts to the engine) | 22,233 | 74% |
| eval | 4,282 | 14% |
| parse (Babel, all 1,426 files) | 1,731 | 6% |
| cool (writing 200 MB and dropping it) | 1,339 | 4% |

## The pattern

The driver is not a script that knows what to do next. The goal is a program —
"every file must be indexed" — and the frontier is a query against it:

```
must_index[code](F) :- source_file[code](F), not indexed[code](F).
```

The loop asks for the frontier, parses what it names, asserts, evaluates,
decides whether to cool, and asks again. It stops when the query answers empty.
Nothing in the driver tracks progress, so nothing in the driver can be wrong
about progress — the same reason a work queue should be read from
`work_state(Item, open)` rather than from its own prose (`docs/working-with-ledgers.md`,
practice 1). The frontier is that idea applied to the run itself.

Two consequences worth stating because both cost a debugging session:

- **An ordinary asserted fact is tick-scoped.** A `tick()` inside the loop drops
  `must_index`, the frontier comes back empty, and the loop reports a corpus
  fully indexed with files unread. What cooling needs is not a tick but a round
  boundary — to be outside a frozen `Assumption`. The loop's iteration is
  therefore not a kernel tick.
- **Anything that reports a file as finished must be reachable by every way a
  file can finish.** When the scanner changed to return `ast_parse_error` as a
  fact instead of throwing, the driver's `catch` stopped firing; the file
  counted as parsed, never got `ast_file`, and sat on the frontier forever while
  the run reported progress. One clause closes it:
  `indexed[code](F) :- ast_parse_error[code](F, _).`

## Lesson 1: a pressure threshold must be a disjunction

Cooling fired on one premise: `peak_rows` against the space wall. On a pure AST
index the join accumulator is nearly empty — every fact is base, almost nothing
is derived from it — so:

| | |
| --- | --- |
| peak rows, against a threshold of 25,000 | 7,437 |
| facts in the world at the same moment | 5,896,383 |

Cooling never fired once. Rows are not facts: `peak_rows` counts intermediate
rows a join holds, `factCount()` counts what the store holds, and a workload can
be enormous in one and idle in the other. A quantity that *correlates* with
pressure on the workload you had is not pressure.

The repair is to measure each reason separately and take any of them:

```
under_pressure[code](C) :- rows_pressure[code](C).
under_pressure[code](C) :- world_pressure[code](C).
under_pressure[code](C) :- memory_pressure[code](C).
under_pressure[code](C) :- volume_settled[code](C).
under_pressure[code](C) :- eviction_asked[code](C).
```

`world_pressure` was the missing one and the one that fired. Alongside it,
`cooled_because[code](Corpus, Tick, Reason)` — so a volume that went to disk can
say which reason sent it, and a reason that never fires is visible as a reason
that never fires.

The general form: **when a limit exists to protect a resource, the threshold
must be measured on that resource.** Any proxy is one workload away from being
blind, and it fails silently, because a threshold that never fires looks exactly
like a threshold that is never needed.

## Lesson 2: the product was inside the loop that was supposed to fix it

`cool` walked the whole world once per volume, so cooling 456 volumes was 456
walks. The repair was `cool_many`: one walk, N prefixes. The comment above it
said so. Cooling still cost **46,444 ms of a 76,824 ms run**.

The walk was single. Inside it, every fact was tested against every volume
prefix — the product had moved from the outer loop into the body, where the
comment claiming it was gone was standing right next to it. Keying the prefixes
by length and doing one hash lookup per fact:

| | before | after |
| --- | --- | --- |
| cool, total | 46,444 ms | 1,339 ms |
| wall | 76,824 ms | 29,934 ms |
| ms/file | 53.9 | 21.0 |

Two things generalise. First, **"one pass" is a claim about the outer loop and
says nothing about the body** — N walks over M facts and one walk doing N work
per fact are the same product written differently. Second, **a comment asserting
a fix is the weakest possible evidence that the fix happened**, and it is worse
than no comment, because it stops the next reader from looking. This is the same
shape as a pin whose explanation has rotted (`docs/test-maintenance-cost.md`).
The instrument that found it was four env-gated timers inside the phase, which
existed only because the number refused to match the story.

## Lesson 3: the format is not the loop

The obvious question about writing volumes as ROFL text was whether a binary
format would be faster. With the phases instrumented, across the three cooling
events of the final run:

| Phase | ms, all three events | what it is |
| --- | --- | --- |
| walk | 844 | scanning the store, including the two below |
| match | 263 | deciding which volume a fact belongs to |
| render | 274 | producing the ROFL text — 3,095,658 facts, 11.3M facts/s |
| write | 194 | 200,124,993 bytes, ~1.0 GB/s (page cache, not disk) |
| remove | 23 | dropping the cooled facts |

Rendering the text costs 274 ms of a 29,934 ms run. A binary format that made
rendering *free* would save 0.9% of cooling and **0.3% of the run**, and it
would cost the property that a cold volume is readable, diffable, and loadable
by anything that can read the language.

The reusable part is not "text is fine". It is that **the phase that sounds
expensive and the phase that is expensive are different phases**, and which is
which is one instrumented run away. The same run says the real target is `load`
at 74% — handing facts across the port, not producing them and not storing them.

## Lesson 4: a boundary with a silent discard will hang, not fail

The first full run stopped at 1,264 files of 1,426 and sat there at 0% CPU, the
engine blocked in `read` and the client blocked in `kevent`, each waiting for
the other.

The cause was two characters. A JavaScript string is UTF-16 and may contain an
unpaired surrogate; a Rust string is UTF-8 and cannot. `JSON.stringify` emits
`\ud83d` for one, `serde_json` refuses it, and the reply comes back with
`id: null` because the id was inside the text that would not parse. The two
files were `no-misleading-character-class` and `utils/char-source` — eslint's
own tests *for* surrogate handling, which is why they carry one.

None of that is why it hung. It hung because the client had four paths that
discarded work without saying anything: an unparseable line (`catch { return }`),
a reply whose id matched no outstanding request (`if (!w) return`), a failed
write whose error nobody read, and the engine's stderr buffered and only
examined if the process died. Each is one line, each is locally reasonable, and
together they turn a two-character bug into a process that is indistinguishable
from a slow one.

The invariant, and it is cheap to hold: **at a process boundary, every path that
discards work must be loud.** A dropped reply is not an edge case, it is a
deadlock with the evidence deleted. The scanner-side repair — replacing unpaired
surrogates with U+FFFD and counting them in `surrogate_replaced[code](File, N)`,
deliberately without a volume prefix so cooling cannot take the count away — is
the smaller half of the fix.

## How to falsify all of this

- Run the loop over a corpus with a genuinely derived workload — one where
  `peak_rows` is large — and check that `cooled_because` names `rows_pressure`
  and not only `world_pressure`. If only ever one reason fires, the disjunction
  is decoration.
- Cool a world whose volumes are few and enormous rather than many and small.
  The length-keyed lookup helps least there, and the walk becomes the cost.
- Push past 2M facts hot. The port is unjudged above roughly 3M and the loop has
  never been asked to hold a ceiling it cannot reach by cooling.
- Time `load` against a batched or shared-memory transfer. If 74% does not move,
  the cost is inside the engine's insert path and not on the wire.

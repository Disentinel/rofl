# flag — a proposition is a relation of arity zero

`deploy_blocked()` has no arguments. Its extension is empty or the one
0-tuple, so it is a truth value: a **proposition**, the base case of the
predicate logic ROFL already was, excluded until 2026-09-10 by one grammar
production written the obvious way.

```sh
npm run repl examples/flag/flag.rofl
? deploy_blocked()
? releasable(S)
why deploy_blocked()
whynot ship[prod](auth)
```

**What it buys.** The guard is ONE row, so the join against it is a constant
rather than a product against whatever the guard ranged over. Written without
it, `releasable` needed a variable carried only so the head had something to
name.

**What it fixes in the reading.** `not deploy_blocked()` says *nothing blocks
the deploy*. The old shape, `not blocked(S)`, reads as *this S is not blocked*
and means the global thing only because a dummy variable made the relation
uniform — something the author had to prove and the reader had to trust.

**And a proposition is still about something.** `frozen[prod]()` and
`frozen[stage]()` are two different truths, because a perspective is a book
and the proposition is about the book it is in. That is why a nullary fact
does not break the discipline in `docs/choosing-perspectives.md`: the ledger
supplies the subject the arguments do not.

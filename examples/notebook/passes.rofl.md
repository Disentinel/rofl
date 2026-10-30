---
model: js
code:
  - passes/handlers.js
---

# A function handed to a call, however it is written

> `passes_function` is a function passed and not called: by its name
> (`etask(named)`), written in place (`etask(function* () {})`, `etask(() => 2)`,
> named `anonymous` when it has no name of its own), or as a member
> (`etask(bus.onMsg)`, named by its key). Run it with
> `npm run nb -- examples/notebook/passes.rofl.md`.

```datalog
handed(I, F, N) :- passes_function[code](C, I, F, N), call_line[code](C, L), L < 11.
? handed(I, F, N)
```

> `table[k]()` with a key nothing traces resolves to nothing and stays in
> `unresolved_call`; the functions its receiver holds are what it may reach.

```datalog
? may_call[code](A, F)
```

> `db.on(name, handler)` is handed two functions at one parameter, and what it
> does with `handler` is answered for both together: `merged_param` names the
> place, so an answer through it is not read as exact.

```datalog
? merged_param[audit](F, I, N)
```

> The write `handlers[name] = handler` is summarised in terms of `on`'s own
> parameters and stitched at each call, so `users` holds `onUser` alone and
> `fireUsers` calls it and nothing else.

```datalog
fires(B) :- calls_named[code]("fireUsers", B).
? fires(B)
```

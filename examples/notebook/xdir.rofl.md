---
world: xdir-notebook
books: main
default: main
model: js
code:
  - xdir/server.ts
  - xdir/handlers/index.ts
  - xdir/handlers/store-handlers.ts
  - xdir/handlers/list-handlers.ts
  - xdir/lib/store.ts
---

# Calls across directories

> A server's dispatcher in `xdir/server.ts` reaches its handlers through a
> barrel, `handlers/index.ts`, written the way TypeScript is written for node:
> `./handlers/index.js` names `index.ts`, `./handlers` names the directory's
> index, and the barrel re-exports by name and with `export *`. Run it with
> `npm run nb -- examples/notebook/xdir.rofl.md`.

> Every handler is reached from the dispatcher. Before the call graph read the
> modules layer's resolution, an import resolved only between files at the
> root, and this never failed on all three handlers.

```datalog
handler(F, N) :- exports_name[code](F, N, File), ast_node[code](F, _, File, _), D is str_pre(File, "/handlers/"), D = "xdir".
dispatched(F) :- calls[code](D, F), ast_child[code](D, id, 0, I), ast_name[code](I, "dispatch").
undispatched(N) :- handler(F, N), not dispatched(F).

? handler(F, N)
never undispatched(N)
```

> What the handlers reach in turn, across one more directory.

```datalog
? calls[code](C, F)
```

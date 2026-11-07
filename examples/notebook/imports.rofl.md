---
world: imports-notebook
books: main
default: main
model: js
code:
  - imports/use.ts
  - imports/lib.ts
  - imports/more.ts
  - imports/open.ts
---

# A call on what another module exports

> An imported class, a TypeScript namespace and a module's namespace object
> (`import * as m`) are seen whole: a class object by its static half (`Store.get()`
> calls a method of the instances and throws), a namespace by what its body
> exports, `m` by exactly the names the module exports, `export *` included,
> and with no prototype (`m.toString()` throws). A module that re-exports what
> the model cannot see (`export * from 'node:path'`) leaves its namespace open:
> "unknown", never "missing". `npm run test:nb` compiles the files to ES modules,
> runs them in Node and checks that a TypeError is thrown at every call said
> missing and at no call said found.
> Run it with `npm run nb -- examples/notebook/imports.rofl.md`.

```datalog
probed(T, C) :- call_site[code](P, _), callee_of[code](P, U), ast_name[code](U, "probe"),
                  arg_at[flow](P, 0, A), ast_value[code](A, T),
                  arg_at[flow](P, 1, F), ast_child[code](F, body, 0, C).
missing(T) :- probed(T, C), missing_member_call[audit](C, _, _).
unknown(T) :- probed(T, C), member_unknown[audit](C).
found(T)   :- probed(T, _), not missing(T), not unknown(T).

? missing(T)
? unknown(T)
? found(T)

never missing("O.join")
never missing("O.joinn")
never missing("helper.call")
```

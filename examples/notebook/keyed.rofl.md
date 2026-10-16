---
world: keyed-notebook
books: main
default: main
model: js
code:
  - keyed/registry.js
  - keyed/app.js
---

# A Map keeps a value under a key

> `m.set(k, v)` puts `v` under `k` on the Map `m` may be, and `m.get(k)` is
> what was put there. The model knows `m` is a Map from where it was made,
> `new Map()`, and never from the method's name: `plain.set(...)` on an
> object of the program is an ordinary method and keeps nothing. A key written
> in place is matched; a key that is a name (`ports.get(which)`) meets every
> key. Walking a Map, with `for ... of` or `forEach`, sees every key and value.
> The class is made in one file and constructed in the other, and its fields
> are read back. Run it with `npm run nb -- examples/notebook/keyed.rofl.md`.

```datalog
seen(Tag, V) :- call_site[code](C, _), callee_of[code](C, U), ast_name[code](U, "use"),
                arg_at[flow](C, 0, T), ast_value[code](T, Tag),
                arg_at[flow](C, 1, A), may_be_lit[flow](A, V).

? seen(Tag, V)

never seen("reg.api", 3000)
never seen("plain.api", 9999)
```

> The receiver's type decides which library method a call is: `set`, `get`
> and `forEach` of a Map, `add` of a Set; `plain.set` is the program's own.

```datalog
? stdlib_member[audit](C, P, Key)
plain_as_library(C) :- stdlib_member[audit](C, _, _), callee_of[code](C, N), ast_child[code](N, object, 0, O),
                       ast_name[code](O, "plain").
never plain_as_library(C)
```

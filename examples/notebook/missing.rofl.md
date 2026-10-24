---
world: missing-notebook
books: main
default: main
model: js
code:
  - missing/calls.js
---

# A call of a member the receiver has not got

> `plain.sett(k)` on `const plain = { set() {} }` throws a TypeError. The model
> says so where it sees the receiver whole: a name bound once to an object
> literal, an array, a class instance or a Map, and nothing writes onto it out
> of sight. Out of sight is a computed key it cannot read (`bag["g" + "o"]`),
> a call it does not follow (`Object.defineProperty(reg, ...)`, `[listed]`),
> a class whose prototype is read (`Old.prototype.legacy = ...`), a parameter,
> a value from a package. There the answer is "unknown", never "missing".
> Each call runs inside `probe`; `npm run test:nb` runs the file under V8 and
> checks that it throws at every missing call and at no call the model finds.
> Run it with `npm run nb -- examples/notebook/missing.rofl.md`.

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

never missing("path.nosuch")
never missing("param.ping")
never missing("bag.go")
never missing("old.legacy")
```

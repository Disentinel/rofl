---
world: external-notebook
books: main
default: main
model: js
code:
  - external/util/http.js
  - external/svc/bat/bat_wbm.js
---

# Values from outside the corpus

> Two files: `util/http.js` builds an Express app and shares it through
> `module.exports`; `svc/bat/bat_wbm.js` reads it back with `require`, sets
> and gets a key on it, and hands callbacks to `router.get` and `fs.readFile`.
> Express and `node:fs` are not in the corpus, so nothing in the files says
> what `express()` returns. The model still gives it an identity: a value
> that came out of a module the corpus does not contain.
> Run it with `npm run nb -- examples/notebook/external.rofl.md`.

> `app.set('port', port)` in one file and `http.get('port')` in another are
> the same object, the same key. This is the pairing the identity makes
> askable: the value read back is the one written, 8080, and not the one
> written to the OTHER app (`other.set('port', 9090)` is a second call of
> `express()`, a second object).

```datalog
keyed(C, Obj, Key) :- callee_of[code](C, M), selects[flow](M, Key),
                      ast_child[code](M, object, 0, O), may_be_node[flow](O, Obj).
kv_set(Obj, K, V) :- keyed(C, Obj, "set"), arg_at[flow](C, 0, A), may_be_lit[flow](A, K),
                     arg_at[flow](C, 1, V).
kv_get(Obj, K, C) :- keyed(C, Obj, "get"), external_value[flow](Obj, _),
                     arg_at[flow](C, 0, A), may_be_lit[flow](A, K).
read_back(C, Val) :- kv_get(Obj, K, C), kv_set(Obj, K, V), may_be_lit[flow](V, Val).

? read_back(C, Val)
never read_back(C, 9090)
```

> Where a value comes from. The module is one object per specifier, a call
> of it is a site, a member read of it is a site, and a callback's parameters
> carry the origin of the call they were handed to.

```datalog
? external_module[code](Spec)
? external_value[flow](N, "express")
? external_value[flow](N, "node:fs")
```

> An external value is not a corpus value: no call resolves to it, and a
> local object does not become one.

```datalog
resolved_external(F) :- resolves[code](_, F), external_value[flow](F, _).
local_made_external(N) :- external_value[flow](N, _), ast_node[code](N, object_expression, _, _).

never resolved_external(F)
never local_made_external(N)

? resolves[code](C, F)
```

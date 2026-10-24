---
world: order-notebook
books: main
default: main
model: js
code:
  - keyed/order.js
---

# What a Map holds when it is read

> `m.get(k)` is what was put under `k` before the read, not anywhere in the
> program. The order is known where a `const` binds a new Map and the read and
> the writes are statements of the same list as that declaration: a put in a
> later statement is not there yet, and a put of the same key, a delete of it
> or a clear in a statement of its own between them takes it out. A delete
> under an `if` may not have run, so the value stays. A put in a function
> (`later()`), or a Map declared outside the loop that reads and writes it
> (`tally`), leaves the order unknown, and the model keeps the put and says
> so. `use(tag, v)` marks each read; `npm run test:nb` runs the file under V8
> and checks the model against what it observes. Run it with
> `npm run nb -- examples/notebook/order.rofl.md`.

```datalog
seen(Tag, V) :- call_site[code](C, _), callee_of[code](C, U), ast_name[code](U, "use"),
                arg_at[flow](C, 0, T), ast_value[code](T, Tag),
                arg_at[flow](C, 1, A), may_be_lit[flow](A, V).

? seen(Tag, V)

never seen("order.before", 1)
never seen("order.one", 2)
never seen("order.gone", 2)
never seen("order.cleared", 3)
never seen("tally.first", 7)
```

> Where the order is not known, each read and each put it may see.

```datalog
unordered(Tag, V) :- call_site[code](C, _), callee_of[code](C, U), ast_name[code](U, "use"),
                     arg_at[flow](C, 0, T), ast_value[code](T, Tag),
                     arg_at[flow](C, 1, G), keyed_order_unknown[audit](G, P), may_be_lit[flow](P, V).

? unordered(Tag, V)
```

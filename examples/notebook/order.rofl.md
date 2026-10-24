---
world: order-notebook
books: main
default: main
model: js
code:
  - keyed/order.js
  - keyed/order_ts.ts
---

# What a Map holds when it is read

> `m.get(k)` is what was put under `k` before the read, not anywhere in the
> program. The order is known in the statement list that makes the Map: the
> list of the `const` that binds it, or the constructor of a class whose field
> holds it (`this.byName = new Map()`, `items = new Map()`). There a put in a
> later statement is not there yet, nor a put in a function that only later
> statements call (`fill()` calls `load()`; `this.#fill()`, and a TypeScript
> `private` method in keyed/order_ts.ts). In any list that
> reads it, a method's body too, a put of the same key, a delete of it or a
> clear, in a statement of its own between them, takes an earlier put out; the
> same key is one literal, one `const` or one parameter nothing assigns. On a
> field, outside the constructor, a call between them may run the method again
> and put the value back (`noisy`), so nothing is taken out. A delete under an
> `if` may not have run, so the value stays. A put in a callback (`add`,
> `forEach`, `then`), in a public method, or a Map declared outside the loop
> that reads and writes it (`tally`), leaves the order unknown, and the model
> keeps the put and says so. A for-of and a `forEach` see what a get would.
> `use(tag, v)` marks each read; `npm run test:nb` runs the file under V8 and
> checks the model against what it observes. Run it with
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
never seen("batch.before", 5)
never seen("calls.before", 9)
never seen("keys.const", 1)
never seen("keys.param", 2)
never seen("walk.of", 2)
never seen("walk.of", 3)
never seen("walk.each", 2)
never seen("field.early", 12)
never seen("field.dropped", 13)
never seen("field.named", 14)
never seen("prop.ctor", 17)
never seen("ts.early", 18)
```

> Where the order is not known, each read and each put it may see: a put in a
> callback written before the read may have run (`forEach`) or not (`then`).

```datalog
unordered(Tag, V) :- call_site[code](C, _), callee_of[code](C, U), ast_name[code](U, "use"),
                     arg_at[flow](C, 0, T), ast_value[code](T, Tag),
                     arg_at[flow](C, 1, G), keyed_read_unordered[flow](G, P), may_be_lit[flow](P, V).

? unordered(Tag, V)
```

> A proof says which. `why` names the read's step: a value put before it, or
> one put in an order not known. What the read does not see is a fact of its
> own, with its proof: the put that comes after it, and the put a later call
> took out.

```datalog
why seen("order.two", 2)
why seen("batch.then", 6)

? keyed_put_after[code](V, C)
? keyed_taken_out[code](V, C, R)
```

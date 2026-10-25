---
world: order-notebook
books: main
default: main
model: js
code:
  - keyed/order.js
  - keyed/order_ts.ts
  - keyed/order_lib.mjs
  - keyed/order_use.mjs
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
> same key is one literal for certain (one value, built of literals alone: `id`
> is `'r'`, `pick()` is `'s'`, and `name` in `keys` is `'n'`, its one call
> says so), one `const` or
> one parameter nothing assigns. On a field,
> outside the constructor, a call between them that may run the method again
> puts the value back (`noisy`): `this.noisy(true)` calls it, and `Open` hands
> its instance to code the model does not resolve, so `hooks.forEach` may. A
> call that reaches neither, `use('field.note', 0)`, takes nothing back. An
> `await` puts back only through another run of the method: `Later.run` has one
> call and runs once, `twice` has two nobody waits for, and the second puts 23
> back before the first reads it; `drain` waits for each `step`, so they do not
> overlap. A delete under an
> `if` may not have run, so the value stays. A put in a callback (`add`,
> `forEach`, `then`), in a public method, or a Map declared outside the loop
> that reads and writes it (`tally`), leaves the order unknown, and the model
> keeps the put and says so; so does a field some file writes again
> (`other.loose = 1` in keyed/order_ts.ts), unless TypeScript keeps it to its
> class (`private`, `readonly`). tsc lets `store['fill']` past `private`:
> the model keeps to `private` and names each such reach. A for-of and a `forEach` see what a get would.
> A get may find no entry and read `undefined`, unless a put of the same key ran
> in a statement of its own before it and nothing between may have taken it out
> (`order.one`). `undefined` is a value of the flow: a parameter a call leaves
> out, a function that ends without a value, a `let` with no initialiser, `void`.
> `use(tag, v)` marks each read; `npm run test:nb` runs the file under V8 and
> checks the model against what it observes. Run it with
> `npm run nb -- examples/notebook/order.rofl.md`.

```datalog
seen(Tag, V) :- call_site[code](C, _), callee_of[code](C, U), ast_name[code](U, "use"),
                arg_at[flow](C, 0, T), ast_value[code](T, Tag),
                arg_at[flow](C, 1, A), read_holds_lit[flow](A, V).

? seen(Tag, V)

never seen("order.before", 1)
never seen("order.one", 2)
never seen("order.one", undefined)
never seen("order.two", undefined)
never seen("lib.slot", 25)
never seen("order.gone", 2)
never seen("order.cleared", 3)
never seen("tally.first", 7)
never seen("batch.before", 5)
never seen("calls.before", 9)
never seen("keys.const", 1)
never seen("keys.param", 2)
never seen("keys.let", 3)
never seen("keys.called", 4)
never seen("walk.of", 2)
never seen("walk.of", 3)
never seen("walk.each", 2)
never seen("field.early", 12)
never seen("field.dropped", 13)
never seen("field.named", 14)
never seen("field.quiet", 20)
never seen("await.once", 22)
never seen("await.seq", 24)
never seen("prop.ctor", 17)
never seen("ts.early", 18)
```

> Where the order is not known, each read and each put it may see: a put in a
> callback written before the read may have run (`forEach`) or not (`then`).

```datalog
unordered(Tag, V) :- call_site[code](C, _), callee_of[code](C, U), ast_name[code](U, "use"),
                     arg_at[flow](C, 0, T), ast_value[code](T, Tag),
                     arg_at[flow](C, 1, G), keyed_read_unordered[flow](G, P), may_be_lit[flow](P, V).

unordered(Tag, undefined) :- call_site[code](C, _), callee_of[code](C, U), ast_name[code](U, "use"),
                             arg_at[flow](C, 0, T), ast_value[code](T, Tag),
                             arg_at[flow](C, 1, G), keyed_read[flow](G, _), not keyed_present[code](G).

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
? keyed_private_reached[audit](N, G)
? keyed_taken_out[code](V, C, R)
```

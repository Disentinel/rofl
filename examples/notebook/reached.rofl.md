---
world: reached-notebook
books: main
default: main
model: js
code:
  - reached/reached.js
---

# Thirty ways a function is called, and whether the model sees the call

> Each `t_` function of reached/reached.js is called one way: through a map of
> handlers, an array of them, an emitter that stores it, a field, a returned
> object, `Reflect.apply`, a class held in a variable, a getter, a Map,
> `bind` with arguments, a rest parameter, a default, `super`, `await`, and
> more. `called` says the model sees it run synchronously, `called_later`
> that a host runs it later (`then`, `setTimeout`); `npm run test:nb` runs
> the file in V8 and checks that what ran is exactly what the model says.
> Run it with `npm run nb -- examples/notebook/reached.rofl.md`.

```datalog
probe(F, Name) :- fn_name[code](F, Name), hoisted[value](F, _), Name != "hit".
called(Name) :- probe(F, Name), runs_now[code](_, F).
called_later(Name) :- probe(F, Name), calls_back[code](_, F, later), not called(Name).
unreached(Name) :- probe(_, Name), not called(Name), not called_later(Name).

? called(Name)
? called_later(Name)

never unreached(Name)
```

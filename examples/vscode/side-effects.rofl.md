---
world: vscode-side-effects
books: main
default: main
model: js
reads:
  - side-effects.rofl
code:
  - mini/common/channels.ts
  - mini/node/pfs.ts
  - mini/node/server.ts
  - mini/node/main.ts
---

# Which value reaches a side effect

> The next version's question (w_next_version_cutoff), asked of four files made to look like vscode: a wrapper
> module (`pfs.ts` hands its parameter to `fs`), constants written in one file and used in another
> (`common/channels.ts`), literals, and a port read from the environment. `side-effects.rofl` holds the rules; the
> same rules run over vscode's subset S in the work item. Run it with
> `npm run nb -- examples/vscode/side-effects.rofl.md`.

> Every site of the five families, and what may reach the argument asked about: the first, or for a call of a
> wrapper the one its body hands on. `remove(this.storage.dir)` is a site with no value: the storage is injected
> and nothing in the code builds it.

```datalog
? side_effect_value(S, F, V)
? side_effect_count(F, N, M)
? side_effect_env(V, K)
```

> The port reaches `server.listen` from two places: the constant of `channels.ts` through `listenOn`, and the
> environment. Neither is a literal at the call.

```datalog
port_from_env(S) :- side_effect_value(S, listen, V), side_effect_env(V, _).
other_channel(S, V) :- side_effect_value(S, ipc, V), V != "vscode:hello".

? port_from_env(S)
never other_channel(S, V)
why side_effect_value(n6ce3b3e159e9764b_114, ipc, "vscode:hello")
```

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
  - mini/node/paths.ts
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

> Why a value reaches a site: first the steps the value took, one line each, where the value changes file said so;
> then the proof, with the conditions that hold because nothing says otherwise counted, not written
> (`npm run nb -- examples/vscode/side-effects.rofl.md --all` writes every proof whole). The path a wrapper hands on
> crosses from the caller's file into `pfs.ts`; the port crosses twice, as an export and as an argument.

```datalog
why side_effect_value(nd100d8f9c1968a85_25, fs_mutation, "/tmp/settings.json")
why side_effect_value(n34efd0fd49e79fa1_34, listen, 8080)
```

> A path built from parts (`paths.ts`, rules/js-concat.rofl): a `path.join`, a template, a `dirname` and a `+=` in a
> loop. Where every part is literal the value is its TEXT, a term the host renders (`join(join("/opt/app", "out"),
> "settings.json")` is `/opt/app/out/settings.json`); where a part is unknown it is a FORM, the part kept as
> `ref(P)`; the loop unfolds three levels and the rest is the `+=` itself, `node(X)`. `part_value` lists what each
> part of a composed value may be.

```datalog
? side_effect_form(S, F, T)
? part_value[flow](ndbdc6130c943fdee_70, I, V)
```

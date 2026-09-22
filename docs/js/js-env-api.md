---
world: js-env-api
books: audit, code, main
default: audit
---

# js-env-api

> js-env-api.rofl — ATTRIBUTING THE RESIDUE THE CALL GRAPH CANNOT RESOLVE.
> `stdlib_member[audit](C, P, Key)` names a member call whose receiver has a
> known PROTOTYPE and whose method is not a node in this program; this says
> WHICH method and SINCE WHEN, from facts/js-lib-surface.rofl, which
> scanners/ts_lib.ts generates from TypeScript's lib.es*.d.ts.
> 
> Two worlds: `stdlib_member` is derived in the call-graph world and
> `environment` declared in facts/js-env.rofl, which that world does not
> load. Each world derives what it can; a pack loaded without the era facts
> reports `environment` through `undefined_premise[audit]`, the kernel saying
> "you brought half a question".

> one join: the residue is keyed by (prototype, key) and so is the library

<a id="lib_call"></a>`lib_call`(C, P, Key, Rel) if [`stdlib_member`](js-callgraph.md#stdlib_member)(C, P, Key) and `lib_member`(P, Key, Rel).

> a member call on a KNOWN prototype whose name TypeScript does not carry: a
> newer edition, a wrong prototype, or a typo; the only thing that would
> notice `prototype_of` going wrong

<a id="stdlib_unattributed"></a>`stdlib_unattributed`(C, P, Key) if [`stdlib_member`](js-callgraph.md#stdlib_member)(C, P, Key), unless `lib_member`(P, Key, something).

> THE ERA QUESTION, the same one `unsupported[audit]` asks of syntax, by
> composition: `Rel` is a RELEASE (lib.es2022.array.d.ts names es2022), so
> the question is whether the environment REACHES it, in the same words
> `has_feature` uses.

<a id="lib_unsupported"></a>`lib_unsupported`(E, C, P, Key) if all of:
  - [`lib_call`](#lib_call)(C, P, Key, Rel);
  - `environment`(E);
  - unless [`reaches`](js-env.md#reaches)(E, Rel).

> `@deprecated` in the JSDoc, read by the scanner. `lib_replaced_by` is
> nearly empty and that is the answer: of forty-one deprecations two name a
> replacement (`trimStart`, `trimEnd`); there is none for `blink()`. A
> replacement table earns its keep on a runtime's API:
> `host_member_replaced_by` in rules/js-host.rofl.

<a id="lib_call_deprecated"></a>`lib_call_deprecated`(C, P, Key) if [`lib_call`](#lib_call)(C, P, Key, something) and `lib_deprecated`(P, Key).

<a id="lib_call_remedy"></a>`lib_call_remedy`(C, P, Key, R) if [`lib_call_deprecated`](#lib_call_deprecated)(C, P, Key) and `lib_replaced_by`(P, Key, R).

## Read from other files

- [reaches](js-env.md#reaches)
- [stdlib_member](js-callgraph.md#stdlib_member)

## Not defined in these files

- `environment`
- `lib_deprecated`
- `lib_member`
- `lib_replaced_by`


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

In the code:

<a id="lib_call"></a>C calls the stdlib Key of a prototype P since a release Rel if C [calls the stdlib member](js-callgraph.md#stdlib_member) Key of P and P has the member Key since Rel.

> a member call on a KNOWN prototype whose name TypeScript does not carry: a
> newer edition, a wrong prototype, or a typo; the only thing that would
> notice `prototype_of` going wrong

In the audit:

<a id="stdlib_unattributed"></a>C calls an unattributed stdlib member Key of a prototype P if C [calls the stdlib member](js-callgraph.md#stdlib_member) Key of P, unless P has the member Key since some release.

> THE ERA QUESTION, the same one `unsupported[audit]` asks of syntax, by
> composition: `Rel` is a RELEASE (lib.es2022.array.d.ts names es2022), so
> the question is whether the environment REACHES it, in the same words
> `has_feature` uses.

<a id="lib_unsupported"></a>C is unsupported in an environment E at Key of a prototype P if all of:
  - C [calls the stdlib](#lib_call) Key of P since a release Rel;
  - E is an environment;
  - unless E [reaches the release](js-env.md#reaches) Rel.

> `@deprecated` in the JSDoc, read by the scanner. `lib_replaced_by` is
> nearly empty and that is the answer: of forty-one deprecations two name a
> replacement (`trimStart`, `trimEnd`); there is none for `blink()`. A
> replacement table earns its keep on a runtime's API:
> `host_member_replaced_by` in rules/js-host.rofl.

<a id="lib_call_deprecated"></a>C calls a deprecated stdlib member Key of a prototype P if C [calls the stdlib](#lib_call) Key of P since some release and P has the deprecated member Key.

<a id="lib_call_remedy"></a>C has the remedy R for a prototype P at Key if C [calls a deprecated stdlib member](#lib_call_deprecated) Key of P and `lib_replaced_by`(P, Key, R).

## Read from other files

- [reaches](js-env.md#reaches), in the audit
- [stdlib_member](js-callgraph.md#stdlib_member), in the audit

## Not defined in these files

- `environment`, in the main
- `lib_deprecated`, in the main
- `lib_member`, in the main
- `lib_replaced_by`, in the main


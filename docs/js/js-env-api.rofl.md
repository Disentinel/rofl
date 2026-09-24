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

Reads:

- from js-callgraph: [stdlib_member](js-callgraph.rofl.md#stdlib_member)
- from js-env: [reaches](js-env.rofl.md#reaches)
- from outside these files, in the main:
  - <a id="environment"></a>An environment E is an environment (`environment`)
  - <a id="lib_deprecated"></a>A prototype P has the deprecated member Key (`lib_deprecated`)
  - <a id="lib_member"></a>A prototype P has the member Key since a release Rel (`lib_member`)
  - <a id="lib_replaced_by"></a>`lib_replaced_by`

In the code:

<a id="lib_call"></a>C calls the stdlib Key of a prototype P since a release Rel if C [calls the stdlib member](js-callgraph.rofl.md#stdlib_member) Key of P and P [has the member](#lib_member) Key since Rel.

> a member call on a KNOWN prototype whose name TypeScript does not carry: a
> newer edition, a wrong prototype, or a typo; the only thing that would
> notice `prototype_of` going wrong

In the audit:

<a id="stdlib_unattributed"></a>C calls an unattributed stdlib member Key of a prototype P if C [calls the stdlib member](js-callgraph.rofl.md#stdlib_member) Key of P, unless P [has the member](#lib_member) Key since some release.

> THE ERA QUESTION, the same one `unsupported[audit]` asks of syntax, by
> composition: `Rel` is a RELEASE (lib.es2022.array.d.ts names es2022), so
> the question is whether the environment REACHES it, in the same words
> `has_feature` uses.

<a id="lib_unsupported"></a>C is unsupported in an environment E at Key of a prototype P if all of:
  - C [calls the stdlib](#lib_call) Key of P since a release Rel;
  - E [is an environment](#environment);
  - unless E [reaches the release](js-env.rofl.md#reaches) Rel.

> `@deprecated` in the JSDoc, read by the scanner. `lib_replaced_by` is
> nearly empty and that is the answer: of forty-one deprecations two name a
> replacement (`trimStart`, `trimEnd`); there is none for `blink()`. A
> replacement table earns its keep on a runtime's API:
> `host_member_replaced_by` in rules/js-host.rofl.

<a id="lib_call_deprecated"></a>C calls a deprecated stdlib member Key of a prototype P if C [calls the stdlib](#lib_call) Key of P since some release and P [has the deprecated member](#lib_deprecated) Key.

<a id="lib_call_remedy"></a>C has the remedy R for a prototype P at Key if C [calls a deprecated stdlib member](#lib_call_deprecated) Key of P and [`lib_replaced_by`](#lib_replaced_by)(P, Key, R).


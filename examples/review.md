---
world: review
books: main
default: main
---

# review

> Who has to approve a change before it merges: every team that owns a
> module the change touches, unless someone on that team wrote it or has
> approved it. A world written as Markdown: `npm run repl -- examples/review.md`
> loads it and answers `? C is blocked by T`, `why`, `whynot` in these
> sentences.

## What the repository knows

Declared as facts:

- <a id="owns"></a>A team T owns a module M
- <a id="member"></a>A person P is on a team T
- <a id="touches"></a>A change C touches a module M
- <a id="author"></a>A change C is written by a person P
- <a id="approved"></a>A change C is approved by a person P

The repository today:

- `platform` owns `auth`.
- `platform` owns `storage`.
- `payments` owns `billing`.
- `ana` is on `platform`.
- `ben` is on `payments`.
- `c1` touches `billing`.
- `c1` touches `auth`.
- `c1` is written by `ana`.
- `c1` is approved by `ben`.
- `c2` touches `storage`.
- `c2` is written by `ben`.

## The rules

<a id="needs"></a>A change C needs a team T if C touches a module M and T owns M.

<a id="covered"></a>A change C is covered for a team T either:

1. if C is approved by a person P and P is on T;
2. if C is written by a person P and P is on T.

<a id="blocked"></a>A change C is blocked by a team T if C needs T, unless C is covered for T.

<a id="mergeable"></a>A change C is mergeable if C is written by some person, unless C is blocked by some team.

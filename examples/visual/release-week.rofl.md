---
reads:
  - rofl:visual/graph.rofl.md
---

# A release week

> What each team did in the week of a release, laid out in time: a lane
> per team, a box per event at its day, a line where one event waited on
> another. The layout is `timeline`; a box says its day with `sits at` on
> `t` and its team on `lane`. A note points at the day that slipped.

## The week

Declared as facts:

- <a id="event"></a>An event E of a team T happened on day D
- <a id="waited"></a>An event A waited for an event B
- <a id="slip"></a>A slip S at an event E says T

The events:

- `freeze` of `dev` happened on day 1.
- `fix_login` of `dev` happened on day 2.
- `test_round` of `qa` happened on day 2.
- `retest` of `qa` happened on day 4.
- `staging` of `ops` happened on day 3.
- `release` of `ops` happened on day 5.
- `notes` of `docs` happened on day 4.
- `fix_login` waited for `freeze`.
- `test_round` waited for `freeze`.
- `retest` waited for `fix_login`.
- `staging` waited for `test_round`.
- `release` waited for `retest`.
- `release` waited for `staging`.
- `release` waited for `notes`.
- `late_retest` at `retest` says "the login fix came a day late, so the retest moved to Thursday".

## The picture

`picture` lays out its marks as "timeline" if E of T happened on day D.

A mark E is a node if E of T happened on day D.

A mark E sits at D on "t" if E of T happened on day D.

A mark E sits at T on "lane" if E of T happened on day D.

A mark B links to a mark A if A waited for B.

A note S is titled "Slipped" and says T if S at E says T.

The note S points at a mark E saying "a day late" if S at E says T.

```rofl
draw graph
```

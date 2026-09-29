---
reads:
  - ../../visual/time.rofl.md
---

# An outage, drawn as a timeline

> A postmortem's first picture: what happened, in order, on one axis of
> minutes. An alert that fires more than five minutes after the first
> symptom is the defect; the `never` below fails on it, and the picture
> draws it red. `draw timeline` puts the marks that happen at a point on
> one axis.

## The incident

Declared as facts:

- <a id="at"></a>An event E happened at a minute T
- <a id="symptom"></a>An event E is a symptom
- <a id="alert"></a>An event E is an alert

The log:

- `deploy` happened at 0.
- `errors_rise` happened at 3.
- `errors_rise` is a symptom.
- `latency_alert` happened at 6.
- `latency_alert` is an alert.
- `error_alert` happened at 11.
- `error_alert` is an alert.
- `acked` happened at 13.
- `rollback` happened at 17.
- `recovered` happened at 21.

<a id="late"></a>An alert A is late if A is an alert, A happened at T, S is a symptom, S happened at F, D is F + 5 and T > D.

## The picture

A mark E happens at T if E happened at T.

A mark A is tagged `late` if A is late.

```rofl
never A is late
draw timeline
```

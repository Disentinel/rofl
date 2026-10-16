---
reads:
  - rofl:visual/graph.rofl.md
---

# What to do first

> A backlog on two axes: how much a task is worth (up) and how much it
> costs (right). The layout is `quadrant`; a task says where it stands
> with `sits at` on `qx` and `qy`, each from 0 to 1. Cheap and worth a lot
> is the top left; a line where one task needs another first.

## The backlog

Declared as facts:

- <a id="task"></a>A task T costs C and is worth V
- <a id="needs"></a>A task A needs a task B first

The tasks:

- `search_fix` costs "0.2" and is worth "0.9".
- `dark_mode` costs "0.3" and is worth "0.3".
- `new_billing` costs "0.9" and is worth "0.8".
- `audit_log` costs "0.6" and is worth "0.7".
- `logo_refresh` costs "0.4" and is worth "0.1".
- `rewrite_ui` costs "0.95" and is worth "0.35".
- `cache_prices` costs "0.25" and is worth "0.6".
- `new_billing` needs `audit_log` first.
- `audit_log` needs `cache_prices` first.

## The picture

`picture` lays out its marks as "quadrant" if T costs C and is worth V.

A mark T is a node if T costs C and is worth V.

A mark T sits at C on "qx" if T costs C and is worth V.

A mark T sits at V on "qy" if T costs C and is worth V.

A mark B links to a mark A if A needs B first.

```rofl
draw graph
```

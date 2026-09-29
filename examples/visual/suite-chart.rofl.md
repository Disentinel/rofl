---
reads:
  - ../../visual/table.rofl.md
---

# Test suites, drawn as a bar chart

> How long each suite of a build took, against the budget it was given. A
> suite over its budget is the defect: the `never` below fails on it, and
> the chart draws its bar red. `draw chart` draws the mark `draws` names;
> the channels say which column is the bar and which its height.

## The build

Declared as facts:

- <a id="took"></a>A suite S took N seconds
- <a id="budget"></a>A suite S is allowed N seconds

The run:

- `unit` took 11 seconds.
- `unit` is allowed 30 seconds.
- `hosts` took 100 seconds.
- `hosts` is allowed 120 seconds.
- `vscode` took 142 seconds.
- `vscode` is allowed 120 seconds.
- `product` took 64 seconds.
- `product` is allowed 120 seconds.

<a id="over"></a>A suite S is over budget if S took N seconds, S is allowed B seconds and N > B.

## The picture

A row S in `seconds` has the value N if S took N seconds.

The chart draws `bar`.

The channel `x` shows the column `row` as `nominal`.

The channel `y` shows the column `seconds` as `quantitative`.

A mark S is tagged `over_budget` if S is over budget.

```rofl
never M is tagged `over_budget`
draw chart
```

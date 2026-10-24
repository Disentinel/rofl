# A screen that answers back

> Scenario 4 of docs/intents.md, to open in the web workbench. The world wants
> a screen: a heading, a card for each stage, a button and a field. The
> workbench draws each want as its component. Press **Approve deploy** or type
> in the field: what you did comes back to the world as a fact,
> `clicked[ui](W)` or `filled[ui](W, Text)`, and the notebook runs again.

```datalog
imports(main, ui).
adapter(ui, render, "workbench").
capability(ui_heading, ui, shows). arg(ui_heading, 1, text, text). component(ui_heading, heading).
capability(ui_card, ui, shows). arg(ui_card, 1, title, text). arg(ui_card, 2, body, text). component(ui_card, card).
capability(ui_button, ui, shows). arg(ui_button, 1, label, text). component(ui_button, button).
capability(ui_field, ui, shows). arg(ui_field, 1, label, text). component(ui_field, field).

stage("build", "done"). stage("deploy", "waits for approval").
want ui_heading("Release 1.5") :- stage(_, _).
want ui_card(S, St) :- stage(S, St), not approved(S).
want ui_card(S, "approved") :- approved(S).
want ui_button("Approve deploy") :- stage("deploy", _), not approved("deploy").
want ui_field("Why this release") :- stage(_, _).
approved("deploy") :- clicked[ui]($want(ui_button, "Approve deploy")).
reason(T) :- filled[ui]($want(ui_field, "Why this release"), T).
want ui_card("why", T) :- reason(T).
```

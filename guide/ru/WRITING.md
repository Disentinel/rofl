# Как писать предложения и правила

Проза блокнота читается как маленький язык. Эта страница — весь этот язык.

## Форма

- **Предложение объявляется один раз**, там, где стоит его якорь:
  `<a id="owns"></a>A team T owns a module M`. Типизированные пропуски
  (`a team T`, `a module M`) — его аргументы, по порядку. Идентификатор
  якоря — его имя. Дальше предложение пишут с заполненными пропусками:
  `T owns M`, `` `platform` owns `auth` ``. Слова-типы можно оставить или
  убрать: `C touches a module M` и `C touches M` — одно и то же предложение.
- **Факты — это список** заполненных предложений, каждое с точкой на конце,
  под абзацем, который оканчивается двоеточием (`The repository today:`).
  Предложение, у которого бывают только перечисленные факты, объявляется в
  списке под `Declared as facts:`.
- **Правило — это `HEAD if CONDITION, CONDITION, unless CONDITION.`**
  Несколько путей к одному выводу — нумерованный список под `either:`, каждый
  пункт начинается с `if` или `unless`. Другой вложенности нет.
- **Говорите предложение везде одинаково.** Отбрасывать можно только
  слова-типы с `a` и `an`: `guards the variable V` и `guards V` — два разных
  предложения.
- **Проза для людей идёт в цитате** (`>`). Обычный абзац, оканчивающийся
  точкой, читается как предложение языка. Заголовки свободны.
- **Правила по одному на строку не требуют пустой строки между собой.**
  Длинное предложение может переноситься.

## Обозначения

| Пишется | Значит |
|---|---|
| `T`, `Team` | переменная: пропуск, который надо заполнить |
| `` `platform` `` | имя: всегда в обратных кавычках |
| `"a string"`, `42` | строка, число |
| `some team`, `something` | пропуск, значение которого не важно |
| `it` | подлежащее предыдущего предложения |

**Имена идут в обратных кавычках.** Голое слово — не терм: `ben likes cat`
не читается. Переменная с именем `A` пишется с типом (`an arity A`), потому
что голое `A` в начале предложения — артикль.

## Мир целиком

Мир — это файл из фактов и правил, который ничего не спрашивает. Вот
`~/rofl-examples/review.rofl.md`; `notebook/review.rofl.md` читает его:

<!-- BEGIN file examples/review.rofl.md -->
```markdown
# review: a world, not a notebook

> This file holds facts and rules and asks nothing, so running it prints no
> answers. `notebook/review.rofl.md` reads it and asks the questions: open
> that one.
>
> Who has to approve a change before it merges: every team that owns a
> module the change touches, unless someone on that team wrote it or has
> approved it.

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
```
<!-- END file -->

## Новое предложение в ячейке

Правило, чью голову ещё не объявило ни одно предложение, объявляет её само,
с именем по собственным словам, так что ячейке якорь не нужен.
`~/rofl-examples/notebook/small.rofl.md` делает это дважды; `vocab` не
перечисляет `C recurses` — его определяет ячейка:

<!-- BEGIN file examples/notebook/small.rofl.md -->
````markdown
---
model: js
code:
  - small.js
---

# Promises nobody waits for

> A notebook over `small.js` with the JS model. Run it with
> `rofl-nb small.rofl.md`.

> An async function called as a statement of its own drops its promise:
> nothing awaits it, returns it or keeps it. This is a question, not an
> invariant: `load('b')` is one such call and the answer says where it is.
> A promise kept in a variable (`const p = load('c'); return p;`) is not
> dropped and is not listed; neither is one kept and then forgotten, which
> this rule does not see.

```rofl
A call C is unawaited if C resolves to a function F, the attribute `async` of F is `true`, a node S is of kind `expression_statement` and the `expression` of S is C.

? C is unawaited
```

> No function calls itself, directly.

```rofl
A call C recurses if C resolves to a function F and F is the nearest function of C.

never C recurses
```
````
<!-- END file -->

Ячейка, чьё правило заключает одно из собственных предложений модели,
должна сказать `extends <name>`, чтобы это было сделано намеренно.

## Предложения для того, что блокнот читает

Файл `.rofl`, который блокнот указывает в `reads:`, приносит отношения без
предложений. Список `Reads:` даёт каждому своё, якорь — его имя:

    Reads:

    - from spat:
      - <a id="uncovered"></a>A child Ch is alone on a day D at a minute S

## Что сообщает читатель

Ничто не отбрасывается молча. То, что читатель не смог прочесть, — ошибка,
которая говорит, что делать, и запуск заканчивается кодом выхода 2:

<!-- BEGIN file guide/examples/typo.rofl.md -->
````markdown
Declared as facts:

- <a id="likes"></a>A person P likes a pet X

Who likes what:

- `ana` likes `cat`.
- ben likes `snake`.

A person P is happy if P likes some pet and P is rich.

```rofl
? P is happy
```
````
<!-- END file -->

<!-- BEGIN run+exit guide/examples: rofl-nb typo.rofl.md -->
```
$ rofl-nb typo.rofl.md
typo.rofl.md:1: cell 0 · prose
  error: not read (list item): ben likes `snake`: ben is not a sentence word here: names go in backticks: `ben`
  error: not read: P is rich
  error: left out: A person P is happy: a condition was not read
typo.rofl.md:13: cell 1 · rofl
  typo.rofl.md:13: ? P is happy  ->  0 answers · nothing in the model can put a row here: check the name, the book and the number of arguments
typo.rofl.md: 1 question answered — not everything was read (exit 2; see rofl-nb --help)
$ echo $?
2
```
<!-- END run+exit -->

- **not read (list item)**: факт, который не совпадает ни с одним
  предложением. Ошибка говорит, почему; здесь у `ben` нет обратных кавычек.
- **not read** с предложением: ни одно объявленное предложение ему не
  соответствует. `P is rich` никогда не объявлялось.
- **left out**: правило с условием, которое не было прочитано, не
  загружается.
- **no sentence reads this question**: строка-вопрос словами, которых ничто
  не объявляет.
- **ambiguities**: предложение, которое совпадает с двумя объявленными.
  Перепишите одно из них.

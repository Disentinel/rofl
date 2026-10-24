# Понятия

## Ячейки

Блокнот — это Markdown. `rofl-nb` читает его ячейками:

- **проза**: всё вне ограждений (fences); из неё читаются предложения;
  цитата (`>`) — для людей.
- ограждение **`rofl`**: правила и строки-вопросы, предложениями.
- ограждение **`datalog`**: то же самое на Datalog.
- ограждение **`natural`**: просьба словами; `rofl-nb translate` просит
  модель написать по ней ячейку `rofl` ([Модели](MODELS.md)).

## Предложения

Предложение объявляется один раз, с якорем и типизированными пропусками:

    - <a id="owns"></a>A team T owns a module M

Потом оно используется с заполненными пропусками: `` `platform` owns `auth` ``.
Имя в обратных кавычках — вещь; заглавная буква — пропуск.

## Факты и правила

**Факт** — заполненное предложение в списке под строкой, оканчивающейся
двоеточием: `` - `c1` touches `billing`. `` **Правило** выводит новые факты:

    A change C needs a team T if C touches a module M and T owns M.

`unless` добавляет условие, которое не должно выполняться. `either:` и
нумерованный список строк с `if` дают несколько путей к одному выводу.

## Строки-вопросы

По одной на строку, в ячейке `rofl` или `datalog`:

| Строка | Значит |
|---|---|
| `? S` | все ответы на S |
| `never S` | выполняется, когда у S нет ответов; при провале перечисляются ответы |
| `why S` | доказательство одного ответа |
| `whynot S` | условие, на котором S останавливается |
| `excise F` | какие строки ответили бы иначе без факта F |
| `unsure S` | под `never`: чего он не смог увидеть |
| `draw K` | картинка того, к чему пришёл блокнот, вида K: граф, время, таблица, пространство или нотация, и их формы (guide/DRAWING.md в репозитории) |

`review.rofl.md` из `~/rofl-examples/notebook`, запущенный:

<!-- BEGIN run examples/notebook: rofl-nb review.rofl.md -->
```
$ rofl-nb review.rofl.md
review.rofl.md:18: cell 1 · rofl
  review.rofl.md:18: ? C is blocked by T  ->  1 answer
    - `c2` is blocked by `platform`
  review.rofl.md:19: why `c2` is blocked by `platform`
    the value's steps, from where it is written:
          `c2` is blocked by `platform`
    the proof:
    `c2` is blocked by `platform`, because
      `c2` needs `platform`, because
        `c2` touches `storage` (given)
        `platform` owns `storage` (given)
      + 1 side condition holds (nothing says otherwise)
    (the whole proof: --all)
review.rofl.md:26: cell 2 · rofl
  review.rofl.md:28: ? C is stuck  ->  1 answer
    - `c2` is stuck
  review.rofl.md:29: whynot `c2` is mergeable
    why not `c2` is mergeable:
      by the rule: C is mergeable if C is written by some person, not C is blocked by some team
        it stops at: not `c2` is blocked by some team, and `c2` is blocked by `platform` does
review.rofl.md:37: cell 3 · rofl
  review.rofl.md:37: never C is blocked by `payments`  ->  holds
review.rofl.md:43: cell 4 · datalog
  review.rofl.md:45: never waits_on(C, payments)  ->  holds
review.rofl.md: 2 questions answered, 2 invariants hold, none fails, 2 explained
```
<!-- END run -->

И `excise`, в `~/rofl-examples/start`, на тех же фактах:

<!-- BEGIN run examples/start: rofl-nb whatif.rofl.md -->
```
$ rofl-nb whatif.rofl.md
whatif.rofl.md:7: cell 1 · rofl
  whatif.rofl.md:7: ? C is blocked by T  ->  1 answer
    - `c2` is blocked by `platform`
  whatif.rofl.md:8: excise `c1` is approved by `ben`  ->  1 line moves
    ? C is blocked by T: 1 -> 2
      now also: `c1` is blocked by `payments`
whatif.rofl.md: 1 question answered, 1 what-if
```
<!-- END run -->

## Reads

`reads:` в шапке файла сначала загружает предложения другого файла, как
`whatif.rofl.md` читает `../review.rofl.md`. Файл вне папки блокнота получает
`note:` на stderr; мир примеров лежит на папку выше.

## Модель и код

**Модель** превращает код в факты. `model: js` читает файлы JavaScript и
TypeScript, перечисленные под `code:`. `rofl-nb vocab` перечисляет её
предложения (а с блокнотом — и его собственные). В коде функция — узел, а не
имя: `` `f` calls `f` `` не совпадает ни с чем, так что пишите
`never F calls F` или назовите её через `F answers to "f"`. Имя, за которым
не стоит ни одного факта, отмечается на своей строке, и `never` над ним
выполняется лишь насколько модель видит (код выхода 3).

## Не смог увидеть: код выхода 3

Когда модель упускает код (неперечисленный импорт, файл, который она не
может разобрать), `never` выполняется лишь насколько она видит. `shop.js`
импортирует отсутствующий `tax.js`:

<!-- BEGIN run+exit examples/start: rofl-nb shop.rofl.md -->
```
$ rofl-nb shop.rofl.md
shop.rofl.md: note: 1 relative import or require was not resolved, so a never holds only as far as the model sees:
  shop.js:1 "./tax.js"
shop.rofl.md:8: cell 1 · rofl
  shop.rofl.md:8: never F always throws  ->  holds as far as it sees · 1 relative import or require was not resolved: shop.js:1 "./tax.js"
shop.rofl.md: 1 invariant holds as far as the model sees, none fails — some invariant holds only as far as the model sees (exit 3; see rofl-nb --help)
$ echo $?
3
```
<!-- END run+exit -->

Перечислите недостающий файл под `code:` или примите пробел. Код выхода 0:
каждый `never` выполняется; 1: один не выполняется; 2: что-то не прочитано.

## Словарь

- **блокнот** (notebook): файл `.rofl.md` с ячейками.
- **мир** (world): файл из фактов и правил, который ничего не спрашивает.
- **ячейка** (cell): один огороженный блок или проза вокруг него.
- **предложение** (sentence): отношение, записанное словами и объявленное
  один раз, с якорем.
- **якорь** (anchor): `<a id="name"></a>`, имя предложения на Datalog.
- **факт** (fact): заполненное предложение, которое дано.
- **правило** (rule): предложение, которое следует из других (`if`,
  `unless`).
- **never**: инвариант; выполняется, когда ничто не отвечает.
- **модель** (model): то, что превращает код в факты (`js` или `none`).
- **вне поля зрения** (out of sight): то, чего модель не смогла увидеть;
  даёт код выхода 3.

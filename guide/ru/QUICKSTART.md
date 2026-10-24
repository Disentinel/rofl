# Быстрый старт

Блокнот ROFL — это Markdown-файл с расширением `.rofl.md`, который отвечает
на вопросы о том, что в нём написано. `rofl-nb` запускает такой файл.

Хотите только посмотреть на блокнот? https://disentinel.github.io/rofl/
открывает его в браузере, на движке TypeScript: перетащите на страницу
`.rofl.md` вместе с файлами, которые названы в его `reads:` и `code:` (или
всю папку целиком), или передайте ссылку: `?gh=owner/repo/path@ref` либо
`?url=` со страницей GitHub или прямой ссылкой на файл. Файлы рядом с ним
читаются оттуда же, где лежит он. Песочница — по адресу `/playground/`.

## 1. Скопируйте примеры

Работает из любой папки:

    cp -r "$(npm root -g)/@grafema/rofl/examples" ~/rofl-examples
    cd ~/rofl-examples/tutorial

## 2. Пройдите первый уровень учебника

<!-- BEGIN run+exit examples/tutorial: rofl-nb 1-what-ships.rofl.md -->
```
$ rofl-nb 1-what-ships.rofl.md
1-what-ships.rofl.md:74: cell 1 · rofl
  1-what-ships.rofl.md:74: ? X leaves the line  ->  3 answers
    - `bike` leaves the line
    - `car` leaves the line
    - `scooter` leaves the line
1-what-ships.rofl.md:111: cell 2 · rofl
  1-what-ships.rofl.md:111: draw graph  ->  10 marks, 11 links
    ```mermaid
    flowchart LR
      m0["bike"]
      m1["car"]
      m2["door"]
      m3["engine"]
      m4["frame"]
      m5["motor"]
      m6["scooter"]
      m7["seat"]
      m8["van"]
      m9["wheel"]
      m2 -->|missing| m8
      m3 --> m1
      m3 --> m8
      m4 --> m0
      m4 --> m6
      m5 --> m6
      m7 --> m1
      m9 --> m0
      m9 --> m1
      m9 --> m6
      m9 --> m8
      class m2 missing
      class m8 waiting
      style m2 fill:orange
      style m8 fill:grey
    ```
1-what-ships.rofl.md:150: cell 3 · rofl
  1-what-ships.rofl.md:150: never L is missing an answer  ->  FAILS · 1
    - `level1` is missing an answer
  1-what-ships.rofl.md:151: never X is on your list by mistake  ->  FAILS · 1
    - `sofa` is on your list by mistake
1-what-ships.rofl.md: 1 question answered, 2 invariants fail, 1 picture — FAILS at lines 150, 151 (exit 1; see rofl-nb --help)
$ echo $?
1
```
<!-- END run+exit -->

Строка, начинающаяся с `?`, — вопрос. Ответы на него перечислены под ней.
У строки, начинающейся с `never`, ответов быть не должно. Здесь у двух таких
строк есть по ответу, поэтому запуск заканчивается кодом 1. Откройте файл,
сделайте то, что сказано под *Your move*, и запускайте снова, пока последняя
строка не скажет **none fails**. Уровни со 2-го по 6-й добавляют по одному
слову каждый. В VS Code откройте файл и нажмите **Run All**; верхняя ячейка
показывает вердикт всего блокнота.

## 3. Напишите свой блокнот

Сохраните это как `pets.rofl.md` (копия лежит в `~/rofl-examples/start`):

<!-- BEGIN file examples/start/pets.rofl.md -->
````markdown
Declared as facts:

- <a id="likes"></a>A person P likes a pet X

Who likes what:

- `ana` likes `cat`.
- `ben` likes `snake`.

A person P is happy if P likes some pet.

```rofl
? P is happy
never P likes `snake`
```
````
<!-- END file -->

<!-- BEGIN run examples/start: rofl-nb pets.rofl.md -->
```
$ rofl-nb pets.rofl.md
pets.rofl.md:13: cell 1 · rofl
  pets.rofl.md:13: ? P is happy  ->  2 answers
    - `ana` is happy
    - `ben` is happy
  pets.rofl.md:14: never P likes `snake`  ->  FAILS · 1
    - `ben` likes `snake`
pets.rofl.md: 1 question answered, 1 invariant fails — FAILS at line 14 (exit 1; see rofl-nb --help)
```
<!-- END run -->

Строка с `<a id="likes"></a>` объявляет предложение. Список под строкой,
оканчивающейся двоеточием, задаёт его факты. Строка с `if` — правило.
Вся форма целиком описана в [WRITING.md](WRITING.md).

## 4. Направьте его на свой код

Назовите код в шапке файла, между строками `---`. `model: js` читает
JavaScript и TypeScript. В `~/rofl-examples/start`, рядом с `app.js`:

<!-- BEGIN file examples/start/app.rofl.md -->
````markdown
---
model: js
code:
  - app.js
---

```rofl
never F always throws
```
````
<!-- END file -->

<!-- BEGIN run+exit examples/start: rofl-nb app.rofl.md -->
```
$ rofl-nb app.rofl.md
app.rofl.md:8: cell 1 · rofl
  app.rofl.md:8: never F always throws  ->  FAILS · 1
    - [function refund() at app.js:6] always throws, in the code
app.rofl.md: 1 invariant fails — FAILS at line 8 (exit 1; see rofl-nb --help)
$ echo $?
1
```
<!-- END run+exit -->

`code:` принимает пути и глобы относительно блокнота (`- ../src/**/*.ts`).
Чтобы узнать, что вообще можно сказать о коде, поищите предложения по слову:

<!-- BEGIN run examples/start: rofl-nb vocab throw -->
```
$ rofl-nb vocab throw
controlflow: a call is an exit
  a function F always throws   (always_throws)
  a call C is a throwing call   (throwing_call)
  a function F throws at the top   (top_throw)

controlflow: what propagates
  a function F may throw   (may_throw)
  a function F throws out a node V   (thrown_by)
  a function F throws outright   (throws_outright)

dataflow: the exception path
  a statement Th throws inside a function   (throw_in_fn)
  a try T throws a node V   (thrown_in)

effects: the join over a body
  a function F may throw without a latent exception   (may_throw_only)

9 sentences with "throw"
```
<!-- END run -->

Дальше: [CONCEPTS.md](CONCEPTS.md), или [CHEATSHEET.md](CHEATSHEET.md) —
всё на одном экране. [DRAWING.md](DRAWING.md) рисует то, к чему пришёл
блокнот. [ASKING.md](ASKING.md) задаёт те же вопросы из командной оболочки,
через `rofl`.

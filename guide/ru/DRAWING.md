# Рисование

Строка `draw K` в ячейке рисует то, к чему пришёл блокнот, как картинку вида
`K`. Картинка состоит из фактов, так что её можно проверять, как любые
другие. `never` над ней — инвариант, `why` на метке — доказательство, а
`excise` перед `draw` показывает, что меняет один факт.

Каждая картинка на этой странице порождена `npm run guide` из примера,
который она называет, и `npm run guide -- --check` падает, если какая-то
устарела. На [опубликованном руководстве](https://disentinel.github.io/rofl/guide/ru/DRAWING.html)
каждая картинка рисуется живьём теми же модулями, которыми рисует VS Code:
щёлкните группу, чтобы открыть или закрыть её, метку — чтобы увидеть её
факты, и *Full screen* — чтобы увидеть картинку целиком. На GitHub, где
скрипты не выполняются, страница показывает SVG рендерера там, где он его
рисует, а для видов-графов, которым для раскладки нужен браузер, — их
mermaid, который GitHub рисует сам.

## Как рисует блокнот

1. **Прочтите словарь вида.** Он перечисляет слова, из которых состоит
   картинка: `visual/graph.rofl.md` (метка, связь, группа),
   `visual/time.rofl.md` (дорожка, интервал, сообщение),
   `visual/table.rofl.md` (строка, столбец, значение), `visual/space.rofl.md`
   (точка, прямоугольник, ось) и `visual/notation.rofl.md` (человек,
   рождение, семья). Они поставляются вместе с ROFL, так что блокнот называет
   словарь без пути: `reads: [rofl:visual/graph.rofl.md]`.
2. **Скажите правилами, что такое метка.** Например, «машина X — узел, если
   X на линии» или «X связан с Y, если X надо покрасить в Y». Эти правила —
   адаптер от вашей предметной области к картинке.
3. **Попросите её.** `draw graph`, `draw time`, `draw table`, `draw space` и
   `draw notation` рисуют пять семейств. У каждого диалекта и каждой формы
   ниже есть собственное имя.

В VS Code картинка рисуется под ячейкой. В командной строке
`rofl-nb F.rofl.md` печатает её счётчики и её текст: mermaid, DOT, Argdown,
Vega-Lite, GeoJSON, таблицу Markdown или GEDCOM. Добавьте `--format F`,
чтобы выбрать одну из этих форм, и `--json`, чтобы получить вид вместе с его
происхождением.

## Что несёт каждая картинка

- **Статус.** Рендерер сам помечает метку тегами; эти теги зарезервированы,
  и адаптер не может их записать:
  - `failing`: какой-то `never` в блокноте её называет.
  - `dangling`: связь не указывает ни на какую метку.
  - `unknown`: правила разбора (inquiry) говорят, что этого никто не знает.
  - `blind`: она пришла из файла, который модель не смогла прочесть.
  - `gone` и `new`: `excise` в ячейке её убрал или добавил.
- **Почему.** Щёлкните метку в VS Code: факты, на которых она стоит,
  произносятся предложениями, на один шаг доказательства вниз.
- **Что, если.** `excise F`, а затем `draw K` в одной ячейке рисуют картинку
  после изъятия. Что изъятие отняло, помечено `gone`, а что оно пропустило —
  `new`.
- **Кадры.** `frame(M, F)` помещает метку в кадр `F`. Картинка становится
  серией малых картинок, по одной на кадр по порядку, и каждый кадр
  сравнивается с предыдущим.
- **Масштаб.** `collapsed(G)` сворачивает группу в одну метку с подписью,
  сколько меток в ней, а щелчок снова её раскрывает. Что считается группой,
  зависит от вида:
  - граф: то, что `inside` неё;
  - временная шкала: дорожки в `lane_group`;
  - доказательство: факты под фактом.
- **Закрепить раскладку.** В VS Code картинку графа можно закрепить: факты
  `placed(M, X, Y)` записываются рядом с блокнотом, и блокнот, который их
  читает, рисует каждую метку на том же месте.

## Граф

Метка и связи между метками, в VS Code нарисованные как схема: группы — это
рамки, которые открываются и закрываются, заметка указывает на метку яркой
стрелкой, связь несёт маленькую таблицу своих термов, а рамка раскладывает
свои метки слоями, дорожками, матрицей, временной шкалой, квадрантом и так
далее ([docs/schemas.md](../../docs/schemas.md)). Какая картинка отвечает на
какой вопрос — в книге
[`visual/viewpoints.rofl.md`](../../visual/viewpoints.rofl.md). Каждый
диалект — это словарь графа плюс теги, которым диалект даёт значение и вид.

### graph

[`paint-shop.rofl.md`](../../examples/visual/paint-shop.rofl.md): машины на
линии, стрелка к цвету, в который каждую надо покрасить. Машины, которые
уходят некрашеными, проваливают `never`; стрелка `c3` указывает на цвет,
которого в цехе нет, и потому повисает.

<!-- BEGIN draw examples/visual: paint-shop.rofl.md -->
<!-- view ../pictures/paint-shop.json -->
```mermaid
flowchart LR
  m1["c1"]
  m2["c2"]
  m3["c3"]
  m4["c4"]
  m5["pink"]
  subgraph g0["shop"]
    m0["blue"]
    m6["red"]
    m7["white"]
  end
  m1 --> m0
  m2 --> m6
  m3 -.-> m5
  linkStyle 2 stroke:#b91c1c,stroke-dasharray:4 3
  classDef failing stroke:#b91c1c,stroke-width:3px,color:#b91c1c
  classDef dangling stroke:#b91c1c,stroke-dasharray:4 3,color:#b91c1c
  class m3 unpainted
  class m3 failing
  class m4 unpainted
  class m4 failing
  class m5 dangling
  class m5 failing
```
<!-- END draw -->

### argument

[`deploy-argument.rofl.md`](../../examples/visual/deploy-argument.rofl.md):
утверждение, свидетельства за и против него, у каждого утверждения — его
оценка. `draw argument` пишет Argdown; тот же вид рисуется и как граф.

<!-- BEGIN draw examples/visual: deploy-argument.rofl.md -->
<!-- view ../pictures/deploy-argument.json -->
```argdown
[cheap_to_run] #unknown

[fast_enough] #supported
  + <bench_p99>

[safe_to_ship] #contested
  + <canary_clean>
  - <incident_4711>
  + [tests_cover_payments] #supported
    + <suite_green>
```

<!-- view ../pictures/deploy-argument-1.json -->
```mermaid
flowchart LR
  m0["bench_p99"]
  m1["canary_clean"]
  m2["cheap_to_run"]
  m3["fast_enough"]
  m4["incident_4711"]
  m5["safe_to_ship"]
  m6["suite_green"]
  m7["tests_cover_payments"]
  m0 --> m3
  m1 --> m5
  m4 -->|attack| m5
  m6 --> m7
  m7 --> m5
  classDef unknown stroke:#66706b,stroke-dasharray:2 3,color:#66706b
  class m2 unknown
  class m3 supported
  class m5 contested
  class m7 supported
```
<!-- END draw -->

### architecture

[`shop-architecture.rofl.md`](../../examples/visual/shop-architecture.rofl.md):
контейнеры внутри границы своей системы и в своих слоях, нарисованные сверху
вниз. Вызов из сервиса вверх, в веб-слой, проваливает `never`.

<!-- BEGIN draw examples/visual: shop-architecture.rofl.md -->
<!-- view ../pictures/shop-architecture.json -->
```mermaid
architecture-beta
  group g0(cloud)[shop]
  service c0(server)[billing] in g0
  service c1(internet)[customer]
  service c2(server)[orders] in g0
  service c3(database)[orders_db] in g0
  service c4(server)[session] in g0
  service c5(internet)[stripe]
  service c6(server)[web] in g0
  c0:B --> T:c4
  c0:B --> T:c5
  c1:B --> T:c6
  c2:B --> T:c0
  c2:B --> T:c3
  c6:B --> T:c2
  c6:B --> T:c4
  %% billing: failing
  %% customer: person
  %% orders_db: database
  %% session: failing
  %% stripe: external
```
<!-- END draw -->

### state

[`order-states.rofl.md`](../../examples/visual/order-states.rofl.md):
состояния и события между ними, с точкой входа, кольцом конечного
состояния и подсвеченным текущим. Состояние, в которое есть вход и из
которого нет выхода, — тупик.

<!-- BEGIN draw examples/visual: order-states.rofl.md -->
<!-- view ../pictures/order-states.json -->
```mermaid
stateDiagram-v2
  state "cancelled" as s0
  state "cart" as s1
  state "delivered" as s2
  state "paid" as s3
  state "refund_pending" as s4
  state "shipped" as s5
  [*] --> s1
  s1 --> s0: abandon
  s1 --> s1: add_item
  s1 --> s3: pay
  s3 --> s4: refund
  s3 --> s5: ship
  s5 --> s2: deliver
  s0 --> [*]
  s2 --> [*]
  classDef failing stroke:#b91c1c,stroke-width:3px
  classDef current stroke-width:3px,font-weight:bold
  class s0 final
  class s1 initial
  class s2 final
  class s4 stuck
  class s4 failing
  class s5 current
```
<!-- END draw -->

### process

[`claim-process.rofl.md`](../../examples/visual/claim-process.rofl.md): шаги
на дорожке того, кто их выполняет, и шлюз там, где поток ветвится. Шаг, в
который ничего не втекает, недостижим.

<!-- BEGIN draw examples/visual: claim-process.rofl.md -->
<!-- view ../pictures/claim-process.json -->
```mermaid
flowchart LR
  subgraph g1["clerk"]
    m1["check"]
    m2(["closed"])
    m3{"covered"}
    m5["pay"]
    m6["reject"]
  end
  subgraph g2["customer"]
    m4(["filed"])
  end
  subgraph g0["manager"]
    m0["appeal"]
    m7["review"]
  end
  m0 --> m7
  m1 --> m3
  m3 -->|yes| m5
  m3 -->|no| m6
  m3 -->|unsure| m7
  m4 --> m1
  m5 --> m2
  m6 --> m2
  m7 --> m5
  classDef failing stroke:#b91c1c,stroke-width:3px,color:#b91c1c
  class m0 failing
  class m2 finish
  class m3 decision
  class m4 start
```
<!-- END draw -->

### causal

[`burnout-loop.rofl.md`](../../examples/visual/burnout-loop.rofl.md):
величины и влияния со знаком между ними, разложенные по кольцу, чтобы были
видны петли. У влияния, которое никто не измерял, знака нет.

<!-- BEGIN draw examples/visual: burnout-loop.rofl.md -->
<!-- view ../pictures/burnout-loop.json -->
```mermaid
flowchart LR
  m0["attrition"]
  m1["backlog"]
  m2["bugs"]
  m3["fatigue"]
  m4["morale"]
  m5["overtime"]
  m0 -->|+| m1
  m1 -->|+| m5
  m2 -->|+| m1
  m3 -->|+| m2
  m3 -->|-| m4
  m4 --> m0
  m5 -->|-| m1
  m5 -->|+| m3
  classDef failing stroke:#b91c1c,stroke-width:3px,color:#b91c1c
  class m0 failing
  class m4 unsigned
  class m4 failing
```
<!-- END draw -->

### proof

[`claim-proof.rofl.md`](../../examples/visual/claim-proof.rofl.md):
доказательство каждого `why` в ячейке в виде дерева. Каждый факт стоит над
фактами, на которых он держится, вплоть до фактов, которых никто не выводил.
Факт о терме, которого никто не знает, рисуется как `unknown`. Сворачивание
факта прячет в него его поддоказательство. VS Code рисует дерево снизу
вверх; здесь это mermaid графа, а в командной строке — текст с отступами,
который печатает `why`.

<!-- BEGIN draw examples/visual: claim-proof.rofl.md -->
<!-- view ../pictures/claim-proof.json -->
```mermaid
flowchart LR
  m0["check leads to covered"]
  m1["covered leads to pay"]
  m2["filed leads to check"]
  m3["filed opens the process"]
  m4["check is reached"]
  m5["covered is reached"]
  m6["filed is reached"]
  m7["pay is reached"]
  m8["check is followed by covered"]
  m9["filed is followed by check"]
  m10["covered is followed by pay when yes"]
  m10 --> m1
  m1 --> m7
  m8 --> m0
  m0 --> m5
  m9 --> m2
  m2 --> m4
  m3 --> m6
  m6 --> m4
  m4 --> m5
  m5 --> m7
  classDef unknown stroke:#66706b,stroke-dasharray:2 3,color:#66706b
  class m0 unknown
  class m2 unknown
  class m3 given
  class m4 unknown
  class m8 given
  class m8 unknown
  class m9 given
  class m9 unknown
  class m10 given
```
<!-- END draw -->

## Время

Дорожки и то, что на них происходит, на одной оси времени.

### time: диаграмма Ганта

[`spat-thursday.rofl.md`](../../examples/visual/spat-thursday.rofl.md):
дорожка на человека, полоса на каждое его дело, и красная полоса везде, где
ребёнок остаётся один, пока не спит.

<!-- BEGIN draw examples/visual: spat-thursday.rofl.md -->
<!-- view ../pictures/spat-thursday.json -->
![draw time: spat-thursday.rofl.md](../pictures/spat-thursday.svg)
<!-- END draw -->

### time: последовательность

[`checkout-sequence.rofl.md`](../../examples/visual/checkout-sequence.rofl.md):
метки, идущие с дорожки на дорожку, рисуются как сообщения. Вызов, на
который так и не ответили, проваливает `never`.

<!-- BEGIN draw examples/visual: checkout-sequence.rofl.md -->
<!-- view ../pictures/checkout-sequence.json -->
![draw time: checkout-sequence.rofl.md](../pictures/checkout-sequence.svg)
<!-- END draw -->

### timeline

[`outage-timeline.rofl.md`](../../examples/visual/outage-timeline.rofl.md):
что произошло в какой момент, по порядку, на одной оси. Оповещение, которое
пришло поздно, красное.

<!-- BEGIN draw examples/visual: outage-timeline.rofl.md -->
<!-- view ../pictures/outage-timeline.json -->
![draw timeline: outage-timeline.rofl.md](../pictures/outage-timeline.svg)
<!-- END draw -->

### timing

[`breaker-timing.rofl.md`](../../examples/visual/breaker-timing.rofl.md):
сигнал на дорожку, ступенями переходящий между своими состояниями.
Размыкатель, открытый слишком долго, красный.

<!-- BEGIN draw examples/visual: breaker-timing.rofl.md -->
<!-- view ../pictures/breaker-timing.json -->
![draw timing: breaker-timing.rofl.md](../pictures/breaker-timing.svg)
<!-- END draw -->

## Таблица

Строки на столбцы на значения.

### table

[`coverage.rofl.md`](../../examples/visual/coverage.rofl.md): матрица
покрытия в виде таблицы Markdown. Строки, которые называют аудиты,
отмечены.

<!-- BEGIN draw examples/visual: coverage.rofl.md -->
<!-- view ../pictures/coverage.json -->
| | l_x | l_y |
|---|---|---|
| k_a [failing] | done | open [failing] |
| k_b | claimed | waived |
| k_c [failing] | open [failing] | done |
<!-- END draw -->

### chart

[`suite-chart.rofl.md`](../../examples/visual/suite-chart.rofl.md): метка,
которую называет `draws`, на каналах, которые называет `shows`. Набор
тестов, вышедший за свой бюджет, красный.

<!-- BEGIN draw examples/visual: suite-chart.rofl.md -->
<!-- view ../pictures/suite-chart.json -->
![draw chart: suite-chart.rofl.md](../pictures/suite-chart.svg)
<!-- END draw -->

### heatmap

[`coverage-heatmap.rofl.md`](../../examples/visual/coverage-heatmap.rofl.md):
ячейка, окрашенная по своему значению. Открытая ячейка, на которую не
претендует ни одна задача, обведена красным.

<!-- BEGIN draw examples/visual: coverage-heatmap.rofl.md -->
<!-- view ../pictures/coverage-heatmap.json -->
![draw heatmap: coverage-heatmap.rofl.md](../pictures/coverage-heatmap.svg)
<!-- END draw -->

### upset

[`access-upset.rofl.md`](../../examples/visual/access-upset.rofl.md): когда
множеств больше, чем вмещают круги, — столбик на множество и столбец на
пересечение. Человек сразу в двух обязанностях отмечен.

<!-- BEGIN draw examples/visual: access-upset.rofl.md -->
<!-- view ../pictures/access-upset.json -->
![draw upset: access-upset.rofl.md](../pictures/access-upset.svg)
<!-- END draw -->

### euler

[`oncall-euler.rofl.md`](../../examples/visual/oncall-euler.rofl.md): три
множества или меньше в виде кругов, и каждый человек в области ровно своих
множеств.

<!-- BEGIN draw examples/visual: oncall-euler.rofl.md -->
<!-- view ../pictures/oncall-euler.json -->
![draw euler: oncall-euler.rofl.md](../pictures/oncall-euler.svg)
<!-- END draw -->

### decision

[`shipping-decision.rofl.md`](../../examples/visual/shipping-decision.rofl.md):
в VS Code — правило на столбец, его условия над его действиями; здесь — его
таблица Markdown, правило на строку. Пробел и наложение — оба провалы.

<!-- BEGIN draw examples/visual: shipping-decision.rofl.md -->
<!-- view ../pictures/shipping-decision.json -->
| | big_order | discount | free_shipping | member |
|---|---|---|---|---|
| $gap(no,no) [gap, failing] | no |  |  | no |
| r1 [overlaps, failing] | any |  | x | yes |
| r2 | yes |  | x | no |
| r3 [overlaps, failing] | yes | x |  | yes |
<!-- END draw -->

## Пространство

Данные и есть геометрия, так что ничего не раскладывается.

### space: карта

[`rail-map.rofl.md`](../../examples/visual/rail-map.rofl.md): станции по
своей долготе и широте. Станция, до которой не доходит ни одна линия,
красная там, где стоит. В командной строке карта — это GeoJSON.

<!-- BEGIN draw examples/visual: rail-map.rofl.md -->
<!-- view ../pictures/rail-map.json -->
![draw space: rail-map.rofl.md](../pictures/rail-map.svg)
<!-- END draw -->

### space: план

[`office-plan.rofl.md`](../../examples/visual/office-plan.rofl.md): комнаты
как прямоугольники, столы как точки. Стол вне всякой комнаты красный.

<!-- BEGIN draw examples/visual: office-plan.rofl.md -->
<!-- view ../pictures/office-plan.json -->
![draw space: office-plan.rofl.md](../pictures/office-plan.svg)
<!-- END draw -->

### space: оси

[`wardley.rofl.md`](../../examples/visual/wardley.rofl.md): компоненты,
размещённые по тому, насколько они зрелые и насколько видимые. Компонент,
который зависит от более видимого, нарушает порядок цепочки.

<!-- BEGIN draw examples/visual: wardley.rofl.md -->
<!-- view ../pictures/wardley.json -->
![draw space: wardley.rofl.md](../pictures/wardley.svg)
<!-- END draw -->

## Нотация

Когда у предметной области есть свой инструмент и стандарт, блокнот пишет
файл, который этот инструмент читает.
[`family-tree.rofl.md`](../../examples/visual/family-tree.rofl.md) пишет
GEDCOM 7; в VS Code он к тому же рисуется как родословная, поколениями вниз,
с ребёнком, родившимся раньше родителя, помеченным как провал, а
*Open as .ged* кладёт файл рядом с блокнотом.

<!-- BEGIN draw examples/visual: family-tree.rofl.md -->
<!-- view ../pictures/family-tree.json -->
```gedcom
0 HEAD
1 GEDC
2 VERS 7.0
1 NOTE drawn from a ROFL notebook by `draw notation`
0 @I1@ INDI
1 NAME Anna /Petrova/
1 BIRT
2 DATE 1950
1 FAMS @F1@
1 FAMC @F2@
0 @I2@ INDI
1 NAME Boris /Sokolov/
1 BIRT
2 DATE 1948
1 FAMS @F1@
0 @I3@ INDI
1 NAME Ivan /Petrov/
1 BIRT
2 DATE 1921
1 FAMS @F2@
0 @I4@ INDI
1 NAME Lena /Sokolova/
1 BIRT
2 DATE 1946
1 FAMC @F1@
0 @I5@ INDI
1 NAME Olga /Petrova/
1 BIRT
2 DATE 1925
1 FAMS @F2@
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I4@
0 @F2@ FAM
1 HUSB @I3@
1 WIFE @I5@
1 CHIL @I1@
0 TRLR
```
<!-- END draw -->

## Покрытие этой страницы, нарисованное ею самой

[`visual/vscode-coverage.rofl.md`](../../visual/vscode-coverage.rofl.md) —
матрица, которая отслеживает, как каждый вид выше покрыт в VS Code. Её
строки — виды, столбцы — то, что значит «покрыт». Каждая ячейка — `done` со
свидетельством, `waived` с причиной, `claimed` открытой работой или `open`.
Она рисует себя как тепловую карту.

<!-- BEGIN draw visual: vscode-coverage.rofl.md -->
<!-- view ../pictures/vscode-coverage.json -->
![draw heatmap: vscode-coverage.rofl.md](../pictures/vscode-coverage.svg)
<!-- END draw -->

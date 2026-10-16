---
world: view-viewpoints
---

# The viewpoints: which picture answers which question

> Sixty ways to draw one system, each answering one question: who calls
> whom, what runs where, what changed, who owns what, what it costs. Each
> viewpoint says what its boxes and lines mean, how its frames gather the
> boxes, which layout it takes (docs/schemas.md), what may be hidden or
> merged, which facts come from the sources and which from people, and how
> a person and an agent keep it true. An agent picks a viewpoint by the
> question it is asked (`? V answers Q`, `? V is recognised by the words
> W`), reads its boxes and lines, and writes the rules that map the
> world's own sentences onto visual/graph.rofl.md. The texts are in
> Russian, the owner's language.

Declared as facts:

- <a id="vp_named"></a>A viewpoint V is named S
- <a id="vp_family"></a>A viewpoint V is in the family F
- <a id="vp_answers"></a>A viewpoint V answers S
- <a id="vp_layout"></a>A viewpoint V is laid out as L
- <a id="vp_when"></a>A viewpoint V is opened when S
- <a id="vp_origin"></a>A viewpoint V comes from S
- <a id="vp_reader"></a>A viewpoint V is read by S
- <a id="vp_box"></a>A viewpoint V draws a box K meaning S
- <a id="vp_line"></a>A viewpoint V joins boxes with a line K meaning S
- <a id="vp_frames"></a>A viewpoint V frames its boxes by S
- <a id="vp_colours"></a>A viewpoint V colours by S
- <a id="vp_rule"></a>A viewpoint V keeps the rule S
- <a id="vp_source"></a>A viewpoint V takes from the source S
- <a id="vp_people"></a>A viewpoint V asks people for S
- <a id="vp_rofl"></a>A viewpoint V is derived by rules like S
- <a id="vp_kept_people"></a>A viewpoint V is kept by people so: S
- <a id="vp_kept_agent"></a>A viewpoint V is kept by an agent so: S
- <a id="vp_words"></a>A viewpoint V is recognised by the words S
- <a id="vp_ask"></a>A viewpoint V is chosen by asking S
- <a id="vp_tune"></a>A viewpoint V is tuned by asking S
- <a id="vp_related"></a>A viewpoint V is related to a viewpoint W

<a id="vp_known"></a>A viewpoint V is known if V is named S.

<a id="vp_stranger"></a>A viewpoint V names a stranger W if V is related to W, unless W is known.

<a id="vp_unlaid"></a>A viewpoint V has no layout if V is known, unless V is laid out as some layout.

```rofl
never V names a stranger W
never V has no layout
```

## The viewpoints

### Система и её окружение

> С кем и с чем наша система общается снаружи и кто ею пользуется?

Its facts:

- `context` is named "Система и её окружение".
- `context` is in the family `structure`.
- `context` answers "С кем и с чем наша система общается снаружи и кто ею пользуется?".
- `context` is laid out as `radial`.
- `context` is opened when "Первая встреча с системой, разговор с заказчиком, начало любой интеграции или аудита. Это обложка всех остальных видов.".
- `context` comes from "C4 L1".
- `context` is read by "менеджмент".
- `context` is read by "архитекторы".
- `context` is read by "продукт".
- `context` is read by "новички".
- `context` draws a box `system` meaning "наша система одной коробкой, например «Интернет-магазин» или «ROFL Notebook для VS Code»".
- `context` draws a box `external` meaning "чужая система: платёжный шлюз, служба доставки, сам VS Code, GitHub".
- `context` draws a box `person` meaning "роль человека: покупатель, менеджер склада, автор блокнота".
- `context` draws a box `note` meaning "заметка с назначением системы в одном предложении".
- `context` joins boxes with a line `uses` meaning "человек пользуется системой (подпись — зачем)".
- `context` joins boxes with a line `calls` meaning "наша система обращается к чужой: «списать деньги», «запросить статус посылки»".
- `context` joins boxes with a line `sends` meaning "чужая система сама присылает нам что-то: уведомление об оплате".
- `context` frames its boxes by "Наша система в центре одной коробкой; чужие системы собраны в рамки по владельцу (наши другие команды, партнёры, облако); люди отдельной полосой сверху.".
- `context` colours by "цвет чужих систем по тому, кто владелец: своя компания, партнёр, публичный сервис".
- `context` colours by "значок замка на линиях, где передаются личные данные".
- `context` keeps the rule "внутренности нашей системы не показывать вовсе — одна коробка".
- `context` keeps the rule "не больше 12 внешних коробок; мелкие объединять в «прочие сервисы ×N»".
- `context` keeps the rule "каждая линия подписана глаголом из словаря предметной области, а не протоколом".
- `context` keeps the rule "людей показывать ролями, не именами".
- `context` takes from the source "адреса внешних сервисов из конфигов и переменных окружения".
- `context` takes from the source "клиенты HTTP и SDK из кода (fetch, axios, stripe, vscode API)".
- `context` takes from the source "входящие точки: маршруты веб-сервера, подписки на вебхуки".
- `context` asks people for "кто наши пользователи и зачем они приходят".
- `context` asks people for "кто владеет каждой внешней системой и есть ли договор".
- `context` is derived by rules like "external(stripe). calls_host(checkout_ts, 'api.stripe.com'). host_of(stripe, 'api.stripe.com'). talks_to(shop, X) :- calls_host(F, H), host_of(X, H), part_of(F, shop).".
- `context` is kept by people so: "Нарисуйте одну коробку своей системы и вокруг всех, с кем она общается. На каждой линии напишите глагол: «оплачивает заказ», «открывает блокнот». Поставьте заметку с одной фразой «зачем существует система» и яркую стрелку туда, где ожидается новая внешняя связь.".
- `context` is kept by an agent so: "Собирать внешние адреса из конфигов и вызовов SDK, сверять со списком внешних систем из заметок. Если в коде есть адрес, которого нет на картинке, или на картинке есть система, к которой код не обращается, — отметить противоречие. Обновлять при каждом изменении конфигов и зависимостей.".
- `context` is recognised by the words "с кем интегрируемся".
- `context` is recognised by the words "внешние системы".
- `context` is recognised by the words "кто пользователи".
- `context` is recognised by the words "общая картина".
- `context` is recognised by the words "на одном слайде".
- `context` is chosen by asking "Нужно показать систему целиком снаружи, без внутренностей?".
- `context` is tuned by asking "Показывать людей или только системы?".
- `context` is tuned by asking "Объединять мелкие внешние сервисы в одну коробку?".
- `context` is related to `containers`.
- `context` is related to `integration_landscape`.
- `context` is related to `capability_map`.
- `context` is related to `threat_model`.

### Работающие части

> Из каких отдельно запускаемых частей состоит система и как они разговаривают друг с другом?

Its facts:

- `containers` is named "Работающие части".
- `containers` is in the family `structure`.
- `containers` answers "Из каких отдельно запускаемых частей состоит система и как они разговаривают друг с другом?".
- `containers` is laid out as `layered_right`.
- `containers` is opened when "Когда нужно понять, что где выполняется: какой код в каком процессе, потоке или браузере. Перед изменением, которое пересекает границу процесса.".
- `containers` comes from "C4 L2".
- `containers` comes from "4+1 process".
- `containers` is read by "архитекторы".
- `containers` is read by "разработчики".
- `containers` is read by "эксплуатация".
- `containers` is read by "новички".
- `containers` draws a box `process` meaning "запускаемая часть: процесс расширения, процесс rofl-lsp, ядро блокнота, веб-сервер магазина".
- `containers` draws a box `thread` meaning "поток внутри процесса: рабочий поток (worker thread) расширения".
- `containers` draws a box `webview` meaning "отрисовщик в браузерном окне: webview с выводом ячеек".
- `containers` draws a box `store` meaning "хранилище: база заказов, кэш Redis, файлы на диске".
- `containers` joins boxes with a line `ipc` meaning "сообщения между процессами: postMessage, JSON-RPC по stdio".
- `containers` joins boxes with a line `spawn` meaning "одна часть запускает другую: расширение запускает rofl-lsp".
- `containers` joins boxes with a line `reads` meaning "чтение и запись хранилища".
- `containers` frames its boxes by "Каждый процесс — рамка; внутри — его потоки и файлы, которые до него доходят от точки входа. Хранилища вне рамок.".
- `containers` colours by "цвет по языку или среде: Node, Rust, браузер".
- `containers` colours by "значок числа экземпляров (×1, ×N на каждую вкладку)".
- `containers` keeps the rule "показывать только линии, пересекающие границу процесса; внутренние вызовы скрыть".
- `containers` keeps the rule "линии между процессами подписывать протоколом и форматом сообщения".
- `containers` keeps the rule "если файл попадает в два процесса, рисовать его в обоих и пометить «общий код»".
- `containers` keeps the rule "не больше 9 рамок; одинаковые воркеры сводить в одну рамку ×N".
- `containers` takes from the source "точки входа из package.json (main, browser), Cargo.toml, Dockerfile".
- `containers` takes from the source "места запуска: new Worker(), child_process.spawn, createWebviewPanel".
- `containers` takes from the source "транзитивные импорты от каждой точки входа".
- `containers` asks people for "сколько экземпляров каждой части в работе".
- `containers` asks people for "какие части обязательны, а какие запускаются по требованию".
- `containers` is derived by rules like "spawned(worker, 'src/worker.ts'). spawned(lsp, 'rust/src/main.rs'). reaches(E, F) :- imports(E, F). reaches(E, F) :- reaches(E, G), imports(G, F). runs_in(File, Proc) :- spawned(Proc, Entry), reaches(Entry, File).".
- `containers` is kept by people so: "Назовите каждую запускаемую часть одним существительным («ядро блокнота», «сервер языка») и запишите в заметке, кто её запускает и когда она умирает. Стрелкой отметьте самое хрупкое место — обычно это канал сообщений между процессами.".
- `containers` is kept by an agent so: "Находить точки входа и места запуска, строить достижимость импортов и раскладывать файлы по процессам. Проверять, что сообщения, которые одна часть посылает, кто-то на другой стороне принимает. Обновлять при изменении точек входа или манифестов.".
- `containers` is recognised by the words "процесс".
- `containers` is recognised by the words "поток".
- `containers` is recognised by the words "воркер".
- `containers` is recognised by the words "webview".
- `containers` is recognised by the words "где это выполняется".
- `containers` is recognised by the words "контейнер".
- `containers` is recognised by the words "микросервис".
- `containers` is chosen by asking "Нужно увидеть, какие части запускаются отдельно и как они обмениваются сообщениями?".
- `containers` is tuned by asking "Показывать потоки внутри процессов?".
- `containers` is tuned by asking "Показывать хранилища?".
- `containers` is related to `context`.
- `containers` is related to `components`.
- `containers` is related to `concurrency`.
- `containers` is related to `deployment`.
- `containers` is related to `events`.

### Компоненты

> Из каких крупных частей собран один процесс и кто от кого зависит?

Its facts:

- `components` is named "Компоненты".
- `components` is in the family `structure`.
- `components` answers "Из каких крупных частей собран один процесс и кто от кого зависит?".
- `components` is laid out as `layered_down`.
- `components` is opened when "Погружение в одну часть системы, ревью архитектуры модуля, поиск места для новой функции.".
- `components` comes from "C4 L3".
- `components` is read by "разработчики".
- `components` is read by "архитекторы".
- `components` is read by "новички".
- `components` draws a box `component` meaning "папка или модуль с одной ответственностью: «корзина», «оплата», «разбор ячеек», «отрисовка вывода»".
- `components` draws a box `file` meaning "файл внутри компонента".
- `components` draws a box `note` meaning "ответственность компонента в одной фразе".
- `components` joins boxes with a line `imports` meaning "компонент использует код другого (×N — сколько импортов)".
- `components` joins boxes with a line `calls` meaning "вызовы функций между компонентами".
- `components` joins boxes with a line `ref` meaning "ссылка на тип без вызова".
- `components` frames its boxes by "По папкам исходников; если есть явная разметка модулей (package, crate, workspace), она главнее папок.".
- `components` colours by "цвет по слою или по владельцу".
- `components` colours by "размер коробки по числу строк кода".
- `components` keeps the rule "линии внутри компонента скрыты, пока рамка закрыта; между рамками — одна линия ×N".
- `components` keeps the rule "тестовые файлы и сгенерированный код скрыты по умолчанию".
- `components` keeps the rule "не больше 9 компонентов на уровне; глубже — открывать рамку".
- `components` keeps the rule "компонент без входящих линий подсветить как кандидата в мёртвый код".
- `components` takes from the source "дерево папок и манифесты пакетов".
- `components` takes from the source "импорты и вызовы из разбора кода".
- `components` asks people for "ответственность каждого компонента одной фразой".
- `components` asks people for "какие компоненты считаются публичными для остальных".
- `components` is derived by rules like "in_component(F, C) :- file_in_dir(F, D), component_dir(C, D). depends(A, B) :- imports(F, G), in_component(F, A), in_component(G, B), A != B.".
- `components` is kept by people so: "Для каждой рамки напишите заметку «отвечает за…» и «не отвечает за…». Если компонент делает две несвязанные вещи, поставьте на него яркую стрелку «разделить».".
- `components` is kept by an agent so: "Строить зависимости по импортам, сверять с заявленными ответственностями: если «отрисовка» импортирует «базу данных», отметить подозрительную связь. Обновлять при переносе файлов между папками.".
- `components` is recognised by the words "модуль".
- `components` is recognised by the words "папка".
- `components` is recognised by the words "компонент".
- `components` is recognised by the words "из чего состоит".
- `components` is recognised by the words "куда положить".
- `components` is chosen by asking "Нужно разобраться в устройстве одной части изнутри?".
- `components` is tuned by asking "Группировать по папкам или по пакетам?".
- `components` is tuned by asking "Показывать тесты?".
- `components` is related to `containers`.
- `components` is related to `code`.
- `components` is related to `layers_cycles`.
- `components` is related to `dsm`.
- `components` is related to `ownership`.

### Код функции

> Что именно делает эта функция шаг за шагом?

Its facts:

- `code` is named "Код функции".
- `code` is in the family `structure`.
- `code` answers "Что именно делает эта функция шаг за шагом?".
- `code` is laid out as `layered_down`.
- `code` is opened when "Чтение незнакомой функции, ревью сложного места, поиск ветки, где теряется ошибка.".
- `code` comes from "C4 L4".
- `code` is read by "разработчики".
- `code` is read by "тестировщики".
- `code` is read by "новички".
- `code` draws a box `function` meaning "функция или метод".
- `code` draws a box `branch` meaning "ветка if/switch или цикл как рамка внутри функции".
- `code` draws a box `step` meaning "отдельный шаг: вызов, присваивание, return, throw".
- `code` joins boxes with a line `step` meaning "порядок выполнения шагов".
- `code` joins boxes with a line `calls` meaning "вызов другой функции (переход к её коробке)".
- `code` joins boxes with a line `data` meaning "значение переходит из шага в шаг".
- `code` frames its boxes by "Функция — рамка; внутри рамки ветвлений и циклов, вложенные как в коде; шаги — листья.".
- `code` colours by "цвет шагов, которые покрыты тестами".
- `code` colours by "значок на шагах, которые бросают исключение".
- `code` keeps the rule "простые присваивания подряд сворачивать в один шаг «подготовка ×N»".
- `code` keeps the rule "ветку, которая только логирует, скрывать".
- `code` keeps the rule "выделять шаги с побочным эффектом (запись, сеть)".
- `code` keeps the rule "код шага показывать в боковой панели по щелчку".
- `code` takes from the source "дерево разбора функции".
- `code` takes from the source "покрытие тестами по строкам".
- `code` takes from the source "места throw/return".
- `code` asks people for "смысл неочевидных веток в заметках".
- `code` is derived by rules like "in_frame(S, B) :- step_at(S, Line), branch_span(B, From, To), Line >= From, Line <= To. side_effect(S) :- step_calls(S, F), writes_external(F).".
- `code` is kept by people so: "Ставьте заметку на ветку, смысл которой не виден из кода: «сюда попадаем, если оплата пришла дважды». Яркой стрелкой отмечайте шаг, который хотите изменить.".
- `code` is kept by an agent so: "Строить рамки из дерева разбора при каждом изменении файла. Проверять, что заметки всё ещё стоят на существующих шагах; если шаг исчез — пометить заметку как осиротевшую.".
- `code` is recognised by the words "эта функция".
- `code` is recognised by the words "что тут происходит".
- `code` is recognised by the words "пошагово".
- `code` is recognised by the words "ветка".
- `code` is recognised by the words "цикл".
- `code` is chosen by asking "Нужно разобрать одну функцию по шагам?".
- `code` is tuned by asking "Сворачивать мелкие шаги?".
- `code` is tuned by asking "Показывать переходы в вызываемые функции?".
- `code` is related to `components`.
- `code` is related to `error_propagation`.
- `code` is related to `test_coverage`.
- `code` is related to `request_lifecycle`.

### Слои и циклы

> Соблюдаются ли слои и где зависимости идут по кругу?

Its facts:

- `layers_cycles` is named "Слои и циклы".
- `layers_cycles` is in the family `structure`.
- `layers_cycles` answers "Соблюдаются ли слои и где зависимости идут по кругу?".
- `layers_cycles` is laid out as `layered_down`.
- `layers_cycles` is opened when "Ревью архитектуры, перед выделением модуля в отдельный пакет, когда сборка или тесты стали медленными из-за связности.".
- `layers_cycles` comes from "Layered architecture".
- `layers_cycles` is read by "архитекторы".
- `layers_cycles` is read by "разработчики".
- `layers_cycles` draws a box `layer` meaning "слой: интерфейс, сценарии, предметная область, доступ к данным".
- `layers_cycles` draws a box `component` meaning "компонент внутри слоя".
- `layers_cycles` draws a box `cycle` meaning "группа компонентов, зависящих друг от друга по кругу".
- `layers_cycles` joins boxes with a line `depends` meaning "разрешённая зависимость сверху вниз".
- `layers_cycles` joins boxes with a line `violation` meaning "зависимость снизу вверх или через слой".
- `layers_cycles` joins boxes with a line `cycle` meaning "ребро, замыкающее цикл".
- `layers_cycles` frames its boxes by "Слои — горизонтальные полосы по заявленным правилам; компоненты одного цикла собраны в рамку «цикл».".
- `layers_cycles` colours by "красным — нарушения слоёв".
- `layers_cycles` colours by "толщина линии по числу импортов".
- `layers_cycles` keeps the rule "разрешённые линии бледные, нарушения яркие".
- `layers_cycles` keeps the rule "в цикле подсвечивать самое «дешёвое» ребро для разрыва (меньше всего импортов)".
- `layers_cycles` keeps the rule "компонент без слоя — в отдельной полосе «не распределено»".
- `layers_cycles` takes from the source "граф импортов".
- `layers_cycles` takes from the source "сильно связные компоненты графа".
- `layers_cycles` asks people for "какие слои есть и в каком порядке".
- `layers_cycles` asks people for "какой компонент к какому слою относится, если не по папке".
- `layers_cycles` is derived by rules like "violation(A, B) :- depends(A, B), layer_of(A, LA), layer_of(B, LB), rank(LA, RA), rank(LB, RB), RA > RB. in_cycle(A) :- depends_tc(A, B), depends_tc(B, A).".
- `layers_cycles` is kept by people so: "Запишите слои и их порядок как правила; для каждого допустимого исключения оставьте заметку с причиной. Стрелкой отметьте цикл, который команда берётся разорвать.".
- `layers_cycles` is kept by an agent so: "Пересчитывать нарушения при каждом изменении импортов и сравнивать с прошлой версией: новое нарушение — сигнал в ревью. Исключение без заметки-причины считать противоречием.".
- `layers_cycles` is recognised by the words "слои".
- `layers_cycles` is recognised by the words "циклическая зависимость".
- `layers_cycles` is recognised by the words "всё связано со всем".
- `layers_cycles` is recognised by the words "чистая архитектура".
- `layers_cycles` is recognised by the words "нарушение".
- `layers_cycles` is chosen by asking "Нужно проверить, соблюдаются ли правила слоёв и нет ли циклов?".
- `layers_cycles` is tuned by asking "Показывать только нарушения?".
- `layers_cycles` is tuned by asking "Считать циклы по файлам или по компонентам?".
- `layers_cycles` is related to `dsm`.
- `layers_cycles` is related to `components`.
- `layers_cycles` is related to `architecture_drift`.
- `layers_cycles` is related to `tech_debt`.

### Матрица зависимостей

> Кто от кого зависит — компактно, для сотен модулей сразу?

Its facts:

- `dsm` is named "Матрица зависимостей".
- `dsm` is in the family `structure`.
- `dsm` answers "Кто от кого зависит — компактно, для сотен модулей сразу?".
- `dsm` is laid out as `matrix`.
- `dsm` is opened when "Когда граф стал «клубком» и картинка из коробок не читается; при планировании разрезания монолита.".
- `dsm` comes from "DSM".
- `dsm` is read by "архитекторы".
- `dsm` is read by "разработчики".
- `dsm` draws a box `row` meaning "модуль, который зависит".
- `dsm` draws a box `column` meaning "модуль, от которого зависят".
- `dsm` draws a box `cell` meaning "число зависимостей строки от столбца".
- `dsm` draws a box `block` meaning "квадрат модулей, тесно связанных между собой".
- `dsm` joins boxes with a line `marked` meaning "клетка выше диагонали — зависимость «против течения»".
- `dsm` frames its boxes by "Строки и столбцы упорядочены так, чтобы связанные модули стояли рядом; рамки на диагонали — кандидаты в отдельные пакеты. Рамки сворачиваются как обычные: одна строка на папку.".
- `dsm` colours by "насыщенность клетки по числу импортов".
- `dsm` colours by "красные клетки выше диагонали".
- `dsm` keeps the rule "пустые строки и столбцы (листья) уводить в конец".
- `dsm` keeps the rule "диагональные блоки выделять рамкой".
- `dsm` keeps the rule "щелчок по клетке показывает конкретные импорты в боковой панели".
- `dsm` keeps the rule "сворачивать до 30×30 клеток, глубже — раскрывая блок".
- `dsm` takes from the source "граф импортов и вызовов".
- `dsm` takes from the source "порядок: топологическая сортировка с объединением циклов".
- `dsm` asks people for "желаемые границы будущих пакетов, чтобы сравнить с блоками".
- `dsm` is derived by rules like "cell(A, B, N) :- N = count F : imports(F, G), in_component(F, A), in_component(G, B). upstream(A, B) :- cell(A, B, N), order(A, OA), order(B, OB), OA < OB.".
- `dsm` is kept by people so: "Отметьте рамкой желаемые блоки и напишите в заметке, почему именно так. Клетку, которую надо обнулить, отметьте стрелкой.".
- `dsm` is kept by an agent so: "Пересчитывать порядок и блоки при изменении импортов, сравнивать с желаемыми блоками и сообщать, какие клетки мешают разрезу.".
- `dsm` is recognised by the words "матрица".
- `dsm` is recognised by the words "клубок".
- `dsm` is recognised by the words "монолит".
- `dsm` is recognised by the words "разрезать".
- `dsm` is recognised by the words "сотни модулей".
- `dsm` is chosen by asking "Граф слишком большой — показать зависимости таблицей?".
- `dsm` is tuned by asking "На уровне папок или файлов?".
- `dsm` is tuned by asking "Считать импорты или вызовы?".
- `dsm` is related to `layers_cycles`.
- `dsm` is related to `components`.
- `dsm` is related to `migration`.
- `dsm` is related to `hotspots`.

### Настройки и флаги

> Какие настройки и флаги функций меняют поведение системы и какой код от них зависит?

Its facts:

- `config_flags` is named "Настройки и флаги".
- `config_flags` is in the family `structure`.
- `config_flags` answers "Какие настройки и флаги функций меняют поведение системы и какой код от них зависит?".
- `config_flags` is laid out as `layered_right`.
- `config_flags` is opened when "Перед включением флага в проде, при разборе «у меня работает, а у них нет», при чистке старых флагов.".
- `config_flags` is read by "разработчики".
- `config_flags` is read by "эксплуатация".
- `config_flags` is read by "продукт".
- `config_flags` is read by "тестировщики".
- `config_flags` draws a box `setting` meaning "настройка: переменная окружения, ключ конфига, параметр VS Code «rofl.server.path»".
- `config_flags` draws a box `flag` meaning "флаг функции: «новая корзина», «экспериментальный рендер»".
- `config_flags` draws a box `code` meaning "код, поведение которого зависит от значения".
- `config_flags` draws a box `env` meaning "окружение, где значение задано".
- `config_flags` joins boxes with a line `read` meaning "код читает настройку".
- `config_flags` joins boxes with a line `gates` meaning "флаг включает или выключает ветку".
- `config_flags` joins boxes with a line `default` meaning "значение по умолчанию задано в коде".
- `config_flags` frames its boxes by "Настройки собраны по источнику (env, файл конфига, параметры редактора, сервис флагов); код — по компонентам.".
- `config_flags` colours by "цвет флага по возрасту: старше полугода — кандидат на удаление".
- `config_flags` colours by "значок, если в окружениях заданы разные значения".
- `config_flags` keeps the rule "показывать только настройки, которые реально читаются кодом; незатронутые — в список «мёртвые ключи»".
- `config_flags` keeps the rule "флаги, включённые везде на 100%, подсвечивать «можно удалить»".
- `config_flags` keeps the rule "не показывать значения секретов, только факт наличия".
- `config_flags` takes from the source "чтения process.env, config.get, workspace.getConfiguration".
- `config_flags` takes from the source "объявления в package.json contributes.configuration".
- `config_flags` takes from the source "значения по окружениям из файлов развёртывания".
- `config_flags` asks people for "назначение флага и дата, когда его планируют убрать".
- `config_flags` asks people for "владелец флага".
- `config_flags` is derived by rules like "reads_setting(F, 'ROFL_JOBS'). gated_by(Branch, new_cart). affects(S, C) :- reads_setting(F, S), in_component(F, C). stale_flag(Fl) :- flag(Fl), enabled_everywhere(Fl), age_days(Fl, D), D > 180.".
- `config_flags` is kept by people so: "Для каждого флага заведите заметку: зачем он, кто владелец, когда убираем. Яркой стрелкой отметьте флаг, который собираетесь переключить в проде.".
- `config_flags` is kept by an agent so: "Извлекать чтения настроек из кода и значения из файлов окружений; противоречие — ключ читается, но нигде не задан и не имеет значения по умолчанию, или задан, но не читается. Обновлять при каждом изменении конфигов.".
- `config_flags` is recognised by the words "флаг".
- `config_flags` is recognised by the words "настройка".
- `config_flags` is recognised by the words "переменная окружения".
- `config_flags` is recognised by the words "конфиг".
- `config_flags` is recognised by the words "у меня работает".
- `config_flags` is recognised by the words "фичефлаг".
- `config_flags` is chosen by asking "Важно, какие настройки и флаги меняют поведение?".
- `config_flags` is tuned by asking "Только флаги функций или все настройки?".
- `config_flags` is tuned by asking "В каком окружении смотрим значения?".
- `config_flags` is related to `environments`.
- `config_flags` is related to `change_impact`.
- `config_flags` is related to `extension_points`.
- `config_flags` is related to `tech_debt`.

### События и подписки

> Кто посылает какие события и кто на них реагирует, в каком порядке?

Its facts:

- `events` is named "События и подписки".
- `events` is in the family `behaviour`.
- `events` answers "Кто посылает какие события и кто на них реагирует, в каком порядке?".
- `events` is laid out as `lanes`.
- `events` is opened when "Отладка «почему не обновилось», добавление нового подписчика, разбор системы на событиях или сообщениях.".
- `events` comes from "UML sequence".
- `events` comes from "Event storming".
- `events` is read by "разработчики".
- `events` is read by "архитекторы".
- `events` draws a box `lane` meaning "участник: процесс расширения, webview, ядро блокнота, сервис заказов".
- `events` draws a box `event` meaning "событие: «ячейка выполнена», «заказ оплачен»".
- `events` draws a box `handler` meaning "обработчик события".
- `events` joins boxes with a line `emit` meaning "отправка события".
- `events` joins boxes with a line `subscribe` meaning "подписка обработчика на событие".
- `events` joins boxes with a line `reply` meaning "ответ на запрос".
- `events` frames its boxes by "Полосы — работающие части (из вида «Работающие части»); события стоят на полосе отправителя, обработчики — на полосе получателя.".
- `events` colours by "цвет события без подписчиков — серым, без отправителя — красным".
- `events` colours by "число подписчиков на событии".
- `events` keeps the rule "время идёт сверху вниз; порядок — по сценарию или по трассе".
- `events` keeps the rule "события без подписчиков показывать отдельно как «в пустоту»".
- `events` keeps the rule "однотипные события сводить «×N»".
- `events` keeps the rule "не больше 7 полос; остальное — в «прочие»".
- `events` takes from the source "emit/on/addEventListener/postMessage и имена событий".
- `events` takes from the source "трассы выполнения с метками времени".
- `events` asks people for "смысл события словами предметной области".
- `events` asks people for "гарантии доставки (может ли потеряться)".
- `events` is derived by rules like "emits(cell_runner, 'cell/done'). subscribes(renderer, 'cell/done'). flows(A, B, Ev) :- emits(A, Ev), subscribes(B, Ev). orphan_event(Ev) :- emits(_, Ev), not subscribes(_, Ev).".
- `events` is kept by people so: "Называйте события в прошедшем времени («заказ оплачен»), а не командами. Заметкой укажите, что будет, если событие потеряется. Стрелкой — место, куда хотите добавить нового подписчика.".
- `events` is kept by an agent so: "Сопоставлять отправки и подписки по имени события; сообщать о событиях без получателя и подписках без отправителя. Обновлять при изменении кода обработчиков и при новых трассах.".
- `events` is recognised by the words "событие".
- `events` is recognised by the words "подписка".
- `events` is recognised by the words "сообщение".
- `events` is recognised by the words "postMessage".
- `events` is recognised by the words "не обновилось".
- `events` is recognised by the words "шина".
- `events` is chosen by asking "Нужно увидеть, кто кому посылает события и в каком порядке?".
- `events` is tuned by asking "Показывать полосы по процессам или по компонентам?".
- `events` is tuned by asking "По коду или по реальной трассе?".
- `events` is related to `containers`.
- `events` is related to `scenario`.
- `events` is related to `queues_topology`.
- `events` is related to `concurrency`.

### Сквозной сценарий

> Как одна пользовательская история проходит через все части системы?

Its facts:

- `scenario` is named "Сквозной сценарий".
- `scenario` is in the family `behaviour`.
- `scenario` answers "Как одна пользовательская история проходит через все части системы?".
- `scenario` is laid out as `lanes`.
- `scenario` is opened when "Проверка архитектуры на реальном случае, онбординг, объяснение продукту, где тратится время.".
- `scenario` comes from "4+1 scenarios".
- `scenario` is read by "архитекторы".
- `scenario` is read by "разработчики".
- `scenario` is read by "продукт".
- `scenario` is read by "новички".
- `scenario` draws a box `actor` meaning "кто начинает: покупатель, автор блокнота".
- `scenario` draws a box `part` meaning "часть системы, через которую идёт сценарий".
- `scenario` draws a box `step` meaning "шаг сценария: «нажал Выполнить», «ядро вычислило», «webview нарисовал»".
- `scenario` draws a box `note` meaning "пояснение к шагу".
- `scenario` joins boxes with a line `step` meaning "переход к следующему шагу".
- `scenario` joins boxes with a line `calls` meaning "вызов внутри шага".
- `scenario` joins boxes with a line `data` meaning "что передаётся".
- `scenario` frames its boxes by "Шаги группируются в фазы сценария («подготовка», «вычисление», «показ»); полосы — по работающим частям.".
- `scenario` colours by "время каждого шага из трасс".
- `scenario` colours by "значок шага, который может отказать".
- `scenario` keeps the rule "показывать только части, которых касается сценарий".
- `scenario` keeps the rule "шаги одной части подряд сворачивать в один".
- `scenario` keeps the rule "отдельной веткой показывать главный путь отказа".
- `scenario` keeps the rule "не больше 15 шагов на экран".
- `scenario` takes from the source "трасса реального выполнения".
- `scenario` takes from the source "цепочка вызовов от точки входа".
- `scenario` asks people for "какие сценарии главные".
- `scenario` asks people for "названия шагов на языке пользователя".
- `scenario` is derived by rules like "scenario_step(run_cell, 1, ui_click). scenario_step(run_cell, 2, kernel_eval). touches(Sc, P) :- scenario_step(Sc, _, S), step_in(S, P).".
- `scenario` is kept by people so: "Напишите сценарий словами пользователя: 5–10 шагов. На шаг, где пользователь ждёт дольше всего, поставьте яркую стрелку. Заметкой укажите, что видит пользователь при отказе.".
- `scenario` is kept by an agent so: "Сверять описанные шаги с трассами: если в трассе есть часть, которой нет в сценарии, — предложить шаг. Обновлять, когда меняются точки входа сценария.".
- `scenario` is recognised by the words "сценарий".
- `scenario` is recognised by the words "пользователь нажимает".
- `scenario` is recognised by the words "от начала до конца".
- `scenario` is recognised by the words "история".
- `scenario` is recognised by the words "путь запроса".
- `scenario` is chosen by asking "Есть конкретная история пользователя, которую нужно проследить через систему?".
- `scenario` is tuned by asking "Какой сценарий?".
- `scenario` is tuned by asking "Показывать путь отказа?".
- `scenario` is related to `request_lifecycle`.
- `scenario` is related to `events`.
- `scenario` is related to `user_journey`.
- `scenario` is related to `critical_path`.

### Состояния и переходы

> В каких состояниях бывает объект и что переводит его из одного в другое?

Its facts:

- `state_machine` is named "Состояния и переходы".
- `state_machine` is in the family `behaviour`.
- `state_machine` answers "В каких состояниях бывает объект и что переводит его из одного в другое?".
- `state_machine` is laid out as `columns`.
- `state_machine` is opened when "Работа с заказом, сессией, ячейкой блокнота, подключением; поиск «невозможных» состояний и забытых переходов.".
- `state_machine` comes from "UML state machine".
- `state_machine` is read by "разработчики".
- `state_machine` is read by "тестировщики".
- `state_machine` is read by "продукт".
- `state_machine` draws a box `state` meaning "состояние: «новый», «оплачен», «отправлен»; у ячейки — «ждёт», «выполняется», «готово», «ошибка»".
- `state_machine` draws a box `group` meaning "составное состояние, внутри которого свои".
- `state_machine` draws a box `note` meaning "условие или побочный эффект перехода".
- `state_machine` joins boxes with a line `transition` meaning "переход, подпись — событие или действие".
- `state_machine` joins boxes with a line `guarded` meaning "переход при условии".
- `state_machine` joins boxes with a line `missing` meaning "переход, который встречается в данных, но не описан".
- `state_machine` frames its boxes by "Составные состояния — рамки (например «активен» содержит «выполняется» и «пауза»).".
- `state_machine` colours by "число объектов в каждом состоянии из базы".
- `state_machine` colours by "частота переходов из логов".
- `state_machine` keeps the rule "показывать конечные состояния двойной рамкой".
- `state_machine` keeps the rule "выделять состояния, из которых нет выхода".
- `state_machine` keeps the rule "переходы, найденные в коде, но не описанные людьми, — яркие".
- `state_machine` keeps the rule "не больше 12 состояний; детали внутри составных".
- `state_machine` takes from the source "перечисления статусов и присваивания status = ... в коде".
- `state_machine` takes from the source "фактические переходы из журнала событий".
- `state_machine` asks people for "какие переходы разрешены".
- `state_machine` asks people for "смысл каждого состояния".
- `state_machine` is derived by rules like "assigns(F, order_status, paid). allowed(new, paid). allowed(paid, shipped). observed(A, B) :- log_transition(_, A, B). unexpected(A, B) :- observed(A, B), not allowed(A, B).".
- `state_machine` is kept by people so: "Перечислите состояния и разрешённые переходы, а у каждого перехода — кто его вызывает. Заметкой отметьте состояние, о котором спорят. Стрелкой — переход, который добавляете.".
- `state_machine` is kept by an agent so: "Сравнивать разрешённые переходы с присваиваниями в коде и с журналами; любой неожиданный переход и тупиковое состояние сообщать. Обновлять при изменении перечислений статусов.".
- `state_machine` is recognised by the words "статус".
- `state_machine` is recognised by the words "состояние".
- `state_machine` is recognised by the words "переход".
- `state_machine` is recognised by the words "зависло в".
- `state_machine` is recognised by the words "жизненный цикл объекта".
- `state_machine` is chosen by asking "Есть объект со статусами, переходы которого нужно разобрать?".
- `state_machine` is tuned by asking "Для какого объекта?".
- `state_machine` is tuned by asking "Наложить реальные частоты переходов?".
- `state_machine` is related to `data_model`.
- `state_machine` is related to `events`.
- `state_machine` is related to `test_coverage`.
- `state_machine` is related to `request_lifecycle`.

### Жизнь запроса

> Через какие слои и обработчики проходит один запрос и что с ним делают на каждом?

Its facts:

- `request_lifecycle` is named "Жизнь запроса".
- `request_lifecycle` is in the family `behaviour`.
- `request_lifecycle` answers "Через какие слои и обработчики проходит один запрос и что с ним делают на каждом?".
- `request_lifecycle` is laid out as `layered_down`.
- `request_lifecycle` is opened when "Добавление проверки, логирования или ограничения частоты; разбор, где запрос теряет время или права.".
- `request_lifecycle` is read by "разработчики".
- `request_lifecycle` is read by "эксплуатация".
- `request_lifecycle` is read by "безопасность".
- `request_lifecycle` draws a box `stage` meaning "этап: балансировщик, проверка входа, промежуточный обработчик, контроллер, база".
- `request_lifecycle` draws a box `handler` meaning "конкретная функция-обработчик".
- `request_lifecycle` draws a box `note` meaning "что этап добавляет или проверяет".
- `request_lifecycle` joins boxes with a line `pass` meaning "запрос передан дальше".
- `request_lifecycle` joins boxes with a line `reject` meaning "запрос отклонён с кодом ответа".
- `request_lifecycle` joins boxes with a line `response` meaning "ответ идёт обратно".
- `request_lifecycle` frames its boxes by "Этапы по порядку слева направо; внутри этапа — его обработчики; для блокнота: команда VS Code → процесс расширения → rofl-lsp → ядро → webview.".
- `request_lifecycle` colours by "среднее время на этапе".
- `request_lifecycle` colours by "доля отказов на этапе".
- `request_lifecycle` keeps the rule "показывать порядок промежуточных обработчиков так, как он задан в коде".
- `request_lifecycle` keeps the rule "выделять этап, где проверяются права".
- `request_lifecycle` keeps the rule "ветки отказа — отдельными линиями вниз".
- `request_lifecycle` keeps the rule "не больше 10 этапов".
- `request_lifecycle` takes from the source "регистрация middleware и маршрутов".
- `request_lifecycle` takes from the source "трассы с временами этапов".
- `request_lifecycle` asks people for "какие проверки должны быть на каждом этапе".
- `request_lifecycle` is derived by rules like "middleware(app, 1, rate_limit). middleware(app, 2, auth). route(app, '/orders', create_order). before(A, B) :- middleware(App, I, A), middleware(App, J, B), I < J.".
- `request_lifecycle` is kept by people so: "Отметьте на этапе, что он гарантирует следующему («дальше пользователь уже известен»). Стрелкой — этап, куда хотите встроить новую проверку.".
- `request_lifecycle` is kept by an agent so: "Строить цепочку из регистрации обработчиков, проверять, что проверка прав стоит до любого доступа к данным. Обновлять при изменении маршрутов.".
- `request_lifecycle` is recognised by the words "запрос".
- `request_lifecycle` is recognised by the words "middleware".
- `request_lifecycle` is recognised by the words "обработчик".
- `request_lifecycle` is recognised by the words "pipeline".
- `request_lifecycle` is recognised by the words "где проверяются права".
- `request_lifecycle` is chosen by asking "Нужно проследить путь одного запроса через обработчики?".
- `request_lifecycle` is tuned by asking "Какой маршрут или команда?".
- `request_lifecycle` is tuned by asking "Показывать обратный путь ответа?".
- `request_lifecycle` is related to `scenario`.
- `request_lifecycle` is related to `error_propagation`.
- `request_lifecycle` is related to `critical_path`.
- `request_lifecycle` is related to `attack_surface`.

### Ошибки и отказы

> Где возникают ошибки, куда они летят, где их ловят и что видит пользователь?

Its facts:

- `error_propagation` is named "Ошибки и отказы".
- `error_propagation` is in the family `behaviour`.
- `error_propagation` answers "Где возникают ошибки, куда они летят, где их ловят и что видит пользователь?".
- `error_propagation` is laid out as `layered_down`.
- `error_propagation` is opened when "После инцидента, перед релизом, при жалобах «ошибка пропала молча», при планировании повторных попыток и таймаутов.".
- `error_propagation` comes from "FMEA".
- `error_propagation` is read by "разработчики".
- `error_propagation` is read by "эксплуатация".
- `error_propagation` is read by "тестировщики".
- `error_propagation` is read by "архитекторы".
- `error_propagation` draws a box `source` meaning "место, где ошибка возникает: throw, отказ сети, таймаут".
- `error_propagation` draws a box `catch` meaning "место, где её ловят: try/catch, обработчик ответа".
- `error_propagation` draws a box `surface` meaning "что видит человек: сообщение в VS Code, страница 500, пустая ячейка".
- `error_propagation` draws a box `part` meaning "работающая часть".
- `error_propagation` joins boxes with a line `propagates` meaning "ошибка поднимается выше".
- `error_propagation` joins boxes with a line `swallowed` meaning "ошибка поймана и потеряна".
- `error_propagation` joins boxes with a line `retry` meaning "повторная попытка".
- `error_propagation` frames its boxes by "По работающим частям; внутри — функции, через которые проходит ошибка.".
- `error_propagation` colours by "частота ошибки из логов".
- `error_propagation` colours by "красным — пути, где ошибка не доходит до пользователя и до журнала".
- `error_propagation` keeps the rule "показывать только пути от места возникновения до места поимки".
- `error_propagation` keeps the rule "выделять пустые catch и catch без журнала".
- `error_propagation` keeps the rule "для каждой внешней зависимости показывать, что будет при её отказе".
- `error_propagation` keeps the rule "отказы одного вида сводить «×N»".
- `error_propagation` takes from the source "throw/catch/reject/Result из кода".
- `error_propagation` takes from the source "тексты ошибок в логах и их частота".
- `error_propagation` asks people for "ожидаемое поведение при отказе каждой зависимости".
- `error_propagation` is derived by rules like "throws(F, timeout). catches(G, timeout). calls(G, F). swallowed(F, E) :- catches(F, E), not logs(F), not rethrows(F, E). reaches_user(E) :- shown_to_user(H, E), catches(H, E).".
- `error_propagation` is kept by people so: "Для каждой внешней зависимости запишите заметкой «если она упала, то…». Стрелкой отметьте место, где ошибка теряется молча.".
- `error_propagation` is kept by an agent so: "Строить пути от throw до catch по графу вызовов, сообщать о проглоченных ошибках и о путях без пользовательского сообщения. Сверять с журналами: ошибки, которых нет в коде, — подозрение на чужой код.".
- `error_propagation` is recognised by the words "ошибка".
- `error_propagation` is recognised by the words "исключение".
- `error_propagation` is recognised by the words "упало".
- `error_propagation` is recognised by the words "молча".
- `error_propagation` is recognised by the words "таймаут".
- `error_propagation` is recognised by the words "отказ".
- `error_propagation` is recognised by the words "retry".
- `error_propagation` is chosen by asking "Нужно понять, где ошибки возникают и куда пропадают?".
- `error_propagation` is tuned by asking "Только необработанные ошибки?".
- `error_propagation` is tuned by asking "Наложить частоту из логов?".
- `error_propagation` is related to `spof`.
- `error_propagation` is related to `incident_timeline`.
- `error_propagation` is related to `request_lifecycle`.
- `error_propagation` is related to `observability`.

### Параллельность и потоки

> Что выполняется одновременно, что делит общие данные и где возможны гонки и блокировки?

Its facts:

- `concurrency` is named "Параллельность и потоки".
- `concurrency` is in the family `behaviour`.
- `concurrency` answers "Что выполняется одновременно, что делит общие данные и где возможны гонки и блокировки?".
- `concurrency` is laid out as `lanes`.
- `concurrency` is opened when "Странные редкие ошибки, зависания, перенос работы в рабочий поток, распараллеливание вычислений.".
- `concurrency` comes from "4+1 process".
- `concurrency` is read by "разработчики".
- `concurrency` is read by "архитекторы".
- `concurrency` draws a box `thread` meaning "поток или цикл событий: главный поток расширения, worker thread, пул в rofl-lsp".
- `concurrency` draws a box `task` meaning "задача, которая выполняется в потоке".
- `concurrency` draws a box `shared` meaning "общий ресурс: переменная, файл, таблица, SharedArrayBuffer".
- `concurrency` draws a box `lock` meaning "блокировка или очередь, защищающая ресурс".
- `concurrency` joins boxes with a line `accesses` meaning "задача читает или пишет общий ресурс".
- `concurrency` joins boxes with a line `awaits` meaning "задача ждёт другую".
- `concurrency` joins boxes with a line `unguarded` meaning "запись в общий ресурс без защиты".
- `concurrency` frames its boxes by "Полосы — потоки; общие ресурсы между полосами; задачи — по полосам, где выполняются.".
- `concurrency` colours by "значок ресурса, к которому пишут из двух потоков".
- `concurrency` colours by "время ожидания блокировок".
- `concurrency` keeps the rule "показывать только ресурсы, которых касаются минимум два потока".
- `concurrency` keeps the rule "выделять циклы ожидания".
- `concurrency` keeps the rule "долгие задачи в главном потоке подсвечивать".
- `concurrency` takes from the source "места создания потоков и пулов".
- `concurrency` takes from the source "обращения к общим данным".
- `concurrency` takes from the source "профили: время в ожидании".
- `concurrency` asks people for "какие ресурсы считаются потокобезопасными".
- `concurrency` is derived by rules like "writes_in(T1, cache). writes_in(T2, cache). race(R) :- writes_in(A, R), accesses_in(B, R), A != B, not guarded(R).".
- `concurrency` is kept by people so: "Отметьте заметкой правило для общего ресурса («пишет только главный поток»). Стрелкой — место предполагаемой гонки.".
- `concurrency` is kept by an agent so: "Находить ресурсы, к которым обращаются из разных потоков, и проверять заявленные правила. Обновлять при появлении новых потоков или общих данных.".
- `concurrency` is recognised by the words "поток".
- `concurrency` is recognised by the words "гонка".
- `concurrency` is recognised by the words "параллельно".
- `concurrency` is recognised by the words "зависает".
- `concurrency` is recognised by the words "блокировка".
- `concurrency` is recognised by the words "deadlock".
- `concurrency` is recognised by the words "async".
- `concurrency` is chosen by asking "Подозрение на гонку или блокировку между потоками?".
- `concurrency` is tuned by asking "Какие потоки показать?".
- `concurrency` is tuned by asking "Только записи или и чтения?".
- `concurrency` is related to `containers`.
- `concurrency` is related to `events`.
- `concurrency` is related to `critical_path`.
- `concurrency` is related to `queues_topology`.

### Потоки данных

> Откуда приходят данные, где их преобразуют и где хранят?

Its facts:

- `data_flow` is named "Потоки данных".
- `data_flow` is in the family `data`.
- `data_flow` answers "Откуда приходят данные, где их преобразуют и где хранят?".
- `data_flow` is laid out as `layered_down`.
- `data_flow` is opened when "Проектирование новой обработки, аудит данных, поиск, где данные портятся или дублируются.".
- `data_flow` comes from "DFD".
- `data_flow` is read by "архитекторы".
- `data_flow` is read by "разработчики".
- `data_flow` is read by "аналитики данных".
- `data_flow` is read by "безопасность".
- `data_flow` draws a box `source` meaning "внешний источник или получатель: покупатель, платёжный шлюз, файл .rofl.md".
- `data_flow` draws a box `process` meaning "преобразование: «рассчитать скидку», «разобрать ячейку», «вычислить факты»".
- `data_flow` draws a box `store` meaning "хранилище: таблица заказов, кэш результатов ячеек".
- `data_flow` draws a box `boundary` meaning "граница доверия или системы".
- `data_flow` joins boxes with a line `data` meaning "поток данных, подпись — что именно течёт: «заказ», «текст ячейки»".
- `data_flow` joins boxes with a line `write` meaning "запись в хранилище".
- `data_flow` joins boxes with a line `read` meaning "чтение из хранилища".
- `data_flow` frames its boxes by "Преобразования группируются по работающим частям; уровни подробности — как в DFD: контекст, затем каждое преобразование раскрывается в своё.".
- `data_flow` colours by "значок личных данных на потоке".
- `data_flow` colours by "объём потока в день".
- `data_flow` keeps the rule "каждый поток подписан существительным — названием данных".
- `data_flow` keeps the rule "хранилище без чтения или без записи подсвечивать".
- `data_flow` keeps the rule "не смешивать управление и данные: вызовы без передачи данных скрыты".
- `data_flow` keeps the rule "не больше 9 преобразований на уровне".
- `data_flow` takes from the source "чтения и записи в базы и файлы из кода".
- `data_flow` takes from the source "аргументы и возвращаемые типы функций, передающих данные".
- `data_flow` asks people for "названия данных на языке предметной области".
- `data_flow` asks people for "какие хранилища главные, а какие копии".
- `data_flow` is derived by rules like "writes(create_order, orders_table, order). reads(ship, orders_table, order). flows(A, B, D) :- writes(A, S, D), reads(B, S, D).".
- `data_flow` is kept by people so: "Подписывайте каждый поток тем, что течёт, а не тем, как («заказ», а не «HTTP POST»). Заметкой отметьте хранилище, которое считается главным источником правды.".
- `data_flow` is kept by an agent so: "Связывать записи и чтения через хранилища, искать хранилища, в которые пишут, но не читают. Сверять названия данных со словарём. Обновлять при изменении схем и запросов.".
- `data_flow` is recognised by the words "данные".
- `data_flow` is recognised by the words "откуда берётся".
- `data_flow` is recognised by the words "куда пишется".
- `data_flow` is recognised by the words "хранилище".
- `data_flow` is recognised by the words "поток данных".
- `data_flow` is recognised by the words "ETL".
- `data_flow` is chosen by asking "Нужно увидеть, как данные движутся между частями и хранилищами?".
- `data_flow` is tuned by asking "Какие данные отслеживаем?".
- `data_flow` is tuned by asking "Показывать чтения или только записи?".
- `data_flow` is related to `data_model`.
- `data_flow` is related to `data_lineage`.
- `data_flow` is related to `pii_map`.
- `data_flow` is related to `caching`.

### Модель данных

> Какие сущности хранятся, как они связаны и кто ими владеет?

Its facts:

- `data_model` is named "Модель данных".
- `data_model` is in the family `data`.
- `data_model` answers "Какие сущности хранятся, как они связаны и кто ими владеет?".
- `data_model` is laid out as `layered_down`.
- `data_model` is opened when "Добавление поля или таблицы, интеграция по данным, разговор о терминах с продуктом.".
- `data_model` comes from "ER".
- `data_model` is read by "разработчики".
- `data_model` is read by "архитекторы".
- `data_model` is read by "аналитики данных".
- `data_model` is read by "продукт".
- `data_model` draws a box `entity` meaning "сущность: покупатель, заказ, позиция заказа; у блокнота — ячейка, факт, правило".
- `data_model` draws a box `aggregate` meaning "группа сущностей, которые меняются вместе".
- `data_model` draws a box `field` meaning "поле, видно при раскрытии сущности".
- `data_model` joins boxes with a line `has` meaning "связь один-ко-многим".
- `data_model` joins boxes with a line `refers` meaning "ссылка по ключу".
- `data_model` joins boxes with a line `derived` meaning "сущность вычисляется из другой".
- `data_model` frames its boxes by "По агрегатам или по сервису-владельцу таблицы; поля видны, только когда сущность раскрыта.".
- `data_model` colours by "число записей".
- `data_model` colours by "значок личных данных на полях".
- `data_model` keeps the rule "служебные поля (created_at, id) скрыты по умолчанию".
- `data_model` keeps the rule "связи между агрегатами разных сервисов выделять — это точки сцепления".
- `data_model` keeps the rule "сущности без связей уводить в сторону".
- `data_model` keeps the rule "не больше 12 сущностей в рамке".
- `data_model` takes from the source "схемы БД, миграции, ORM-модели, типы TypeScript и Rust".
- `data_model` takes from the source "внешние ключи".
- `data_model` asks people for "смысл сущностей и их границы".
- `data_model` asks people for "владелец агрегата".
- `data_model` is derived by rules like "table(orders). column(orders, customer_id). fk(orders, customer_id, customers). links(A, B) :- fk(A, _, B). cross_owner(A, B) :- links(A, B), owner(A, O1), owner(B, O2), O1 != O2.".
- `data_model` is kept by people so: "Для каждой сущности одна фраза: что это для бизнеса. Если одно слово значит разные вещи в двух сервисах, поставьте заметку и свяжите с видом «Словарь».".
- `data_model` is kept by an agent so: "Извлекать схемы из миграций и типов, сравнивать типы в коде со схемой базы; расхождение полей отмечать. Обновлять при каждой миграции.".
- `data_model` is recognised by the words "таблица".
- `data_model` is recognised by the words "сущность".
- `data_model` is recognised by the words "схема".
- `data_model` is recognised by the words "поле".
- `data_model` is recognised by the words "ER".
- `data_model` is recognised by the words "модель данных".
- `data_model` is chosen by asking "Нужна картина сущностей и связей между ними?".
- `data_model` is tuned by asking "Показывать поля?".
- `data_model` is tuned by asking "По агрегатам или по сервисам?".
- `data_model` is related to `data_flow`.
- `data_model` is related to `schema_evolution`.
- `data_model` is related to `glossary`.
- `data_model` is related to `state_machine`.

### Происхождение данных

> Из чего и через какие шаги получено это число, поле или отчёт?

Its facts:

- `data_lineage` is named "Происхождение данных".
- `data_lineage` is in the family `data`.
- `data_lineage` answers "Из чего и через какие шаги получено это число, поле или отчёт?".
- `data_lineage` is laid out as `layered_right`.
- `data_lineage` is opened when "Число в отчёте выглядит неправильно; перед изменением исходной таблицы — понять, какие отчёты сломаются.".
- `data_lineage` comes from "Data lineage".
- `data_lineage` is read by "аналитики данных".
- `data_lineage` is read by "менеджмент".
- `data_lineage` is read by "разработчики".
- `data_lineage` draws a box `dataset` meaning "набор данных: таблица, витрина, файл выгрузки, отчёт «выручка за неделю»".
- `data_lineage` draws a box `column` meaning "поле внутри набора".
- `data_lineage` draws a box `job` meaning "задача, которая строит набор: SQL-скрипт, ночная выгрузка".
- `data_lineage` joins boxes with a line `derives` meaning "поле получено из поля".
- `data_lineage` joins boxes with a line `filters` meaning "данные отфильтрованы условием".
- `data_lineage` joins boxes with a line `built_by` meaning "набор построен задачей".
- `data_lineage` frames its boxes by "По системам хранения (база магазина, хранилище аналитики, BI); внутри — наборы и их поля.".
- `data_lineage` colours by "свежесть каждого набора".
- `data_lineage` colours by "красным — наборы, построенные с ошибкой".
- `data_lineage` keeps the rule "от выбранного поля показывать только предков (или только потомков)".
- `data_lineage` keeps the rule "промежуточные временные таблицы сворачивать".
- `data_lineage` keeps the rule "выделять места, где данные агрегируются или теряются строки".
- `data_lineage` takes from the source "разбор SQL и скриптов выгрузок".
- `data_lineage` takes from the source "журнал запусков задач".
- `data_lineage` asks people for "какие отчёты важны и кто их смотрит".
- `data_lineage` is derived by rules like "derives(rev_report.total, orders.amount). derives(orders.amount, items.price). upstream(X, Y) :- derives(X, Y). upstream(X, Z) :- upstream(X, Y), derives(Y, Z).".
- `data_lineage` is kept by people so: "Заметкой опишите, как число должно считаться словами бизнеса; стрелкой отметьте шаг, которому не доверяете.".
- `data_lineage` is kept by an agent so: "Разбирать SQL и строить связи поле-к-полю, проверять, что описание словами совпадает с фильтрами в коде. Обновлять при изменении скриптов.".
- `data_lineage` is recognised by the words "откуда это число".
- `data_lineage` is recognised by the words "отчёт неправильный".
- `data_lineage` is recognised by the words "витрина".
- `data_lineage` is recognised by the words "происхождение".
- `data_lineage` is recognised by the words "lineage".
- `data_lineage` is chosen by asking "Нужно понять, откуда взялось конкретное число или поле?".
- `data_lineage` is tuned by asking "Показывать предков или потомков?".
- `data_lineage` is tuned by asking "До какой глубины?".
- `data_lineage` is related to `data_flow`.
- `data_lineage` is related to `why`.
- `data_lineage` is related to `schema_evolution`.
- `data_lineage` is related to `pii_map`.

### Изменения схем

> Как менялись схемы данных и форматы сообщений, и кто сломается от следующего изменения?

Its facts:

- `schema_evolution` is named "Изменения схем".
- `schema_evolution` is in the family `data`.
- `schema_evolution` answers "Как менялись схемы данных и форматы сообщений, и кто сломается от следующего изменения?".
- `schema_evolution` is laid out as `timeline`.
- `schema_evolution` is opened when "Перед миграцией, удалением поля, изменением формата сообщения между процессами или API.".
- `schema_evolution` is read by "разработчики".
- `schema_evolution` is read by "архитекторы".
- `schema_evolution` draws a box `version` meaning "версия схемы или формата".
- `schema_evolution` draws a box `field` meaning "поле в версии".
- `schema_evolution` draws a box `consumer` meaning "код или система, которые читают поле".
- `schema_evolution` joins boxes with a line `added` meaning "поле появилось".
- `schema_evolution` joins boxes with a line `removed` meaning "поле удалено".
- `schema_evolution` joins boxes with a line `reads` meaning "потребитель читает поле".
- `schema_evolution` frames its boxes by "Столбцы — версии по времени; строки — поля, сгруппированные по сущности.".
- `schema_evolution` colours by "красным — поля, которые удалены, но ещё читаются".
- `schema_evolution` colours by "значок несовместимого изменения".
- `schema_evolution` keeps the rule "показывать только поля, менявшиеся в выбранный период".
- `schema_evolution` keeps the rule "несовместимые изменения выделять ярко".
- `schema_evolution` keeps the rule "щелчок по полю — список читателей".
- `schema_evolution` takes from the source "история миграций и файлов схем в git".
- `schema_evolution` takes from the source "чтения полей в коде".
- `schema_evolution` asks people for "какие версии ещё работают у клиентов".
- `schema_evolution` is derived by rules like "field_in(v3, orders, discount). field_in(v4, orders, promo). removed(F, V2) :- field_in(V1, T, F), next(V1, V2), not field_in(V2, T, F). breaks(C, F) :- removed(F, _), reads_field(C, F).".
- `schema_evolution` is kept by people so: "Для каждого несовместимого изменения напишите заметку: как переходят старые клиенты. Стрелкой отметьте поле, которое планируете удалить.".
- `schema_evolution` is kept by an agent so: "Сравнивать соседние версии схем, искать читателей удалённых полей; любое такое чтение — блокер. Обновлять при каждой миграции.".
- `schema_evolution` is recognised by the words "миграция схемы".
- `schema_evolution` is recognised by the words "удалить поле".
- `schema_evolution` is recognised by the words "формат сообщения".
- `schema_evolution` is recognised by the words "обратная совместимость".
- `schema_evolution` is recognised by the words "версия API".
- `schema_evolution` is chosen by asking "Собираетесь менять схему или формат и боитесь сломать читателей?".
- `schema_evolution` is tuned by asking "За какой период?".
- `schema_evolution` is tuned by asking "Какая сущность или формат?".
- `schema_evolution` is related to `data_model`.
- `schema_evolution` is related to `api_surface`.
- `schema_evolution` is related to `change_impact`.
- `schema_evolution` is related to `release_diff`.

### Кэши

> Где данные копируются в кэш, как они устаревают и кто их сбрасывает?

Its facts:

- `caching` is named "Кэши".
- `caching` is in the family `data`.
- `caching` answers "Где данные копируются в кэш, как они устаревают и кто их сбрасывает?".
- `caching` is laid out as `layered_right`.
- `caching` is opened when "Жалобы на устаревшие данные, рост памяти, ускорение медленного места.".
- `caching` is read by "разработчики".
- `caching` is read by "эксплуатация".
- `caching` draws a box `cache` meaning "кэш: Redis, память процесса, кэш результатов ячеек блокнота, CDN".
- `caching` draws a box `source` meaning "источник правды, который кэшируется".
- `caching` draws a box `invalidator` meaning "код, который сбрасывает кэш".
- `caching` joins boxes with a line `fills` meaning "кэш заполняется из источника".
- `caching` joins boxes with a line `invalidates` meaning "сброс кэша".
- `caching` joins boxes with a line `stale` meaning "путь, где изменение источника не сбрасывает кэш".
- `caching` frames its boxes by "По работающим частям; кэш стоит в рамке той части, в памяти которой живёт.".
- `caching` colours by "доля попаданий".
- `caching` colours by "время жизни записей".
- `caching` keeps the rule "для каждого кэша показывать источник и все места сброса".
- `caching` keeps the rule "запись в источник без сброса кэша — яркая линия".
- `caching` keeps the rule "кэши в нескольких слоях подряд выделять".
- `caching` takes from the source "обращения к кэш-клиентам и мемоизация в коде".
- `caching` takes from the source "метрики попаданий".
- `caching` asks people for "допустимое время устаревания".
- `caching` is derived by rules like "caches(result_cache, cell_output). writes_source(edit_cell, cell_output). stale_path(W, C) :- writes_source(W, S), caches(C, S), not invalidates(W, C).".
- `caching` is kept by people so: "Для каждого кэша заметка: «можно показывать старое до N секунд». Стрелкой — место, где пользователи видели устаревшее.".
- `caching` is kept by an agent so: "Находить записи в источник без сброса соответствующего кэша, сверять с заявленным временем устаревания. Обновлять при изменении кода кэшей.".
- `caching` is recognised by the words "кэш".
- `caching` is recognised by the words "устаревшие данные".
- `caching` is recognised by the words "не обновляется".
- `caching` is recognised by the words "память растёт".
- `caching` is recognised by the words "CDN".
- `caching` is chosen by asking "Проблема с устаревшими данными или с кэшем?".
- `caching` is tuned by asking "Какие кэши показать?".
- `caching` is tuned by asking "Наложить метрики попаданий?".
- `caching` is related to `data_flow`.
- `caching` is related to `critical_path`.
- `caching` is related to `containers`.

### Развёртывание

> На каких машинах, в каких облаках и сетях работает каждая часть?

Its facts:

- `deployment` is named "Развёртывание".
- `deployment` is in the family `operations`.
- `deployment` answers "На каких машинах, в каких облаках и сетях работает каждая часть?".
- `deployment` is laid out as `layered_down`.
- `deployment` is opened when "Планирование мощностей, перенос в другое облако, разбор сетевых проблем, аудит.".
- `deployment` comes from "C4 deployment".
- `deployment` comes from "4+1 physical".
- `deployment` is read by "эксплуатация".
- `deployment` is read by "архитекторы".
- `deployment` is read by "безопасность".
- `deployment` draws a box `node` meaning "машина, кластер, под, браузер пользователя, ноутбук с VS Code".
- `deployment` draws a box `zone` meaning "сеть или зона доступности".
- `deployment` draws a box `instance` meaning "экземпляр работающей части на узле".
- `deployment` joins boxes with a line `network` meaning "сетевое соединение, подпись — порт и протокол".
- `deployment` joins boxes with a line `replica` meaning "копия того же экземпляра".
- `deployment` frames its boxes by "Облако → регион → сеть → узел → экземпляры; для расширения: машина пользователя → VS Code → процессы.".
- `deployment` colours by "нагрузка узла".
- `deployment` colours by "стоимость узла в месяц".
- `deployment` keeps the rule "одинаковые реплики сводить «×N»".
- `deployment` keeps the rule "показывать открытые наружу порты".
- `deployment` keeps the rule "не показывать узлы без экземпляров".
- `deployment` takes from the source "манифесты Kubernetes, Terraform, docker-compose".
- `deployment` takes from the source "список узлов от облака".
- `deployment` asks people for "где развёрнуто то, чего нет в коде инфраструктуры".
- `deployment` is derived by rules like "deploys(orders_svc, k8s_prod, 3). node_in(k8s_prod, eu_west). runs_on(Part, Zone) :- deploys(Part, Cluster, _), node_in(Cluster, Zone).".
- `deployment` is kept by people so: "Отметьте заметкой всё, что настроено руками, а не кодом. Стрелкой — узел, который планируете переносить.".
- `deployment` is kept by an agent so: "Строить вид из кода инфраструктуры и сравнивать с реальным списком ресурсов облака; ресурс без кода — дрейф. Обновлять при каждом применении изменений инфраструктуры.".
- `deployment` is recognised by the words "сервер".
- `deployment` is recognised by the words "кластер".
- `deployment` is recognised by the words "облако".
- `deployment` is recognised by the words "kubernetes".
- `deployment` is recognised by the words "где развёрнуто".
- `deployment` is recognised by the words "регион".
- `deployment` is chosen by asking "Нужно увидеть, где физически работают части системы?".
- `deployment` is tuned by asking "Какое окружение?".
- `deployment` is tuned by asking "До какого уровня: облако, узел, под?".
- `deployment` is related to `containers`.
- `deployment` is related to `environments`.
- `deployment` is related to `cost_map`.
- `deployment` is related to `spof`.

### Окружения

> Чем отличаются окружения: что где развёрнуто, с какими версиями и настройками?

Its facts:

- `environments` is named "Окружения".
- `environments` is in the family `operations`.
- `environments` answers "Чем отличаются окружения: что где развёрнуто, с какими версиями и настройками?".
- `environments` is laid out as `matrix`.
- `environments` is opened when "«На стенде работает, в проде нет», подготовка релиза, проверка, что тестовая среда похожа на боевую.".
- `environments` is read by "эксплуатация".
- `environments` is read by "разработчики".
- `environments` is read by "тестировщики".
- `environments` draws a box `env` meaning "окружение: локальное, тестовое, предпрод, прод".
- `environments` draws a box `part` meaning "работающая часть или настройка".
- `environments` draws a box `value` meaning "версия или значение в клетке".
- `environments` joins boxes with a line `differs` meaning "значение отличается от прода".
- `environments` frames its boxes by "Строки — части и настройки, сгруппированные по компонентам; столбцы — окружения.".
- `environments` colours by "цвет клеток, отличающихся от прода".
- `environments` colours by "возраст версии".
- `environments` keeps the rule "по умолчанию показывать только строки с различиями".
- `environments` keeps the rule "секреты — только «задан/не задан»".
- `environments` keeps the rule "сравнивать каждое окружение с выбранным эталоном".
- `environments` takes from the source "версии развёртываний из CI и кластера".
- `environments` takes from the source "значения конфигов по окружениям".
- `environments` asks people for "назначение каждого окружения".
- `environments` asks people for "допустимые различия".
- `environments` is derived by rules like "version_in(orders_svc, prod, '1.8'). version_in(orders_svc, stage, '1.9'). differs(P, E) :- version_in(P, E, V1), version_in(P, prod, V2), V1 != V2.".
- `environments` is kept by people so: "Запишите заметкой допустимые различия («на тесте платежи заглушены»). Всё прочее различие — повод разобраться.".
- `environments` is kept by an agent so: "Собирать версии и настройки с каждого окружения, отмечать различия, которые не объявлены допустимыми. Обновлять после каждого развёртывания.".
- `environments` is recognised by the words "стенд".
- `environments` is recognised by the words "прод".
- `environments` is recognised by the words "окружение".
- `environments` is recognised by the words "на тесте работает".
- `environments` is recognised by the words "staging".
- `environments` is chosen by asking "Нужно сравнить окружения между собой?".
- `environments` is tuned by asking "Какое окружение эталон?".
- `environments` is tuned by asking "Только различия или всё?".
- `environments` is related to `config_flags`.
- `environments` is related to `deployment`.
- `environments` is related to `ci_cd`.
- `environments` is related to `release_diff`.

### Сборка и доставка

> Как изменение проходит путь от коммита до пользователей, где оно ждёт и где падает?

Its facts:

- `ci_cd` is named "Сборка и доставка".
- `ci_cd` is in the family `operations`.
- `ci_cd` answers "Как изменение проходит путь от коммита до пользователей, где оно ждёт и где падает?".
- `ci_cd` is laid out as `layered_down`.
- `ci_cd` is opened when "Медленная или нестабильная сборка, настройка нового конвейера, вопрос «почему релиз занимает неделю».".
- `ci_cd` is read by "разработчики".
- `ci_cd` is read by "эксплуатация".
- `ci_cd` is read by "менеджмент".
- `ci_cd` draws a box `stage` meaning "этап: сборка, тесты, проверки, публикация в маркетплейс VS Code, развёртывание".
- `ci_cd` draws a box `job` meaning "задача внутри этапа".
- `ci_cd` draws a box `gate` meaning "ручное согласование или обязательная проверка".
- `ci_cd` joins boxes with a line `next` meaning "следующий этап".
- `ci_cd` joins boxes with a line `needs` meaning "задача ждёт другую".
- `ci_cd` joins boxes with a line `artifact` meaning "передача артефакта сборки".
- `ci_cd` frames its boxes by "Этапы по порядку; задачи внутри этапов; параллельные задачи одна под другой.".
- `ci_cd` colours by "среднее время задачи".
- `ci_cd` colours by "доля падений".
- `ci_cd` colours by "нестабильные тесты".
- `ci_cd` keeps the rule "выделять самую длинную цепочку ожидания".
- `ci_cd` keeps the rule "задачи, падающие чаще 5%, — красным".
- `ci_cd` keeps the rule "ручные шлюзы — отдельным значком с указанием, кто согласует".
- `ci_cd` takes from the source "файлы конвейеров (GitHub Actions, GitLab CI)".
- `ci_cd` takes from the source "история запусков, времена и результаты".
- `ci_cd` asks people for "кто согласует ручные шлюзы".
- `ci_cd` asks people for "целевое время от коммита до прода".
- `ci_cd` is derived by rules like "job(build). job(test_rust). needs(test_rust, build). duration(build, 240). path_time(J, T) :- job(J), not needs(J, _), duration(J, T). path_time(J, T) :- needs(J, P), path_time(P, T0), duration(J, D), T = T0 + D.".
- `ci_cd` is kept by people so: "Заметкой укажите целевое время каждого этапа. Стрелкой — этап, который хотите ускорить или убрать.".
- `ci_cd` is kept by an agent so: "Разбирать файлы конвейеров и историю запусков, считать длинную цепочку и нестабильные задачи; задача в файле без запусков за месяц — мёртвая. Обновлять ежедневно.".
- `ci_cd` is recognised by the words "сборка".
- `ci_cd` is recognised by the words "CI".
- `ci_cd` is recognised by the words "пайплайн".
- `ci_cd` is recognised by the words "релиз долго".
- `ci_cd` is recognised by the words "тесты падают".
- `ci_cd` is recognised by the words "деплой".
- `ci_cd` is chosen by asking "Интересует путь изменения от коммита до пользователей?".
- `ci_cd` is tuned by asking "За какой период статистика?".
- `ci_cd` is tuned by asking "Какая ветка или конвейер?".
- `ci_cd` is related to `environments`.
- `ci_cd` is related to `test_coverage`.
- `ci_cd` is related to `release_diff`.
- `ci_cd` is related to `supply_chain`.

### Живая карта сервисов

> Кто кого вызывает прямо сейчас, с какой частотой, задержкой и ошибками?

Its facts:

- `live_service_map` is named "Живая карта сервисов".
- `live_service_map` is in the family `operations`.
- `live_service_map` answers "Кто кого вызывает прямо сейчас, с какой частотой, задержкой и ошибками?".
- `live_service_map` is laid out as `layered_right`.
- `live_service_map` is opened when "Дежурство, разбор деградации, сверка «как задумано» с «как работает».".
- `live_service_map` is read by "эксплуатация".
- `live_service_map` is read by "разработчики".
- `live_service_map` is read by "архитекторы".
- `live_service_map` draws a box `service` meaning "сервис или процесс, как его видят трассы".
- `live_service_map` draws a box `dependency` meaning "база, очередь, внешний API".
- `live_service_map` draws a box `group` meaning "команда или домен".
- `live_service_map` joins boxes with a line `call` meaning "наблюдаемые вызовы, толщина — частота".
- `live_service_map` joins boxes with a line `erroring` meaning "вызовы с ошибками выше порога".
- `live_service_map` joins boxes with a line `expected` meaning "вызов есть в коде, но не виден в трассах".
- `live_service_map` frames its boxes by "По доменам или командам; можно переключить на рамки из вида «Работающие части».".
- `live_service_map` colours by "задержка p95 цветом линии".
- `live_service_map` colours by "доля ошибок на коробке".
- `live_service_map` keeps the rule "толщина линии по логарифму частоты".
- `live_service_map` keeps the rule "линии без трафика за час скрывать или показывать пунктиром".
- `live_service_map` keeps the rule "сравнение с кодом: вызовы в трассах, которых нет в коде, — подсветить".
- `live_service_map` takes from the source "распределённые трассы (OpenTelemetry)".
- `live_service_map` takes from the source "метрики сервисов".
- `live_service_map` asks people for "пороги «нормальной» задержки и ошибок".
- `live_service_map` is derived by rules like "span_call(checkout, payments, 1200, 340). static_call(checkout, payments). unseen(A, B) :- static_call(A, B), not span_call(A, B, _, _). unexpected(A, B) :- span_call(A, B, _, _), not static_call(A, B).".
- `live_service_map` is kept by people so: "Задайте пороги нормы на ключевых линиях. Стрелкой отметьте зависимость, которая сейчас тревожит.".
- `live_service_map` is kept by an agent so: "Подтягивать трассы и метрики, сверять с вызовами из кода; расхождения сообщать. Обновлять непрерывно, хранить срезы для инцидентов.".
- `live_service_map` is recognised by the words "сейчас".
- `live_service_map` is recognised by the words "метрики".
- `live_service_map` is recognised by the words "задержка".
- `live_service_map` is recognised by the words "трассы".
- `live_service_map` is recognised by the words "дежурство".
- `live_service_map` is recognised by the words "что тормозит".
- `live_service_map` is chosen by asking "Нужна картина реальных вызовов с метриками?".
- `live_service_map` is tuned by asking "За какое окно времени?".
- `live_service_map` is tuned by asking "Какую метрику показывать цветом?".
- `live_service_map` is related to `containers`.
- `live_service_map` is related to `observability`.
- `live_service_map` is related to `incident_timeline`.
- `live_service_map` is related to `critical_path`.

### Наблюдаемость

> Что в системе видно через логи, метрики, трассы и тревоги, а что слепое пятно?

Its facts:

- `observability` is named "Наблюдаемость".
- `observability` is in the family `operations`.
- `observability` answers "Что в системе видно через логи, метрики, трассы и тревоги, а что слепое пятно?".
- `observability` is laid out as `treemap`.
- `observability` is opened when "После инцидента, который долго не замечали; перед запуском новой части; аудит дежурства.".
- `observability` is read by "эксплуатация".
- `observability` is read by "разработчики".
- `observability` is read by "архитекторы".
- `observability` draws a box `part` meaning "компонент или работающая часть".
- `observability` draws a box `signal` meaning "лог, метрика, трасса, тревога".
- `observability` draws a box `runbook` meaning "инструкция дежурному".
- `observability` joins boxes with a line `emits` meaning "часть выпускает сигнал".
- `observability` joins boxes with a line `alerts` meaning "тревога настроена на сигнал".
- `observability` joins boxes with a line `blind` meaning "внешний вызов без сигнала".
- `observability` frames its boxes by "По работающим частям; сигналы — значки на коробках.".
- `observability` colours by "цвет по полноте покрытия: есть лог, метрика, трасса, тревога".
- `observability` colours by "значок «нет инструкции»".
- `observability` keeps the rule "часть без тревог и без метрик — красная".
- `observability` keeps the rule "тревога без инструкции — жёлтая".
- `observability` keeps the rule "показывать четыре значка покрытия на каждой коробке, не больше".
- `observability` takes from the source "вызовы логгеров и метрик в коде".
- `observability` takes from the source "правила тревог из конфигурации мониторинга".
- `observability` asks people for "какие части критичны".
- `observability` asks people for "инструкции дежурным".
- `observability` is derived by rules like "emits_metric(orders_svc, latency). alert_on(latency, orders_svc). blind(P) :- critical(P), not emits_metric(P, _). no_runbook(A) :- alert(A), not runbook_for(A, _).".
- `observability` is kept by people so: "Для каждой критичной части заметкой укажите, как понять, что она больна. Стрелкой — слепое пятно, которое закрываем в этом квартале.".
- `observability` is kept by an agent so: "Собирать сигналы из кода и правил мониторинга, отмечать критичные части без тревог и тревоги без инструкций. Обновлять при изменении правил.".
- `observability` is recognised by the words "логи".
- `observability` is recognised by the words "мониторинг".
- `observability` is recognised by the words "тревоги".
- `observability` is recognised by the words "не заметили".
- `observability` is recognised by the words "слепое пятно".
- `observability` is recognised by the words "алерт".
- `observability` is chosen by asking "Нужно понять, что в системе видно, а что нет?".
- `observability` is tuned by asking "Какие виды сигналов учитывать?".
- `observability` is tuned by asking "Только критичные части?".
- `observability` is related to `live_service_map`.
- `observability` is related to `incident_timeline`.
- `observability` is related to `error_propagation`.
- `observability` is related to `quality_risk`.

### Хроника инцидента

> Что и в каком порядке произошло во время сбоя и что было причиной?

Its facts:

- `incident_timeline` is named "Хроника инцидента".
- `incident_timeline` is in the family `operations`.
- `incident_timeline` answers "Что и в каком порядке произошло во время сбоя и что было причиной?".
- `incident_timeline` is laid out as `timeline`.
- `incident_timeline` is opened when "Разбор после сбоя, подготовка отчёта, поиск повторяющихся причин.".
- `incident_timeline` comes from "Postmortem".
- `incident_timeline` is read by "эксплуатация".
- `incident_timeline` is read by "разработчики".
- `incident_timeline` is read by "менеджмент".
- `incident_timeline` draws a box `time` meaning "шкала времени".
- `incident_timeline` draws a box `event` meaning "событие: развёртывание, рост ошибок, тревога, действие дежурного".
- `incident_timeline` draws a box `lane` meaning "часть системы или человек".
- `incident_timeline` draws a box `note` meaning "вывод разбора".
- `incident_timeline` joins boxes with a line `caused` meaning "одно событие вызвало другое".
- `incident_timeline` joins boxes with a line `noticed` meaning "тревога заметила событие".
- `incident_timeline` joins boxes with a line `fix` meaning "действие, которое помогло".
- `incident_timeline` frames its boxes by "Полосы по частям системы и по людям; события по времени.".
- `incident_timeline` colours by "фаза: обнаружение, диагностика, исправление".
- `incident_timeline` colours by "влияние на пользователей".
- `incident_timeline` keeps the rule "отмечать время до обнаружения и время до исправления".
- `incident_timeline` keeps the rule "показывать изменения (релизы, флаги) за сутки до начала".
- `incident_timeline` keeps the rule "причинные связи только подтверждённые, гипотезы — пунктиром".
- `incident_timeline` takes from the source "журнал развёртываний и переключений флагов".
- `incident_timeline` takes from the source "тревоги и метрики за период".
- `incident_timeline` takes from the source "сообщения в канале дежурства".
- `incident_timeline` asks people for "причинные связи".
- `incident_timeline` asks people for "выводы и действия после разбора".
- `incident_timeline` is derived by rules like "at(deploy_19, '10:02'). at(err_spike, '10:05'). changed_before(deploy_19, err_spike). suspect(Ch) :- incident(I), starts(I, T), change(Ch), at(Ch, T0), T0 < T, T - T0 < 3600.".
- `incident_timeline` is kept by people so: "Пишите события фактами, без оценок и имён виноватых. Заметкой — каждый вывод; стрелкой — момент, когда сбой можно было заметить раньше.".
- `incident_timeline` is kept by an agent so: "Собирать события из журналов за окно инцидента, предлагать подозрительные изменения перед началом; гипотезу без подтверждения не выдавать за причину. Обновлять, пока разбор открыт.".
- `incident_timeline` is recognised by the words "инцидент".
- `incident_timeline` is recognised by the words "сбой".
- `incident_timeline` is recognised by the words "упало вчера".
- `incident_timeline` is recognised by the words "постмортем".
- `incident_timeline` is recognised by the words "что произошло".
- `incident_timeline` is recognised by the words "авария".
- `incident_timeline` is chosen by asking "Разбираете конкретный сбой?".
- `incident_timeline` is tuned by asking "Какое окно времени?".
- `incident_timeline` is tuned by asking "Какие части системы показать?".
- `incident_timeline` is related to `error_propagation`.
- `incident_timeline` is related to `live_service_map`.
- `incident_timeline` is related to `release_diff`.
- `incident_timeline` is related to `why`.

### Горячие места

> Какой код меняют чаще всего и что меняется вместе?

Its facts:

- `hotspots` is named "Горячие места".
- `hotspots` is in the family `evolution`.
- `hotspots` answers "Какой код меняют чаще всего и что меняется вместе?".
- `hotspots` is laid out as `treemap`.
- `hotspots` is opened when "Выбор, что рефакторить в первую очередь; поиск скрытых связей, которых нет в импортах.".
- `hotspots` comes from "Code as a crime scene".
- `hotspots` is read by "архитекторы".
- `hotspots` is read by "разработчики".
- `hotspots` is read by "менеджмент".
- `hotspots` draws a box `file` meaning "файл, размер — число строк".
- `hotspots` draws a box `component` meaning "компонент".
- `hotspots` joins boxes with a line `co_change` meaning "файлы часто меняются в одних коммитах, толщина — частота".
- `hotspots` joins boxes with a line `static` meaning "есть и прямая зависимость".
- `hotspots` frames its boxes by "По компонентам; рамки сворачиваются до суммы по папке.".
- `hotspots` colours by "цвет по частоте изменений за период".
- `hotspots` colours by "насыщенность по сложности кода".
- `hotspots` keeps the rule "показывать связи совместных изменений только выше порога (например 30% коммитов)".
- `hotspots` keeps the rule "выделять связи без статической зависимости — скрытая связность".
- `hotspots` keeps the rule "не учитывать массовые коммиты (переименования, форматирование)".
- `hotspots` takes from the source "история git: коммиты, файлы, авторы, даты".
- `hotspots` takes from the source "сложность из разбора кода".
- `hotspots` asks people for "какие коммиты считать шумом".
- `hotspots` is derived by rules like "changed(c1, 'cart.ts'). changed(c1, 'price.ts'). co(A, B, N) :- N = count C : changed(C, A), changed(C, B), A != B. hidden(A, B) :- co(A, B, N), N > 10, not imports(A, B), not imports(B, A).".
- `hotspots` is kept by people so: "Заметкой поясните, почему место горячее (новая функция или постоянные исправления). Стрелкой — место для рефакторинга.".
- `hotspots` is kept by an agent so: "Считать частоты по истории за выбранный период, исключая шумовые коммиты; сообщать новые скрытые связи. Обновлять еженедельно.".
- `hotspots` is recognised by the words "часто меняется".
- `hotspots` is recognised by the words "рефакторинг".
- `hotspots` is recognised by the words "с чего начать".
- `hotspots` is recognised by the words "git история".
- `hotspots` is recognised by the words "связаны неявно".
- `hotspots` is chosen by asking "Нужно найти, где код меняется чаще всего?".
- `hotspots` is tuned by asking "За какой период?".
- `hotspots` is tuned by asking "Порог совместных изменений?".
- `hotspots` is related to `tech_debt`.
- `hotspots` is related to `knowledge_map`.
- `hotspots` is related to `change_impact`.
- `hotspots` is related to `dsm`.

### Последствия изменения

> Что затронет изменение этого места и что нужно проверить?

Its facts:

- `change_impact` is named "Последствия изменения".
- `change_impact` is in the family `evolution`.
- `change_impact` answers "Что затронет изменение этого места и что нужно проверить?".
- `change_impact` is laid out as `radial`.
- `change_impact` is opened when "Перед изменением, на ревью, при выборе тестов, при оценке риска релиза.".
- `change_impact` comes from "Blast radius".
- `change_impact` is read by "разработчики".
- `change_impact` is read by "тестировщики".
- `change_impact` is read by "архитекторы".
- `change_impact` draws a box `changed` meaning "изменённая функция, файл или настройка".
- `change_impact` draws a box `affected` meaning "затронутые компоненты и части".
- `change_impact` draws a box `test` meaning "тесты, которые это покрывают".
- `change_impact` joins boxes with a line `depends` meaning "путь, по которому изменение доходит".
- `change_impact` joins boxes with a line `tested` meaning "тест проверяет затронутое".
- `change_impact` joins boxes with a line `cross` meaning "изменение пересекает границу процесса или сервиса".
- `change_impact` frames its boxes by "По работающим частям; затронутое показывается кольцами по дальности от изменения.".
- `change_impact` colours by "цвет по расстоянию".
- `change_impact` colours by "красным — затронутое без тестов".
- `change_impact` keeps the rule "показывать только затронутое, остальное скрыто".
- `change_impact` keeps the rule "ограничивать дальность (по умолчанию 3 шага)".
- `change_impact` keeps the rule "отдельно выделять затронутые публичные API и форматы данных".
- `change_impact` takes from the source "граф вызовов и импортов".
- `change_impact` takes from the source "дифф ветки".
- `change_impact` takes from the source "связь тестов с кодом из покрытия".
- `change_impact` asks people for "что считается публичным".
- `change_impact` is derived by rules like "changed_fn(price_calc). affected(X) :- changed_fn(X). affected(Y) :- affected(X), calls(Y, X). untested(X) :- affected(X), not covered_by(X, _).".
- `change_impact` is kept by people so: "Поставьте яркую стрелку на изменяемое место, заметкой опишите, что меняется в поведении. Отметьте затронутое, которое проверите руками.".
- `change_impact` is kept by an agent so: "Брать дифф, строить затронутое и список тестов, сообщать затронутое без тестов и затронутые API. Обновлять на каждый пуш в ветку.".
- `change_impact` is recognised by the words "что сломается".
- `change_impact` is recognised by the words "безопасно поменять".
- `change_impact` is recognised by the words "последствия".
- `change_impact` is recognised by the words "ревью".
- `change_impact` is recognised by the words "blast radius".
- `change_impact` is chosen by asking "Собираетесь что-то менять и хотите знать последствия?".
- `change_impact` is tuned by asking "Насколько далеко идти?".
- `change_impact` is tuned by asking "Учитывать совместные изменения из git?".
- `change_impact` is related to `test_coverage`.
- `change_impact` is related to `hotspots`.
- `change_impact` is related to `change_plan`.
- `change_impact` is related to `api_surface`.
- `change_impact` is related to `release_diff`.

### Карта техдолга

> Где долг, сколько он мешает и сколько стоит его отдать?

Its facts:

- `tech_debt` is named "Карта техдолга".
- `tech_debt` is in the family `evolution`.
- `tech_debt` answers "Где долг, сколько он мешает и сколько стоит его отдать?".
- `tech_debt` is laid out as `quadrant`.
- `tech_debt` is opened when "Планирование квартала, разговор с менеджментом о времени на долг, выбор, что чинить.".
- `tech_debt` is read by "архитекторы".
- `tech_debt` is read by "менеджмент".
- `tech_debt` is read by "разработчики".
- `tech_debt` draws a box `component` meaning "компонент, размер — объём кода".
- `tech_debt` draws a box `debt` meaning "пункт долга: устаревшая библиотека, дублирование, TODO, обход ошибки".
- `tech_debt` draws a box `note` meaning "чем мешает и сколько стоит".
- `tech_debt` joins boxes with a line `slows` meaning "долг замедляет работу над функцией".
- `tech_debt` joins boxes with a line `blocks` meaning "долг мешает пункту плана".
- `tech_debt` frames its boxes by "По компонентам; пункты долга — значки на коробках.".
- `tech_debt` colours by "по осям: насколько мешает (частота изменений × боль) и сколько стоит отдать".
- `tech_debt` colours by "цвет по типу долга".
- `tech_debt` keeps the rule "каждый пункт долга имеет оценку боли и стоимости, иначе он в списке «не оценено»".
- `tech_debt` keeps the rule "выделять долг в горячих местах".
- `tech_debt` keeps the rule "не больше 20 пунктов на экране, остальное — сводкой".
- `tech_debt` takes from the source "TODO/FIXME/HACK в коде".
- `tech_debt` takes from the source "устаревшие версии зависимостей".
- `tech_debt` takes from the source "дублирование кода".
- `tech_debt` takes from the source "частота изменений из git".
- `tech_debt` asks people for "боль и стоимость каждого пункта".
- `tech_debt` asks people for "связь долга с планами".
- `tech_debt` is derived by rules like "debt(d1, cart, duplicated_pricing). pain(d1, 8). cost(d1, 3). pay_first(D) :- debt(D, C, _), pain(D, P), cost(D, K), hot(C), P > 2 * K.".
- `tech_debt` is kept by people so: "Записывайте долг заметкой «что мешает и когда это больно», а не «плохой код». Стрелкой — долг, который блокирует ближайшую цель.".
- `tech_debt` is kept by an agent so: "Находить признаки долга в коде и зависимостях, накладывать частоту изменений, предлагать пункты без оценки на оценку. Обновлять еженедельно.".
- `tech_debt` is recognised by the words "техдолг".
- `tech_debt` is recognised by the words "легаси".
- `tech_debt` is recognised by the words "переписать".
- `tech_debt` is recognised by the words "время на рефакторинг".
- `tech_debt` is recognised by the words "TODO".
- `tech_debt` is chosen by asking "Нужно показать техдолг и решить, что отдавать первым?".
- `tech_debt` is tuned by asking "Какие виды долга учитывать?".
- `tech_debt` is tuned by asking "Показывать только долг в горячих местах?".
- `tech_debt` is related to `hotspots`.
- `tech_debt` is related to `roadmap`.
- `tech_debt` is related to `quality_risk`.
- `tech_debt` is related to `supply_chain`.

### Как есть → как будет

> Чем целевое устройство отличается от нынешнего и какими шагами мы туда идём?

Its facts:

- `migration` is named "Как есть → как будет".
- `migration` is in the family `evolution`.
- `migration` answers "Чем целевое устройство отличается от нынешнего и какими шагами мы туда идём?".
- `migration` is laid out as `timeline`.
- `migration` is opened when "Планирование переезда (монолит → сервисы, TS → Rust, новая база), отчёт о ходе миграции.".
- `migration` comes from "Transition architecture".
- `migration` is read by "архитекторы".
- `migration` is read by "менеджмент".
- `migration` is read by "разработчики".
- `migration` draws a box `as_is` meaning "нынешняя часть".
- `migration` draws a box `to_be` meaning "целевая часть".
- `migration` draws a box `stage` meaning "промежуточное состояние".
- `migration` draws a box `note` meaning "что сделано на шаге".
- `migration` joins boxes with a line `replaces` meaning "новая часть заменяет старую".
- `migration` joins boxes with a line `bridge` meaning "временный мост между старым и новым".
- `migration` joins boxes with a line `remaining` meaning "зависимость, которая ещё держит старое".
- `migration` frames its boxes by "Два или больше снимков одного вида рядом: как есть, промежуточные этапы, как будет; одинаковые коробки на одних местах.".
- `migration` colours by "цвет: осталось, в работе, переехало, удалено".
- `migration` colours by "процент переезда по компоненту".
- `migration` keeps the rule "раскладка коробок одна на всех снимках, чтобы видеть разницу".
- `migration` keeps the rule "показывать, что держит старую часть".
- `migration` keeps the rule "временные мосты помечать сроком удаления".
- `migration` takes from the source "зависимости на старые части из кода".
- `migration` takes from the source "процент вызовов, идущих в новое, из трасс".
- `migration` asks people for "целевое устройство".
- `migration` asks people for "этапы и их сроки".
- `migration` is derived by rules like "target(orders_svc). legacy(monolith_orders). replaces(orders_svc, monolith_orders). holds(L, F) :- legacy(L), calls(F, L), not migrated(F). done(L) :- legacy(L), not holds(L, _).".
- `migration` is kept by people so: "Нарисуйте целевое устройство отдельным снимком и на каждом этапе поставьте заметку «что уже переехало». Стрелкой — следующий шаг.".
- `migration` is kept by an agent so: "Считать, что ещё держит старые части, и процент переезда; сообщать, если целевое устройство нарушено новым кодом. Обновлять на каждый релиз.".
- `migration` is recognised by the words "миграция".
- `migration` is recognised by the words "переезд".
- `migration` is recognised by the words "целевая архитектура".
- `migration` is recognised by the words "было и будет".
- `migration` is recognised by the words "as-is".
- `migration` is recognised by the words "to-be".
- `migration` is chosen by asking "Планируете или ведёте переезд на новое устройство?".
- `migration` is tuned by asking "Какие этапы показать?".
- `migration` is tuned by asking "Отчёт для менеджмента или для команды?".
- `migration` is related to `architecture_drift`.
- `migration` is related to `roadmap`.
- `migration` is related to `dsm`.
- `migration` is related to `options_compare`.

### Что изменилось в релизе

> Что поменялось в устройстве и поведении между двумя версиями?

Its facts:

- `release_diff` is named "Что изменилось в релизе".
- `release_diff` is in the family `evolution`.
- `release_diff` answers "Что поменялось в устройстве и поведении между двумя версиями?".
- `release_diff` is laid out as `layered_down`.
- `release_diff` is opened when "Подготовка релиза, разбор регрессии, заметки к выпуску.".
- `release_diff` is read by "разработчики".
- `release_diff` is read by "тестировщики".
- `release_diff` is read by "эксплуатация".
- `release_diff` is read by "продукт".
- `release_diff` draws a box `box` meaning "компонент, функция, API или настройка с отметкой изменения".
- `release_diff` draws a box `change` meaning "группа изменений одной задачи".
- `release_diff` joins boxes with a line `added` meaning "новая связь".
- `release_diff` joins boxes with a line `removed` meaning "исчезнувшая связь".
- `release_diff` joins boxes with a line `changed` meaning "связь с изменённым форматом".
- `release_diff` frames its boxes by "Любой структурный вид, наложенный на два снимка; изменения сгруппированы по задачам из коммитов.".
- `release_diff` colours by "цвет: добавлено, удалено, изменено, без изменений (бледно)".
- `release_diff` keeps the rule "неизменённое бледное, но остаётся для ориентира".
- `release_diff` keeps the rule "изменения публичного API и формата данных наверху списка".
- `release_diff` keeps the rule "группировать изменения по задачам, а не по файлам".
- `release_diff` takes from the source "дифф между тегами".
- `release_diff` takes from the source "номера задач из сообщений коммитов".
- `release_diff` takes from the source "изменения схем и конфигов".
- `release_diff` asks people for "что из изменений важно пользователям".
- `release_diff` is derived by rules like "edge_in(v1, a, b). edge_in(v2, a, c). added(A, B) :- edge_in(v2, A, B), not edge_in(v1, A, B). removed(A, B) :- edge_in(v1, A, B), not edge_in(v2, A, B).".
- `release_diff` is kept by people so: "Добавьте заметку к каждой группе изменений: что заметит пользователь. Стрелкой — изменение, которое надо проверить особенно.".
- `release_diff` is kept by an agent so: "Строить разницу двух снимков, связывать с задачами, отмечать изменения без задачи. Обновлять при каждом новом теге.".
- `release_diff` is recognised by the words "релиз".
- `release_diff` is recognised by the words "что изменилось".
- `release_diff` is recognised by the words "между версиями".
- `release_diff` is recognised by the words "регрессия".
- `release_diff` is recognised by the words "changelog".
- `release_diff` is chosen by asking "Нужно сравнить две версии системы?".
- `release_diff` is tuned by asking "Какие две версии?".
- `release_diff` is tuned by asking "Какой вид накладывать?".
- `release_diff` is related to `change_impact`.
- `release_diff` is related to `ci_cd`.
- `release_diff` is related to `schema_evolution`.
- `release_diff` is related to `incident_timeline`.

### Расхождение с замыслом

> Где реальный код разошёлся с задуманной архитектурой?

Its facts:

- `architecture_drift` is named "Расхождение с замыслом".
- `architecture_drift` is in the family `evolution`.
- `architecture_drift` answers "Где реальный код разошёлся с задуманной архитектурой?".
- `architecture_drift` is laid out as `layered_down`.
- `architecture_drift` is opened when "Регулярная проверка архитектуры, перед аудитом, когда документация устарела.".
- `architecture_drift` comes from "Reflexion model".
- `architecture_drift` comes from "Fitness functions".
- `architecture_drift` is read by "архитекторы".
- `architecture_drift` is read by "разработчики".
- `architecture_drift` draws a box `intended` meaning "часть из задуманной схемы".
- `architecture_drift` draws a box `module` meaning "реальный модуль кода".
- `architecture_drift` joins boxes with a line `convergent` meaning "связь есть и в замысле, и в коде".
- `architecture_drift` joins boxes with a line `divergent` meaning "связь есть в коде, но не в замысле".
- `architecture_drift` joins boxes with a line `absent` meaning "связь есть в замысле, но не в коде".
- `architecture_drift` frames its boxes by "По задуманной схеме: модули кода разложены в задуманные части по правилам соответствия.".
- `architecture_drift` colours by "число расхождений на части".
- `architecture_drift` keeps the rule "совпадающие связи бледные, расхождения яркие".
- `architecture_drift` keeps the rule "модули, не попавшие ни в одну часть, — в отдельную рамку".
- `architecture_drift` keeps the rule "каждое расхождение можно принять (с заметкой-причиной) или отправить в долг".
- `architecture_drift` takes from the source "граф зависимостей кода".
- `architecture_drift` asks people for "задуманная схема и правила соответствия папок частям".
- `architecture_drift` asks people for "принятые исключения".
- `architecture_drift` is derived by rules like "intended(ui, core). maps('src/ui/', ui). maps('src/core/', core). actual(A, B) :- depends(F, G), maps_file(F, A), maps_file(G, B), A != B. divergent(A, B) :- actual(A, B), not intended(A, B), not accepted(A, B).".
- `architecture_drift` is kept by people so: "Опишите задуманную схему и правила, какие папки куда относятся. Каждое принятое расхождение сопроводите заметкой с причиной.".
- `architecture_drift` is kept by an agent so: "Пересчитывать расхождения на каждом слиянии, новое расхождение без принятия — замечание в ревью. Предлагать обновить схему, если расхождение держится долго и все с ним согласны.".
- `architecture_drift` is recognised by the words "документация устарела".
- `architecture_drift` is recognised by the words "задумано иначе".
- `architecture_drift` is recognised by the words "расходится".
- `architecture_drift` is recognised by the words "соответствие архитектуре".
- `architecture_drift` is chosen by asking "Нужно сверить реальный код с задуманной архитектурой?".
- `architecture_drift` is tuned by asking "Какую схему считать задуманной?".
- `architecture_drift` is tuned by asking "Показывать принятые исключения?".
- `architecture_drift` is related to `layers_cycles`.
- `architecture_drift` is related to `migration`.
- `architecture_drift` is related to `contradictions`.
- `architecture_drift` is related to `components`.

### Кто чем владеет

> Какая команда отвечает за какую часть и совпадают ли границы команд с границами кода?

Its facts:

- `ownership` is named "Кто чем владеет".
- `ownership` is in the family `people`.
- `ownership` answers "Какая команда отвечает за какую часть и совпадают ли границы команд с границами кода?".
- `ownership` is laid out as `layered_down`.
- `ownership` is opened when "Кого звать на ревью, кому писать при сбое, реорганизация команд, разбор медленных согласований.".
- `ownership` comes from "Conway".
- `ownership` is read by "менеджмент".
- `ownership` is read by "архитекторы".
- `ownership` is read by "разработчики".
- `ownership` draws a box `team` meaning "команда".
- `ownership` draws a box `component` meaning "компонент, которым она владеет".
- `ownership` joins boxes with a line `depends` meaning "зависимость между компонентами разных команд".
- `ownership` joins boxes with a line `unowned` meaning "компонент без владельца".
- `ownership` frames its boxes by "По командам-владельцам (из CODEOWNERS или ручной разметки); внутри — их компоненты.".
- `ownership` colours by "цвет по команде".
- `ownership` colours by "толщина межкомандных связей — повод для частых согласований".
- `ownership` keeps the rule "компоненты без владельца в отдельной рамке ярко".
- `ownership` keeps the rule "показывать только связи, пересекающие команды".
- `ownership` keeps the rule "компонент, который фактически правят чаще другие, — значок «реальный владелец другой»".
- `ownership` takes from the source "CODEOWNERS".
- `ownership` takes from the source "авторы коммитов по компонентам".
- `ownership` asks people for "состав команд".
- `ownership` asks people for "официальные владельцы, если CODEOWNERS нет".
- `ownership` is derived by rules like "owns(team_checkout, cart). owns(team_pay, payments). coordination(T1, T2) :- depends(A, B), owns(T1, A), owns(T2, B), T1 != T2. de_facto(C, T) :- top_committer_team(C, T), owns(T0, C), T != T0.".
- `ownership` is kept by people so: "Укажите владельца каждого компонента и как с ним связаться. Стрелкой отметьте межкомандную связь, которая тормозит работу.".
- `ownership` is kept by an agent so: "Сверять CODEOWNERS с реальными авторами коммитов, сообщать о компонентах без владельца и о расхождении официального и фактического владельца. Обновлять ежемесячно.".
- `ownership` is recognised by the words "кто отвечает".
- `ownership` is recognised by the words "владелец".
- `ownership` is recognised by the words "команда".
- `ownership` is recognised by the words "кого спросить".
- `ownership` is recognised by the words "Конвей".
- `ownership` is chosen by asking "Нужно понять, кто за что отвечает?".
- `ownership` is tuned by asking "Официальные владельцы или фактические по git?".
- `ownership` is tuned by asking "Показывать только межкомандные связи?".
- `ownership` is related to `team_topology`.
- `ownership` is related to `knowledge_map`.
- `ownership` is related to `components`.

### Устройство команд

> Как команды взаимодействуют: кто кому служит платформой, кто с кем работает вплотную?

Its facts:

- `team_topology` is named "Устройство команд".
- `team_topology` is in the family `people`.
- `team_topology` answers "Как команды взаимодействуют: кто кому служит платформой, кто с кем работает вплотную?".
- `team_topology` is laid out as `layered_down`.
- `team_topology` is opened when "Реорганизация, рост компании, жалобы на перегрузку согласованиями.".
- `team_topology` comes from "Team Topologies".
- `team_topology` is read by "менеджмент".
- `team_topology` is read by "архитекторы".
- `team_topology` draws a box `team` meaning "команда с типом: продуктовая, платформенная, сложной подсистемы, помогающая".
- `team_topology` draws a box `domain` meaning "область продукта".
- `team_topology` joins boxes with a line `collaboration` meaning "тесная совместная работа".
- `team_topology` joins boxes with a line `x_as_a_service` meaning "одна команда пользуется результатом другой".
- `team_topology` joins boxes with a line `facilitating` meaning "одна команда помогает другой научиться".
- `team_topology` frames its boxes by "По областям продукта; платформенные команды — отдельной полосой снизу.".
- `team_topology` colours by "нагрузка команды: число компонентов и межкомандных связей".
- `team_topology` colours by "значок команды, которой владеет слишком много".
- `team_topology` keeps the rule "показывать заявленные и реальные (по зависимостям кода) связи разным стилем".
- `team_topology` keeps the rule "выделять команды с более чем тремя тесными связями".
- `team_topology` keeps the rule "не больше 15 команд на экране".
- `team_topology` takes from the source "межкомандные зависимости из вида «Кто чем владеет»".
- `team_topology` asks people for "тип каждой команды".
- `team_topology` asks people for "заявленный способ взаимодействия".
- `team_topology` is derived by rules like "team_type(team_pay, platform). interaction(team_checkout, team_pay, x_as_a_service). overloaded(T) :- team(T), N = count C : owns(T, C), N > 12.".
- `team_topology` is kept by people so: "Запишите тип каждой команды и с кем она как работает. Стрелкой отметьте пару команд, у которых тесная связь не задумана.".
- `team_topology` is kept by an agent so: "Сравнивать заявленные способы взаимодействия с реальными зависимостями кода и частотой совместных изменений, сообщать о расхождениях. Обновлять ежеквартально.".
- `team_topology` is recognised by the words "реорганизация".
- `team_topology` is recognised by the words "команды".
- `team_topology` is recognised by the words "платформа".
- `team_topology` is recognised by the words "перегружены".
- `team_topology` is recognised by the words "team topologies".
- `team_topology` is chosen by asking "Обсуждаете, как устроены и как взаимодействуют команды?".
- `team_topology` is tuned by asking "Показывать реальные связи по коду?".
- `team_topology` is tuned by asking "Какие области продукта?".
- `team_topology` is related to `ownership`.
- `team_topology` is related to `capability_map`.
- `team_topology` is related to `knowledge_map`.

### Знания и фактор автобуса

> Кто знает какой код и где знание держится на одном человеке?

Its facts:

- `knowledge_map` is named "Знания и фактор автобуса".
- `knowledge_map` is in the family `people`.
- `knowledge_map` answers "Кто знает какой код и где знание держится на одном человеке?".
- `knowledge_map` is laid out as `treemap`.
- `knowledge_map` is opened when "Планирование отпусков и найма, уход сотрудника, выбор, кому поручить задачу.".
- `knowledge_map` is read by "менеджмент".
- `knowledge_map` is read by "архитекторы".
- `knowledge_map` draws a box `component` meaning "компонент, размер — объём кода".
- `knowledge_map` draws a box `person` meaning "человек, который знает код".
- `knowledge_map` joins boxes with a line `knows` meaning "человек много менял этот код недавно".
- `knowledge_map` frames its boxes by "По компонентам; люди — значки на коробках.".
- `knowledge_map` colours by "цвет по числу знающих: один — красный, два — жёлтый, три и больше — зелёный".
- `knowledge_map` colours by "значок, если главный знающий ушёл".
- `knowledge_map` keeps the rule "знание считается по свежим изменениям (например за год), старые затухают".
- `knowledge_map` keeps the rule "показывать имена только тем, кто вправе их видеть; менеджменту — числа".
- `knowledge_map` keeps the rule "выделять горячие места с одним знающим".
- `knowledge_map` takes from the source "история git: авторы, объёмы, даты".
- `knowledge_map` takes from the source "ревьюеры из запросов на слияние".
- `knowledge_map` asks people for "кто ушёл или уходит".
- `knowledge_map` asks people for "кто знает код без коммитов (архитекторы, бывшие авторы)".
- `knowledge_map` is derived by rules like "knows(P, C) :- authored_recent(P, C, Lines), Lines > 200. bus_factor(C, N) :- component(C), N = count P : knows(P, C). at_risk(C) :- bus_factor(C, 1), hot(C).".
- `knowledge_map` is kept by people so: "Отметьте людей, которые знают код, но не коммитят. Стрелкой — компонент, где нужен второй знающий.".
- `knowledge_map` is kept by an agent so: "Считать знание по истории с затуханием, сообщать о компонентах с одним знающим. Не показывать персональные данные тем, кому не положено. Обновлять ежемесячно.".
- `knowledge_map` is recognised by the words "фактор автобуса".
- `knowledge_map` is recognised by the words "один человек знает".
- `knowledge_map` is recognised by the words "уходит".
- `knowledge_map` is recognised by the words "передать знания".
- `knowledge_map` is recognised by the words "отпуск".
- `knowledge_map` is chosen by asking "Беспокоит, что знание держится на одном человеке?".
- `knowledge_map` is tuned by asking "За какой период считать знание?".
- `knowledge_map` is tuned by asking "Показывать имена или только числа?".
- `knowledge_map` is related to `ownership`.
- `knowledge_map` is related to `onboarding_path`.
- `knowledge_map` is related to `hotspots`.

### Путь новичка

> В каком порядке новичку знакомиться с системой и что читать на каждом шаге?

Its facts:

- `onboarding_path` is named "Путь новичка".
- `onboarding_path` is in the family `people`.
- `onboarding_path` answers "В каком порядке новичку знакомиться с системой и что читать на каждом шаге?".
- `onboarding_path` is laid out as `layered_down`.
- `onboarding_path` is opened when "Приход нового человека или агента, подготовка учебного материала, проверка понятности системы.".
- `onboarding_path` is read by "новички".
- `onboarding_path` is read by "разработчики".
- `onboarding_path` is read by "менеджмент".
- `onboarding_path` draws a box `step` meaning "шаг пути: «прочитай контекст», «запусти блокнот», «пройди сценарий выполнения ячейки»".
- `onboarding_path` draws a box `view` meaning "вид, который открывается на шаге".
- `onboarding_path` draws a box `note` meaning "что нужно понять на шаге".
- `onboarding_path` joins boxes with a line `next` meaning "следующий шаг".
- `onboarding_path` joins boxes with a line `prerequisite` meaning "нужно знать заранее".
- `onboarding_path` frames its boxes by "По неделям или этапам: «первый день», «первая неделя», «первая задача».".
- `onboarding_path` colours by "отметка пройденных шагов".
- `onboarding_path` colours by "время на шаг".
- `onboarding_path` keeps the rule "каждый шаг ссылается на открытый в нужной глубине вид".
- `onboarding_path` keeps the rule "начинать с контекста, заканчивать первой задачей".
- `onboarding_path` keeps the rule "не больше 12 шагов".
- `onboarding_path` takes from the source "главные сценарии и компоненты из других видов".
- `onboarding_path` takes from the source "первые задачи с меткой для новичков".
- `onboarding_path` asks people for "порядок шагов".
- `onboarding_path` asks people for "вопросы для самопроверки".
- `onboarding_path` is derived by rules like "path_step(1, context). path_step(2, containers). path_step(3, scenario). before(A, B) :- path_step(I, A), path_step(J, B), I < J.".
- `onboarding_path` is kept by people so: "Опишите путь как список шагов и к каждому — заметку «после этого ты знаешь…». Попросите следующего новичка отметить, где он застрял.".
- `onboarding_path` is kept by an agent so: "Проверять, что каждый шаг ссылается на существующий вид и он не устарел; предлагать шаги для частей, которые новички чаще всего спрашивают. Обновлять при больших изменениях устройства.".
- `onboarding_path` is recognised by the words "новичок".
- `onboarding_path` is recognised by the words "онбординг".
- `onboarding_path` is recognised by the words "с чего начать".
- `onboarding_path` is recognised by the words "первый день".
- `onboarding_path` is recognised by the words "ввести в курс".
- `onboarding_path` is chosen by asking "Нужно ввести нового человека в систему?".
- `onboarding_path` is tuned by asking "Для какой роли путь?".
- `onboarding_path` is tuned by asking "Сколько дней на путь?".
- `onboarding_path` is related to `context`.
- `onboarding_path` is related to `containers`.
- `onboarding_path` is related to `scenario`.
- `onboarding_path` is related to `glossary`.
- `onboarding_path` is related to `knowledge_map`.

### Качества и риски

> Где система слаба по надёжности, скорости, безопасности, удобству сопровождения?

Its facts:

- `quality_risk` is named "Качества и риски".
- `quality_risk` is in the family `quality`.
- `quality_risk` answers "Где система слаба по надёжности, скорости, безопасности, удобству сопровождения?".
- `quality_risk` is laid out as `quadrant`.
- `quality_risk` is opened when "Архитектурный аудит, подготовка к росту нагрузки, отчёт о рисках руководству.".
- `quality_risk` comes from "Rozanski–Woods perspectives".
- `quality_risk` comes from "ATAM".
- `quality_risk` is read by "архитекторы".
- `quality_risk` is read by "менеджмент".
- `quality_risk` draws a box `part` meaning "компонент или работающая часть".
- `quality_risk` draws a box `risk` meaning "риск: «нет повторных попыток к платёжному шлюзу»".
- `quality_risk` draws a box `note` meaning "сценарий качества: «при падении базы заказ не теряется»".
- `quality_risk` joins boxes with a line `threatens` meaning "риск угрожает сценарию качества".
- `quality_risk` joins boxes with a line `mitigates` meaning "мера снижает риск".
- `quality_risk` frames its boxes by "Любой структурный вид как основа; поверх — значки рисков по выбранной перспективе.".
- `quality_risk` colours by "по осям: вероятность и ущерб".
- `quality_risk` colours by "переключатель перспективы: надёжность, производительность, безопасность, сопровождение".
- `quality_risk` keeps the rule "каждый риск привязан к коробке или линии".
- `quality_risk` keeps the rule "риск без владельца и срока — жёлтый".
- `quality_risk` keeps the rule "не больше 10 главных рисков на слайде, остальные списком".
- `quality_risk` takes from the source "признаки из других видов: одиночные точки отказа, слепые пятна, проглоченные ошибки, устаревшие зависимости".
- `quality_risk` asks people for "сценарии качества".
- `quality_risk` asks people for "оценка вероятности и ущерба".
- `quality_risk` asks people for "принятые решения по риску".
- `quality_risk` is derived by rules like "risk(r1, payments_call, no_retry). likelihood(r1, high). impact(r1, high). risk(R, P, spof) :- spof(P), R = P. top(R) :- likelihood(R, high), impact(R, high), not mitigated(R).".
- `quality_risk` is kept by people so: "Запишите сценарии качества в форме «когда …, система …». Для каждого риска — владелец и решение: снижаем, принимаем, переносим.".
- `quality_risk` is kept by an agent so: "Собирать признаки рисков из других видов, предлагать новые риски на оценку, сообщать о рисках без владельца. Обновлять при изменении видов-источников.".
- `quality_risk` is recognised by the words "риски".
- `quality_risk` is recognised by the words "надёжность".
- `quality_risk` is recognised by the words "аудит".
- `quality_risk` is recognised by the words "слабые места".
- `quality_risk` is recognised by the words "что может пойти не так".
- `quality_risk` is chosen by asking "Нужно оценить качества системы и главные риски?".
- `quality_risk` is tuned by asking "Какая перспектива?".
- `quality_risk` is tuned by asking "Для какого уровня: команда или руководство?".
- `quality_risk` is related to `spof`.
- `quality_risk` is related to `threat_model`.
- `quality_risk` is related to `critical_path`.
- `quality_risk` is related to `tech_debt`.
- `quality_risk` is related to `observability`.

### Скорость и критический путь

> Где тратится время в самом важном пути и что даст ускорение?

Its facts:

- `critical_path` is named "Скорость и критический путь".
- `critical_path` is in the family `quality`.
- `critical_path` answers "Где тратится время в самом важном пути и что даст ускорение?".
- `critical_path` is laid out as `timeline`.
- `critical_path` is opened when "Жалобы на медлительность, цели по задержке, выбор, что оптимизировать.".
- `critical_path` is read by "разработчики".
- `critical_path` is read by "архитекторы".
- `critical_path` is read by "эксплуатация".
- `critical_path` draws a box `step` meaning "шаг пути с временем".
- `critical_path` draws a box `part` meaning "работающая часть".
- `critical_path` draws a box `budget` meaning "бюджет времени на путь".
- `critical_path` joins boxes with a line `critical` meaning "шаг на критическом пути".
- `critical_path` joins boxes with a line `parallel` meaning "шаг идёт параллельно и не влияет на итог".
- `critical_path` frames its boxes by "По работающим частям; шаги — по времени из трасс или профилей.".
- `critical_path` colours by "цвет по доле времени".
- `critical_path` colours by "отметка превышения бюджета".
- `critical_path` keeps the rule "показывать только критический путь и его ближайшие ветки".
- `critical_path` keeps the rule "шаги короче 1% сводить".
- `critical_path` keeps the rule "для каждого шага — ссылка на код в боковой панели".
- `critical_path` takes from the source "трассы и профили".
- `critical_path` takes from the source "граф вызовов для связи шагов с кодом".
- `critical_path` asks people for "бюджет времени".
- `critical_path` asks people for "какой путь главный".
- `critical_path` is derived by rules like "span(s1, null, 0, 120). span(s2, s1, 10, 110). on_path(S) :- root_span(S). on_path(C) :- on_path(P), child(C, P), latest_ending_child(P, C).".
- `critical_path` is kept by people so: "Заметкой укажите бюджет («открытие блокнота меньше секунды»). Стрелкой — шаг, который будете ускорять.".
- `critical_path` is kept by an agent so: "Строить критический путь по трассам, связывать шаги с кодом, сообщать о регрессиях времени после релизов. Обновлять при новых трассах.".
- `critical_path` is recognised by the words "медленно".
- `critical_path` is recognised by the words "тормозит".
- `critical_path` is recognised by the words "задержка".
- `critical_path` is recognised by the words "производительность".
- `critical_path` is recognised by the words "ускорить".
- `critical_path` is chosen by asking "Цель — найти, где теряется время?".
- `critical_path` is tuned by asking "Какой путь?".
- `critical_path` is tuned by asking "Какой процентиль?".
- `critical_path` is related to `scenario`.
- `critical_path` is related to `request_lifecycle`.
- `critical_path` is related to `live_service_map`.
- `critical_path` is related to `caching`.
- `critical_path` is related to `concurrency`.

### Карта тестов

> Что проверено тестами, какими и что не проверено вовсе?

Its facts:

- `test_coverage` is named "Карта тестов".
- `test_coverage` is in the family `quality`.
- `test_coverage` answers "Что проверено тестами, какими и что не проверено вовсе?".
- `test_coverage` is laid out as `treemap`.
- `test_coverage` is opened when "Перед рискованным изменением, планирование тестов, отчёт о качестве.".
- `test_coverage` is read by "тестировщики".
- `test_coverage` is read by "разработчики".
- `test_coverage` is read by "менеджмент".
- `test_coverage` draws a box `component` meaning "компонент, размер — объём кода".
- `test_coverage` draws a box `test` meaning "тест или набор тестов".
- `test_coverage` joins boxes with a line `covers` meaning "тест проверяет код".
- `test_coverage` joins boxes with a line `scenario` meaning "сквозной тест проходит сценарий".
- `test_coverage` frames its boxes by "По компонентам; можно переключить на рамки сценариев.".
- `test_coverage` colours by "цвет по покрытию строк или веток".
- `test_coverage` colours by "значок: модульные, интеграционные, сквозные".
- `test_coverage` keeps the rule "непокрытое и горячее — ярко".
- `test_coverage` keeps the rule "сгенерированный код и тесты не учитывать".
- `test_coverage` keeps the rule "показывать нестабильные тесты отдельным значком".
- `test_coverage` takes from the source "отчёты покрытия".
- `test_coverage` takes from the source "связь тестов с кодом".
- `test_coverage` takes from the source "история нестабильных тестов из CI".
- `test_coverage` asks people for "какие сценарии обязательно проверять".
- `test_coverage` is derived by rules like "covered(F, T) :- coverage_hit(T, F, Line). gap(C) :- component(C), hot(C), coverage(C, P), P < 50.".
- `test_coverage` is kept by people so: "Отметьте сценарии, которые обязаны быть проверены. Стрелкой — непокрытое место, которое меняется в этом релизе.".
- `test_coverage` is kept by an agent so: "Обновлять покрытие после каждого прогона CI, накладывать горячие места, сообщать о падении покрытия в изменённом коде.".
- `test_coverage` is recognised by the words "тесты".
- `test_coverage` is recognised by the words "покрытие".
- `test_coverage` is recognised by the words "не проверено".
- `test_coverage` is recognised by the words "регрессия".
- `test_coverage` is recognised by the words "QA".
- `test_coverage` is chosen by asking "Нужно увидеть, что проверено тестами?".
- `test_coverage` is tuned by asking "По строкам или по сценариям?".
- `test_coverage` is tuned by asking "Только изменённый код?".
- `test_coverage` is related to `change_impact`.
- `test_coverage` is related to `code`.
- `test_coverage` is related to `ci_cd`.
- `test_coverage` is related to `state_machine`.

### Одиночные точки отказа

> Отказ чего остановит всю систему или важный сценарий?

Its facts:

- `spof` is named "Одиночные точки отказа".
- `spof` is in the family `quality`.
- `spof` answers "Отказ чего остановит всю систему или важный сценарий?".
- `spof` is laid out as `layered_down`.
- `spof` is opened when "Подготовка к росту, требования к доступности, разбор после сбоя.".
- `spof` comes from "FMEA".
- `spof` is read by "эксплуатация".
- `spof` is read by "архитекторы".
- `spof` is read by "менеджмент".
- `spof` draws a box `part` meaning "работающая часть или ресурс".
- `spof` draws a box `scenario` meaning "важный сценарий".
- `spof` draws a box `redundancy` meaning "резерв: реплика, запасной путь".
- `spof` joins boxes with a line `requires` meaning "сценарий не работает без части".
- `spof` joins boxes with a line `fallback` meaning "есть запасной путь".
- `spof` frames its boxes by "По развёртыванию: зоны и узлы; сценарии — полосами поверх.".
- `spof` colours by "красным — части без резерва, нужные важному сценарию".
- `spof` keeps the rule "показывать только части, без которых падает хотя бы один важный сценарий".
- `spof` keeps the rule "учитывать скрытые общие зависимости (одна база, один DNS, один ключ)".
- `spof` keeps the rule "резерв, который ни разу не проверяли переключением, считать отсутствующим и помечать жёлтым".
- `spof` takes from the source "число реплик из развёртывания".
- `spof` takes from the source "зависимости сценариев из трасс".
- `spof` asks people for "какие сценарии важны".
- `spof` asks people for "какие резервы существуют вне кода".
- `spof` is derived by rules like "needs(checkout, payments_db). replicas(payments_db, 1). spof(P) :- needs(Sc, P), important(Sc), replicas(P, 1), not fallback(P, _).".
- `spof` is kept by people so: "Для каждой точки отказа заметкой укажите, что происходит при отказе и сколько длится восстановление. Стрелкой — точка, которую закрываем.".
- `spof` is kept by an agent so: "Выводить точки отказа из развёртывания и сценариев, сообщать о новых при изменении реплик. Обновлять при изменении инфраструктуры.".
- `spof` is recognised by the words "точка отказа".
- `spof` is recognised by the words "доступность".
- `spof` is recognised by the words "резерв".
- `spof` is recognised by the words "если упадёт".
- `spof` is recognised by the words "SLA".
- `spof` is chosen by asking "Нужно найти, чей отказ остановит систему?".
- `spof` is tuned by asking "Какие сценарии считать важными?".
- `spof` is tuned by asking "Учитывать внешние зависимости?".
- `spof` is related to `deployment`.
- `spof` is related to `error_propagation`.
- `spof` is related to `quality_risk`.

### Модель угроз

> Где проходят границы доверия, что через них течёт и какие угрозы на каждой?

Its facts:

- `threat_model` is named "Модель угроз".
- `threat_model` is in the family `security`.
- `threat_model` answers "Где проходят границы доверия, что через них течёт и какие угрозы на каждой?".
- `threat_model` is laid out as `layered_down`.
- `threat_model` is opened when "Проектирование новой функции с данными пользователей, аудит, подготовка к сертификации.".
- `threat_model` comes from "STRIDE".
- `threat_model` comes from "DFD".
- `threat_model` is read by "безопасность".
- `threat_model` is read by "архитекторы".
- `threat_model` draws a box `zone` meaning "зона доверия: браузер, webview, процесс расширения, сервер, внешний сервис".
- `threat_model` draws a box `flow` meaning "поток данных через границу".
- `threat_model` draws a box `threat` meaning "угроза на потоке или коробке".
- `threat_model` joins boxes with a line `crosses` meaning "поток пересекает границу доверия".
- `threat_model` joins boxes with a line `mitigation` meaning "мера защиты".
- `threat_model` joins boxes with a line `open` meaning "угроза без меры".
- `threat_model` frames its boxes by "По зонам доверия; например webview не доверяет содержимому ячеек, процесс расширения не доверяет webview.".
- `threat_model` colours by "цвет угроз по категории STRIDE".
- `threat_model` colours by "значок проверки ввода на границе".
- `threat_model` keeps the rule "показывать только потоки, пересекающие границы".
- `threat_model` keeps the rule "каждая угроза — с мерой или с решением «принято»".
- `threat_model` keeps the rule "выделять потоки с личными данными".
- `threat_model` takes from the source "потоки из вида «Потоки данных»".
- `threat_model` takes from the source "места проверки ввода и экранирования".
- `threat_model` takes from the source "политики CSP webview".
- `threat_model` asks people for "границы доверия".
- `threat_model` asks people for "угрозы и меры".
- `threat_model` is derived by rules like "zone(webview, untrusted). zone(ext_host, trusted). msg(webview, ext_host, run_cell). crossing(A, B, M) :- msg(A, B, M), zone(A, Z1), zone(B, Z2), Z1 != Z2. unvalidated(M) :- crossing(_, B, M), not validates(B, M).".
- `threat_model` is kept by people so: "Нарисуйте границы доверия и на каждом пересечении заметкой опишите, что проверяется. Стрелкой — пересечение без проверки.".
- `threat_model` is kept by an agent so: "Находить пересечения границ по потокам и сообщениям, проверять наличие проверки ввода; новый поток через границу без угроз — запрос на разбор. Обновлять при изменении потоков.".
- `threat_model` is recognised by the words "безопасность".
- `threat_model` is recognised by the words "угрозы".
- `threat_model` is recognised by the words "граница доверия".
- `threat_model` is recognised by the words "STRIDE".
- `threat_model` is recognised by the words "аудит безопасности".
- `threat_model` is chosen by asking "Нужно разобрать угрозы безопасности?".
- `threat_model` is tuned by asking "Какие границы рассмотреть?".
- `threat_model` is tuned by asking "Какие категории угроз?".
- `threat_model` is related to `attack_surface`.
- `threat_model` is related to `data_flow`.
- `threat_model` is related to `pii_map`.
- `threat_model` is related to `access_map`.
- `threat_model` is related to `quality_risk`.

### Поверхность атаки

> Через какие входы чужой может достучаться до системы?

Its facts:

- `attack_surface` is named "Поверхность атаки".
- `attack_surface` is in the family `security`.
- `attack_surface` answers "Через какие входы чужой может достучаться до системы?".
- `attack_surface` is laid out as `layered_right`.
- `attack_surface` is opened when "Перед публикацией, аудит, после добавления маршрутов, команд или обработчиков сообщений.".
- `attack_surface` is read by "безопасность".
- `attack_surface` is read by "разработчики".
- `attack_surface` draws a box `entry` meaning "вход: HTTP-маршрут, команда VS Code, обработчик сообщения webview, разбор файла .rofl.md".
- `attack_surface` draws a box `part` meaning "часть, которая обрабатывает вход".
- `attack_surface` draws a box `sink` meaning "опасное место: выполнение кода, запись в файл, SQL".
- `attack_surface` joins boxes with a line `reaches` meaning "данные со входа доходят до опасного места".
- `attack_surface` joins boxes with a line `sanitized` meaning "путь через проверку".
- `attack_surface` frames its boxes by "По работающим частям; входы на границе рамок.".
- `attack_surface` colours by "цвет входа по доступности: из интернета, из локальной машины, только внутренний".
- `attack_surface` colours by "значок аутентификации".
- `attack_surface` keeps the rule "показывать пути от входа до опасного места без проверки".
- `attack_surface` keeps the rule "входы без аутентификации — ярко".
- `attack_surface` keeps the rule "сводить однотипные маршруты".
- `attack_surface` takes from the source "маршруты, команды, обработчики сообщений, разборщики форматов".
- `attack_surface` takes from the source "пути данных от входа до опасных мест".
- `attack_surface` asks people for "какие входы задуманно публичны".
- `attack_surface` is derived by rules like "entry(msg_run_cell). sink(eval_code). flows_to(msg_run_cell, eval_code). exposed(E, S) :- entry(E), sink(S), flows_to(E, S), not passes_check(E, S).".
- `attack_surface` is kept by people so: "Отметьте каждый вход как публичный или внутренний и заметкой — кто должен им пользоваться. Стрелкой — вход, который закрываем.".
- `attack_surface` is kept by an agent so: "Находить новые входы при каждом изменении и пути до опасных мест; новый вход без проверки — блокер ревью.".
- `attack_surface` is recognised by the words "уязвимость".
- `attack_surface` is recognised by the words "вход".
- `attack_surface` is recognised by the words "открыто наружу".
- `attack_surface` is recognised by the words "эндпоинт".
- `attack_surface` is recognised by the words "поверхность атаки".
- `attack_surface` is chosen by asking "Нужно увидеть все входы, через которые можно атаковать?".
- `attack_surface` is tuned by asking "Только входы из интернета?".
- `attack_surface` is tuned by asking "Показывать пути до опасных мест?".
- `attack_surface` is related to `threat_model`.
- `attack_surface` is related to `api_surface`.
- `attack_surface` is related to `request_lifecycle`.
- `attack_surface` is related to `access_map`.

### Личные данные

> Где хранятся и куда утекают личные данные пользователей?

Its facts:

- `pii_map` is named "Личные данные".
- `pii_map` is in the family `security`.
- `pii_map` answers "Где хранятся и куда утекают личные данные пользователей?".
- `pii_map` is laid out as `layered_down`.
- `pii_map` is opened when "Запрос пользователя на удаление данных, аудит соответствия закону, подключение внешнего сервиса.".
- `pii_map` comes from "GDPR data map".
- `pii_map` is read by "безопасность".
- `pii_map` is read by "менеджмент".
- `pii_map` is read by "аналитики данных".
- `pii_map` draws a box `field` meaning "поле с личными данными: email, адрес, телефон".
- `pii_map` draws a box `store` meaning "хранилище, где оно лежит".
- `pii_map` draws a box `external` meaning "внешний сервис, куда оно уходит".
- `pii_map` joins boxes with a line `copies` meaning "копия данных в другое место".
- `pii_map` joins boxes with a line `shared` meaning "передача третьей стороне".
- `pii_map` joins boxes with a line `logs` meaning "попадание в логи".
- `pii_map` frames its boxes by "По системам и странам хранения.".
- `pii_map` colours by "цвет по чувствительности".
- `pii_map` colours by "значок: шифруется, срок хранения задан".
- `pii_map` keeps the rule "показывать каждое место, где лежит копия".
- `pii_map` keeps the rule "передачи третьим лицам без договора — ярко".
- `pii_map` keeps the rule "выделять попадание в логи и аналитику".
- `pii_map` takes from the source "поля, помеченные или распознанные по имени и типу".
- `pii_map` takes from the source "потоки из вида «Потоки данных»".
- `pii_map` takes from the source "логирование объектов с такими полями".
- `pii_map` asks people for "какие поля личные".
- `pii_map` asks people for "договоры с третьими сторонами".
- `pii_map` asks people for "сроки хранения".
- `pii_map` is derived by rules like "pii(customers.email). copies(customers.email, analytics.events). holds_pii(S) :- pii(F), field_in_store(F, S). holds_pii(S) :- copies(F, S2), pii(F), store_of(S2, S).".
- `pii_map` is kept by people so: "Пометьте личные поля и для каждого места хранения заметкой — срок и основание. Стрелкой — передача, которую надо проверить юристам.".
- `pii_map` is kept by an agent so: "Искать новые копии личных полей и их попадание в логи, сообщать о передачах без договора. Обновлять при изменении схем и интеграций.".
- `pii_map` is recognised by the words "личные данные".
- `pii_map` is recognised by the words "персональные данные".
- `pii_map` is recognised by the words "GDPR".
- `pii_map` is recognised by the words "удалить пользователя".
- `pii_map` is recognised by the words "PII".
- `pii_map` is chosen by asking "Нужно знать, где лежат и куда уходят личные данные?".
- `pii_map` is tuned by asking "Какие категории данных?".
- `pii_map` is tuned by asking "Включать логи и аналитику?".
- `pii_map` is related to `data_flow`.
- `pii_map` is related to `threat_model`.
- `pii_map` is related to `data_lineage`.
- `pii_map` is related to `integration_landscape`.

### Права и секреты

> Кто и что может делать в системе, какими ключами, и не слишком ли широки права?

Its facts:

- `access_map` is named "Права и секреты".
- `access_map` is in the family `security`.
- `access_map` answers "Кто и что может делать в системе, какими ключами, и не слишком ли широки права?".
- `access_map` is laid out as `matrix`.
- `access_map` is opened when "Аудит доступов, утечка ключа, подключение нового сервиса или сотрудника.".
- `access_map` comes from "Least privilege".
- `access_map` is read by "безопасность".
- `access_map` is read by "эксплуатация".
- `access_map` draws a box `principal` meaning "кто: пользователь, роль, сервисный аккаунт, расширение".
- `access_map` draws a box `resource` meaning "что: таблица, бакет, API, файлы рабочей папки".
- `access_map` draws a box `secret` meaning "ключ или токен".
- `access_map` joins boxes with a line `granted` meaning "выданное право".
- `access_map` joins boxes with a line `used` meaning "право реально используется".
- `access_map` joins boxes with a line `unused` meaning "право выдано, но не используется".
- `access_map` frames its boxes by "По ролям и по системам-ресурсам.".
- `access_map` colours by "цвет права: чтение, запись, администрирование".
- `access_map` colours by "возраст ключа".
- `access_map` keeps the rule "выделять неиспользуемые права и старые ключи".
- `access_map` keeps the rule "никогда не показывать значения секретов".
- `access_map` keeps the rule "сводить пользователей в роли".
- `access_map` takes from the source "политики IAM, роли базы".
- `access_map` takes from the source "журналы доступа".
- `access_map` takes from the source "места чтения секретов в коде".
- `access_map` asks people for "кто какие права должен иметь".
- `access_map` is derived by rules like "granted(svc_orders, orders_db, write). used(svc_orders, orders_db, read). excess(P, R, A) :- granted(P, R, A), not used(P, R, A).".
- `access_map` is kept by people so: "Опишите, какие права нужны каждой роли и почему. Стрелкой — право, которое отзываем.".
- `access_map` is kept by an agent so: "Сравнивать выданные права с журналами использования, сообщать о лишних правах и старых ключах. Обновлять ежедневно.".
- `access_map` is recognised by the words "доступ".
- `access_map` is recognised by the words "права".
- `access_map` is recognised by the words "роль".
- `access_map` is recognised by the words "ключ".
- `access_map` is recognised by the words "токен".
- `access_map` is recognised by the words "секрет утёк".
- `access_map` is chosen by asking "Нужно проверить, у кого какие права и ключи?".
- `access_map` is tuned by asking "Какие системы?".
- `access_map` is tuned by asking "Только неиспользуемые права?".
- `access_map` is related to `threat_model`.
- `access_map` is related to `attack_surface`.
- `access_map` is related to `config_flags`.

### Сторонние зависимости

> Какие чужие библиотеки и сервисы мы используем, чем они рискуют и с какими лицензиями?

Its facts:

- `supply_chain` is named "Сторонние зависимости".
- `supply_chain` is in the family `security`.
- `supply_chain` answers "Какие чужие библиотеки и сервисы мы используем, чем они рискуют и с какими лицензиями?".
- `supply_chain` is laid out as `tree`.
- `supply_chain` is opened when "Новость об уязвимости, выбор библиотеки, юридическая проверка перед продажей, обновление версий.".
- `supply_chain` comes from "SBOM".
- `supply_chain` is read by "безопасность".
- `supply_chain` is read by "менеджмент".
- `supply_chain` is read by "архитекторы".
- `supply_chain` is read by "разработчики".
- `supply_chain` draws a box `package` meaning "библиотека: npm-пакет, crate".
- `supply_chain` draws a box `part` meaning "наш компонент или процесс".
- `supply_chain` draws a box `license` meaning "лицензия".
- `supply_chain` joins boxes with a line `direct` meaning "прямая зависимость".
- `supply_chain` joins boxes with a line `transitive` meaning "зависимость зависимости".
- `supply_chain` joins boxes with a line `vulnerable` meaning "зависимость с известной уязвимостью".
- `supply_chain` frames its boxes by "По нашим процессам (что попадает в процесс расширения, что в webview, что в rofl-lsp); внутри — пакеты.".
- `supply_chain` colours by "цвет по риску: уязвимость, нет обновлений год, один сопровождающий".
- `supply_chain` colours by "значок несовместимой лицензии".
- `supply_chain` keeps the rule "транзитивные зависимости свёрнуты, пока не отмечены риском".
- `supply_chain` keeps the rule "выделять пакеты, которые реально вызываются из кода с уязвимостью".
- `supply_chain` keeps the rule "показывать лицензии, требующие открытия кода".
- `supply_chain` takes from the source "package-lock.json, Cargo.lock".
- `supply_chain` takes from the source "базы уязвимостей".
- `supply_chain` takes from the source "лицензии из манифестов пакетов".
- `supply_chain` asks people for "разрешённые лицензии".
- `supply_chain` asks people for "принятые риски".
- `supply_chain` is derived by rules like "dep(ext_host, 'lodash', '4.17.20'). vuln('lodash', '4.17.20', cve_x). at_risk(P, C) :- dep(P, Pkg, V), vuln(Pkg, V, C), calls_pkg(P, Pkg). bad_license(Pkg) :- license(Pkg, L), not allowed_license(L).".
- `supply_chain` is kept by people so: "Заметкой отметьте, зачем нужна каждая крупная зависимость и чем её заменить. Стрелкой — пакет на замену.".
- `supply_chain` is kept by an agent so: "Сверять lock-файлы с базами уязвимостей ежедневно, проверять, доходит ли код до уязвимой функции, сообщать о новых лицензиях.".
- `supply_chain` is recognised by the words "уязвимость в библиотеке".
- `supply_chain` is recognised by the words "лицензия".
- `supply_chain` is recognised by the words "зависимости".
- `supply_chain` is recognised by the words "npm".
- `supply_chain` is recognised by the words "SBOM".
- `supply_chain` is recognised by the words "устаревшие пакеты".
- `supply_chain` is chosen by asking "Нужно проверить сторонние библиотеки на риски и лицензии?".
- `supply_chain` is tuned by asking "Включать транзитивные?".
- `supply_chain` is tuned by asking "Только реально вызываемые?".
- `supply_chain` is related to `tech_debt`.
- `supply_chain` is related to `ci_cd`.
- `supply_chain` is related to `quality_risk`.
- `supply_chain` is related to `integration_landscape`.

### Карта возможностей

> Что система умеет делать для бизнеса и какие части за это отвечают?

Its facts:

- `capability_map` is named "Карта возможностей".
- `capability_map` is in the family `product`.
- `capability_map` answers "Что система умеет делать для бизнеса и какие части за это отвечают?".
- `capability_map` is laid out as `treemap`.
- `capability_map` is opened when "Стратегия, бюджет, разговор «что у нас есть и где дыры», выбор, что покупать, а что делать.".
- `capability_map` comes from "Business capability map".
- `capability_map` is read by "менеджмент".
- `capability_map` is read by "продукт".
- `capability_map` is read by "архитекторы".
- `capability_map` draws a box `capability` meaning "возможность: «приём платежей», «каталог», «выполнение ячеек», «подсказки в редакторе»".
- `capability_map` draws a box `part` meaning "компонент или сервис, реализующий возможность".
- `capability_map` joins boxes with a line `realizes` meaning "часть реализует возможность".
- `capability_map` joins boxes with a line `depends` meaning "возможность опирается на другую".
- `capability_map` frames its boxes by "Возможности вложены: верхний уровень — области бизнеса, ниже — возможности, внизу — части системы.".
- `capability_map` colours by "цвет по зрелости: нет, вручную, частично, полностью".
- `capability_map` colours by "стоимость или число команд на возможность".
- `capability_map` keeps the rule "имена возможностей — существительные действия, без названий технологий".
- `capability_map` keeps the rule "возможность без реализации — пустая коробка с пунктиром".
- `capability_map` keeps the rule "одна часть в трёх и более возможностях — значок «перегружена»".
- `capability_map` takes from the source "связь частей с возможностями через метки в коде или в каталоге сервисов".
- `capability_map` asks people for "дерево возможностей".
- `capability_map` asks people for "оценка зрелости".
- `capability_map` is derived by rules like "capability(payments). realizes(payments_svc, payments). gap(C) :- capability(C), not realizes(_, C). overloaded(P) :- part(P), N = count C : realizes(P, C), N >= 3.".
- `capability_map` is kept by people so: "Сначала договоритесь о дереве возможностей без технологий, потом привяжите части. Стрелкой — возможность, которую хотите развивать.".
- `capability_map` is kept by an agent so: "Поддерживать привязку частей к возможностям по меткам и вызовам, сообщать о частях без возможности. Обновлять при появлении новых сервисов.".
- `capability_map` is recognised by the words "что умеет система".
- `capability_map` is recognised by the words "возможности".
- `capability_map` is recognised by the words "бизнес-функции".
- `capability_map` is recognised by the words "стратегия".
- `capability_map` is recognised by the words "купить или сделать".
- `capability_map` is chosen by asking "Нужно показать, что система умеет делать для бизнеса?".
- `capability_map` is tuned by asking "До какой глубины?".
- `capability_map` is tuned by asking "Наложить зрелость или стоимость?".
- `capability_map` is related to `context`.
- `capability_map` is related to `feature_to_code`.
- `capability_map` is related to `cost_map`.
- `capability_map` is related to `team_topology`.
- `capability_map` is related to `roadmap`.

### Путь пользователя и поток ценности

> Какие шаги проходит пользователь до результата и какая часть системы стоит за каждым?

Its facts:

- `user_journey` is named "Путь пользователя и поток ценности".
- `user_journey` is in the family `product`.
- `user_journey` answers "Какие шаги проходит пользователь до результата и какая часть системы стоит за каждым?".
- `user_journey` is laid out as `lanes`.
- `user_journey` is opened when "Поиск, где теряются пользователи, планирование улучшений, связь продуктовых метрик с кодом.".
- `user_journey` comes from "Customer journey".
- `user_journey` comes from "Value stream".
- `user_journey` is read by "продукт".
- `user_journey` is read by "менеджмент".
- `user_journey` is read by "архитекторы".
- `user_journey` draws a box `stage` meaning "этап пути: «нашёл товар», «положил в корзину», «оплатил»; «установил расширение», «открыл блокнот», «получил ответ»".
- `user_journey` draws a box `touchpoint` meaning "экран или команда".
- `user_journey` draws a box `part` meaning "часть системы за этапом".
- `user_journey` joins boxes with a line `next` meaning "переход к следующему этапу, толщина — доля дошедших".
- `user_journey` joins boxes with a line `served_by` meaning "этап обслуживается частью".
- `user_journey` joins boxes with a line `waits` meaning "ожидание без ценности".
- `user_journey` frames its boxes by "Этапы слева направо; под каждым — экраны, ещё ниже — части системы.".
- `user_journey` colours by "доля отвала на этапе".
- `user_journey` colours by "время этапа".
- `user_journey` keeps the rule "верхняя полоса — слова пользователя, нижняя — части системы".
- `user_journey` keeps the rule "выделять этап с наибольшим отвалом".
- `user_journey` keeps the rule "не больше 8 этапов".
- `user_journey` takes from the source "аналитика переходов".
- `user_journey` takes from the source "связь экранов и команд с кодом".
- `user_journey` asks people for "этапы пути".
- `user_journey` asks people for "что пользователь чувствует на каждом".
- `user_journey` is derived by rules like "stage(add_to_cart, 2). served_by(add_to_cart, cart_svc). conv(add_to_cart, 0.4). worst(S) :- stage(S, _), conv(S, C), not (stage(T, _), conv(T, D), D < C).".
- `user_journey` is kept by people so: "Опишите путь словами пользователя и заметкой — его боль на этапе. Стрелкой — этап, который улучшаем.".
- `user_journey` is kept by an agent so: "Связывать этапы с экранами и кодом, накладывать аналитику, сообщать об этапах без части системы или без метрик. Обновлять при изменении экранов.".
- `user_journey` is recognised by the words "пользователь".
- `user_journey` is recognised by the words "воронка".
- `user_journey` is recognised by the words "отвал".
- `user_journey` is recognised by the words "путь клиента".
- `user_journey` is recognised by the words "поток ценности".
- `user_journey` is recognised by the words "конверсия".
- `user_journey` is chosen by asking "Нужно связать путь пользователя с системой?".
- `user_journey` is tuned by asking "Какой путь?".
- `user_journey` is tuned by asking "Наложить воронку?".
- `user_journey` is related to `scenario`.
- `user_journey` is related to `feature_to_code`.
- `user_journey` is related to `capability_map`.

### Функция → код

> Какой код реализует эту функцию продукта и какие функции живут в этом коде?

Its facts:

- `feature_to_code` is named "Функция → код".
- `feature_to_code` is in the family `product`.
- `feature_to_code` answers "Какой код реализует эту функцию продукта и какие функции живут в этом коде?".
- `feature_to_code` is laid out as `layered_right`.
- `feature_to_code` is opened when "Оценка доработки, удаление ненужной функции, вопрос «сколько стоит поддерживать фичу».".
- `feature_to_code` comes from "Traceability".
- `feature_to_code` is read by "продукт".
- `feature_to_code` is read by "разработчики".
- `feature_to_code` is read by "менеджмент".
- `feature_to_code` is read by "тестировщики".
- `feature_to_code` draws a box `feature` meaning "функция продукта: «промокоды», «автодополнение в ячейке»".
- `feature_to_code` draws a box `code` meaning "файл или функция".
- `feature_to_code` draws a box `flag` meaning "флаг, который её включает".
- `feature_to_code` joins boxes with a line `implements` meaning "код реализует функцию".
- `feature_to_code` joins boxes with a line `shared` meaning "код общий для нескольких функций".
- `feature_to_code` frames its boxes by "По функциям продукта; общий код — в отдельной рамке «общее».".
- `feature_to_code` colours by "использование функции пользователями".
- `feature_to_code` colours by "объём кода на функцию".
- `feature_to_code` keeps the rule "показывать только код, специфичный для функции, и отдельно общий".
- `feature_to_code` keeps the rule "функции без использования — ярко как кандидаты на удаление".
- `feature_to_code` keeps the rule "код без функции — в рамке «непонятно зачем»".
- `feature_to_code` takes from the source "номера задач в коммитах".
- `feature_to_code` takes from the source "флаги функций".
- `feature_to_code` takes from the source "точки входа команд и маршрутов".
- `feature_to_code` asks people for "список функций".
- `feature_to_code` asks people for "связь задач с функциями".
- `feature_to_code` is derived by rules like "feature(promo_codes). task_feature('SHOP-12', promo_codes). commit_task(c9, 'SHOP-12'). implements(F, Ft) :- changed(C, F), commit_task(C, T), task_feature(T, Ft).".
- `feature_to_code` is kept by people so: "Отметьте функцию продукта и её флаг; заметкой — кто её владелец. Стрелкой — функцию, которую убираем.".
- `feature_to_code` is kept by an agent so: "Связывать код с функциями через задачи, флаги и точки входа, сообщать о коде без функции. Обновлять при каждом слиянии.".
- `feature_to_code` is recognised by the words "где эта фича".
- `feature_to_code` is recognised by the words "какой код".
- `feature_to_code` is recognised by the words "удалить функцию".
- `feature_to_code` is recognised by the words "стоимость поддержки".
- `feature_to_code` is recognised by the words "трассировка".
- `feature_to_code` is chosen by asking "Нужно найти код конкретной функции продукта?".
- `feature_to_code` is tuned by asking "Какая функция?".
- `feature_to_code` is tuned by asking "Включать общий код?".
- `feature_to_code` is related to `capability_map`.
- `feature_to_code` is related to `requirements_trace`.
- `feature_to_code` is related to `config_flags`.
- `feature_to_code` is related to `cost_map`.

### Карта затрат

> Сколько стоит каждая часть системы и каждая возможность — в деньгах и в людях?

Its facts:

- `cost_map` is named "Карта затрат".
- `cost_map` is in the family `product`.
- `cost_map` answers "Сколько стоит каждая часть системы и каждая возможность — в деньгах и в людях?".
- `cost_map` is laid out as `treemap`.
- `cost_map` is opened when "Бюджет, рост счёта за облако, решение «оставить или выключить».".
- `cost_map` comes from "FinOps".
- `cost_map` is read by "менеджмент".
- `cost_map` is read by "архитекторы".
- `cost_map` is read by "эксплуатация".
- `cost_map` draws a box `part` meaning "часть системы, размер — стоимость в месяц".
- `cost_map` draws a box `resource` meaning "облачный ресурс: машины, база, трафик, лицензии".
- `cost_map` joins boxes with a line `pays_for` meaning "ресурс оплачивается ради части".
- `cost_map` frames its boxes by "По возможностям или по командам; внутри — ресурсы.".
- `cost_map` colours by "цвет по росту за месяц".
- `cost_map` colours by "стоимость на пользователя или запрос".
- `cost_map` keeps the rule "ресурсы без владельца — отдельной рамкой".
- `cost_map` keeps the rule "показывать рост, а не только сумму".
- `cost_map` keeps the rule "включать людей (команды) по желанию".
- `cost_map` takes from the source "счета облака с метками".
- `cost_map` takes from the source "размер команд".
- `cost_map` asks people for "распределение общих расходов".
- `cost_map` asks people for "стоимость человеко-часа".
- `cost_map` is derived by rules like "bill(res_db1, 420). tag(res_db1, orders_svc). realizes(orders_svc, checkout). cost(P, S) :- part(P), S = sum X : bill(R, X), tag(R, P). untagged(R) :- bill(R, _), not tag(R, _).".
- `cost_map` is kept by people so: "Договоритесь о правилах раздела общих расходов и запишите их заметкой. Стрелкой — самый быстрорастущий расход.".
- `cost_map` is kept by an agent so: "Подтягивать счета ежедневно, сообщать о ресурсах без метки и резком росте. Сверять метки с развёртыванием.".
- `cost_map` is recognised by the words "сколько стоит".
- `cost_map` is recognised by the words "бюджет".
- `cost_map` is recognised by the words "счёт за облако".
- `cost_map` is recognised by the words "затраты".
- `cost_map` is recognised by the words "дорого".
- `cost_map` is chosen by asking "Нужно показать затраты по частям системы?".
- `cost_map` is tuned by asking "Только облако или с людьми?".
- `cost_map` is tuned by asking "По возможностям или по командам?".
- `cost_map` is related to `capability_map`.
- `cost_map` is related to `deployment`.
- `cost_map` is related to `feature_to_code`.

### Словарь предметной области

> Какие слова мы используем, что они значат в каждой части и где одно слово значит разное?

Its facts:

- `glossary` is named "Словарь предметной области".
- `glossary` is in the family `product`.
- `glossary` answers "Какие слова мы используем, что они значат в каждой части и где одно слово значит разное?".
- `glossary` is laid out as `layered_right`.
- `glossary` is opened when "Споры о терминах, онбординг, интеграция двух команд, переименование.".
- `glossary` comes from "DDD ubiquitous language".
- `glossary` comes from "Context map".
- `glossary` is read by "продукт".
- `glossary` is read by "разработчики".
- `glossary` is read by "новички".
- `glossary` is read by "аналитики данных".
- `glossary` draws a box `term` meaning "термин: «заказ», «ячейка», «факт», «правило», «мир»".
- `glossary` draws a box `context` meaning "область, в которой термин имеет одно значение".
- `glossary` draws a box `code_name` meaning "имя в коде: класс, тип, таблица".
- `glossary` joins boxes with a line `same` meaning "один смысл, разные имена".
- `glossary` joins boxes with a line `conflict` meaning "одно имя, разный смысл".
- `glossary` joins boxes with a line `translates` meaning "перевод между областями".
- `glossary` frames its boxes by "По ограниченным контекстам (областям, где язык однозначен).".
- `glossary` colours by "значок: термин есть в коде, есть в документации, есть в обоих".
- `glossary` keeps the rule "каждый термин с определением в одну фразу".
- `glossary` keeps the rule "выделять конфликты имён между контекстами".
- `glossary` keeps the rule "показывать имена в коде, расходящиеся со словарём".
- `glossary` takes from the source "имена типов, таблиц, классов".
- `glossary` takes from the source "частые слова в документации и задачах".
- `glossary` asks people for "определения".
- `glossary` asks people for "границы контекстов".
- `glossary` is derived by rules like "term(order, sales, 'покупка клиента'). term(order, warehouse, 'задание на сборку'). conflict(T) :- term(T, C1, D1), term(T, C2, D2), C1 != C2, D1 != D2.".
- `glossary` is kept by people so: "Записывайте определение одной фразой и пример. Если слово значит разное в двух местах, сделайте две карточки и линию «конфликт».".
- `glossary` is kept by an agent so: "Сверять имена в коде со словарём, предлагать новые термины из частых слов, сообщать о конфликтах. Обновлять при новых типах и таблицах.".
- `glossary` is recognised by the words "термин".
- `glossary` is recognised by the words "что значит".
- `glossary` is recognised by the words "мы по-разному называем".
- `glossary` is recognised by the words "словарь".
- `glossary` is recognised by the words "язык домена".
- `glossary` is chosen by asking "Есть путаница в словах и терминах?".
- `glossary` is tuned by asking "Какие области?".
- `glossary` is tuned by asking "Только конфликты?".
- `glossary` is related to `data_model`.
- `glossary` is related to `onboarding_path`.
- `glossary` is related to `integration_landscape`.
- `glossary` is related to `capability_map`.

### API и контракты

> Что наша система обещает наружу, кто чем пользуется и что сломается при изменении?

Its facts:

- `api_surface` is named "API и контракты".
- `api_surface` is in the family `integration`.
- `api_surface` answers "Что наша система обещает наружу, кто чем пользуется и что сломается при изменении?".
- `api_surface` is laid out as `layered_right`.
- `api_surface` is opened when "Изменение API, выпуск новой версии, подключение нового клиента, удаление старого метода.".
- `api_surface` comes from "Consumer-driven contracts".
- `api_surface` is read by "разработчики".
- `api_surface` is read by "архитекторы".
- `api_surface` is read by "продукт".
- `api_surface` draws a box `api` meaning "API или протокол: REST магазина, JSON-RPC rofl-lsp, сообщения webview".
- `api_surface` draws a box `operation` meaning "метод, маршрут, сообщение".
- `api_surface` draws a box `consumer` meaning "кто пользуется: мобильное приложение, партнёр, webview".
- `api_surface` joins boxes with a line `uses` meaning "потребитель вызывает операцию, ×N в день".
- `api_surface` joins boxes with a line `deprecated` meaning "устаревшая операция ещё используется".
- `api_surface` joins boxes with a line `contract` meaning "есть тест контракта".
- `api_surface` frames its boxes by "По API и версиям; потребители — отдельной полосой справа.".
- `api_surface` colours by "цвет: стабильно, экспериментально, устарело".
- `api_surface` colours by "частота использования".
- `api_surface` keeps the rule "операции без потребителей — бледно".
- `api_surface` keeps the rule "устаревшее с потребителями — ярко".
- `api_surface` keeps the rule "изменение формата показывает всех потребителей".
- `api_surface` takes from the source "описания OpenAPI, схемы сообщений, обработчики маршрутов".
- `api_surface` takes from the source "журналы обращений по клиентам".
- `api_surface` asks people for "обещания совместимости".
- `api_surface` asks people for "контакты потребителей".
- `api_surface` is derived by rules like "operation(rest_v1, get_order). consumer_calls(mobile, get_order, 9000). deprecated(get_order). must_notify(C, Op) :- deprecated(Op), consumer_calls(C, Op, N), N > 0.".
- `api_surface` is kept by people so: "Для каждой операции укажите, стабильна ли она и до какой даты поддерживается. Стрелкой — операцию, которую меняете.".
- `api_surface` is kept by an agent so: "Сверять описания API с реальными обработчиками, накладывать журналы, сообщать о потребителях устаревших операций. Обновлять при изменении API.".
- `api_surface` is recognised by the words "API".
- `api_surface` is recognised by the words "контракт".
- `api_surface` is recognised by the words "эндпоинт".
- `api_surface` is recognised by the words "клиенты API".
- `api_surface` is recognised by the words "обратная совместимость".
- `api_surface` is recognised by the words "версия".
- `api_surface` is chosen by asking "Нужно понять, что мы обещаем наружу и кто этим пользуется?".
- `api_surface` is tuned by asking "Какой API?".
- `api_surface` is tuned by asking "Показывать потребителей?".
- `api_surface` is related to `schema_evolution`.
- `api_surface` is related to `extension_points`.
- `api_surface` is related to `attack_surface`.
- `api_surface` is related to `change_impact`.
- `api_surface` is related to `integration_landscape`.

### Точки расширения

> Где можно подключиться к системе или расширить её, не ломая остальное?

Its facts:

- `extension_points` is named "Точки расширения".
- `extension_points` is in the family `integration`.
- `extension_points` answers "Где можно подключиться к системе или расширить её, не ломая остальное?".
- `extension_points` is laid out as `layered_down`.
- `extension_points` is opened when "Планирование интеграции («мы хотим встроиться сюда»), выбор места для плагина, оценка партнёра.".
- `extension_points` is read by "архитекторы".
- `extension_points` is read by "разработчики".
- `extension_points` is read by "продукт".
- `extension_points` draws a box `hook` meaning "точка расширения: событие, интерфейс, реестр, вебхук, contributes в package.json VS Code".
- `extension_points` draws a box `part` meaning "часть, предоставляющая точку".
- `extension_points` draws a box `plugin` meaning "существующий потребитель точки".
- `extension_points` draws a box `note` meaning "что можно и чего нельзя делать в точке".
- `extension_points` joins boxes with a line `plugs` meaning "расширение подключено к точке".
- `extension_points` joins boxes with a line `wanted` meaning "желаемая интеграция — большая яркая стрелка".
- `extension_points` frames its boxes by "По работающим частям; точки расширения — значки на границах рамок.".
- `extension_points` colours by "цвет точки: официальная, внутренняя, нет точки (придётся править код)".
- `extension_points` keeps the rule "показывать только точки и их потребителей, остальное бледно".
- `extension_points` keeps the rule "место без официальной точки, куда хотят встроиться, — яркая стрелка и пометка «нужна точка»".
- `extension_points` keeps the rule "для каждой точки — что гарантируется".
- `extension_points` takes from the source "зарегистрированные события и интерфейсы, реестры, вебхуки".
- `extension_points` takes from the source "объявления contributes в манифесте расширения".
- `extension_points` asks people for "какие точки официальные".
- `extension_points` asks people for "куда хотят встроиться".
- `extension_points` is derived by rules like "hook(kernel, 'onCellExecuted'). plugs(viz_plugin, 'onCellExecuted'). wants(partner, renderer). official(H) :- hook(_, H), documented(H). needs_hook(P) :- wants(_, P), not (hook(P, H), official(H)).".
- `extension_points` is kept by people so: "Поставьте большую яркую стрелку «мы хотим интегрироваться сюда» и заметку: что нужно получить или изменить. Для каждой официальной точки — что она гарантирует.".
- `extension_points` is kept by an agent so: "Находить в коде точки расширения и их потребителей, проверять, что желаемые интеграции попадают в официальные точки; если нет — предлагать, где её сделать. Обновлять при изменении интерфейсов.".
- `extension_points` is recognised by the words "подключиться".
- `extension_points` is recognised by the words "интегрироваться сюда".
- `extension_points` is recognised by the words "плагин".
- `extension_points` is recognised by the words "расширить".
- `extension_points` is recognised by the words "хук".
- `extension_points` is recognised by the words "встроиться".
- `extension_points` is chosen by asking "Ищете место, куда подключиться или что расширить?".
- `extension_points` is tuned by asking "Какая часть системы?".
- `extension_points` is tuned by asking "Только официальные точки?".
- `extension_points` is related to `api_surface`.
- `extension_points` is related to `integration_landscape`.
- `extension_points` is related to `change_plan`.
- `extension_points` is related to `events`.

### Очереди и брокеры

> Какие очереди и темы есть, кто в них пишет, кто читает и где копятся сообщения?

Its facts:

- `queues_topology` is named "Очереди и брокеры".
- `queues_topology` is in the family `integration`.
- `queues_topology` answers "Какие очереди и темы есть, кто в них пишет, кто читает и где копятся сообщения?".
- `queues_topology` is laid out as `layered_right`.
- `queues_topology` is opened when "Рост задержек в асинхронной обработке, добавление потребителя, разбор потерянных сообщений.".
- `queues_topology` comes from "Enterprise integration patterns".
- `queues_topology` is read by "разработчики".
- `queues_topology` is read by "эксплуатация".
- `queues_topology` is read by "архитекторы".
- `queues_topology` draws a box `topic` meaning "очередь или тема: «orders.paid», очередь задач ядра блокнота".
- `queues_topology` draws a box `producer` meaning "кто пишет".
- `queues_topology` draws a box `consumer` meaning "кто читает, группа потребителей".
- `queues_topology` draws a box `dlq` meaning "очередь неудачных сообщений".
- `queues_topology` joins boxes with a line `publishes` meaning "запись в очередь".
- `queues_topology` joins boxes with a line `consumes` meaning "чтение".
- `queues_topology` joins boxes with a line `dead_letter` meaning "отказы уходят сюда".
- `queues_topology` frames its boxes by "По брокерам и кластерам; внутри — темы.".
- `queues_topology` colours by "глубина очереди".
- `queues_topology` colours by "задержка потребителя".
- `queues_topology` keeps the rule "темы без потребителя или без писателя — ярко".
- `queues_topology` keeps the rule "показывать очереди отказов рядом с основной".
- `queues_topology` keeps the rule "одинаковые потребители сводить ×N".
- `queues_topology` takes from the source "конфигурация брокера".
- `queues_topology` takes from the source "код публикаций и подписок".
- `queues_topology` takes from the source "метрики глубины".
- `queues_topology` asks people for "гарантии доставки и порядок".
- `queues_topology` is derived by rules like "publishes(orders_svc, 'orders.paid'). consumes(ship_svc, 'orders.paid'). dangling(T) :- publishes(_, T), not consumes(_, T). lagging(T) :- depth(T, D), D > 10000.".
- `queues_topology` is kept by people so: "Для каждой темы заметкой — формат сообщения и что делать при отказе. Стрелкой — тему, куда добавляете потребителя.".
- `queues_topology` is kept by an agent so: "Сверять конфигурацию брокера с кодом, сообщать о темах без потребителей и растущей глубине. Обновлять при изменении подписок.".
- `queues_topology` is recognised by the words "очередь".
- `queues_topology` is recognised by the words "кафка".
- `queues_topology` is recognised by the words "брокер".
- `queues_topology` is recognised by the words "сообщения копятся".
- `queues_topology` is recognised by the words "асинхронно".
- `queues_topology` is recognised by the words "тема".
- `queues_topology` is chosen by asking "В системе есть очереди сообщений, которые нужно разобрать?".
- `queues_topology` is tuned by asking "Какой брокер?".
- `queues_topology` is tuned by asking "Наложить глубину очередей?".
- `queues_topology` is related to `events`.
- `queues_topology` is related to `integration_landscape`.
- `queues_topology` is related to `concurrency`.
- `queues_topology` is related to `data_flow`.

### Ландшафт интеграций

> Как наша система связана с другими системами компании и партнёров: протоколы, частота, надёжность?

Its facts:

- `integration_landscape` is named "Ландшафт интеграций".
- `integration_landscape` is in the family `integration`.
- `integration_landscape` answers "Как наша система связана с другими системами компании и партнёров: протоколы, частота, надёжность?".
- `integration_landscape` is laid out as `radial`.
- `integration_landscape` is opened when "Планирование новой интеграции, замена партнёра, аудит внешних связей.".
- `integration_landscape` is read by "архитекторы".
- `integration_landscape` is read by "менеджмент".
- `integration_landscape` is read by "эксплуатация".
- `integration_landscape` draws a box `system` meaning "система: наша, соседняя, партнёрская".
- `integration_landscape` draws a box `interface` meaning "способ связи: API, файл по расписанию, очередь, общая база".
- `integration_landscape` draws a box `owner` meaning "организация-владелец".
- `integration_landscape` joins boxes with a line `sync` meaning "синхронный вызов".
- `integration_landscape` joins boxes with a line `async` meaning "асинхронный обмен".
- `integration_landscape` joins boxes with a line `batch` meaning "выгрузка по расписанию".
- `integration_landscape` joins boxes with a line `shared_db` meaning "общая база — сильная связь".
- `integration_landscape` frames its boxes by "По организациям-владельцам; наша система раскрывается до работающих частей, остальные — одной коробкой.".
- `integration_landscape` colours by "надёжность связи".
- `integration_landscape` colours by "наличие договора и контакта".
- `integration_landscape` keeps the rule "каждая связь подписана способом и частотой".
- `integration_landscape` keeps the rule "общая база между системами — ярко".
- `integration_landscape` keeps the rule "не больше 15 систем, мелкие сводятся".
- `integration_landscape` takes from the source "внешние адреса и SDK из кода".
- `integration_landscape` takes from the source "расписания выгрузок".
- `integration_landscape` takes from the source "очереди".
- `integration_landscape` asks people for "договоры".
- `integration_landscape` asks people for "контакты и сроки поддержки".
- `integration_landscape` is derived by rules like "integrates(shop, delivery_co, api). integrates(shop, erp, batch). fragile(A, B) :- integrates(A, B, shared_db). fragile(A, B) :- integrates(A, B, _), not contract(A, B).".
- `integration_landscape` is kept by people so: "Для каждой связи заметкой — договор и кто отвечает с той стороны. Стрелкой — новая интеграция, которую планируете.".
- `integration_landscape` is kept by an agent so: "Собирать связи из кода и конфигураций, сверять со списком договоров, сообщать о связях без владельца. Обновлять при изменении внешних адресов.".
- `integration_landscape` is recognised by the words "интеграция".
- `integration_landscape` is recognised by the words "партнёр".
- `integration_landscape` is recognised by the words "другие системы".
- `integration_landscape` is recognised by the words "обмен данными".
- `integration_landscape` is recognised by the words "ESB".
- `integration_landscape` is chosen by asking "Нужна картина связей с другими системами?".
- `integration_landscape` is tuned by asking "Только внешние или и внутренние системы компании?".
- `integration_landscape` is tuned by asking "Наложить надёжность?".
- `integration_landscape` is related to `context`.
- `integration_landscape` is related to `api_surface`.
- `integration_landscape` is related to `queues_topology`.
- `integration_landscape` is related to `extension_points`.
- `integration_landscape` is related to `pii_map`.

### Почему так

> Почему эта коробка здесь, почему эта связь есть и какое решение за этим стоит?

Its facts:

- `why` is named "Почему так".
- `why` is in the family `reasoning`.
- `why` answers "Почему эта коробка здесь, почему эта связь есть и какое решение за этим стоит?".
- `why` is laid out as `tree`.
- `why` is opened when "Вопрос «зачем так сделано», спор о решении, проверка вывода агента, перед отменой старого решения.".
- `why` comes from "ADR".
- `why` comes from "ROFL proofs".
- `why` is read by "архитекторы".
- `why` is read by "разработчики".
- `why` is read by "новички".
- `why` is read by "агенты".
- `why` draws a box `conclusion` meaning "вывод: «файл worker.ts работает в процессе worker»".
- `why` draws a box `premise` meaning "исходный факт: импорт, запуск, запись в CODEOWNERS".
- `why` draws a box `rule` meaning "правило, по которому вывод получен".
- `why` draws a box `decision` meaning "архитектурное решение: контекст, выбор, последствия".
- `why` joins boxes with a line `proof` meaning "посылка поддерживает вывод".
- `why` joins boxes with a line `because` meaning "решение объясняет устройство".
- `why` joins boxes with a line `supersedes` meaning "решение заменило прежнее".
- `why` frames its boxes by "Дерево доказательства: вывод наверху, правила — рамки, внутри посылки; решения — заметками рядом с коробками, которых касаются.".
- `why` colours by "значок: посылка из кода, из git, внесена человеком".
- `why` colours by "возраст решения".
- `why` keeps the rule "по умолчанию показывать один шаг доказательства, глубже — по щелчку".
- `why` keeps the rule "одинаковые поддеревья сводить ×N".
- `why` keeps the rule "посылки, внесённые людьми, выделять: их проверяют глазами".
- `why` takes from the source "доказательства ROFL для любого выведенного факта".
- `why` takes from the source "файлы решений (ADR) в репозитории".
- `why` asks people for "решения: контекст, выбор, отвергнутые варианты".
- `why` is derived by rules like "runs_in('src/worker.ts', worker). % why runs_in('src/worker.ts', worker) → % spawned(worker, 'src/worker.ts'), reaches('src/worker.ts', 'src/worker.ts') decision(adr_7, 'ядро в отдельном процессе'). explains(adr_7, kernel).".
- `why` is kept by people so: "Записывайте решение коротко: что было, что выбрали, что отвергли и почему. Привязывайте его к коробкам, которых оно касается, чтобы оно всплывало при наведении.".
- `why` is kept by an agent so: "Отвечать на «почему» доказательством, а не пересказом; при каждом выводе в отчёте давать ссылку на доказательство. Проверять, что решения не противоречат текущему коду; устаревшее решение помечать.".
- `why` is recognised by the words "почему".
- `why` is recognised by the words "зачем так".
- `why` is recognised by the words "кто решил".
- `why` is recognised by the words "докажи".
- `why` is recognised by the words "откуда это".
- `why` is chosen by asking "Нужно понять, почему система устроена именно так?".
- `why` is tuned by asking "Насколько глубоко раскрывать доказательство?".
- `why` is tuned by asking "Показывать решения или только факты?".
- `why` is related to `whynot`.
- `why` is related to `assumptions`.
- `why` is related to `contradictions`.
- `why` is related to `options_compare`.

### Чего не хватает для вывода

> Почему вывод не получился и какого факта не хватает?

Its facts:

- `whynot` is named "Чего не хватает для вывода".
- `whynot` is in the family `reasoning`.
- `whynot` answers "Почему вывод не получился и какого факта не хватает?".
- `whynot` is laid out as `tree`.
- `whynot` is opened when "Ожидаемая связь не появилась на картинке; агент не может что-то подтвердить; поиск пробелов в данных.".
- `whynot` comes from "ROFL whynot".
- `whynot` is read by "архитекторы".
- `whynot` is read by "агенты".
- `whynot` is read by "разработчики".
- `whynot` draws a box `goal` meaning "ожидаемый вывод, которого нет".
- `whynot` draws a box `missing` meaning "недостающий факт".
- `whynot` draws a box `rule` meaning "правило, которое могло бы дать вывод".
- `whynot` joins boxes with a line `would_need` meaning "правилу не хватает этого факта".
- `whynot` joins boxes with a line `blocked_by` meaning "вывод запрещён отрицанием".
- `whynot` frames its boxes by "Дерево причин отказа: цель наверху, под ней — каждое правило, под правилом — что не сошлось.".
- `whynot` colours by "значок: недостающий факт можно извлечь автоматически или его должен внести человек".
- `whynot` keeps the rule "показывать только ближайшие варианты: правила, где не хватает одного–двух фактов".
- `whynot` keeps the rule "ограничивать глубину и число узлов".
- `whynot` keeps the rule "каждый недостающий факт — с подсказкой, откуда его взять".
- `whynot` takes from the source "ответы whynot движка ROFL".
- `whynot` asks people for "ожидания: какие выводы должны быть".
- `whynot` is derived by rules like "expected(runs_in('src/render.ts', webview)). % whynot runs_in('src/render.ts', webview) → % нет spawned(webview, E) для E, из которого достижим render.ts missing_fact(G, F) :- expected(G), not holds(G), whynot(G, F).".
- `whynot` is kept by people so: "Запишите ожидание («этот файл должен работать в webview»). Если вывода нет, вид покажет, какого факта не хватает — внесите его или исправьте ожидание.".
- `whynot` is kept by an agent so: "При каждом невыполненном ожидании строить whynot и предлагать, какой факт извлечь или у кого спросить. Не выдумывать недостающий факт.".
- `whynot` is recognised by the words "почему нет".
- `whynot` is recognised by the words "не появилось".
- `whynot` is recognised by the words "чего не хватает".
- `whynot` is recognised by the words "не получается доказать".
- `whynot` is recognised by the words "пробел".
- `whynot` is chosen by asking "Ждёте вывод или связь, которой нет, и хотите знать почему?".
- `whynot` is tuned by asking "Насколько глубоко искать?".
- `whynot` is tuned by asking "Только недостающие факты или и запреты?".
- `whynot` is related to `why`.
- `whynot` is related to `assumptions`.
- `whynot` is related to `contradictions`.

### Допущения и открытые вопросы

> На каких непроверенных допущениях держатся наши выводы и решения и что ещё не выяснено?

Its facts:

- `assumptions` is named "Допущения и открытые вопросы".
- `assumptions` is in the family `reasoning`.
- `assumptions` answers "На каких непроверенных допущениях держатся наши выводы и решения и что ещё не выяснено?".
- `assumptions` is laid out as `quadrant`.
- `assumptions` is opened when "Перед важным решением, при планировании, после разговора, где многое сказали «наверное».".
- `assumptions` comes from "Assumption mapping".
- `assumptions` is read by "архитекторы".
- `assumptions` is read by "менеджмент".
- `assumptions` is read by "агенты".
- `assumptions` draws a box `assumption` meaning "допущение: «нагрузка не вырастет вдвое за год», «webview получает только наш HTML»".
- `assumptions` draws a box `question` meaning "открытый вопрос с владельцем".
- `assumptions` draws a box `decision` meaning "решение или вывод, который опирается на допущение".
- `assumptions` joins boxes with a line `rests_on` meaning "вывод опирается на допущение".
- `assumptions` joins boxes with a line `would_change` meaning "если допущение ложно, меняется решение".
- `assumptions` frames its boxes by "По важности и уверенности: что важно и неуверенно — проверять первым.".
- `assumptions` colours by "по осям: насколько важно и насколько уверены".
- `assumptions` colours by "значок срока проверки".
- `assumptions` keeps the rule "каждое допущение связано хотя бы с одним выводом, иначе оно лишнее".
- `assumptions` keeps the rule "вопрос без владельца — ярко".
- `assumptions` keeps the rule "проверенное допущение превращается в факт и уходит с картинки".
- `assumptions` takes from the source "посылки доказательств, внесённые людьми без источника".
- `assumptions` takes from the source "вопросы из заметок и задач".
- `assumptions` asks people for "допущения, вопросы, владельцы, сроки".
- `assumptions` is derived by rules like "assumption(a1, 'нагрузка < 2x'). rests_on(decision_single_db, a1). fragile(D) :- rests_on(D, A), important(A), not verified(A).".
- `assumptions` is kept by people so: "После каждого обсуждения запишите, что приняли без проверки, и кто проверит. Стрелкой — допущение, от которого зависит ближайшее решение.".
- `assumptions` is kept by an agent so: "Находить посылки без источника и показывать их как допущения; напоминать о сроках проверки; если новые факты опровергают допущение — пометить зависящие решения.".
- `assumptions` is recognised by the words "предполагаем".
- `assumptions` is recognised by the words "наверное".
- `assumptions` is recognised by the words "не уверены".
- `assumptions` is recognised by the words "открытый вопрос".
- `assumptions` is recognised by the words "надо выяснить".
- `assumptions` is chosen by asking "Хотите увидеть, на чём держатся решения и что не проверено?".
- `assumptions` is tuned by asking "Только важные допущения?".
- `assumptions` is tuned by asking "Показывать закрытые вопросы?".
- `assumptions` is related to `why`.
- `assumptions` is related to `whynot`.
- `assumptions` is related to `quality_risk`.
- `assumptions` is related to `options_compare`.

### Противоречия

> Где документация, заметки людей и код говорят разное?

Its facts:

- `contradictions` is named "Противоречия".
- `contradictions` is in the family `reasoning`.
- `contradictions` answers "Где документация, заметки людей и код говорят разное?".
- `contradictions` is laid out as `table`.
- `contradictions` is opened when "Регулярная чистка документации, перед аудитом, после работы агентов, проверка карты на правду.".
- `contradictions` is read by "архитекторы".
- `contradictions` is read by "агенты".
- `contradictions` is read by "разработчики".
- `contradictions` draws a box `claim` meaning "утверждение из заметки, документа или вида".
- `contradictions` draws a box `fact` meaning "факт, извлечённый из кода, git, трасс".
- `contradictions` draws a box `place` meaning "коробка или линия, о которой спор".
- `contradictions` joins boxes with a line `contradicts` meaning "утверждение противоречит факту".
- `contradictions` joins boxes with a line `supports` meaning "факт подтверждает утверждение".
- `contradictions` frames its boxes by "По видам, в которых найдены противоречия; внутри — по коробкам.".
- `contradictions` colours by "цвет по возрасту противоречия".
- `contradictions` colours by "кто автор утверждения".
- `contradictions` keeps the rule "показывать пары «утверждение — факт» рядом".
- `contradictions` keeps the rule "каждое противоречие решается: исправить заметку, исправить код или принять с причиной".
- `contradictions` keeps the rule "не показывать уже решённые".
- `contradictions` takes from the source "сверки из всех видов: связь на картинке без связи в коде, владелец в заметке без коммитов и т.п.".
- `contradictions` asks people for "решения по каждому противоречию".
- `contradictions` is derived by rules like "claims(note_12, depends(ui, db), false). actual(ui, db). contradiction(N) :- claims(N, depends(A, B), false), actual(A, B). contradiction(N) :- claims(N, depends(A, B), true), not actual(A, B).".
- `contradictions` is kept by people so: "Когда видите противоречие, не исправляйте молча — решите, кто прав, и оставьте заметку с причиной.".
- `contradictions` is kept by an agent so: "Собирать противоречия из всех видов после каждого обновления фактов, не исправлять утверждения людей самостоятельно, а предлагать исправление. Обновлять при каждом пересчёте.".
- `contradictions` is recognised by the words "документация врёт".
- `contradictions` is recognised by the words "устарело".
- `contradictions` is recognised by the words "не совпадает".
- `contradictions` is recognised by the words "противоречие".
- `contradictions` is recognised by the words "кто прав".
- `contradictions` is chosen by asking "Нужно найти, где документация и код говорят разное?".
- `contradictions` is tuned by asking "В каких видах искать?".
- `contradictions` is tuned by asking "Показывать принятые?".
- `contradictions` is related to `architecture_drift`.
- `contradictions` is related to `why`.
- `contradictions` is related to `whynot`.
- `contradictions` is related to `assumptions`.

### Дорожная карта

> Что и когда мы делаем, какие части системы это затронет и что от чего зависит?

Its facts:

- `roadmap` is named "Дорожная карта".
- `roadmap` is in the family `planning`.
- `roadmap` answers "Что и когда мы делаем, какие части системы это затронет и что от чего зависит?".
- `roadmap` is laid out as `timeline`.
- `roadmap` is opened when "Квартальное планирование, отчёт о ходе работ, поиск конфликтов между планами команд.".
- `roadmap` is read by "менеджмент".
- `roadmap` is read by "продукт".
- `roadmap` is read by "архитекторы".
- `roadmap` draws a box `time` meaning "шкала: месяцы или кварталы".
- `roadmap` draws a box `initiative` meaning "инициатива: «новая корзина», «перенос ядра блокнота на Rust»".
- `roadmap` draws a box `team` meaning "команда".
- `roadmap` draws a box `milestone` meaning "веха".
- `roadmap` joins boxes with a line `depends` meaning "инициатива ждёт другую".
- `roadmap` joins boxes with a line `touches` meaning "инициатива затрагивает часть системы".
- `roadmap` joins boxes with a line `conflict` meaning "две инициативы меняют одну часть одновременно".
- `roadmap` frames its boxes by "Полосы по командам или возможностям; инициативы по времени.".
- `roadmap` colours by "статус: план, в работе, сделано, под угрозой".
- `roadmap` colours by "уверенность в сроке".
- `roadmap` keeps the rule "выделять конфликты по частям системы".
- `roadmap` keeps the rule "зависимости между командами — толстыми линиями".
- `roadmap` keeps the rule "не больше 20 инициатив на экране".
- `roadmap` takes from the source "задачи и эпики из трекера".
- `roadmap` takes from the source "части системы, затронутые задачами, по коммитам".
- `roadmap` asks people for "инициативы, сроки, зависимости".
- `roadmap` is derived by rules like "initiative(new_cart, q3). touches(new_cart, cart). touches(promo, cart). initiative(promo, q3). conflict(A, B) :- touches(A, P), touches(B, P), initiative(A, Q), initiative(B, Q), A != B.".
- `roadmap` is kept by people so: "Для каждой инициативы — цель одной фразой и части системы, которые она тронет. Стрелкой — инициативу под угрозой.".
- `roadmap` is kept by an agent so: "Связывать инициативы с частями системы по задачам и коммитам, сообщать о конфликтах и о зависимостях, сроки которых не сходятся. Обновлять еженедельно.".
- `roadmap` is recognised by the words "план".
- `roadmap` is recognised by the words "квартал".
- `roadmap` is recognised by the words "сроки".
- `roadmap` is recognised by the words "дорожная карта".
- `roadmap` is recognised by the words "когда будет".
- `roadmap` is recognised by the words "roadmap".
- `roadmap` is chosen by asking "Нужен план работ, связанный с устройством системы?".
- `roadmap` is tuned by asking "Какой период?".
- `roadmap` is tuned by asking "Полосы по командам или по возможностям?".
- `roadmap` is related to `migration`.
- `roadmap` is related to `capability_map`.
- `roadmap` is related to `tech_debt`.
- `roadmap` is related to `change_plan`.
- `roadmap` is related to `requirements_trace`.

### Требования → проверки

> Какое требование чем реализовано и чем проверено, и что ни к чему не привязано?

Its facts:

- `requirements_trace` is named "Требования → проверки".
- `requirements_trace` is in the family `planning`.
- `requirements_trace` answers "Какое требование чем реализовано и чем проверено, и что ни к чему не привязано?".
- `requirements_trace` is laid out as `table`.
- `requirements_trace` is opened when "Сдача работы заказчику, аудит, сертификация, проверка, что ничего не забыли.".
- `requirements_trace` comes from "Requirements traceability".
- `requirements_trace` is read by "продукт".
- `requirements_trace` is read by "тестировщики".
- `requirements_trace` is read by "менеджмент".
- `requirements_trace` is read by "архитекторы".
- `requirements_trace` draws a box `requirement` meaning "требование: «возврат денег за 3 дня», «ячейка показывает ошибку на месте»".
- `requirements_trace` draws a box `code` meaning "реализующий код".
- `requirements_trace` draws a box `test` meaning "тест, проверяющий требование".
- `requirements_trace` joins boxes with a line `implemented_by` meaning "реализовано кодом".
- `requirements_trace` joins boxes with a line `verified_by` meaning "проверено тестом".
- `requirements_trace` joins boxes with a line `orphan` meaning "требование без кода или без теста".
- `requirements_trace` frames its boxes by "По разделам требований; справа — код и тесты.".
- `requirements_trace` colours by "статус: реализовано и проверено, только реализовано, ничего".
- `requirements_trace` keeps the rule "требования без проверки — ярко".
- `requirements_trace` keeps the rule "тесты, не связанные с требованием, — в отдельной группе".
- `requirements_trace` keeps the rule "показывать изменения требования после реализации".
- `requirements_trace` takes from the source "ссылки на требования в задачах, коммитах, тестах".
- `requirements_trace` asks people for "список требований".
- `requirements_trace` asks people for "связи, которые нельзя вывести".
- `requirements_trace` is derived by rules like "req(r12). test_refs(t_refund, r12). task_refs('SHOP-40', r12). verified(R) :- req(R), test_refs(T, R), passed(T). orphan(R) :- req(R), not verified(R).".
- `requirements_trace` is kept by people so: "Давайте требованиям короткие номера и ссылайтесь на них в задачах и тестах. Заметкой — требования, которые проверяются вручную.".
- `requirements_trace` is kept by an agent so: "Собирать ссылки на требования из задач, коммитов и тестов, сообщать о непроверенных требованиях и тестах без требований. Обновлять после каждого прогона тестов.".
- `requirements_trace` is recognised by the words "требования".
- `requirements_trace` is recognised by the words "ТЗ".
- `requirements_trace` is recognised by the words "приёмка".
- `requirements_trace` is recognised by the words "покрыто ли".
- `requirements_trace` is recognised by the words "сертификация".
- `requirements_trace` is recognised by the words "ничего не забыли".
- `requirements_trace` is chosen by asking "Нужно проверить, что все требования реализованы и проверены?".
- `requirements_trace` is tuned by asking "Какой раздел требований?".
- `requirements_trace` is tuned by asking "Учитывать ручные проверки?".
- `requirements_trace` is related to `feature_to_code`.
- `requirements_trace` is related to `test_coverage`.
- `requirements_trace` is related to `roadmap`.

### План изменения

> Куда именно вносим изменение, в каком порядке и что проверяем на каждом шаге?

Its facts:

- `change_plan` is named "План изменения".
- `change_plan` is in the family `planning`.
- `change_plan` answers "Куда именно вносим изменение, в каком порядке и что проверяем на каждом шаге?".
- `change_plan` is laid out as `layered_down`.
- `change_plan` is opened when "Перед началом задачи, особенно крупной; при поручении работы агенту; на обсуждении оценки.".
- `change_plan` is read by "разработчики".
- `change_plan` is read by "архитекторы".
- `change_plan` is read by "менеджмент".
- `change_plan` is read by "агенты".
- `change_plan` draws a box `target` meaning "место изменения, отмеченное большой яркой стрелкой".
- `change_plan` draws a box `step` meaning "шаг плана: «добавить сообщение в протокол», «обработать в ядре», «нарисовать в webview»".
- `change_plan` draws a box `part` meaning "затронутая часть".
- `change_plan` draws a box `note` meaning "риск или вопрос шага".
- `change_plan` joins boxes with a line `order` meaning "порядок шагов".
- `change_plan` joins boxes with a line `touches` meaning "шаг меняет часть".
- `change_plan` joins boxes with a line `check` meaning "проверка после шага".
- `change_plan` frames its boxes by "Любой структурный вид как основа; шаги плана нанесены поверх и пронумерованы.".
- `change_plan` colours by "статус шага".
- `change_plan` colours by "оценка трудоёмкости".
- `change_plan` keeps the rule "каждый шаг привязан к коробке или линии".
- `change_plan` keeps the rule "показывать последствия изменения из вида «Последствия изменения» бледно".
- `change_plan` keeps the rule "не больше 10 шагов, иначе дробить".
- `change_plan` takes from the source "последствия из графа зависимостей".
- `change_plan` takes from the source "тесты для затронутых мест".
- `change_plan` asks people for "цель изменения".
- `change_plan` asks people for "порядок шагов".
- `change_plan` is derived by rules like "plan_step(1, protocol, add_message). plan_step(2, kernel, handle_message). needs_check(S, T) :- plan_step(S, P, _), affected_by(P, X), covered_by(X, T).".
- `change_plan` is kept by people so: "Поставьте яркую стрелку на место изменения и заметку с целью. Пронумеруйте шаги на коробках, к каждому — как проверить, что шаг удался.".
- `change_plan` is kept by an agent so: "Строить план из цели и графа зависимостей, отмечать шаги, которые пересекают границы процессов, предлагать проверки. Обновлять статус шагов по коммитам.".
- `change_plan` is recognised by the words "как сделать".
- `change_plan` is recognised by the words "план работ".
- `change_plan` is recognised by the words "куда вносить".
- `change_plan` is recognised by the words "оценка задачи".
- `change_plan` is recognised by the words "поручить агенту".
- `change_plan` is chosen by asking "Планируете конкретное изменение и нужен пошаговый план?".
- `change_plan` is tuned by asking "На какой основе рисовать: компоненты или работающие части?".
- `change_plan` is tuned by asking "Насколько подробно дробить шаги?".
- `change_plan` is related to `change_impact`.
- `change_plan` is related to `extension_points`.
- `change_plan` is related to `roadmap`.
- `change_plan` is related to `options_compare`.

### Сравнение вариантов

> Чем отличаются варианты решения по устройству, затратам и рискам?

Its facts:

- `options_compare` is named "Сравнение вариантов".
- `options_compare` is in the family `planning`.
- `options_compare` answers "Чем отличаются варианты решения по устройству, затратам и рискам?".
- `options_compare` is laid out as `matrix`.
- `options_compare` is opened when "Выбор между двумя–тремя путями: «свой сервис или готовый», «процесс или поток», «переписать или чинить».".
- `options_compare` comes from "ATAM".
- `options_compare` comes from "ADR".
- `options_compare` is read by "архитекторы".
- `options_compare` is read by "менеджмент".
- `options_compare` is read by "продукт".
- `options_compare` draws a box `option` meaning "вариант: снимок вида с изменениями".
- `options_compare` draws a box `criterion` meaning "критерий: стоимость, срок, риск, скорость, сопровождение".
- `options_compare` draws a box `score` meaning "оценка варианта по критерию".
- `options_compare` joins boxes with a line `differs` meaning "место, где варианты различаются".
- `options_compare` joins boxes with a line `tradeoff` meaning "выигрыш по одному критерию ценой другого".
- `options_compare` frames its boxes by "Варианты рядом, с одинаковой раскладкой; под ними — таблица оценок.".
- `options_compare` colours by "цвет оценок".
- `options_compare` colours by "отметка выбранного варианта".
- `options_compare` keeps the rule "общая часть вариантов бледная, различия яркие".
- `options_compare` keeps the rule "каждая оценка с причиной".
- `options_compare` keeps the rule "не больше трёх вариантов и семи критериев".
- `options_compare` takes from the source "последствия каждого варианта из графа".
- `options_compare` takes from the source "оценка затрат из вида «Карта затрат»".
- `options_compare` asks people for "варианты".
- `options_compare` asks people for "критерии и веса".
- `options_compare` asks people for "оценки".
- `options_compare` is derived by rules like "option(own_svc). option(saas). score(own_svc, cost, 2). score(saas, cost, 4). weight(cost, 3). total(O, T) :- option(O), T = sum S * W : score(O, C, S), weight(C, W).".
- `options_compare` is kept by people so: "Нарисуйте каждый вариант на одном и том же виде, договоритесь о критериях до оценок, к каждой оценке — причина. Выбранный вариант оформите решением в виде «Почему так».".
- `options_compare` is kept by an agent so: "Строить различия вариантов на одном виде, считать последствия, проверять, что оценки опираются на факты; оценку без причины помечать допущением.".
- `options_compare` is recognised by the words "вариант".
- `options_compare` is recognised by the words "сравнить".
- `options_compare` is recognised by the words "что выбрать".
- `options_compare` is recognised by the words "плюсы и минусы".
- `options_compare` is recognised by the words "или".
- `options_compare` is chosen by asking "Выбираете между несколькими вариантами решения?".
- `options_compare` is tuned by asking "Какие критерии?".
- `options_compare` is tuned by asking "Какой вид брать основой?".
- `options_compare` is related to `migration`.
- `options_compare` is related to `why`.
- `options_compare` is related to `assumptions`.
- `options_compare` is related to `cost_map`.
- `options_compare` is related to `change_plan`.

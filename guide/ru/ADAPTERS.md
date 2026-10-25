# Как написать адаптер

Адаптер позволяет миру спрашивать внешнее: базу данных, программу,
MCP-сервер, HTTP API, другой мир ROFL, экран. Мир пишет `want` — запрос.
Движок его отправляет, и ответ приходит назад фактами в книге адаптера.
Устройство и его причины описаны в [docs/intents.md](../../docs/intents.md).
Эта страница — о том, как такой адаптер написать.

## Книга

Адаптер — это книга фактов. Мир пользуется ею, импортируя её. Книга —
это файл или книга, подписанная на узле Roflenox (ниже).

    imports(main, deps).                          -- мир читает книгу deps
    adapter(deps, exec, "node deps.cjs").         -- имя, вид, адрес
    capability(imports_of, deps, reads).          -- что он умеет: reads, shows или does
    arg(imports_of, 1, file, text).               -- его аргументы: позиция, имя, тип
    answers(imports_of, file_import, 2).          -- куда приходят ответы; первый столбец — запрос
    max_wants(imports_of, 20000).                 -- не больше стольких запросов за вычисление (1000, если не сказано)

Типы аргументов: `text`, `number`, `atom`, `time` и `json`.

Мир спрашивает запросом `want` — правилом, чья голова называет возможность
(capability):

    want imports_of(F) :- needed(F).

Затем мир читает ответы в книге адаптера, `file_import[deps](W, F)`. `W` —
ключ запроса, `$want(imports_of, "main.js")`, так что правило может
различить, к какому вопросу относится ответ.

## Три класса

- **reads** спрашивает и ничего снаружи не меняет. Его отправляет каждый
  вычисляющий глагол: `load`, `ask`, `why`, `whynot`, `serve`.
- **shows** показывает что-то человеку. Он никогда не отправляется, и
  никакое правило не читает его ответов. Его рисует хост; веб-верстак (Workbench) рисует
  экран адаптера `render`.
- **does** меняет мир снаружи. Его отправляет только `rofl serve` с
  журналом, и только при `permit(W)`. Он отправляется один раз: журнал это
  помнит.

## Чем заканчивается запрос

Каждый запрос заканчивается одним из этих фактов:

- `answered(W)` или любой факт его отношения `answers`;
- `failed(W, Reason)`;
- `outcome_unknown(W)`: адаптер завершился хорошо и ничего об этом не сказал;
- `want_held(W, Why)`: адаптер недоступен или не хватает ключа.

Мир, который ждёт, говорит об этом собственным правилом:
`pending(W) :- want_of(W, _), not answered(W), not failed(W, _)`.

## Виды

| вид | адрес | что добавляет книга |
|---|---|---|
| `exec` | командная строка | ничего; программа читает пачку со stdin и печатает факты |
| `sql` | файл SQLite | `query(Cap, "SELECT ... ?1")` для каждой возможности |
| `mcp` | команда (stdio) или URL | `mcp_tool`, `mcp_arg`, `mcp_field`; генерируются |
| `openapi` | базовый URL API | `http_op`, `http_in`, `http_field`; генерируются |
| `rofl` | файлы другого мира или команда, которая его обслуживает | отношение, из которого отвечает возможность |
| `render` | `"workbench"` | `component(Cap, Kind)`: heading, text, card, button, field |

`rofl adapter mcp CMD|URL` и `rofl adapter openapi SPEC` печатают книгу по
собственному описанию сервера. Перегенерируйте её, когда сервер меняется;
версия книги меняется вместе с ним.

### exec

Программа получает на stdin по одной пачке на возможность за раунд, в виде
JSON: `{capability, book_version, wants: [{key, args: {name: value}}]}`. Она
печатает факты ROFL, в каждом ответе первым идёт ключ запроса. Она может
напечатать `failed(K, "why")` и `answered(K)`. Строка `-- reads: PATH`
называет файл, от которого зависит ответ, и ответ хранится, пока этот файл
не изменится.

<!-- BEGIN file examples/intents/exec.rofl -->
```rofl
-- SCENARIO 3 (docs/intents.md 7): a local program. The scanner of today, unchanged, beside an exec adapter that
-- answers the same kind of question as wants: what main.js imports, a file a round, as the scan world asks.
imports(main, deps).
adapter(deps, exec, "node examples/intents/deps.cjs").
capability(imports_of, deps, reads).
arg(imports_of, 1, file, text).
answers(imports_of, file_import, 2).

needed("main.js").
needed(F) :- file_import[deps](_, F).
want imports_of(F) :- needed(F).
```
<!-- END file -->

<!-- BEGIN file examples/intents/deps.cjs -->
```
// The exec adapter of scenario 3: the files each file it is asked about imports, from examples/scan/src.
const fs = require('fs');
const path = require('path');
const batch = JSON.parse(fs.readFileSync(0, 'utf8'));
const root = path.join(__dirname, '..', 'scan', 'src');
for (const w of batch.wants) {
  const file = path.join(root, w.args.file);
  console.log(`-- reads: ${file}`);
  const found = [...fs.readFileSync(file, 'utf8').matchAll(/from\s+['"](\.\/.+?)['"]/g)]
    .map(m => path.relative(root, path.join(path.dirname(file), m[1])));
  for (const f of found) console.log(`file_import(${w.key}, ${JSON.stringify(f)}).`);
  if (found.length === 0) console.log(`answered(${w.key}).`);
}
```
<!-- END file -->

### sql

Шаблон принадлежит книге и никогда не бывает строкой, которую собирает
правило. `?1`, `?2` — аргументы запроса по порядку, и каждая строка
результата — один факт-ответ.

    adapter(shop, sql, "examples/intents/shop.db").
    capability(children_of, shop, reads).
    arg(children_of, 1, tenant, text).
    answers(children_of, child, 2).
    query(children_of, "SELECT id FROM tenants WHERE parent = ?1").

### rofl

Адаптер — это другой мир ROFL. Его адрес — файлы этого мира, которые движок
вычисляет один раз в своём процессе:

    adapter(team, rofl, "team.rofl").

Или адрес — это команда, которая обслуживает мир, и тогда он живёт в другом
процессе или на другой машине:

    adapter(team, rofl, "rofl serve team.rofl").
    adapter(team, rofl, "ssh bob.example rofl serve team.rofl").

`rofl serve FILE...` вычисляет файлы как свою сессию 1, прежде чем прочитать
первый запрос. Движок запускает команду один раз и спрашивает эту сессию на
каждом раунде, так что изменившийся мир отвечает таким, какой он сейчас. Адрес,
все слова которого кончаются на `.rofl` или `.rofl.md`, — это файлы; любой
другой — команда.

Возможность отвечает одним отношением другого мира. Аргументы запроса — его
первые столбцы. Каждая строка возвращается ответом в книге адаптера, и why
ответа останавливается на этой границе.

## Ключи

Ключ никогда не бывает фактом. Книга называет, где его найти, и движок
читает его из окружения при отправке:

    http_auth(Adapter, Scheme, How, Name, Env).   -- How: bearer, basic, header, query, client_credentials
    http_needs(Cap, Scheme).                      -- каким возможностям он нужен

Для `client_credentials` `Name` — это URL токена, а `Env` содержит
`id:secret`; адаптер сам получает и обновляет токен. Отсутствующая
переменная задерживает запрос: `want_held(W, "... the environment has no ENV ...")`.
В командной строке ключ задаётся как `HOW[:NAME]=ENV`:
`rofl adapter mcp URL bearer=TRACKER_TOKEN`.

## Книга на Roflenox

Книга может жить не в файле, а на узле Roflenox. Там она подписана: видно,
кто её написал, и что по дороге её никто не изменил. Её называют там, где
стоял бы файл:

    rofl ask 'imports_of[deps](W, F)' main.rofl roflenox://rofl.enox.dev/vadim.enox.dev/deps

Адрес выглядит как `roflenox://HOST/IDENTITY/BOOK`. Каждое предложение книги —
это один факт в книге этой личности на узле:

    {source: "deps", relation: "rofl:book", target: "capability(imports_of, deps, reads).", perspective: "rofl", confidence: 1}

Чтобы изменить предложение, утвердите новое. Чтобы убрать, утвердите его ещё
раз с уверенностью 0. Читателю без ключа узел показывает ленту только после
того, как личность один раз опубликует свои книги:

    {source: "rofl:book", relation: "roflenox:export", target: "public", perspective: "rofl", confidence: 1}

Кладите факты книги в отдельные партии. Узел скрывает партию целиком, если в
ней есть хоть один факт, который он не публикует.

Движок не верит узлу на слово. Он проверяет документы личности с первого и
запоминает первый при первой встрече. Он проверяет каждую партию цепочки:
подпись, то, что ключ был действителен в момент подписи, связь с предыдущей
партией и содержимое против подписанного дайджеста. Если хоть одна партия не
прошла, книга отвергается (exit 2). Скрытая партия считается и называется в
первой строке книги; что в ней, неизвестно.

Проверенное хранится в `~/.cache/rofl/roflenox`. Следующая загрузка
запрашивает только партии после него. Если узел недоступен, ответ берётся
оттуда, и stderr об этом говорит.

## Когда произошло событие

У ответа два времени. Одно — когда мир о нём узнал, такт (tick), который
движок ведёт сам. Другое — когда это случилось снаружи: трекер отвечает на
такте 500, что тикет закрыт, а закрыт он был вчера в 14:00.

Это второе время — обычный столбец ответа. Книга говорит, который:

    capability(ticket_closed, tracker, reads).
    answers(ticket_closed, closed, 3).            -- closed(W, Ticket, At)
    event_time(ticket_closed, 3).                 -- столбец 3 отношения closed — когда это случилось

Столбец содержит текст в формате ISO 8601, тип `time`. Правила сравнивают его
как любое другое значение. Не заворачивайте факты в отдельное
`at(Fact, Time)`. Это соглашение книги (выбор владельца, 2026-10-24). Движок
пока не читает `event_time`.

## Рекурсия

Запрос может зависеть от ответов на предыдущие запросы: дерево в базе данных,
импорты импортов. Движок отправляет по одному раунду за раз, по пачке на
возможность, пока не перестанут появляться новые запросы:

    reaches("acme").
    reaches(T) :- want_arg(W, 1, _), child[shop](W, T).
    want children_of(T) :- reaches(T).

- Каждый уровень дерева — один раунд, и каждый раунд — один запрос или вызов
  на возможность, никогда не по одному на узел.
- Запрос отправляется один раз за вычисление, по своему ключу, так что цикл
  в данных заканчивается.
- Возможность отправляет не больше 1000 запросов за вычисление, или столько,
  сколько говорит её книга: `max_wants(Cap, N)`. Запрос сверх предела
  задерживается, `want_held(W, "over the limit of N wants of Cap an evaluation: ...")`,
  и ответы мира частичны (код выхода 5). Именно это останавливает ответ,
  который вечно задаёт ещё один вопрос: каждый раунд стоит вызова, а предел —
  это число вызовов, за которые автор книги готов платить.
- Раунды также делят бюджет вычисления и его предел по памяти, так что
  раунд, который разрастается слишком широко, останавливается там с
  дырой (hole), как останавливается правило.

# Для агента

Claude Code не знает, что `rofl-nb` существует. Вставьте это в `CLAUDE.md`
проекта:

    This project keeps checked invariants as ROFL notebooks (*.rofl.md). Run `rofl-nb --help` once.
    After editing a notebook or the code it names, run `rofl-nb <file.rofl.md>` (`--json` to parse).
    Exit 1: a `never` fails, fix the code or the rule. Exit 2: something was not read, see the errors.
    Exit 3: it holds only as far as the model sees; read the rows listed as out of sight.

## Команды

    rofl-nb <file.rofl.md> [--json] [--cell N]   что говорит каждая ячейка
    rofl-nb <file.rofl.md> --all                 все ответы, а не первые 12 (JSON: 50)
    rofl-nb <file.rofl.md> --timing              время каждой фазы, на stderr
    rofl-nb <file.rofl.md> --format F            `draw` в форме F: mermaid, dot, argdown, vega-lite, ... (DRAWING.md)
    rofl-nb edit <file.rofl.md> --cell N         новый текст ячейки N со stdin (`--lang L` для новой ячейки); единственный
                                                 безопасный способ для программы изменить блокнот: файл записывается,
                                                 только если читается обратно так, как записан
    rofl-nb translate <file.rofl.md>             модель пишет ячейку rofl под каждой ячейкой natural (rofl-nb models)
    rofl-nb vocab [<file.rofl.md>] [word]        предложения, которые может использовать ячейка; с файлом — и его собственные
    rofl-nb --help env                           переменные окружения:

<!-- BEGIN run examples/start: rofl-nb --help env -->
```
$ rofl-nb --help env
ROFL_NB_LIMIT=120        seconds a run evaluates before it stops and answers what it found (exit 3)
ROFL_NB_MEMORY=<GB>      gigabytes of heap likewise; by default most of what Node allows
ROFL_NB_DAEMON=0         run in this process; by default runs go to a kept kernel, started on first use
                         (the model loads once, 10 to 20 s; later runs take seconds)
ROFL_NB_TIMEOUT=<s>      how long to wait for the kept kernel; by default ROFL_NB_LIMIT + 180
ROFL_NB_IDLE=900         seconds the kept kernel waits for a run before it exits
ROFL_NB_MODEL_CMD=<sh>   a command that reads the prompt on stdin and prints the answer (the harness named command)
ROFL_NB_<NAME>=<path>    the binary of that harness, e.g. ROFL_NB_CLAUDE=/opt/claude
ROFL_NB_ALLOW_TOOLS=1    run a harness that cannot be run without tools (codex, copilot, hermes)
ROFL_NB_MODEL_TIMEOUT=180  seconds translate waits for the model
ROFL_NB_READ_ROUNDS=6    rounds the model may read the workspace's files before it writes; ROFL_NB_READ_BUDGET=200000 bytes in all
ROFL_NB_UNTRACKED_COMMAND=<sh>  prints the files your version control tracks, for untracked_by(command) in .rofl/read.rofl
```
<!-- END run -->

## Коды выхода

0 каждый `never` выполняется · 1 какой-то `never` не выполняется · 2 что-то
не прочитано · 3 выполняется, но какие-то лишь насколько модель видит, либо
запуск упёрся в предел по времени или памяти.

## `--json`

Один объект. `status` — это `ok`, `fails`, `unread` или `blind` (коды
выхода 0, 1, 2, 3). `errors` перечисляет, что не было прочитано;
`unresolved`, когда есть, — импорты, за которыми модель не смогла пойти.
В `cells[]` у каждой ячейки `index`, `kind` (`rofl`, `datalog`, `natural`,
`prose`), `line`, `errors` и `lines[]`. У каждой строки `kind` (`answers`,
`never`, `why`, `whynot`, `unsure`, `extends`, `excise`), `text`, `verdict`
(`answers`, `holds`, `fails`, `blind`, `explained`, `unasked`), `total` и
`answers[]` из `{ sentence, literal, at }`, где `at` — место в коде.

## Рисование

Когда просят картинку, прочтите `rofl:visual/viewpoints.rofl.md`: шестьдесят
точек зрения, у каждой — вопрос, на который она отвечает, что значат её
прямоугольники, линии и рамки, и её раскладка. Выберите одну по вопросу
(`? V answers Q`, `? V is recognised by the words W`), затем напишите
правила, которые отображают собственные предложения блокнота на
`rofl:visual/graph.rofl.md`, и закончите ячейку строкой `draw graph`. Слова,
раскладки и шаги описаны в [docs/schemas.md](../../docs/schemas.md); каждый
вид картинки — в [DRAWING.md](DRAWING.md).

## За пределами блокнота

Вопрос о коде из командной строки, без блокнота, задают `rofl ask`,
`rofl why` и `rofl whynot` ([ASKING.md](ASKING.md)). Все команды, миры,
которые они хранят, коды выхода и протокол `rofl serve` описаны в
[docs/cli.md](../../docs/cli.md). Мир вычисляется в одной куче: прежде чем
направить его на тысячи файлов, прочтите там раздел *A corpus larger than
one heap*.

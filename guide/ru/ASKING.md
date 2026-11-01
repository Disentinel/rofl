# Вопросы о своём коде из командной строки

[WHAT.md](WHAT.md) задал свой вопрос в блокноте, предложениями. Тот же вопрос
можно задать из командной оболочки, самому или через агента, командой
`rofl`: один вопрос на входе, один ответ на выходе, `--json`, когда читать
будет программа. Факты те же, значит, и ответ тот же. Меняется язык: командная
строка говорит на Datalog — тех же предложениях блокнота, только без лишних
слов. `rofl-nb vocab` перечисляет обе формы рядом, имя на Datalog в скобках
после каждого предложения:

<!-- BEGIN run examples/start: rofl-nb vocab throw | head -4 -->
```
$ rofl-nb vocab throw | head -4
controlflow: a call is an exit
  a function F always throws   (always_throws)
  a call C is a throwing call   (throwing_call)
  a function F throws at the top   (top_throw)
```
<!-- END run -->

`a function F may throw` — это `may_throw(F)`. Магазин из WHAT.md,
`guide/examples/first`, служит и здесь.

## Файл мира

Командная строка читает мир: файл из фактов и правил. Этот называет код,
который надо просканировать, и определяет вопрос:

<!-- BEGIN file guide/examples/first/shop.rofl -->
```rofl
-- The shop, for the command line. The scanner reads checkout.js and every file it imports.
scanner(js, "rofl scan .").
scan_request(js, "checkout.js").
scan_request(js, F) :- depends[code](_, F).

-- an exported function that may throw at its caller
risky(N) :- fn_name[code](F, N), exported_fn[code](F), may_throw[code](F).
```
<!-- END file -->

Он начинается с того, откуда берутся факты. `scanner` называет команду,
которая превращает файл JavaScript в факты, — `rofl scan`, запущенную в этой
папке. `scan_request` просит `checkout.js`, а затем каждый файл, от которого
зависит уже просканированный: `pay.js` сканируется потому, что его
импортирует `checkout.js`, а файл, который никто не импортирует, не читается
вовсе. Последняя строка — правило из WHAT.md на Datalog: `[code]` после имени
говорит, в какой *книге* лежат факты; это та, в которую пишет модель
JavaScript.

## Спросить

<!-- BEGIN run guide/examples/first: rofl ask 'risky(N)' @rules/js.files shop.rofl -->
```
$ rofl ask 'risky(N)' @rules/js.files shop.rofl
N = "charge"
N = "checkout"
```
<!-- END run -->

По строке на ответ: переменная и её значение. `@rules/js.files` — модель
JavaScript, два десятка файлов правил, которые говорят, что значит
`may_throw`; команда `rofl` находит их в собственном пакете, так что строка
работает из любой папки. Мир — это модель плюс `shop.rofl`, а `shop.rofl`
подтягивает код.

Для программы `--json` печатает тот же ответ одним объектом на строку:

<!-- BEGIN run guide/examples/first: rofl ask 'risky(N)' --json @rules/js.files shop.rofl -->
```
$ rofl ask 'risky(N)' --json @rules/js.files shop.rofl
{"keys":["risky[main](\"checkout\")","risky[main](\"charge\")"],"ok":true,"partial":false,"rows":[["\"checkout\""],["\"charge\""]],"shrugs":[],"vars":["N"]}
```
<!-- END run -->

`partial` равно `false`: каждая строка, которая следует из фактов, на месте.
Оно становится `true`, а код выхода — 5, когда вычисление оборвал бюджет или
не удалось сканирование; тогда строк может не хватать, и вывод говорит об
этом прямо, вместо того чтобы выдать короткий список за полный.

## Почему

<!-- BEGIN run guide/examples/first: rofl why 'risky("checkout")' @rules/js.files shop.rofl | head -23 -->
```
$ rofl why 'risky("checkout")' @rules/js.files shop.rofl | head -23
risky[main]("checkout")  <= re667b5bf @tick 0
  fn_name[code](n017f49dbfbe9e0a8_fa4unkv52g4,"checkout")  <= rb448fa01 @tick 0
    fn_node[code](n017f49dbfbe9e0a8_fa4unkv52g4)  <= r631ec945 @tick 0
      body[value](n017f49dbfbe9e0a8_fa4unkv52g4,n017f49dbfbe9e0a8_6siev33bp82)  <= rb22caae4 @tick 0
        fn_kind[ast_babel](function_declaration) [axiom]
        node[ast_babel](n017f49dbfbe9e0a8_fa4unkv52g4,function_declaration,"checkout.js")  <= ra858953d @tick 0
          ast_node[code](n017f49dbfbe9e0a8_fa4unkv52g4,function_declaration,"checkout.js") [axiom]
        child[ast_babel](n017f49dbfbe9e0a8_fa4unkv52g4,body,0,n017f49dbfbe9e0a8_6siev33bp82)  <= r1e007e15 @tick 0
          ast_child[code](n017f49dbfbe9e0a8_fa4unkv52g4,body,0,n017f49dbfbe9e0a8_6siev33bp82) [axiom]
    target[value](n017f49dbfbe9e0a8_fa4unkv52g4,n017f49dbfbe9e0a8_pi9h9ptud43)  <= r56fa45d2 @tick 0
      target_field[ast_babel](function_declaration,id) [axiom]
      node[ast_babel](n017f49dbfbe9e0a8_fa4unkv52g4,function_declaration,"checkout.js") [above]
      child[ast_babel](n017f49dbfbe9e0a8_fa4unkv52g4,id,0,n017f49dbfbe9e0a8_pi9h9ptud43)  <= r1e007e15 @tick 0
        ast_child[code](n017f49dbfbe9e0a8_fa4unkv52g4,id,0,n017f49dbfbe9e0a8_pi9h9ptud43) [axiom]
    binds[value](n017f49dbfbe9e0a8_pi9h9ptud43,"checkout")  <= r06d8976c @tick 0
      b_bind[ast_babel](n017f49dbfbe9e0a8_pi9h9ptud43,value)  <= r610c4050 @tick 0
        bind_root[ast_babel](function_declaration,id,value) [axiom]
        node[ast_babel](n017f49dbfbe9e0a8_fa4unkv52g4,function_declaration,"checkout.js") [above]
        child[ast_babel](n017f49dbfbe9e0a8_fa4unkv52g4,id,0,n017f49dbfbe9e0a8_pi9h9ptud43) [above]
      node[ast_babel](n017f49dbfbe9e0a8_pi9h9ptud43,identifier,"checkout.js")  <= ra858953d @tick 0
        ast_node[code](n017f49dbfbe9e0a8_pi9h9ptud43,identifier,"checkout.js") [axiom]
      attr[ast_babel](n017f49dbfbe9e0a8_pi9h9ptud43,name,"checkout")  <= r17100bcb @tick 0
        ast_attr[code](n017f49dbfbe9e0a8_pi9h9ptud43,name,"checkout") [axiom]
```
<!-- END run -->

То же доказательство, что в блокноте, в собственной форме движка. Каждая
строка — факт; `<= re667b5bf @tick 0` называет правило, которое его вывело;
строки с отступом под ним — факты, которые это правило использовало;
`[axiom]` — факт, который был дан, сканером или файлом правил, и под аксиомой
ничего нет. Узел кода здесь — его идентификатор, а не имя:
`n017f49dbfbe9e0a8_fa4unkv52g4` — это функция `checkout`, и строка `fn_name`
прямо под ним — то, что связывает их вместе. Целиком доказательство занимает
около 150 строк. Форма блокнота, с `[function checkout() at checkout.js:4]`
на месте идентификатора, — та, которую читают; форма командной строки — та,
которую разбирает программа.

## Почему нет

<!-- BEGIN run guide/examples/first: rofl whynot 'risky("safeCheckout")' --depth 1 @rules/js.files shop.rofl -->
```
$ rofl whynot 'risky("safeCheckout")' --depth 1 @rules/js.files shop.rofl
whynot risky[main]("safeCheckout"):
  rule re667b5bf: risky[main](?N)@now :- fn_name[code](?F,?N)@now, exported_fn[code](?F)@now, may_throw[code](?F)@now
    failed premise: may_throw[code](n017f49dbfbe9e0a8_gjdh70j2637)
```
<!-- END run -->

Единственное правило, которое могло бы заключить `risky("safeCheckout")`, и
посылка, которая не выполнилась: `may_throw` узла, который и есть
`safeCheckout`. `--depth 2` идёт на одно правило дальше и среди способов,
которыми `may_throw` мог бы выполниться, называет тот, что был перекрыт:
`not caught_here(C)` не выполняется, потому что выполняется
`caught_here(C)` — вызов `checkout` стоит внутри `try`. Каждый уровень вниз
умножает число строк; `--depth N` и `--nodes N` ограничивают обход.

## Чего он не видел

Блокнот печатает заметку о `./log.js` раньше всего остального. В командной
строке пробел — такое же отношение, как любое другое, и о нём спрашивают:

<!-- BEGIN run guide/examples/first: rofl ask 'unresolved_relative[code](F,L,S)' @rules/js.files shop.rofl -->
```
$ rofl ask 'unresolved_relative[code](F,L,S)' @rules/js.files shop.rofl
F = "checkout.js", L = 2, S = "./log.js"
```
<!-- END run -->

Относительный импорт, который не называет ни одного файла кода, с его
файлом и строкой. Агент, который спрашивает о коде, должен задавать и этот
вопрос: ответ над миром с неразрешённым импортом выполняется лишь настолько,
насколько модель видит.

## Второй вопрос ничего не стоит

Первый `rofl ask` над магазином просканировал два файла, вычислил модель и
ответил примерно за секунду. Заодно он сохранил построенный мир под
`~/.cache/rofl/worlds`, назвав его по файлам и движку. Второй вопрос над теми
же файлами, этот же или другой, получает ответ из сохранённого мира без
вычисления: 0,03 с на той же машине. Замените `<=` в `pay.js` на `<` и
спросите снова: запуск сканирует этот один файл заново, принимает изменение
дельтой вместо того, чтобы начинать сначала, и говорит об этом на stderr:

```
the kept world took 1 file by delta: pay.js (scanned again) (1 facts out, 4 overdeleted or derived again; opened and taken in 285 ms, kept again in 0 ms, 220396 bytes written over the world it was kept from)
```

Ничего включать не нужно. Кэш держит не больше `ROFL_CACHE_GB` гигабайт
(50 по умолчанию) и первым выбрасывает мир, который дольше всех не
спрашивали. Мир, слишком большой для кэша, получает ответ и не сохраняется,
о чём сказано на stderr; мир, который перерастает предел во время
вычисления, останавливается на нём, отвечает тем, что есть, как частичным
ответом (код выхода 5), и продолжает с места остановки, когда его спросят
под большим пределом.

## Коды выхода

| код | значение |
|---|---|
| 0 | ответ дан, целиком |
| 1 | вызов неверен: флаг, значение, файл, который не читается |
| 2 | файл отвергнут: он не разбирается или не загружается; или мир `--kept` устарел |
| 3 | мир отвергнут при вычислении: объявленная структура не выполняется, или отрицание проходит через цикл |
| 4 | вопрос отвергнут: `why` литерала с переменной внутри, `excise` факта, который не был дан, вопрос вне объявленного конуса мира |
| 5 | ответ дан, но из мира, оборванного его бюджетом, его памятью или неудавшимся сканированием; строк может не хватать |
| 70 | дефект самого движка |

Отказ сильнее частичного ответа: запуск с отвергнутым вопросом завершается
кодом 4, что бы ещё ни произошло.

## Остальное

`rofl excise F` отвечает, что изменится без данного факта F: какие строки
уйдут и какие придут. `rofl load --ask L --why L --whynot L --excise F`
задаёт несколько вопросов за одно вычисление, ответы в том же порядке, с
пустой строкой после каждого. `--kept F` сохраняет мир по вашему пути, под
более строгим правилом: вычислен один раз, спрошен сколько угодно раз,
отвергнут вместо пересчёта, как только изменится файл, из которого он был
построен. Каждый флаг, формы JSON, `rofl serve` для долгоживущего процесса и
`rofl render` для формы предложений описаны в
[docs/cli.md](../../docs/cli.md).

Дальше: [QUICKSTART.md](QUICKSTART.md) про блокнот и
[CONCEPTS.md](CONCEPTS.md) про форму предложений, на которой он говорит.

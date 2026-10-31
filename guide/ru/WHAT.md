# Что такое ROFL и что он отвечает

ROFL держит модель вашего кода и отвечает на вопросы о ней. Не списком
совпадений, как grep, и не «да» или «нет», как линтер, а одной из трёх вещей:

- **ответом с доказательством**: каждый шаг от факта в коде до вывода, так что
  его можно проверить;
- **местом, где останавливается «нет»**: тем единственным условием, которое
  должно было бы выполняться, чтобы ответ был «да», и не выполняется;
- **честным «я этого не видел»**: какую часть кода модель не прочла, чтобы вы
  знали, докуда ответ дотягивается.

Вопросы пишутся предложениями. Модель, которая превращает код в факты,
поставляется вместе с ROFL для JavaScript и TypeScript; правила, которые
превращают факты в ответы, — ваши: их можно читать, менять и дополнять.

## Магазин в двух файлах

`pay.js` бросает исключение, если сумма неверна. `checkout.js` вызывает его
дважды: один раз напрямую, другой — внутри `try`. Третий файл, `log.js`,
импортируется, но его нет.

<!-- BEGIN file guide/examples/first/pay.js -->
```js
export function charge(card, amount) {
  if (amount <= 0) throw new Error('nothing to charge');
  return { card, amount };
}
```
<!-- END file -->

<!-- BEGIN file guide/examples/first/checkout.js -->
```js
import { charge } from './pay.js';
import { log } from './log.js';

export function checkout(cart) {
  log('checkout', cart.id);
  return charge(cart.card, cart.total);
}

export function safeCheckout(cart) {
  try {
    return checkout(cart);
  } catch (e) {
    return null;
  }
}
```
<!-- END file -->

Вопрос: какая экспортируемая функция может бросить исключение тому, кто её
вызывает. Он записан в блокноте — Markdown-файле, который ROFL выполняет:

<!-- BEGIN file guide/examples/first/checkout.rofl.md -->
````markdown
---
model: js
code:
  - pay.js
  - checkout.js
---

# Which exported function can throw at its caller

> Two files of a shop. `charge` throws on a bad amount; `checkout` calls it; `safeCheckout` wraps the call in a `try`.

```rofl
A name N is a risky export if a function F answers to N, F is exported and F may throw.

? N is a risky export
why "checkout" is a risky export
```

> `safeCheckout` catches what `checkout` throws.

```rofl
whynot "safeCheckout" is a risky export
```

> The invariant a CI run would hold.

```rofl
never N is a risky export
```
````
<!-- END file -->

Первая строка первой ячейки — правило: оно говорит, что значит «рискованный
экспорт» (*a risky export*), через три предложения, которые модель JavaScript
уже знает (`answers to` — отзывается на имя, `is exported` — экспортируется,
`may throw` — может бросить исключение). Все остальные строки спрашивают.

## Ответ и его доказательство

<!-- BEGIN run guide/examples/first: rofl-nb checkout.rofl.md --cell 1 | head -33 -->
```
$ rofl-nb checkout.rofl.md --cell 1 | head -33
checkout.rofl.md: note: 1 relative import or require was not resolved, so a never holds only as far as the model sees:
  checkout.js:2 "./log.js"
checkout.rofl.md:13: cell 1 · rofl
  checkout.rofl.md:15: ? N is a risky export  ->  2 answers
    - "charge" is a risky export
    - "checkout" is a risky export
  checkout.rofl.md:16: why "checkout" is a risky export
    the value's steps, from where it is written:
      checkout.js:4  checkout             it is named "checkout"
      checkout.js:4  function checkout()  it answers to "checkout"
                                          "checkout" is a risky export
    the proof:
    "checkout" is a risky export, because
      [function checkout() at checkout.js:4] is a function, in the code, because
        `function_declaration` is a function kind (given)
        [function checkout() at checkout.js:4] is of kind `function_declaration` in file "checkout.js", in the code (given)
      [function checkout() at checkout.js:4] answers to "checkout", in the code, because
        [function checkout() at checkout.js:4] is of kind `function_declaration` in file "checkout.js", in the code (given)
        The `id` of [function checkout() at checkout.js:4] is [checkout at checkout.js:4], in the code (given)
        [checkout at checkout.js:4] is named "checkout", in the code, because
          The attribute `name` of [checkout at checkout.js:4] is "checkout", in the code (given)
      [function checkout() at checkout.js:4] is exported, in the code, because
        [function checkout() at checkout.js:4] is a function, in the code [above]
        + 1 side condition holds (nothing says otherwise)
        [function checkout() at checkout.js:4] is within [export named at checkout.js:4], in the code, because
          [function checkout() at checkout.js:4] is under [export named at checkout.js:4], in the code, because
            The `declaration` of [export named at checkout.js:4] is [function checkout() at checkout.js:4], in the code (given)
        [export named at checkout.js:4] is of kind `export_named_declaration` in file "checkout.js", in the code (given)
        `export_named_declaration` is an export declaration kind (given)
      [function checkout() at checkout.js:4] may throw, in the code, because
        [function charge() at pay.js:1] may throw, in the code, because
          [function charge() at pay.js:1] throws outright, in the code, because
            [throw at pay.js:2] is of kind `throw_statement` in file "pay.js", in the code (given)
```
<!-- END run -->

Первые две строки, ещё до всякого ответа, — это третий вид ответа: модель не
нашла `log.js` и говорит об этом раньше всего остального. Каждый `never` в
этом блокноте теперь выполняется лишь настолько, насколько модель видит.

`? N is a risky export` перечисляет два имени. `charge` бросает исключение
сам. В `checkout` нет ни одного `throw`, и всё же он в списке, а `why`
говорит, почему. Сначала короткая форма: шаги от имени в коде до ответа, по
строке на шаг. Потом доказательство, деревом с отступами: `checkout` —
рискованный экспорт, *потому что* это функция, *потому что* она отзывается
на имя, *потому что* она экспортируется и *потому что* может бросить
исключение; а бросить она может *потому что* может `charge`, *потому что*
`charge` бросает его напрямую в `pay.js:2`. Каждый лист помечен `(given)`:
факт, прочитанный прямо из кода. Строка с пометкой `[above]` уже доказана
выше. «Побочные условия» (*side conditions*) — это части `unless` в
правилах, то, что выполняется потому, что ничто в коде не говорит обратного;
они сосчитаны, а `--all` их печатает.

В этом доказательстве нет ни одной догадки. Каждая строка — правило,
применённое к фактам, а правила — текст, который можно открыть.

## Где останавливается «нет»

<!-- BEGIN run guide/examples/first: rofl-nb checkout.rofl.md --cell 2 -->
```
$ rofl-nb checkout.rofl.md --cell 2
checkout.rofl.md: note: 1 relative import or require was not resolved, so a never holds only as far as the model sees:
  checkout.js:2 "./log.js"
checkout.rofl.md:22: cell 2 · rofl
  checkout.rofl.md:22: whynot "safeCheckout" is a risky export
    by file:
      checkout.js: none; it stops at: [function safeCheckout() at checkout.js:9] may throw, in the code
        why not "safeCheckout" is a risky export in checkout.js:
          by the rule: N is a risky export if F is a function, in the code, F answers to N, in the code, F is exported, in the code, F may throw, in the code
            it stops at: [function safeCheckout() at checkout.js:9] may throw, in the code
              by the rule: F may throw, in the code if G may throw, in the code, G runs its body at once, in the code, C resolves to G, in the code, F is the nearest function of C, in the code, not C is caught here, in the code
                it stops at: not [checkout() at checkout.js:11] is caught here, in the code, and [checkout() at checkout.js:11] is caught here, in the code does
          (every failure: --all)
      pay.js: none; it stops at: Some function answers to "safeCheckout", in the code -- none in this file
        why not "safeCheckout" is a risky export in pay.js:
          by the rule: N is a risky export if F is a function, in the code, F answers to N, in the code, F is exported, in the code, F may throw, in the code
            it stops at: Some function answers to "safeCheckout", in the code -- none in this file
checkout.rofl.md: 1 question answered, 1 invariant fails, 2 explained — FAILS at line 28 (exit 1; see rofl-nb --help)
```
<!-- END run -->

`safeCheckout` в списке нет, и `whynot` говорит, почему нет, файл за файлом.
В `checkout.js` цепочка останавливается на одном условии: `safeCheckout`
должна была бы быть функцией, которая может бросить исключение, а она не
такая, потому что единственный вызов в ней, который может бросить, перехвачен
её `try`. В `pay.js` цепочка останавливается раньше: там вообще ни одна
функция не отзывается на это имя. В этом разница между «нет» и «не найдено»:
ответ называет условие, которое не выполнилось, и вы сами решаете, что
неправильно — код или правило.

## Чего модель не видела

Заметка наверху — не предупреждение, которое можно пролистать. `checkout`
вызывает `log`, а `log.js` отсутствует, так что модель ничего не знает о
том, что `log` делает. Если бы `log` бросал исключение, `checkout` всё равно
был бы рискованным, так что ответ держится; но `never`, который зависит от
того, что делает `log`, выполняется *лишь настолько, насколько модель
видит*, и запуск, чьи инварианты выполняются именно так, завершается кодом
3, а не 0. Пробел назван с файлом и строкой, так что исправление — либо
добавить файл в список, либо принять пробел сознательно.

ROFL никогда не заполняет пробел догадкой. Где кончаются факты, там кончается
ответ, и он говорит, где.

## Откуда берутся факты

```
   your files  ──scan──▶  facts  ──rules──▶  answers
   pay.js                 [charge] throws     "charge" is a risky export
   checkout.js            [checkout] calls    "checkout" is a risky export
   log.js  (missing)      [checkout] reads    … and the note about log.js
                          "log" from ./log.js
```

**Сканер** читает каждый файл один раз и записывает, что там есть: этот узел
— функция, её имя `charge`, этот оператор — `throw`, он стоит внутри той
функции. Это и есть факты: 304 штуки для этих двух файлов. **Правила**
говорят, что из фактов следует: функция, в которой есть `throw`, бросает
исключение напрямую; функция, которая вызывает ту, что может бросить, может
бросить сама, если только вызов не внутри `try`. Модель JavaScript — это
около двадцати файлов таких правил, написанных теми же предложениями, что вы
видели в блокноте. Ваше правило, `a name N is a risky export if ...`, — ещё
одна строка на том же языке, и ей достаются те же `why` и `whynot`, что и
правилам из поставки.

Поскольку ответ вычисляется из фактов и правил и ни из чего больше,
доказательство достаётся бесплатно: доказательство *и есть* само вычисление,
выписанное целиком.

## Где это работает

Одна и та же модель отвечает в четырёх местах, над одними и теми же файлами:

| | |
|---|---|
| `rofl ask`, `rofl why`, `rofl whynot`, `rofl excise` | один вопрос из командной строки, для человека или агента; `--json` для программы. Мир сохраняется, так что второй вопрос над теми же файлами получает ответ примерно за секунду ([ASKING.md](ASKING.md)) |
| `rofl-nb file.rofl.md` | блокнот из вопросов и инвариантов, запускаемый в CI; код выхода 1, когда инвариант не выполняется, 3, когда он выполняется лишь насколько модель видит ([QUICKSTART.md](QUICKSTART.md)) |
| VS Code | тот же блокнот, ячейка за ячейкой, с картинками ([INSTALL.md](INSTALL.md)) |
| [disentinel.github.io/rofl](https://disentinel.github.io/rofl/) | блокнот в браузере, ничего не устанавливая |

Дальше: [QUICKSTART.md](QUICKSTART.md) устанавливает ROFL и задаёт первый
вопрос за пять минут. [CONCEPTS.md](CONCEPTS.md) — каждое слово языка
блокнота на одной странице.

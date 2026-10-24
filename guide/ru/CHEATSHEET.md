# Шпаргалка

## Запуск

    rofl-nb file.rofl.md           выполнить; --json, --cell N, --all
    rofl-nb vocab [word]           что можно сказать о коде
    rofl-nb vocab file.rofl.md     ... плюс собственные предложения этого блокнота
    rofl-nb translate file.rofl.md модель превращает ячейки на естественном языке в rofl
    rofl-nb models                 какую модель спрашивает translate
    rofl-nb --help

Код выхода: 0 всё выполняется · 1 какой-то `never` не выполняется · 2 файл не
прочитан · 3 выполняется лишь насколько модель видит.

## Шапка файла (необязательна)

    ---
    model: js                  # или none (по умолчанию)
    code:
      - ../src/**/*.ts         # относительно блокнота
    reads:
      - rules.rofl.md          # предложения другого файла, загружаются первыми
    ---

## Объявить, утверждать, выводить

    Declared as facts:

    - <a id="owns"></a>A team T owns a module M

    The repository today:

    - `platform` owns `auth`.

    A change C needs a team T if C touches a module M and T owns M.

    A change C is blocked by a team T if C needs T, unless C is covered for T.

    A change C is covered for a team T either:

    1. if C is approved by a person P and P is on T;
    2. if C is written by a person P and P is on T.

## Спросить, в ячейке rofl

    ? C is blocked by T               все ответы
    never C is blocked by `payments`  инвариант
    why `c2` is blocked by `platform` доказательство
    whynot `c2` is mergeable          где останавливается
    excise `c1` is approved by `ben`  что изменится без этого факта
    unsure F always throws            под never: чего модель не видела
    extends R                         эта ячейка добавляет правила к R модели

## Обозначения

`T` переменная · `` `platform` `` имя · `"text"` · `42` ·
`some team`, `something` пропуск, который вы не учитываете · `it` последнее
подлежащее · `> цитата` проза, которую читают только люди.

Подробнее: [QUICKSTART.md](QUICKSTART.md) · [CONCEPTS.md](CONCEPTS.md) ·
[WRITING.md](WRITING.md) · [AGENTS.md](AGENTS.md)

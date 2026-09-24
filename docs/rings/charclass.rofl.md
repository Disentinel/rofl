---
world: charclass
books: main
default: main
---

# charclass

> Character classes: DATA, generated, not a decision about the grammar.
> 
> The line feed is written with an escape here. Until 2026-09-04 it could
> not be: an escape meant `take the next character literally`, so the
> sequence was the LETTER n and this row silently declared n to be a
> newline, which ended every comment at the first n inside it. C-style
> escapes landed the same day and the row now says what it looks like it
> says.
> 
> No other control character appears: everything unclassified is simply
> not a token character, which is what spaces, tabs and carriage returns
> need.

`cls` lists:

| character | class |
|---|---|
| "a" | `lower` |
| "b" | `lower` |
| "c" | `lower` |
| "d" | `lower` |
| "e" | `lower` |
| "f" | `lower` |
| "g" | `lower` |
| "h" | `lower` |
| "i" | `lower` |
| "j" | `lower` |
| "k" | `lower` |
| "l" | `lower` |
| "m" | `lower` |
| "n" | `lower` |
| "o" | `lower` |
| "p" | `lower` |
| "q" | `lower` |
| "r" | `lower` |
| "s" | `lower` |
| "t" | `lower` |
| "u" | `lower` |
| "v" | `lower` |
| "w" | `lower` |
| "x" | `lower` |
| "y" | `lower` |
| "z" | `lower` |
| "A" | `upper` |
| "B" | `upper` |
| "C" | `upper` |
| "D" | `upper` |
| "E" | `upper` |
| "F" | `upper` |
| "G" | `upper` |
| "H" | `upper` |
| "I" | `upper` |
| "J" | `upper` |
| "K" | `upper` |
| "L" | `upper` |
| "M" | `upper` |
| "N" | `upper` |
| "O" | `upper` |
| "P" | `upper` |
| "Q" | `upper` |
| "R" | `upper` |
| "S" | `upper` |
| "T" | `upper` |
| "U" | `upper` |
| "V" | `upper` |
| "W" | `upper` |
| "X" | `upper` |
| "Y" | `upper` |
| "Z" | `upper` |
| "0" | `digit` |
| "1" | `digit` |
| "2" | `digit` |
| "3" | `digit` |
| "4" | `digit` |
| "5" | `digit` |
| "6" | `digit` |
| "7" | `digit` |
| "8" | `digit` |
| "9" | `digit` |
| "_" | `upper` |
| "(" | `lpar` |
| ")" | `rpar` |
| "[" | `lbrack` |
| "]" | `rbrack` |
| "," | `comma` |
| "." | `dot` |
| ":" | `colon` |
| "-" | `dash` |
| "\"" | `quote` |
| "\n" | `nl` |

Declared as facts:

- <a id="cls"></a>`cls` — rows in this file

> WHITESPACE IS NOW NAMED rather than left unclassified. It shared the
> unclassified bucket with `{`, `#` and every other character the host
> refuses, so `p({a}).` produced `p[main](a)@now` while src/parser.ts said
> `expected a term, got '{'`. Coverage was over TOKENS, and a character that
> makes no token has no token to be uncovered.

`cls` lists:

| character | class |
|---|---|
| "$" | `dollar` |
| " " | `space` |
| "\t" | `space` |
| "\r" | `space` |
| "\\" | `backslash` |
| "@" | `at` |
| "=" | `eq` |
| "!" | `bang` |
| "<" | `lt` |
| ">" | `gt` |
| "+" | `plus` |
| "*" | `star` |
| "/" | `slash` |


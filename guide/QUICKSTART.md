# Quickstart

A ROFL notebook is a Markdown file ending in `.rofl.md` that answers
questions about what it says. `rofl-nb` runs one.

## 1. Copy the examples

Works from any folder:

    cp -r "$(npm root -g)/rofl-nb/examples" ~/rofl-examples
    cd ~/rofl-examples/tutorial

## 2. Play level 1 of the tutorial

<!-- BEGIN run+exit examples/tutorial: rofl-nb 1-what-ships.rofl.md -->
```
$ rofl-nb 1-what-ships.rofl.md
1-what-ships.rofl.md:72: cell 1 · rofl
  1-what-ships.rofl.md:72: ? X leaves the line  ->  3 answers
    - `bike` leaves the line
    - `car` leaves the line
    - `scooter` leaves the line
1-what-ships.rofl.md:111: cell 2 · rofl
  1-what-ships.rofl.md:111: never L is missing an answer  ->  FAILS · 1
    - `level1` is missing an answer
  1-what-ships.rofl.md:112: never X is on your list by mistake  ->  FAILS · 1
    - `sofa` is on your list by mistake
1-what-ships.rofl.md: a never fails
$ echo $?
1
```
<!-- END run+exit -->

A line starting with `?` is a question. Its answers are listed under it.
A line starting with `never` must have no answers. Here two have one, so the
run ends with exit 1. Open the file, do what *Your move* says, and run it
again until the last line says **every never holds**. (Before the answers,
on stderr, a line like `load 57 ms, run 67 ms` says how long it took.) Levels 2 to 6 each add
one word. In VS Code, open the file and press **Run All**.

## 3. Write a notebook of your own

Save this as `pets.rofl.md` (a copy is in `~/rofl-examples/start`):

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
pets.rofl.md: a never fails
```
<!-- END run -->

The line with `<a id="likes"></a>` declares a sentence. The list under a
line ending in a colon gives its facts. The line with `if` is a rule.
[WRITING.md](WRITING.md) has the whole form.

## 4. Point it at your code

Name the code in the front matter, between the `---` lines. `model: js`
reads JavaScript and TypeScript. In `~/rofl-examples/start`, beside `app.js`:

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
app.rofl.md: a never fails
$ echo $?
1
```
<!-- END run+exit -->

`code:` takes paths and globs, relative to the notebook (`- ../src/**/*.ts`).
To find what you can say about code, search the sentences by a word:

<!-- BEGIN run examples/start: rofl-nb vocab throw -->
```
$ rofl-nb vocab throw
a function F always throws   (always_throws)
a function F may throw   (may_throw)
a function F may throw without a latent exception   (may_throw_only)
a call C is a throwing call   (throwing_call)
a function F throws out a node V   (thrown_by)
a try T throws a node V   (thrown_in)
a function F throws outright   (throws_outright)
a function F throws at the top   (top_throw)
8 sentences with "throw"
```
<!-- END run -->

Next: [CONCEPTS.md](CONCEPTS.md), or [CHEATSHEET.md](CHEATSHEET.md) for one
screen of everything.

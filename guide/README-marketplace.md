# ROFL notebooks

ROFL checks what you say about your code. A notebook (`.rofl.md`) is
Markdown with sentences, rules and questions; it answers the questions and
marks every `never` that fails, on the line in your code where it fails.

![A notebook over a JavaScript file: answers under each question, and a failing never marked in the code](https://raw.githubusercontent.com/Disentinel/rofl/notebook/vscode/media/notebook.png)

## Use it

- Open any `.rofl.md` file: it opens as a notebook. Press **Run All**.
- New here? Play the tutorial: six short levels, one new word each.
  Get it with the `rofl-nb` command, or from
  [GitHub](https://github.com/Disentinel/rofl/tree/main/examples/tutorial).

![Level 1 of the tutorial, run](https://raw.githubusercontent.com/Disentinel/rofl/notebook/vscode/media/tutorial.png)

- A `.rofl` file gets errors on their lines, hover, go to definition and
  completion.

## Learn

- [Quickstart](https://github.com/Disentinel/rofl/blob/main/guide/QUICKSTART.md)
- [Concepts](https://github.com/Disentinel/rofl/blob/main/guide/CONCEPTS.md)
- [Writing sentences and rules](https://github.com/Disentinel/rofl/blob/main/guide/WRITING.md)
- [Cheat sheet](https://github.com/Disentinel/rofl/blob/main/guide/CHEATSHEET.md)

## Good to know

- Desktop VS Code only; not in the browser.
- No telemetry. Nothing leaves your machine, except:
- **Translate** (natural-language cells) sends the notebook text to the model you
  chose: VS Code's language model (e.g. Copilot) or a CLI (`ROFL: Choose model`).
- A notebook reads the code files its front matter names, so it runs only
  in a trusted workspace.

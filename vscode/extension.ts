// A `.rofl.md` opens as a notebook; Run goes through notebook/kernel.ts in a worker; a failing never marks the lines it names.
import * as vscode from 'vscode';
import { Worker } from 'node:worker_threads';
import { CODE, KINDS, deserialize, serialize, type Cell, type Doc } from './serial.ts';
import type { Run, Shown } from './render.ts';
import type { Cell as Ask } from './worker.ts';

const TYPE = 'rofl-notebook';
type Note = { file: string; line: number; never: string; warn: boolean; where: vscode.Location };

let worker: Worker | undefined, seq = 0;
const waiting = new Map<number, { ok: (r: any) => void; fail: (e: Error) => void }>();
function ask<T>(op: 'run' | 'translate', file: string, text: string, unsaved: Record<string, string> = {}, cell?: Ask): Promise<T> {
  if (!worker) {
    const w = worker = new Worker(new URL('./worker.ts', import.meta.url));
    w.on('message', ({ id, r, error }) => { const p = waiting.get(id)!; waiting.delete(id); error ? p.fail(new Error(error)) : p.ok(r); });
    w.on('error', (e) => { worker = undefined; for (const p of waiting.values()) p.fail(e); waiting.clear(); });
  }
  const id = ++seq;
  return new Promise((ok, fail) => { waiting.set(id, { ok, fail }); worker!.postMessage({ id, op, file, text, unsaved, cell }); });
}

const docOf = (nb: vscode.NotebookDocument): Doc => ({ cells: nb.getCells().map((c) => ({ kind: c.kind, value: c.document.getText(), languageId: c.document.languageId, metadata: c.metadata })), metadata: nb.metadata });
const cellsOf = (d: Doc) => d.cells.map((c) => Object.assign(new vscode.NotebookCellData(c.kind, c.value, c.languageId), { metadata: c.metadata }));
const runsOf = (nb: vscode.NotebookDocument) => nb.getCells().filter((c) => c.kind === CODE && KINDS.includes(c.document.languageId));
/** The natural cell a cell answers to, as the kernel reads it: itself, or the natural cell before a rofl or datalog one. */
const naturalOf = (cell: vscode.NotebookCell) => {
  const runs = runsOf(cell.notebook), k = runs.indexOf(cell), lang = cell.document.languageId;
  return lang === 'natural' ? cell : k > 0 && lang !== 'natural' && runs[k - 1].document.languageId === 'natural' ? runs[k - 1] : undefined;
};
/** The cell a cell toolbar button was pressed on, or else the selected one. */
const cellArg = (c?: vscode.NotebookCell) => { const e = vscode.window.activeNotebookEditor; return c ?? (e?.notebook.notebookType === TYPE ? e.notebook.cellAt(e.selection.start) : undefined); };

export function activate(ctx: vscode.ExtensionContext) {
  const results = new Map<string, Run>(), diagnostics = new Map<string, vscode.DiagnosticCollection>();
  const notes = new Map<string, Note[]>(), asked = new WeakMap<vscode.NotebookCell, string>();
  const [bad, warn] = ['editorError.foreground', 'editorWarning.foreground'].map((c) => vscode.window.createTextEditorDecorationType({ after: { color: new vscode.ThemeColor(c), margin: '0 0 0 2em', fontStyle: 'italic' } }));
  const channel = vscode.window.createOutputChannel('ROFL notebook');
  const controller = vscode.notebooks.createNotebookController('rofl-kernel', TYPE, 'ROFL');
  controller.supportedLanguages = [...KINDS, 'yaml'];
  controller.executeHandler = (_cells, nb) => run(nb);

  async function run(nb: vscode.NotebookDocument) {
    const runs = runsOf(nb);
    const front = nb.cellAt(0)?.document.languageId === 'yaml' ? nb.cellAt(0) : undefined;
    const execs = new Map<vscode.NotebookCell, vscode.NotebookCellExecution>();
    try { for (const c of front ? [front, ...runs] : runs) execs.set(c, controller.createNotebookCellExecution(c)); }
    catch { for (const e of execs.values()) { e.start(); e.end(undefined); } return; }   // a run of this notebook is already going
    for (const e of execs.values()) { e.start(Date.now()); e.clearOutput(); }
    const out = (shown: Shown[]) => shown.flatMap((s) => [
      ...(s.md ? [new vscode.NotebookCellOutput([vscode.NotebookCellOutputItem.text(s.md, 'text/markdown')])] : []),
      ...(s.err ? [new vscode.NotebookCellOutput([vscode.NotebookCellOutputItem.stderr(s.err)])] : [])]);
    let r: Run & { shown: { head: Shown; cells: Shown[] } };
    try {
      r = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `ROFL: running ${vscode.workspace.asRelativePath(nb.uri)}` },
        () => ask('run', nb.uri.fsPath, serialize(docOf(nb)), Object.fromEntries(vscode.workspace.textDocuments.filter((d) => d.isDirty && d.uri.scheme === 'file').map((d) => [d.uri.fsPath, d.getText()]))));
    } catch (e) {
      for (const [c, x] of execs) { if (c === (front ?? runs[0])) x.replaceOutput(out([{ md: '', err: (e as Error).message, ok: false }])); x.end(false, Date.now()); }
      return;
    }
    results.set(nb.uri.toString(), r);
    for (const [c, x] of execs) {
      const head = { ...r.shown.head, md: r.shown.head.md.replace(/rofl-cell:(\d+)/g, (m, k) => runs[Number(k) - 1]?.document.uri.toString() ?? m) };
      const shown = [...(c === (front ?? runs[0]) ? [head] : []), ...(c === front ? [] : [r.shown.cells[runs.indexOf(c)] ?? { md: '', err: '', ok: r.status !== 'unread' }])];
      x.replaceOutput(out(shown));
      x.end(shown.every((s) => s.ok), Date.now());
    }
    mark(nb, runs, r);
  }

  /** A failing never is an error on its line and on every code line its rows name; a row out of its sight, a warning; a cell not read, an error. */
  function mark(nb: vscode.NotebookDocument, runs: vscode.NotebookCell[], r: Run) {
    const key = nb.uri.toString();
    const coll = diagnostics.get(key) ?? diagnostics.set(key, vscode.languages.createDiagnosticCollection('rofl')).get(key)!;
    const by = new Map<string, [vscode.Uri, vscode.Diagnostic[]]>();
    const add = (uri: vscode.Uri, line: number, message: string, severity: vscode.DiagnosticSeverity, related?: vscode.DiagnosticRelatedInformation) => {
      const d = new vscode.Diagnostic(new vscode.Range(line, 0, line, 1 << 16), message, severity);
      d.source = 'rofl';
      if (related) d.relatedInformation = [related];
      (by.get(uri.toString()) ?? by.set(uri.toString(), [uri, []]).get(uri.toString())!)[1].push(d);
    };
    const marked: Note[] = [];
    const rows = (answers: { sentence: string; at: string[] }[], message: string, severity: vscode.DiagnosticSeverity, where: vscode.Location, never: string) => {
      for (const a of answers) for (const at of a.at) {
        const i = at.lastIndexOf(':'), file = r.paths[at.slice(0, i)], line = Number(at.slice(i + 1)) - 1;
        if (!file) continue;
        add(vscode.Uri.file(file), line, message, severity, new vscode.DiagnosticRelatedInformation(where, a.sentence));
        marked.push({ file, line, never, warn: severity === vscode.DiagnosticSeverity.Warning, where });
      }
    };
    r.cells.slice(1).forEach((o, k) => {
      const cell = runs[k]; if (!cell) return;
      for (const e of o.errors) add(cell.document.uri, 0, e, vscode.DiagnosticSeverity.Error);
      for (const l of o.lines) {
        const where = new vscode.Location(cell.document.uri, new vscode.Position(l.line - o.line, 0));
        if (l.verdict === 'fails') { add(cell.document.uri, l.line - o.line, l.text, vscode.DiagnosticSeverity.Error); rows(l.answers, l.text, vscode.DiagnosticSeverity.Error, where, l.text); }
        if (l.unsure?.total) rows(l.unsure.answers, `${l.text}: out of sight, ${l.unsure.text}`, vscode.DiagnosticSeverity.Warning, where, `out of sight of ${l.text}`);
      }
    });
    coll.clear();
    for (const [uri, ds] of by.values()) coll.set(uri, ds);
    notes.set(key, marked);
    paint();
  }

  /** Every code line a never marked says after it which never, in the error colour, or the warning colour for a row out of its sight; its hover opens the cell. */
  function paint() {
    for (const e of vscode.window.visibleTextEditors) for (const [type, w] of [[bad, false], [warn, true]] as const) {
      e.setDecorations(type, notesOn(e.document.uri.fsPath, w).filter(({ line }) => line < e.document.lineCount).map(({ line, text, links }) => {
        const hover = new vscode.MarkdownString(links.join('\n\n'));
        hover.isTrusted = { enabledCommands: ['rofl-notebook.reveal'] };
        return { range: e.document.lineAt(line).range, hoverMessage: hover, renderOptions: { after: { contentText: text } } };
      }));
    }
  }
  /** What a code file's lines say after them: each marked line once, every never that marked it once. */
  function notesOn(file: string, w: boolean) {
    const at = new Map<number, Note[]>();
    for (const n of [...notes.values()].flat()) if (n.file === file && n.warn === w) at.set(n.line, [...at.get(n.line) ?? [], n]);
    return [...at].map(([line, ns]) => ({
      line, text: `\u2190 ${[...new Set(ns.map((n) => n.never))].join(' \u00b7 ')}`,
      links: [...new Set(ns.map((n) => `[${n.never}](command:rofl-notebook.reveal?${encodeURIComponent(JSON.stringify([n.where.uri.toString(), n.where.range.start.line]))})`))],
    }));
  }

  /** The cell whose text is `uri`, shown with its line `line` in view. */
  async function reveal(uri: string, line = 0) {
    const nb = vscode.workspace.notebookDocuments.find((d) => d.getCells().some((c) => c.document.uri.toString() === uri));
    const cell = nb?.getCells().find((c) => c.document.uri.toString() === uri);
    if (!nb || !cell) return;
    const group = vscode.window.tabGroups.all.find((g) => g.tabs.some((t) => t.input instanceof vscode.TabInputNotebook && t.input.uri.toString() === nb.uri.toString()));
    await vscode.window.showNotebookDocument(nb, { viewColumn: group?.viewColumn, selections: [new vscode.NotebookRange(cell.index, cell.index + 1)] });
    const e = await vscode.window.showTextDocument(cell.document, { selection: new vscode.Range(line, 0, line, 0) });
    e.revealRange(new vscode.Range(line, 0, line, 0), vscode.TextEditorRevealType.InCenter);
  }

  /** The notebook made `text`: only the cells that differ are replaced, so the others keep their outputs. */
  async function apply(nb: vscode.NotebookDocument, text: string) {
    const was = docOf(nb).cells, now = deserialize(text).cells, same = (a: Cell, b: Cell) => JSON.stringify(a) === JSON.stringify(b);
    let p = 0, s = 0;
    while (p < was.length && p < now.length && same(was[p], now[p])) p++;
    while (s < was.length - p && s < now.length - p && same(was[was.length - 1 - s], now[now.length - 1 - s])) s++;
    await change(nb, vscode.NotebookEdit.replaceCells(new vscode.NotebookRange(p, was.length - s), cellsOf({ cells: now.slice(p, now.length - s), metadata: {} })));
  }
  async function change(nb: vscode.NotebookDocument, e: vscode.NotebookEdit) {
    const edit = new vscode.WorkspaceEdit();
    edit.set(nb.uri, [e]);
    await vscode.workspace.applyEdit(edit);
  }

  async function translate() {
    const nb = vscode.window.activeNotebookEditor?.notebook;
    if (nb?.notebookType !== TYPE) return void vscode.window.showWarningMessage('Open a .rofl.md notebook first.');
    const text = serialize(docOf(nb));
    const r = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'ROFL: Claude translates the natural cells' },
      () => ask<{ code: number; said: string[]; text: string }>('translate', nb.uri.fsPath, text));
    channel.appendLine(r.said.join('\n'));
    if (r.text !== text) await apply(nb, r.text);
    if (r.code) { vscode.window.showErrorMessage('ROFL: not every natural cell was translated', 'Show').then((a) => a && channel.show()); }
    else if (r.text === text) vscode.window.showInformationMessage('ROFL: every natural cell already has its rofl cell');
  }

  /** One natural cell, or the natural cell a translation answers, translated again; with `words`, what the person says to Claude. Claude's words instead of a cell are the natural cell's output. */
  async function translateOne(arg?: vscode.NotebookCell, words = '') {
    const natural = arg && naturalOf(arg);
    if (!natural) return void vscode.window.showWarningMessage('ROFL: select a natural cell or the rofl cell under one.');
    const nb = natural.notebook, text = serialize(docOf(nb)), at = runsOf(nb).indexOf(natural) + 1;
    const r = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: words ? 'ROFL: Claude takes in what you said' : 'ROFL: Claude translates the cell' },
      () => ask<{ code: number; said: string[]; text: string; reply?: string }>('translate', nb.uri.fsPath, text, {}, { at, words, asked: asked.get(natural) }));
    channel.appendLine(r.said.join('\n'));
    if (r.reply || asked.has(natural)) await say(natural, r.reply);
    if (r.reply) asked.set(natural, r.reply); else asked.delete(natural);
    if (r.text !== text) await apply(nb, r.text);
    else if (r.code && !r.reply) vscode.window.showErrorMessage('ROFL: the cell was not translated', 'Show').then((a) => a && channel.show());
  }
  async function say(cell: vscode.NotebookCell, reply?: string) {
    try {
      const x = controller.createNotebookCellExecution(cell);
      x.start(); await x.replaceOutput(reply ? [new vscode.NotebookCellOutput([vscode.NotebookCellOutputItem.text(`**Claude:** ${reply}`, 'text/markdown')])] : []); x.end(undefined);
    } catch { if (reply) vscode.window.showInformationMessage(`Claude: ${reply}`); }
  }
  /** `words` asked for in an input box, where Claude's question, if it asked one, is the prompt. */
  async function refine(arg?: vscode.NotebookCell, words?: string) {
    const natural = arg && naturalOf(arg);
    if (!natural) return void vscode.window.showWarningMessage('ROFL: select a natural cell or the rofl cell under one.');
    const q = asked.get(natural);
    words ??= await vscode.window.showInputBox({ title: q ? 'Answer Claude' : 'Refine in plain language', prompt: q ?? 'Say what to change, in plain language', ignoreFocusOut: true });
    if (words?.trim()) await translateOne(natural, words.trim());
  }
  /** A translation deleted: the natural cell above it, which kept the words, is what is left. */
  async function revert(arg?: vscode.NotebookCell) {
    const natural = arg && naturalOf(arg);
    if (!arg || !natural || natural === arg) return void vscode.window.showWarningMessage('ROFL: select the rofl cell under a natural cell.');
    asked.delete(natural);
    await change(arg.notebook, vscode.NotebookEdit.deleteCells(new vscode.NotebookRange(arg.index, arg.index + 1)));
  }
  /** The natural cells and the cells that answer one, for the cell toolbar: a `when` clause sees a cell by its resource, not its language. */
  const translations = () => {
    const runs = vscode.workspace.notebookDocuments.filter((nb) => nb.notebookType === TYPE).flatMap(runsOf), uris = (cs: vscode.NotebookCell[]) => cs.map((c) => c.document.uri.toString());
    void vscode.commands.executeCommand('setContext', 'rofl-notebook.naturals', uris(runs.filter((c) => c.document.languageId === 'natural')));
    void vscode.commands.executeCommand('setContext', 'rofl-notebook.translations', uris(runs.filter((c) => c.document.languageId !== 'natural' && naturalOf(c))));
  };

  ctx.subscriptions.push(controller, channel, bad, warn, { dispose: () => { worker?.terminate(); for (const d of diagnostics.values()) d.dispose(); } },
    vscode.workspace.registerNotebookSerializer(TYPE, {
      deserializeNotebook: (bytes) => { const d = deserialize(new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes)); return Object.assign(new vscode.NotebookData(cellsOf(d)), { metadata: d.metadata }); },
      serializeNotebook: (data) => new TextEncoder().encode(serialize({ cells: data.cells as Cell[], metadata: data.metadata ?? {} })),
    }, { transientOutputs: true }),
    vscode.workspace.onDidCloseNotebookDocument((nb) => { results.delete(nb.uri.toString()); diagnostics.get(nb.uri.toString())?.clear(); notes.delete(nb.uri.toString()); paint(); translations(); }),
    vscode.workspace.onDidOpenNotebookDocument(translations), vscode.workspace.onDidChangeNotebookDocument(translations), vscode.workspace.onDidOpenTextDocument(translations),
    vscode.window.onDidChangeVisibleTextEditors(paint),
    vscode.commands.registerCommand('rofl-notebook.translate', translate),
    vscode.commands.registerCommand('rofl-notebook.translateCell', (c?: vscode.NotebookCell) => translateOne(cellArg(c))),
    vscode.commands.registerCommand('rofl-notebook.refine', (c?: vscode.NotebookCell, words?: string) => refine(cellArg(c), words)),
    vscode.commands.registerCommand('rofl-notebook.revert', (c?: vscode.NotebookCell) => revert(cellArg(c))),
    vscode.commands.registerCommand('rofl-notebook.reveal', reveal));
  translations();
  // A .rofl.md named on the `code` command line opens as text before this extension's notebook is known; reopen it as the notebook.
  for (const tab of vscode.window.tabGroups.all.flatMap((g) => g.tabs)) {
    if (!(tab.input instanceof vscode.TabInputText) || !tab.input.uri.path.endsWith('.rofl.md') || tab.isDirty) continue;
    const uri = tab.input.uri;
    void vscode.window.tabGroups.close(tab).then(() => vscode.commands.executeCommand('vscode.openWith', uri, TYPE));
  }
  return { result: (uri: vscode.Uri) => results.get(uri.toString()), notes: (file: string) => [...notesOn(file, false), ...notesOn(file, true)] };
}

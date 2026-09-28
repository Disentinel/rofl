// A `.rofl.md` opens as a notebook; Run goes through notebook/kernel.ts in a worker; a failing never marks the lines it names.
import * as vscode from 'vscode';
import { Worker } from 'node:worker_threads';
import { CODE, KINDS, deserialize, serialize, type Cell, type Doc } from './serial.ts';
import type { Run, Shown } from './render.ts';
import type { Cell as Ask } from './worker.ts';
import type { NbCellOut } from '../notebook/kernel.ts';
import { lsp } from './lsp.ts';

const TYPE = 'rofl-notebook';
type Note = { file: string; line: number; never: string; warn: boolean; where: vscode.Location };

let worker: Worker | undefined, seq = 0;
const waiting = new Map<number, { ok: (r: any) => void; fail: (e: Error) => void; step?: (s: string) => void }>();
/** `step` hears a translation's steps as they start; `stop` cancelled kills the model's process. */
function ask<T>(op: 'run' | 'translate', file: string, text: string, unsaved: Record<string, string> = {}, cell?: Ask, step?: (s: string) => void, stop?: vscode.CancellationToken): Promise<T> {
  if (!worker) {
    const w = worker = new Worker(new URL('./worker.ts', import.meta.url));
    w.on('message', ({ id, r, error, step }) => {
      const p = waiting.get(id)!;
      if (step !== undefined) return p.step?.(step);
      waiting.delete(id); error ? p.fail(new Error(error)) : p.ok(r);
    });
    w.on('error', (e) => { worker = undefined; for (const p of waiting.values()) p.fail(e); waiting.clear(); });
  }
  const id = ++seq;
  stop?.onCancellationRequested(() => worker?.postMessage({ id, op: 'stop' }));
  return new Promise((ok, fail) => { waiting.set(id, { ok, fail, step }); worker!.postMessage({ id, op, file, text, unsaved, cell }); });
}
/** The worker ended, mid-run or not: what waits on it fails, and the next run starts another, which loads the model again. */
function restart() {
  void worker?.terminate();
  worker = undefined;
  for (const p of waiting.values()) p.fail(new Error('stopped: the kernel was restarted'));
  waiting.clear();
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
  const said = new WeakMap<vscode.NotebookCell, { text: string; out: NbCellOut; paths: Record<string, string> }>(), saidChanged = new vscode.EventEmitter<void>();
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
    // Stop: a run cannot be told anything while it computes, so its worker goes
    for (const e of execs.values()) { e.start(Date.now()); e.clearOutput(); e.token.onCancellationRequested(restart); }
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
    runs.forEach((c, k) => { if (r.cells[k + 1]) said.set(c, { text: c.document.getText(), out: r.cells[k + 1], paths: r.paths }); });
    saidChanged.fire();
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

  /** A run cell's verdict in a word or two under it; a click on a failing one opens the code line of its first answer. */
  function verdict(cell: vscode.NotebookCell): vscode.NotebookCellStatusBarItem[] {
    const s = said.get(cell);
    if (!s || cell.document.languageId === 'natural') return [];
    if (s.text !== cell.document.getText()) return [new vscode.NotebookCellStatusBarItem('$(circle-outline) edited, not run yet', vscode.NotebookCellStatusBarAlignment.Left)];
    const { errors, lines } = s.out, has = (v: string) => lines.filter((l) => l.verdict === v);
    const fails = has('fails'), blind = has('blind'), excise = lines.find((l) => l.kind === 'excise'), answers = has('answers').filter((l) => l !== excise);
    const text = errors.length ? '$(circle-slash) not read' : fails.length ? `$(error) FAILS \u00b7 ${fails.length > 1 ? `${fails.length} nevers` : fails[0].total}` : has('unasked').length ? '$(circle-slash) not asked'
      : blind.length ? `$(warning) as far as it sees \u00b7 ${blind.reduce((n, l) => n + (l.unsure?.total ?? 0), 0)} unseen` : has('holds').length ? '$(pass) holds'
      : excise ? `excise: ${excise.total} ${excise.total === 1 ? 'line moves' : 'lines move'}` : answers.length ? ((n) => `${n} ${n === 1 ? 'answer' : 'answers'}`)(answers.reduce((n, l) => n + l.total, 0)) : has('explained').length ? 'explained' : '';
    if (!text) return [];
    const item = new vscode.NotebookCellStatusBarItem(text, vscode.NotebookCellStatusBarAlignment.Left);
    item.tooltip = [...errors, ...lines.map((l) => `${l.text}: ${l.verdict === 'unasked' ? 'not asked' : l.verdict}${l.total ? ` (${l.total})` : ''}`)].join('\n');
    const at = fails[0]?.answers.flatMap((a) => a.at)[0], i = at?.lastIndexOf(':') ?? -1, file = at && s.paths[at.slice(0, i)];
    if (file) item.command = { title: 'Open the line', command: 'vscode.open', arguments: [vscode.Uri.file(file), { selection: new vscode.Range(Number(at.slice(i + 1)) - 1, 0, Number(at.slice(i + 1)) - 1, 0) }] };
    return [item];
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
  /** While Claude works the natural cell says what it is doing and for how long, and its Stop kills the model; then it says what came back:
   *  nothing when a cell was written (the notebook runs, so the new cell answers), Claude's words, or why nothing was written. */
  async function translateOne(arg?: vscode.NotebookCell, words = '') {
    const natural = arg && naturalOf(arg);
    if (!natural) return void vscode.window.showWarningMessage('ROFL: select a natural cell or the rofl cell under one.');
    const nb = natural.notebook, text = serialize(docOf(nb)), at = runsOf(nb).indexOf(natural) + 1;
    const x = await execution(natural);
    if (!x) return void vscode.window.showWarningMessage('ROFL: the notebook is running; translate when it is done.');
    const t0 = Date.now(), show = (md: string) => x.replaceOutput(md ? [new vscode.NotebookCellOutput([vscode.NotebookCellOutputItem.text(md, 'text/markdown')])] : []);
    let step = 'Claude is writing the cell';
    const tick = () => show(`*${step.replace(/\*/g, '\\*')} \u00b7 ${Math.round((Date.now() - t0) / 1000)} s*`), timer = setInterval(tick, 1000);
    x.start(t0); tick();
    let r: { code: number; said: string[]; text: string; reply?: string };
    try { r = await ask('translate', nb.uri.fsPath, text, {}, { at, words, asked: asked.get(natural) }, (s) => { step = s; tick(); }, x.token); }
    catch (e) { r = { code: 2, said: [(e as Error).message], text }; }
    finally { clearInterval(timer); }
    channel.appendLine(r.said.join('\n'));
    if (r.reply) asked.set(natural, r.reply); else asked.delete(natural);
    const stopped = r.said.includes('translation failed: stopped');
    await show(r.reply ? `**Claude:** ${r.reply}\n\n*Answer with Refine.*` : r.text !== text ? '' : stopped ? '*Stopped; nothing written.*'
      : `**Not translated:** \`${why(r.said).replace(/`/g, "'")}\`\n\n\`\`\`\n${r.said.join('\n')}\n\`\`\`\n\n*Refine to say more, or change the words and Translate again.*`);
    x.end(r.text !== text || !!r.reply, Date.now());
    if (r.text !== text) { await apply(nb, r.text); await run(nb); }
  }
  /** The last thing that went wrong, in a sentence. */
  const why = (said: string[]) => { const h = said.map((l) => !l.startsWith(' ')).lastIndexOf(true); return (said.slice(h + 1).find((l) => !l.startsWith('  |')) ?? said[h] ?? '').trim(); };
  /** An execution of the cell, choosing this kernel for the notebook if none is chosen; none while the cell is running. */
  async function execution(cell: vscode.NotebookCell) {
    try { return controller.createNotebookCellExecution(cell); } catch {}
    await vscode.commands.executeCommand('notebook.selectKernel', { notebookEditor: vscode.window.visibleNotebookEditors.find((e) => e.notebook === cell.notebook), id: 'rofl-kernel', extension: ctx.extension.id });
    try { return controller.createNotebookCellExecution(cell); } catch { return undefined; }
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

  ctx.subscriptions.push(...lsp(channel), controller, channel, bad, warn, { dispose: () => { worker?.terminate(); for (const d of diagnostics.values()) d.dispose(); } },
    vscode.workspace.registerNotebookSerializer(TYPE, {
      deserializeNotebook: (bytes) => { const d = deserialize(new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes)); return Object.assign(new vscode.NotebookData(cellsOf(d)), { metadata: d.metadata }); },
      serializeNotebook: (data) => new TextEncoder().encode(serialize({ cells: data.cells as Cell[], metadata: data.metadata ?? {} })),
    }, { transientOutputs: true }),
    vscode.workspace.onDidCloseNotebookDocument((nb) => { results.delete(nb.uri.toString()); diagnostics.get(nb.uri.toString())?.clear(); notes.delete(nb.uri.toString()); paint(); translations(); }),
    vscode.workspace.onDidOpenNotebookDocument(translations), vscode.workspace.onDidChangeNotebookDocument(() => { translations(); saidChanged.fire(); }), vscode.workspace.onDidOpenTextDocument(translations),
    vscode.window.onDidChangeVisibleTextEditors(paint), saidChanged,
    vscode.notebooks.registerNotebookCellStatusBarItemProvider(TYPE, { onDidChangeCellStatusBarItems: saidChanged.event, provideCellStatusBarItems: verdict }),
    vscode.commands.registerCommand('rofl-notebook.translate', translate),
    vscode.commands.registerCommand('rofl-notebook.translateCell', (c?: vscode.NotebookCell) => translateOne(cellArg(c))),
    vscode.commands.registerCommand('rofl-notebook.refine', (c?: vscode.NotebookCell, words?: string) => refine(cellArg(c), words)),
    vscode.commands.registerCommand('rofl-notebook.revert', (c?: vscode.NotebookCell) => revert(cellArg(c))),
    vscode.commands.registerCommand('rofl-notebook.reveal', reveal),
    vscode.commands.registerCommand('rofl-notebook.restart', restart));
  translations();
  // A .rofl.md named on the `code` command line opens as text before this extension's notebook is known; reopen it as the notebook.
  for (const tab of vscode.window.tabGroups.all.flatMap((g) => g.tabs)) {
    if (!(tab.input instanceof vscode.TabInputText) || !tab.input.uri.path.endsWith('.rofl.md') || tab.isDirty) continue;
    const uri = tab.input.uri;
    void vscode.window.tabGroups.close(tab).then(() => vscode.commands.executeCommand('vscode.openWith', uri, TYPE));
  }
  return { result: (uri: vscode.Uri) => results.get(uri.toString()), verdict: (cell: vscode.NotebookCell) => verdict(cell).map((i) => i.text), notes: (file: string) => [...notesOn(file, false), ...notesOn(file, true)] };
}

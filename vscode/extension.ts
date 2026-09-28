// A `.rofl.md` opens as a notebook; Run goes through notebook/kernel.ts in a worker; a failing never marks the lines it names.
import * as vscode from 'vscode';
import { Worker } from 'node:worker_threads';
import { CODE, KINDS, deserialize, serialize, type Cell, type Doc } from './serial.ts';
import type { Run, Shown } from './render.ts';

const TYPE = 'rofl-notebook';

let worker: Worker | undefined, seq = 0;
const waiting = new Map<number, { ok: (r: any) => void; fail: (e: Error) => void }>();
function ask<T>(op: 'run' | 'translate', file: string, text: string, unsaved: Record<string, string> = {}): Promise<T> {
  if (!worker) {
    const w = worker = new Worker(new URL('./worker.ts', import.meta.url));
    w.on('message', ({ id, r, error }) => { const p = waiting.get(id)!; waiting.delete(id); error ? p.fail(new Error(error)) : p.ok(r); });
    w.on('error', (e) => { worker = undefined; for (const p of waiting.values()) p.fail(e); waiting.clear(); });
  }
  const id = ++seq;
  return new Promise((ok, fail) => { waiting.set(id, { ok, fail }); worker!.postMessage({ id, op, file, text, unsaved }); });
}

const docOf = (nb: vscode.NotebookDocument): Doc => ({ cells: nb.getCells().map((c) => ({ kind: c.kind, value: c.document.getText(), languageId: c.document.languageId, metadata: c.metadata })), metadata: nb.metadata });
const cellsOf = (d: Doc) => d.cells.map((c) => Object.assign(new vscode.NotebookCellData(c.kind, c.value, c.languageId), { metadata: c.metadata }));

export function activate(ctx: vscode.ExtensionContext) {
  const results = new Map<string, Run>(), diagnostics = new Map<string, vscode.DiagnosticCollection>();
  const channel = vscode.window.createOutputChannel('ROFL notebook');
  const controller = vscode.notebooks.createNotebookController('rofl-kernel', TYPE, 'ROFL');
  controller.supportedLanguages = [...KINDS, 'yaml'];
  controller.executeHandler = (_cells, nb) => run(nb);

  async function run(nb: vscode.NotebookDocument) {
    const runs = nb.getCells().filter((c) => c.kind === CODE && KINDS.includes(c.document.languageId));
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
    const rows = (answers: { sentence: string; at: string[] }[], message: string, severity: vscode.DiagnosticSeverity, where: vscode.Location) => {
      for (const a of answers) for (const at of a.at) {
        const i = at.lastIndexOf(':'), file = r.paths[at.slice(0, i)];
        if (file) add(vscode.Uri.file(file), Number(at.slice(i + 1)) - 1, message, severity, new vscode.DiagnosticRelatedInformation(where, a.sentence));
      }
    };
    r.cells.slice(1).forEach((o, k) => {
      const cell = runs[k]; if (!cell) return;
      for (const e of o.errors) add(cell.document.uri, 0, e, vscode.DiagnosticSeverity.Error);
      for (const l of o.lines) {
        const where = new vscode.Location(cell.document.uri, new vscode.Position(l.line - o.line, 0));
        if (l.verdict === 'fails') { add(cell.document.uri, l.line - o.line, l.text, vscode.DiagnosticSeverity.Error); rows(l.answers, l.text, vscode.DiagnosticSeverity.Error, where); }
        if (l.unsure?.total) rows(l.unsure.answers, `${l.text}: out of sight, ${l.unsure.text}`, vscode.DiagnosticSeverity.Warning, where);
      }
    });
    coll.clear();
    for (const [uri, ds] of by.values()) coll.set(uri, ds);
  }

  async function translate() {
    const nb = vscode.window.activeNotebookEditor?.notebook;
    if (nb?.notebookType !== TYPE) return void vscode.window.showWarningMessage('Open a .rofl.md notebook first.');
    const text = serialize(docOf(nb));
    const r = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'ROFL: Claude translates the natural cells' },
      () => ask<{ code: number; said: string[]; text: string }>('translate', nb.uri.fsPath, text));
    channel.appendLine(r.said.join('\n'));
    if (r.text !== text) {
      const edit = new vscode.WorkspaceEdit();
      edit.set(nb.uri, [vscode.NotebookEdit.replaceCells(new vscode.NotebookRange(0, nb.cellCount), cellsOf(deserialize(r.text)))]);
      await vscode.workspace.applyEdit(edit);
    }
    if (r.code) { vscode.window.showErrorMessage('ROFL: not every natural cell was translated', 'Show').then((a) => a && channel.show()); }
    else if (r.text === text) vscode.window.showInformationMessage('ROFL: every natural cell already has its rofl cell');
  }

  ctx.subscriptions.push(controller, channel, { dispose: () => { worker?.terminate(); for (const d of diagnostics.values()) d.dispose(); } },
    vscode.workspace.registerNotebookSerializer(TYPE, {
      deserializeNotebook: (bytes) => { const d = deserialize(new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes)); return Object.assign(new vscode.NotebookData(cellsOf(d)), { metadata: d.metadata }); },
      serializeNotebook: (data) => new TextEncoder().encode(serialize({ cells: data.cells as Cell[], metadata: data.metadata ?? {} })),
    }, { transientOutputs: true }),
    vscode.workspace.onDidCloseNotebookDocument((nb) => { results.delete(nb.uri.toString()); diagnostics.get(nb.uri.toString())?.clear(); }),
    vscode.commands.registerCommand('rofl-notebook.translate', translate));
  // A .rofl.md named on the `code` command line opens as text before this extension's notebook is known; reopen it as the notebook.
  for (const tab of vscode.window.tabGroups.all.flatMap((g) => g.tabs)) {
    if (!(tab.input instanceof vscode.TabInputText) || !tab.input.uri.path.endsWith('.rofl.md') || tab.isDirty) continue;
    const uri = tab.input.uri;
    void vscode.window.tabGroups.close(tab).then(() => vscode.commands.executeCommand('vscode.openWith', uri, TYPE));
  }
  return { result: (uri: vscode.Uri) => results.get(uri.toString()) };
}

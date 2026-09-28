// Inside a real VS Code: open the notebooks the runner planted, run them, and hold the outputs and the marks against the command line's.
import * as vscode from 'vscode';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { Run } from '../render.ts';
import { serialize } from '../serial.ts';

type Api = { result: (u: vscode.Uri) => Run | undefined; verdict: (c: vscode.NotebookCell) => string[]; notes: (file: string) => { line: number; text: string }[] };
type Case = { file: string; cli: string; fails?: { text: string; code?: [string, number] } };
const cases: Case[] = JSON.parse(process.env.ROFL_NB_CASES!);

const strip = (r: any) => JSON.stringify({ status: r.status, errors: r.errors, cells: r.cells });
const until = async <T>(get: () => T | undefined, ms: number, what: string): Promise<T> => {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise((f) => setTimeout(f, 100))) { const v = get(); if (v) return v; }
  throw new Error(`waited ${ms} ms for ${what}`);
};

export async function run() {
  const api = await vscode.extensions.getExtension('rofl.rofl-notebook')!.activate() as Api;
  const bad: string[] = [];
  for (const l of ['rofl', 'datalog', 'natural']) if (vscode.workspace.getConfiguration('editor', { languageId: l }).get('wordWrap') !== 'on') bad.push(`${l} cells do not wrap`);
  const startup = process.env.ROFL_NB_STARTUP!;
  const tabs = () => vscode.window.tabGroups.all.flatMap((g) => g.tabs).filter((t) => (t.input as { uri?: vscode.Uri })?.uri?.fsPath === startup);
  await until(() => tabs().some((t) => t.input instanceof vscode.TabInputNotebook && t.input.notebookType === 'rofl-notebook') || undefined, 10_000, 'the notebook named at launch')
    .catch(() => bad.push(`${startup}: named on the command line, it opened as ${tabs().map((t) => t.input instanceof vscode.TabInputText ? 'text' : String(t.input?.constructor.name)).join(', ') || 'nothing'}, not a notebook`));
  await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(cases[0].file));
  const opened = await until(() => vscode.window.activeNotebookEditor?.notebook.notebookType, 10_000, 'a notebook editor').catch(() => vscode.window.activeTextEditor?.document.languageId);
  if (opened !== 'rofl-notebook') bad.push(`${cases[0].file}: opening it the way a click does gives ${opened}, not a notebook`);
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  for (const c of cases) {
    const t0 = Date.now();
    const nb = await vscode.workspace.openNotebookDocument(vscode.Uri.file(c.file));
    if (nb.notebookType !== 'rofl-notebook') { bad.push(`${c.file}: opened as ${nb.notebookType}`); continue; }
    await vscode.window.showNotebookDocument(nb);
    await vscode.commands.executeCommand('notebook.selectKernel', { id: 'rofl-kernel', extension: 'rofl.rofl-notebook' });
    await vscode.commands.executeCommand('notebook.execute');
    const r = await until(() => api.result(nb.uri), 110_000, `a result for ${c.file}`);
    const runs = nb.getCells().filter((x) => ['rofl', 'datalog', 'natural'].includes(x.document.languageId));
    await until(() => runs.every((x) => x.executionSummary?.success !== undefined) || undefined, 5_000, 'every cell to end');
    const said = (x: vscode.NotebookCell) => x.outputs.flatMap((o) => o.items.map((i) => new TextDecoder().decode(i.data))).join('\n');
    if (strip(r) !== strip(JSON.parse(readFileSync(c.cli, 'utf8')))) bad.push(`${c.file}: the extension's result is not the command line's --json`);
    r.cells.slice(1).forEach((k, i) => {
      if (!runs[i] || !said(runs[i])) bad.push(`${c.file}: kernel cell ${k.index} has no output in notebook cell ${runs[i]?.index}`);
      for (const l of k.lines) if (!said(runs[i]).includes(l.text.replace(/[\\[\]()]/g, '\\$&').replace(/</g, '&lt;'))) bad.push(`${c.file}: "${l.text}" is not in the output of the cell it was asked in`);
    });
    const errors = vscode.languages.getDiagnostics().flatMap(([u, ds]) => ds.filter((d) => d.severity === vscode.DiagnosticSeverity.Error).map((d) => ({ u, d })));
    const ours = errors.filter(({ u }) => runs.some((x) => x.document.uri.toString() === u.toString()));
    if (!c.fails) { if (ours.length) bad.push(`${c.file}: nothing fails, yet ${ours.length} errors are marked: ${ours.map((e) => e.d.message).join('; ')}`); }
    else {
      const cell = runs.find((x) => x.document.getText().split('\n').some((l) => l.trim() === c.fails!.text));
      const line = cell?.document.getText().split('\n').findIndex((l) => l.trim() === c.fails!.text);
      if (!ours.some(({ u, d }) => u.toString() === cell?.document.uri.toString() && d.range.start.line === line && d.message === c.fails!.text)) bad.push(`${c.file}: no error "${c.fails.text}" on its line in its cell`);
      if (!cell || !api.verdict(cell).some((t) => t.includes('FAILS'))) bad.push(`${c.file}: the failing cell's status bar says ${JSON.stringify(cell && api.verdict(cell))}, not FAILS`);
      const holds = runs.find((x) => x !== cell && x.document.getText().includes('never'));
      if (holds && !api.verdict(holds).some((t) => t.includes('holds'))) bad.push(`${c.file}: a cell whose never holds has the status ${JSON.stringify(api.verdict(holds))}`);
      const code = c.fails.code;
      if (code && !runs.some((x) => said(x).includes(`](<${code[0]}:${code[1]}>)`))) bad.push(`${c.file}: no output links to ${code[0]}:${code[1]}`);
      if (code && !errors.some(({ u, d }) => u.fsPath === code[0] && d.range.start.line === code[1] - 1 && d.message === c.fails!.text)) bad.push(`${c.file}: no error "${c.fails.text}" at ${code[0]}:${code[1]}`);
      if (code && !api.notes(code[0]).some((n) => n.line === code[1] - 1 && n.text.includes(c.fails!.text))) bad.push(`${c.file}: line ${code[1]} of ${code[0]} does not say after it that "${c.fails.text}" marked it: ${JSON.stringify(api.notes(code[0]))}`);
      if (code && !bad.length) await stale(nb, api, c.fails.text, code, bad);
    }
    console.log(`${c.file}: ${Date.now() - t0} ms`);
    if (bad.length) break;
  }
  if (!bad.length) await translate(process.env.ROFL_NB_TRANSLATE!, bad);
  if (!bad.length) await interrupt(process.env.ROFL_NB_RUNAWAY!, cases[0], api, bad);
  writeFileSync(process.env.ROFL_NB_REPORT!, bad.join('\n'));
  if (bad.length) throw new Error(bad.join('\n'));
}

/** A rule that climbs for ever, stopped: every cell ends at once, and the next run, in a new worker, answers what the command line does. */
async function interrupt(file: string, again: Case, api: Api, bad: string[]) {
  const nb = await vscode.workspace.openNotebookDocument(vscode.Uri.file(file));
  await vscode.window.showNotebookDocument(nb);
  await vscode.commands.executeCommand('notebook.selectKernel', { id: 'rofl-kernel', extension: 'rofl.rofl-notebook' });
  const cell = nb.getCells().find((c) => c.document.languageId === 'datalog')!;
  void vscode.commands.executeCommand('notebook.execute');
  await new Promise((f) => setTimeout(f, 3_000));
  const t0 = Date.now();
  await vscode.commands.executeCommand('notebook.cancelExecution');
  await until(() => cell.executionSummary?.success !== undefined || undefined, 5_000, 'Stop to end the runaway').catch(() => bad.push(`${file}: Stop did not end the run in 5 s`));
  const stopped = Date.now() - t0;
  if (bad.length) return;
  const other = await vscode.workspace.openNotebookDocument(vscode.Uri.file(again.file)), before = api.result(other.uri);
  await vscode.window.showNotebookDocument(other);
  await vscode.commands.executeCommand('notebook.execute');
  const r = await until(() => api.result(other.uri) !== before ? api.result(other.uri) : undefined, 60_000, 'a run after Stop').catch(() => undefined);
  if (!r || strip(r) !== strip(JSON.parse(readFileSync(again.cli, 'utf8')))) bad.push(`${again.file}: the run after Stop is not the command line's --json`);
  console.log(`${file}: run after Stop, ${r ? 'answered' : 'no answer'}: ${stopped} ms`);
}

/** The command, with the model pointed at a script: a rofl cell appears under the natural cell, which stays; the file on disk does not change. */
async function translate(file: string, bad: string[]) {
  const before = readFileSync(file, 'utf8');
  const nb = await vscode.workspace.openNotebookDocument(vscode.Uri.file(file));
  await vscode.window.showNotebookDocument(nb);
  const natural = nb.getCells().findIndex((c) => c.document.languageId === 'natural');
  const text = nb.cellAt(natural).document.getText();
  await vscode.commands.executeCommand('rofl-notebook.translate');
  const after = nb.cellAt(natural), next = nb.cellAt(natural + 1);
  if (after.document.getText() !== text || after.document.languageId !== 'natural') bad.push(`${file}: the natural cell did not stay`);
  if (next?.document.languageId !== 'rofl' || !next.document.getText().includes('never M is unowned')) bad.push(`${file}: no rofl cell under the natural cell after Translate`);
  if (readFileSync(file, 'utf8') !== before) bad.push(`${file}: Translate wrote the file`);
  await cellControls(nb, natural, before, bad);
  await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
}

/** The code under a run changes, on disk and then in an unsaved editor; the same window runs again and the answer follows it. */
async function stale(nb: vscode.NotebookDocument, api: Api, never: string, [file, line]: [string, number], bad: string[]) {
  const verdict = (r: Run) => r.cells.flatMap((c) => c.lines).find((l) => l.text === never)?.verdict;
  const marked = () => vscode.languages.getDiagnostics(vscode.Uri.file(file)).some((d) => d.range.start.line === line - 1 && d.message === never);
  const again = async (what: string) => {
    const before = api.result(nb.uri), t0 = Date.now();
    await vscode.window.showNotebookDocument(nb);
    await vscode.commands.executeCommand('notebook.execute');
    const r = await until(() => api.result(nb.uri) !== before ? api.result(nb.uri) : undefined, 110_000, `a run after ${what}`);
    console.log(`${nb.uri.fsPath}: run after ${what}: ${Date.now() - t0} ms`);
    return r;
  };
  const js = readFileSync(file, 'utf8'), spin = js.indexOf('\nexport function spin');
  writeFileSync(file, js.slice(0, spin + 1));
  let r = await again('the recursion was deleted on disk');
  if (verdict(r) !== 'holds' || marked()) bad.push(`${file}: deleted on disk, the recursion still fails the never (${verdict(r)}) or marks line ${line}`);
  const doc = await vscode.workspace.openTextDocument(file), edit = new vscode.WorkspaceEdit();
  edit.insert(doc.uri, doc.positionAt(doc.getText().length), js.slice(spin + 1));
  await vscode.workspace.applyEdit(edit);
  r = await again('the recursion was typed back, unsaved');
  if (verdict(r) !== 'fails' || !marked()) bad.push(`${file}: typed back unsaved, the never ${verdict(r)} and line ${line} is ${marked() ? '' : 'not '}marked`);
  await vscode.window.showTextDocument(doc);
  await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
}

/** The buttons on a cell, as the script answers: Revert gives back the file's text, Translate one cell puts its translation back,
 *  Refine with "ask me" gets a question shown under the natural cell and nothing changed, and the answer replaces the translation. */
async function cellControls(nb: vscode.NotebookDocument, natural: number, before: string, bad: string[]) {
  const text = () => serialize({ cells: nb.getCells().map((c) => ({ kind: c.kind, value: c.document.getText(), languageId: c.document.languageId, metadata: c.metadata })), metadata: nb.metadata });
  const said = (c: vscode.NotebookCell) => c.outputs.flatMap((o) => o.items.map((i) => new TextDecoder().decode(i.data))).join('\n');
  const under = () => nb.cellAt(natural + 1).document.getText();
  await vscode.commands.executeCommand('notebook.selectKernel', { id: 'rofl-kernel', extension: 'rofl.rofl-notebook' });
  await vscode.commands.executeCommand('rofl-notebook.revert', nb.cellAt(natural + 1));
  if (text() !== before) bad.push(`${nb.uri.fsPath}: after Revert the notebook is not the file it was: ${nb.cellAt(natural)?.document.languageId} cell ${natural} holds ${JSON.stringify(nb.cellAt(natural)?.document.getText())}`);
  await vscode.commands.executeCommand('rofl-notebook.translateCell', nb.cellAt(natural));
  if (!under().includes('never M is unowned')) bad.push(`${nb.uri.fsPath}: Translate on the natural cell put no translation under it`);
  await until(() => said(nb.cellAt(natural + 1)).includes('never M is unowned') || undefined, 10_000, 'the translation to answer').catch(() => bad.push(`${nb.uri.fsPath}: the translation came back without its answers: ${said(nb.cellAt(natural + 1))}`));
  await vscode.commands.executeCommand('rofl-notebook.refine', nb.cellAt(natural + 1), 'break it');
  if (!said(nb.cellAt(natural)).includes('Not translated') || !said(nb.cellAt(natural)).includes('gloriously') || !under().includes('never M is unowned')) bad.push(`${nb.uri.fsPath}: a translation that did not read is not said under the natural cell, or the cell under it changed: ${said(nb.cellAt(natural))}`);
  const pid = process.env.ROFL_NB_PID!, stopping = vscode.commands.executeCommand('rofl-notebook.refine', nb.cellAt(natural + 1), 'wait');
  await until(() => existsSync(pid) || undefined, 10_000, 'the model to start').catch(() => {});
  await until(() => said(nb.cellAt(natural)).includes('Claude is writing the cell') || undefined, 5_000, 'the progress').catch(() => {});
  if (!said(nb.cellAt(natural)).includes('Claude is writing the cell')) bad.push(`${nb.uri.fsPath}: while Claude works the natural cell does not say so: ${said(nb.cellAt(natural))}`);
  await vscode.commands.executeCommand('notebook.cancelExecution');
  await stopping;
  const alive = () => { try { process.kill(Number(readFileSync(pid, 'utf8')), 0); return true; } catch { return false; } };
  await until(() => !alive() || undefined, 5_000, 'the model to die').catch(() => bad.push(`${nb.uri.fsPath}: Stop left the model's process running`));
  if (!said(nb.cellAt(natural)).includes('Stopped')) bad.push(`${nb.uri.fsPath}: Stop is not said under the natural cell: ${said(nb.cellAt(natural))}`);
  const n = nb.cellCount;
  await vscode.commands.executeCommand('rofl-notebook.refine', nb.cellAt(natural + 1), 'ask me');
  await until(() => said(nb.cellAt(natural)).includes('Which modules count as owned?') || undefined, 5_000, 'the question').catch(() => {});
  if (!said(nb.cellAt(natural)).includes('Which modules count as owned?') || nb.cellCount !== n || !under().includes('never M is unowned')) bad.push(`${nb.uri.fsPath}: Claude's question is not under the natural cell, or the notebook changed: ${said(nb.cellAt(natural))}`);
  await vscode.commands.executeCommand('rofl-notebook.refine', nb.cellAt(natural), 'a team owns it');
  await until(() => !said(nb.cellAt(natural)).includes('Which modules') || undefined, 5_000, 'the question to go').catch(() => {});
  if (nb.cellCount !== n || !under().includes('? M is unowned') || said(nb.cellAt(natural)).includes('Which modules') || said(nb.cellAt(natural)).includes('Not translated')) bad.push(`${nb.uri.fsPath}: the answer did not replace the translation, or the question stayed: ${JSON.stringify(under())}`);
}

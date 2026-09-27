// Inside a real VS Code: open the notebooks the runner planted, run them, and hold the outputs and the marks against the command line's.
import * as vscode from 'vscode';
import { readFileSync, writeFileSync } from 'node:fs';
import type { Run } from '../render.ts';

type Case = { file: string; cli: string; fails?: { text: string; code?: [string, number] } };
const cases: Case[] = JSON.parse(process.env.ROFL_NB_CASES!);

const strip = (r: any) => JSON.stringify({ status: r.status, errors: r.errors, cells: r.cells });
const until = async <T>(get: () => T | undefined, ms: number, what: string): Promise<T> => {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise((f) => setTimeout(f, 100))) { const v = get(); if (v) return v; }
  throw new Error(`waited ${ms} ms for ${what}`);
};

export async function run() {
  const api = await vscode.extensions.getExtension('rofl.rofl-notebook')!.activate() as { result: (u: vscode.Uri) => Run | undefined };
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
      for (const l of k.lines) if (!said(runs[i]).includes(l.text.replace(/</g, '&lt;'))) bad.push(`${c.file}: "${l.text}" is not in the output of the cell it was asked in`);
    });
    const errors = vscode.languages.getDiagnostics().flatMap(([u, ds]) => ds.filter((d) => d.severity === vscode.DiagnosticSeverity.Error).map((d) => ({ u, d })));
    const ours = errors.filter(({ u }) => runs.some((x) => x.document.uri.toString() === u.toString()));
    if (!c.fails) { if (ours.length) bad.push(`${c.file}: nothing fails, yet ${ours.length} errors are marked: ${ours.map((e) => e.d.message).join('; ')}`); }
    else {
      const cell = runs.find((x) => x.document.getText().split('\n').some((l) => l.trim() === c.fails!.text));
      const line = cell?.document.getText().split('\n').findIndex((l) => l.trim() === c.fails!.text);
      if (!ours.some(({ u, d }) => u.toString() === cell?.document.uri.toString() && d.range.start.line === line && d.message === c.fails!.text)) bad.push(`${c.file}: no error "${c.fails.text}" on its line in its cell`);
      const code = c.fails.code;
      if (code && !runs.some((x) => said(x).includes(`](<${code[0]}:${code[1]}>)`))) bad.push(`${c.file}: no output links to ${code[0]}:${code[1]}`);
      if (code && !errors.some(({ u, d }) => u.fsPath === code[0] && d.range.start.line === code[1] - 1 && d.message === c.fails!.text)) bad.push(`${c.file}: no error "${c.fails.text}" at ${code[0]}:${code[1]}`);
      if (code && !bad.length) await stale(nb, api, c.fails.text, code, bad);
    }
    console.log(`${c.file}: ${Date.now() - t0} ms`);
    if (bad.length) break;
  }
  if (!bad.length) await translate(process.env.ROFL_NB_TRANSLATE!, bad);
  writeFileSync(process.env.ROFL_NB_REPORT!, bad.join('\n'));
  if (bad.length) throw new Error(bad.join('\n'));
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
  await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
}

/** The code under a run changes, on disk and then in an unsaved editor; the same window runs again and the answer follows it. */
async function stale(nb: vscode.NotebookDocument, api: { result: (u: vscode.Uri) => Run | undefined }, never: string, [file, line]: [string, number], bad: string[]) {
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

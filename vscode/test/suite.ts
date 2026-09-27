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
    }
    console.log(`${c.file}: ${Date.now() - t0} ms`);
    if (bad.length) break;
  }
  writeFileSync(process.env.ROFL_NB_REPORT!, bad.join('\n'));
  if (bad.length) throw new Error(bad.join('\n'));
}

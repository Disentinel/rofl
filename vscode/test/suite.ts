// Inside a real VS Code: open the notebooks the runner planted, run them, and hold the outputs and the marks against the command line's.
import * as vscode from 'vscode';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { Run } from '../render.ts';
import { serialize } from '../serial.ts';

type Api = { result: (u: vscode.Uri) => Run | undefined; verdict: (c: vscode.NotebookCell) => string[]; notes: (file: string) => { line: number; text: string }[] };
type Case = { file: string; cli: string; fails?: { text: string; code?: [string, number] }; pictures?: string[]; status?: [string, string]; why?: [string, string]; compare?: [string, string]; pin?: string };
const VIEW_MIME = 'application/vnd.rofl.view+json';
const cases: Case[] = JSON.parse(process.env.ROFL_NB_CASES!);
const ID = ((m) => `${m.publisher}.${m.name}`)(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')));

const strip = (r: any) => JSON.stringify({ status: r.status, errors: r.errors, cells: r.cells });
const until = async <T>(get: () => T | undefined, ms: number, what: string): Promise<T> => {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise((f) => setTimeout(f, 100))) { const v = get(); if (v) return v; }
  throw new Error(`waited ${ms} ms for ${what}`);
};

export async function run() {
  const api = await vscode.extensions.getExtension(ID)!.activate() as Api;
  const bad: string[] = [];
  if (process.env.ROFL_NB_FAKE_LM) {
    await viaLm(process.env.ROFL_NB_TRANSLATE!, bad);
    writeFileSync(process.env.ROFL_NB_REPORT!, bad.join('\n'));
    if (bad.length) throw new Error(bad.join('\n'));
    return;
  }
  for (const l of ['rofl', 'datalog', 'natural']) if (vscode.workspace.getConfiguration('editor', { languageId: l }).get('wordWrap') !== 'on') bad.push(`${l} cells do not wrap`);
  const startup = process.env.ROFL_NB_STARTUP!;
  const tabs = () => vscode.window.tabGroups.all.flatMap((g) => g.tabs).filter((t) => (t.input as { uri?: vscode.Uri })?.uri?.fsPath === startup);
  await until(() => tabs().some((t) => t.input instanceof vscode.TabInputNotebook && t.input.notebookType === 'rofl-notebook') || undefined, 10_000, 'the notebook named at launch')
    .catch(() => bad.push(`${startup}: named on the command line, it opened as ${tabs().map((t) => t.input instanceof vscode.TabInputText ? 'text' : String(t.input?.constructor.name)).join(', ') || 'nothing'}, not a notebook`));
  await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(cases[0].file));
  const opened = await until(() => vscode.window.activeNotebookEditor?.notebook.notebookType, 10_000, 'a notebook editor').catch(() => vscode.window.activeTextEditor?.document.languageId);
  if (opened !== 'rofl-notebook') bad.push(`${cases[0].file}: opening it the way a click does gives ${opened}, not a notebook`);
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  await language(bad);
  for (const c of cases) {
    const t0 = Date.now();
    // Pin layout, as the renderer's button asks it: the facts in <notebook>.layout.rofl, which this notebook reads, then drawn where they put the marks
    if (c.pin) {
      const file = await vscode.commands.executeCommand<string>('rofl-notebook.pinLayout', vscode.Uri.file(c.file), c.pin);
      if (!existsSync(file) || readFileSync(file, 'utf8') !== c.pin) { bad.push(`${c.file}: Pin layout did not write ${file}`); break; }
    }
    const nb = await vscode.workspace.openNotebookDocument(vscode.Uri.file(c.file));
    if (nb.notebookType !== 'rofl-notebook') { bad.push(`${c.file}: opened as ${nb.notebookType}`); continue; }
    await vscode.window.showNotebookDocument(nb);
    await vscode.commands.executeCommand('notebook.selectKernel', { id: 'rofl-kernel', extension: ID });
    await vscode.commands.executeCommand('notebook.execute');
    const r = await until(() => api.result(nb.uri), 110_000, `a result for ${c.file}`);
    const runs = nb.getCells().filter((x) => ['rofl', 'datalog', 'natural'].includes(x.document.languageId));
    await until(() => runs.every((x) => x.executionSummary?.success !== undefined) || undefined, 5_000, 'every cell to end');
    const said = (x: vscode.NotebookCell) => x.outputs.flatMap((o) => o.items.map((i) => new TextDecoder().decode(i.data))).join('\n');
    if (c.pin) {
      const view = runs.flatMap((x) => x.outputs).flatMap((o) => o.items).filter((i) => i.mime === VIEW_MIME).map((i) => JSON.parse(new TextDecoder().decode(i.data)).view)[0];
      if (!view?.facts.some((f: { literal: string }) => `${f.literal}.\n` === c.pin)) bad.push(`${c.file}: the picture does not carry the pinned ${c.pin.trim()}`);
      // and the renderer put the mark there: where it laid each mark, as it reported it
      // an output off screen is not drawn: bring the picture's cell into view first
      const drawing = runs.find((x) => x.outputs.some((o) => o.items.some((i) => i.mime === VIEW_MIME)));
      if (drawing) vscode.window.activeNotebookEditor?.revealRange(new vscode.NotebookRange(drawing.index, drawing.index + 1), vscode.NotebookEditorRevealType.AtTop);
      let at: string[] = [];
      for (const end = Date.now() + 45_000; !at.length && Date.now() < end; await new Promise((f) => setTimeout(f, 200))) at = await vscode.commands.executeCommand<string[]>('rofl-notebook.laid', nb.uri);
      if (!at.includes(c.pin.trim())) bad.push(`${c.file}: the renderer laid ${c.pin.trim().replace(/, \d+, \d+\)\.$/, '')} elsewhere: ${at.find((x) => x.startsWith(c.pin!.slice(0, c.pin!.indexOf(',')))) ?? 'nothing reported'}`);
      console.log(`${c.file}: ${Date.now() - t0} ms`);
      continue;
    }
    if (strip(r) !== strip(JSON.parse(readFileSync(c.cli, 'utf8')))) bad.push(`${c.file}: the extension's result is not the command line's --json`);
    r.cells.slice(1).forEach((k, i) => {
      if (!runs[i] || !said(runs[i]) && (k.lines.length || k.notes.length || k.errors.length)) bad.push(`${c.file}: kernel cell ${k.index} has no output in notebook cell ${runs[i]?.index}`);
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
    // a picture: an output the notebook renderer draws, the view in it, and the view as text for an editor without the renderer
    if (c.pictures) {
      const views = runs.flatMap((x) => x.outputs.filter((o) => o.items.some((i) => i.mime === VIEW_MIME)));
      const drawn = views.map((o) => JSON.parse(new TextDecoder().decode(o.items.find((i) => i.mime === VIEW_MIME)!.data)).view), kinds = drawn.map((v) => v.kind);
      if (kinds.join() !== c.pictures.join()) bad.push(`${c.file}: the pictures drawn are [${kinds}], not [${c.pictures}]`);
      const [mark, tag] = c.status!, tags = drawn[0]?.marks[mark]?.tags ?? [];
      if (!tags.includes(tag)) bad.push(`${c.file}: the mark ${mark} is drawn with the tags [${tags}], not ${tag}`);
      if (c.compare) { const [m, t] = c.compare, got = drawn.at(-1)?.marks[m]?.tags ?? []; if (!got.includes(t)) bad.push(`${c.file}: the what-if draws ${m} with the tags [${got}], not ${t}`); }
      const [fact, says] = c.why!, why = await vscode.commands.executeCommand<string>('rofl-notebook.why', fact, nb.uri);
      if (!why?.includes(says)) bad.push(`${c.file}: a picture's why of ${fact} does not say "${says}": ${why}`);
      if (views.some((o) => !o.items.some((i) => i.mime === 'text/markdown' && new TextDecoder().decode(i.data).length > 20))) bad.push(`${c.file}: a picture has no text for an editor without its renderer`);
      const shot = process.env.ROFL_NB_SHOT;   // the runner screenshots the window while the picture is on it
      if (shot && !bad.length) {
        await vscode.commands.executeCommand('notebook.cell.collapseAllCellInputs').then(() => {}, () => {});
        await new Promise((f) => setTimeout(f, 6000));
        const k = cases.indexOf(c); writeFileSync(`${shot}-${k}.ready`, '');
        await until(() => existsSync(`${shot}-${k}.done`), 30_000, 'the screenshot').catch(() => {});
      }
    }
    console.log(`${c.file}: ${Date.now() - t0} ms`);
    if (bad.length) break;
  }
  if (!bad.length) await translate(process.env.ROFL_NB_TRANSLATE!, bad);
  if (!bad.length) await interrupt(process.env.ROFL_NB_RUNAWAY!, cases[0], api, bad);
  writeFileSync(process.env.ROFL_NB_REPORT!, bad.join('\n'));
  if (bad.length) throw new Error(bad.join('\n'));
}

/** VS Code's language model, one the extension declares only in this copy: Translate asks it and not the command line, offers it no tool,
 *  and Stop cancels its request. The API is newer than @types/vscode 1.90, hence `any`. */
async function viaLm(file: string, bad: string[]) {
  const lm = vscode.lm as any, Text = (vscode as any).LanguageModelTextPart, asked: { tools: number; text: string; cancelled: boolean }[] = [];
  lm.registerLanguageModelChatProvider('rofl-test', {
    provideLanguageModelChatInformation: () => [{ id: 'rofl-test-model', name: 'Test model', family: 'test', version: '1', maxInputTokens: 200_000, maxOutputTokens: 10_000, capabilities: {} }],
    async provideLanguageModelChatResponse(_m: unknown, messages: { content: { value?: string }[] }[], options: { tools?: unknown[] }, progress: { report: (p: unknown) => void }, token: vscode.CancellationToken) {
      const a = { tools: options.tools?.length ?? 0, text: messages.flatMap((m) => m.content.map((p) => p.value ?? '')).join('\n'), cancelled: false };
      asked.push(a);
      if (a.text.includes('The person says: wait')) return new Promise<void>((f) => token.onCancellationRequested(() => { a.cancelled = true; f(); }));
      progress.report(new Text('```rofl\nA module M is unowned if some change touches M, unless some team owns M.\n\n? M is unowned\n```'));
    },
    provideTokenCount: async () => 1,
  });
  const nb = await vscode.workspace.openNotebookDocument(vscode.Uri.file(file));
  await vscode.window.showNotebookDocument(nb);
  const natural = nb.getCells().findIndex((c) => c.document.languageId === 'natural'), t0 = Date.now();
  await vscode.commands.executeCommand('rofl-notebook.translate');
  const under = nb.cellAt(natural + 1)?.document.getText() ?? '';
  if (!under.includes('? M is unowned')) bad.push(`${file}: Translate did not write VS Code's model's cell: ${JSON.stringify(under)} (asked ${asked.length} times)`);
  if (asked.some((a) => a.tools) || !asked[0]?.text.includes('The request: No change touches a module nobody owns.')) bad.push(`${file}: VS Code's model was offered tools or not the request: ${JSON.stringify(asked.map((a) => [a.tools, a.text.slice(-300)]))}`);
  console.log(`VS Code's language model: Translate ${Date.now() - t0} ms`);
  const said = (c: vscode.NotebookCell) => c.outputs.flatMap((o) => o.items.map((i) => new TextDecoder().decode(i.data))).join('\n');
  await vscode.commands.executeCommand('notebook.selectKernel', { id: 'rofl-kernel', extension: ID });
  const stopping = vscode.commands.executeCommand('rofl-notebook.refine', nb.cellAt(natural + 1), 'wait');
  await until(() => asked.some((a) => a.text.includes('The person says: wait')) || undefined, 20_000, 'the model to be asked').catch(() => {});
  await until(() => said(nb.cellAt(natural)).includes('Test model is writing the cell') || undefined, 5_000, 'the progress').catch(() => bad.push(`${file}: while VS Code's model works the natural cell does not say so: ${said(nb.cellAt(natural))}`));
  await vscode.commands.executeCommand('notebook.cancelExecution');
  await Promise.race([stopping, new Promise((f) => setTimeout(f, 10_000))]);
  if (!asked.at(-1)?.cancelled || !said(nb.cellAt(natural)).includes('Stopped')) bad.push(`${file}: Stop did not cancel VS Code's model's request (${asked.at(-1)?.cancelled}) or is not said: ${said(nb.cellAt(natural))}`);
  await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
}

/** The language server: a `.rofl` with a broken rule on line 3 has its error there and a hover on a relation says what it is; a `.rofl.md` opened as text has its sentence not read marked. */
async function language(bad: string[]) {
  const [rofl, md] = JSON.parse(process.env.ROFL_LSP_FILES!) as string[], t0 = Date.now();
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(rofl));
  await vscode.window.showTextDocument(doc);
  if (doc.languageId !== 'rofl') bad.push(`${rofl}: opened as ${doc.languageId}, not rofl`);
  const error = (d: vscode.TextDocument) => vscode.languages.getDiagnostics(d.uri).find((x) => x.source === 'rofl' && x.severity === vscode.DiagnosticSeverity.Error);
  const d = await until(() => error(doc), 20_000, `a diagnostic on ${rofl}`).catch(() => undefined);
  if (d?.range.start.line !== 2) bad.push(`${rofl}: the broken rule on line 3 is marked ${d ? `on line ${d.range.start.line + 1}: ${d.message}` : 'nowhere'}`);
  const hover = await vscode.commands.executeCommand<vscode.Hover[]>('vscode.executeHoverProvider', doc.uri, new vscode.Position(1, 0));
  const said = hover.flatMap((h) => h.contents.map((c) => (c as vscode.MarkdownString).value ?? String(c))).join('\n');
  if (!said.includes('**b**')) bad.push(`${rofl}: a hover on b says ${JSON.stringify(said)}`);
  const text = await vscode.workspace.openTextDocument(vscode.Uri.file(md));
  await vscode.window.showTextDocument(text);
  const m = await until(() => error(text), 20_000, `a diagnostic on ${md}`).catch(() => undefined);
  if (!m?.message.startsWith('not read: M is frozen by a team T') || m.range.start.line !== text.lineCount - 2) bad.push(`${md}: the sentence not read is marked ${m ? `on line ${m.range.start.line + 1}: ${m.message}` : 'nowhere'}`);
  console.log(`language server: ${Date.now() - t0} ms`);
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
}

/** A rule that climbs for ever, stopped: every cell ends at once, and the next run, in a new worker, answers what the command line does. */
async function interrupt(file: string, again: Case, api: Api, bad: string[]) {
  const nb = await vscode.workspace.openNotebookDocument(vscode.Uri.file(file));
  await vscode.window.showNotebookDocument(nb);
  await vscode.commands.executeCommand('notebook.selectKernel', { id: 'rofl-kernel', extension: ID });
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
  await vscode.commands.executeCommand('notebook.selectKernel', { id: 'rofl-kernel', extension: ID });
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

// Inside a real VS Code: open the notebooks the runner planted, run them, and hold the outputs and the marks against the command line's.
import * as vscode from 'vscode';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { Run } from '../render.ts';
import { serialize } from '../serial.ts';
import { framesOf, GRAPHS, zoom } from '../../notebook/draw.ts';

type Api = { result: (u: vscode.Uri) => Run | undefined; verdict: (c: vscode.NotebookCell) => string[]; notes: (file: string) => { line: number; text: string }[] };
type Case = { file: string; cli: string; fails?: { text: string; code?: [string, number] }; pictures?: string[]; status?: [string, string]; why?: [string, string]; compare?: [string, string]; pin?: string; frames?: string[]; zoom?: string[]; laid?: string; below?: [string, string]; notation?: string; form?: string; look?: 'down' | 'up' | 'entry' | 'bands' | 'ring'; asks?: boolean };
const VIEW_MIME = 'application/vnd.rofl.view+json';
const cases: Case[] = JSON.parse(process.env.ROFL_NB_CASES!);
const ID = ((m) => `${m.publisher}.${m.name}`)(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')));

const strip = (r: any) => JSON.stringify({ status: r.status, errors: r.errors, cells: r.cells });
const until = async <T>(get: () => T | undefined | Promise<T | undefined>, ms: number, what: string): Promise<T> => {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise((f) => setTimeout(f, 100))) { const v = await get(); if (v) return v; }
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
  // under a plant every check runs, so the one the plant is for gives its reason whatever broke before it
  const extras = !process.env.ROFL_NB_CASES_ONLY, planted = !!process.env.ROFL_NB_PLANTED;
  const guard = (what: string, f: () => Promise<void>) => f().catch((e: Error) => { bad.push(`${what}: ${e.message}`); });
  if (extras) await guard('before the cases', () => beforeCases(bad));
  for (const c of cases) {
    const t0 = Date.now();
    await guard(c.file, async () => {
    // Pin layout, as the renderer's button asks it: the facts in <notebook>.layout.rofl, which this notebook reads, then drawn where they put the marks
    if (c.pin) {
      const file = await vscode.commands.executeCommand<string>('rofl-notebook.pinLayout', vscode.Uri.file(c.file), c.pin);
      if (!existsSync(file) || readFileSync(file, 'utf8') !== c.pin) { bad.push(`${c.file}: Pin layout did not write ${file}`); return; }
    }
    const nb = await vscode.workspace.openNotebookDocument(vscode.Uri.file(c.file));
    if (nb.notebookType !== 'rofl-notebook') { bad.push(`${c.file}: opened as ${nb.notebookType}`); return; }
    await vscode.window.showNotebookDocument(nb);
    // a picture is drawn with the side bar shut, and measured again with it open: narrower, it must still fit
    if (c.pictures) await vscode.commands.executeCommand('workbench.action.closeSidebar');
    await vscode.commands.executeCommand('notebook.selectKernel', { id: 'rofl-kernel', extension: ID });
    await vscode.commands.executeCommand('notebook.execute');
    const r = await until(() => api.result(nb.uri), 110_000, `a result for ${c.file}`);
    const runs = nb.getCells().filter((x) => ['rofl', 'datalog', 'natural'].includes(x.document.languageId));
    await until(() => runs.every((x) => x.executionSummary?.success !== undefined) || undefined, 5_000, 'every cell to end');
    const said = (x: vscode.NotebookCell) => x.outputs.flatMap((o) => o.items.map((i) => new TextDecoder().decode(i.data))).join('\n');
    // small multiples: the renderer reports each picture's frames as it draws them
    if (c.frames || c.zoom) {
      const drawing = runs.find((x) => x.outputs.some((o) => o.items.some((i) => i.mime === VIEW_MIME)));
      if (drawing) vscode.window.activeNotebookEditor?.revealRange(new vscode.NotebookRange(drawing.index, drawing.index + 1), vscode.NotebookEditorRevealType.AtTop);
      let got: { kind: string; frames: string[]; labels: string[] }[] = [];
      for (const end = Date.now() + 45_000; !got.some((d) => !c.frames || d.frames.length) && Date.now() < end; await new Promise((f) => setTimeout(f, 200))) got = await vscode.commands.executeCommand('rofl-notebook.drawn', nb.uri);
      if (c.frames && !got.some((d) => d.frames.join() === c.frames!.join())) bad.push(`${c.file}: the renderer drew the frames ${JSON.stringify(got)}, not [${c.frames}]`);
      if (c.zoom) {
        const [group, shut, member] = c.zoom, n = got.length, has = (d: { labels: string[] }, l: string) => d.labels.includes(l);
        if (!got.some((d) => has(d, shut) && !has(d, member))) bad.push(`${c.file}: the shut group ${group} is not drawn as "${shut}" without ${member}: ${JSON.stringify(got.map((d) => d.labels))}`);
        await vscode.commands.executeCommand('rofl-notebook.zoom', nb.uri, group);
        // a picture still finishing its first paint may report after the zoom too: wait for a report with the member, not for the next one
        for (const end = Date.now() + 20_000; !got.slice(n).some((d) => has(d, member)) && Date.now() < end; await new Promise((f) => setTimeout(f, 200))) got = await vscode.commands.executeCommand('rofl-notebook.drawn', nb.uri);
        if (!got.slice(n).some((d) => has(d, member) && !has(d, shut))) bad.push(`${c.file}: zoomed into ${group}, the renderer does not draw ${member}: ${JSON.stringify(got.slice(n).map((d) => d.labels))}`);
      }
    }
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
      return;
    }
    if (strip(r) !== strip(JSON.parse(readFileSync(c.cli, 'utf8')))) bad.push(`${c.file}: the extension's result is not the command line's --json`);
    r.cells.slice(1).forEach((k, i) => {
      if (!runs[i] || !said(runs[i]) && (k.lines.length || k.notes.length || k.errors.length)) bad.push(`${c.file}: kernel cell ${k.index} has no output in notebook cell ${runs[i]?.index}`);
      for (const l of k.lines) if (l.kind === 'answers' && l.answers.length) { const t = said(runs[i]), h = t.indexOf(`**${l.text.replace(/[\\[\]()]/g, '\\$&').replace(/</g, '&lt;')}**`), d = t.indexOf(`<details><summary>${l.total} answer`, h), li = t.indexOf('\n- ', h); if (h < 0 || d < 0 || li < d) bad.push(`${c.file}: a ? line's answers are not folded under it: "${l.text}"`); }
      for (const l of k.lines) if (!said(runs[i]).includes(l.text.replace(/[\\[\]()]/g, '\\$&').replace(/</g, '&lt;'))) bad.push(`${c.file}: "${l.text}" is not in the output of the cell it was asked in`);
    });
    await colours(nb, runs, said, c.file, bad);
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
    if (c.asks) await asks(nb, runs, api, c.file, bad);
    // a picture: an output the notebook renderer draws, the view in it, and the view as text for an editor without the renderer
    if (c.pictures) {
      const views = runs.flatMap((x) => x.outputs.filter((o) => o.items.some((i) => i.mime === VIEW_MIME)));
      const drawn = views.map((o) => JSON.parse(new TextDecoder().decode(o.items.find((i) => i.mime === VIEW_MIME)!.data)).view), kinds = drawn.map((v) => v.kind);
      if (kinds.join() !== c.pictures.join()) bad.push(`${c.file}: the pictures drawn are [${kinds}], not [${c.pictures}]`);
      const [mark, tag] = c.status!, tags = drawn[0]?.marks[mark]?.tags ?? [];
      if (!tags.includes(tag)) bad.push(`${c.file}: the mark ${mark} is drawn with the tags [${tags}], not ${tag}`);
      if (c.laid) {   // space is never laid out: the renderer reports each point back at the data's position
        const drawing = runs.find((x) => x.outputs.some((o) => o.items.some((i) => i.mime === VIEW_MIME)));
        if (drawing) vscode.window.activeNotebookEditor?.revealRange(new vscode.NotebookRange(drawing.index, drawing.index + 1), vscode.NotebookEditorRevealType.AtTop);
        let at: string[] = [];
        for (const end = Date.now() + 45_000; !at.length && Date.now() < end; await new Promise((f) => setTimeout(f, 200))) at = await vscode.commands.executeCommand<string[]>('rofl-notebook.laid', nb.uri);
        if (!at.includes(c.laid)) bad.push(`${c.file}: the renderer put ${c.laid.slice(3, c.laid.indexOf(','))} elsewhere: ${at.find((x) => x.startsWith(c.laid!.slice(0, c.laid!.indexOf(',')))) ?? 'nothing reported'}`);
        const y = (m: string) => Number(/, (-?\d+)\)\.$/.exec(at.find((x) => x.startsWith(`drawn_at(${m},`)) ?? '')?.[1] ?? NaN);
        if (c.below && !(y(c.below[0]) > y(c.below[1]))) bad.push(`${c.file}: ${c.below[0]} is not drawn below ${c.below[1]} (page y ${y(c.below[0])} and ${y(c.below[1])})`);
      }
      // drawn by the renderer's own module: a report for each kind, and a dialect's look read back from where it put the marks
      const drawing = runs.find((x) => x.outputs.some((o) => o.items.some((i) => i.mime === VIEW_MIME)));
      if (drawing) vscode.window.activeNotebookEditor?.revealRange(new vscode.NotebookRange(drawing.index, drawing.index + 1), vscode.NotebookEditorRevealType.AtTop);
      type Report = { kind: string; laid: string[]; features: string[]; tags: string[] };
      let reports: Report[] = [];
      for (const end = Date.now() + 45_000; !c.pictures.every((k) => reports.some((d) => d.kind === k)) && Date.now() < end; await new Promise((f) => setTimeout(f, 200))) reports = await vscode.commands.executeCommand('rofl-notebook.drawn', nb.uri);
      const missing = c.pictures.filter((k) => !reports.some((d) => d.kind === k));
      if (missing.length) bad.push(`${c.file}: the renderer drew no ${missing.join(', ')} (it reported ${JSON.stringify(reports.map((d) => d.kind))})`);
      await fitted(nb, c.file, reports.length, bad);
      // a graph drawn by the renderer carries the mark's status as it drew it (a shut group may hold the mark, so not under zoom)
      const own = reports.find((d) => d.kind === c.pictures![0]);
      if (!c.zoom && own && (GRAPHS.includes(own.kind as never) || own.kind === 'notation') && !own.tags.includes(`tagged(${c.status![0]}, ${c.status![1]}).`)) bad.push(`${c.file}: the ${own.kind} does not draw ${c.status!.join(' ')}: ${JSON.stringify(own.tags)}`);
      // a pedigree: each partner above the family, the family above each child
      if (own?.kind === 'notation') {
        const y = new Map(own.laid.flatMap((l) => { const m = /^placed\((.*), -?\d+, (-?\d+)\)\.$/.exec(l); return m ? [[m[1], Number(m[2])] as const] : []; }));
        const z = zoom(drawn[0]), rows = (framesOf(z)?.[0].view ?? z).facts.filter((f: { rel: string; args: string[] }) => (f.rel === 'partner' || f.rel === 'child') && y.has(f.args[0]) && y.has(f.args[1]));
        if (!rows.length || rows.some((f: { rel: string; args: string[] }) => !(f.rel === 'partner' ? y.get(f.args[1])! < y.get(f.args[0])! : y.get(f.args[1])! > y.get(f.args[0])!))) bad.push(`${c.file}: the pedigree is not drawn down: ${JSON.stringify(own.laid)}`);
      }
      if (c.look) {
        // the first report of the kind is the notebook's own picture as first painted: its groups shut as the notebook shuts them, its first frame
        const kind = c.pictures![0], d = reports.find((x) => x.kind === kind), z = zoom(drawn[0]), v0 = framesOf(z)?.[0].view ?? z;
        const at = new Map((d?.laid ?? []).flatMap((l) => { const m = /^placed\((.*), (-?\d+), (-?\d+)\)\.$/.exec(l); return m ? [[m[1], { x: Number(m[2]), y: Number(m[3]) }] as const] : []; }));
        const links = v0.facts.filter((f: { rel: string }) => f.rel === 'link').map((f: { args: string[] }) => f.args).filter(([a, b]: string[]) => at.has(a) && at.has(b) && a !== b);
        const parent = new Map<string, string>(v0.facts.filter((f: { rel: string }) => f.rel === 'inside').map((f: { args: string[] }) => [f.args[0], f.args[1]]));
        const ok = {
          // an architecture flows down, save the call that is the defect: a link from a failing mark may go up, as it does
          down: () => links.length > 0 && links.every(([a, b]: string[]) => at.get(b)!.y > at.get(a)!.y || v0.marks[a]?.tags.includes('failing')),
          up: () => links.length > 0 && links.every(([a, b]: string[]) => at.get(b)!.y < at.get(a)!.y),
          entry: () => (d?.features ?? []).some((x) => x.startsWith('entry(')),
          bands: () => { const band = new Map<string, number[]>(); for (const [m, p] of at) if (parent.has(m)) band.set(parent.get(m)!, [...(band.get(parent.get(m)!) ?? []), p.y]);
            const spans = [...band.values()].map((ys) => [Math.min(...ys), Math.max(...ys)]).sort((p, q) => p[0] - q[0]); return spans.length > 1 && spans.every((s, i) => !i || s[0] > spans[i - 1][1]); },
          ring: () => { const ps = [...at.values()], cx = ps.reduce((a, p) => a + p.x, 0) / ps.length, cy = ps.reduce((a, p) => a + p.y, 0) / ps.length, r = ps.map((p) => Math.hypot(p.x - cx, p.y - cy)); return ps.length > 2 && Math.max(...r) - Math.min(...r) < 4; },
        }[c.look]();
        if (!ok) bad.push(`${c.file}: the ${kind} is not drawn ${c.look}: ${JSON.stringify({ laid: d?.laid, features: d?.features })}`);
      }
      if (c.notation) {   // a notation opens as the standard file beside the notebook, the same text the picture shows
        const text = /```\w+\n([\s\S]*)\n```/.exec(views.flatMap((o) => o.items).filter((i) => i.mime === 'text/markdown').map((i) => new TextDecoder().decode(i.data))[0] ?? '')?.[1] ?? '';
        const file = await vscode.commands.executeCommand<string>('rofl-notebook.openNotation', nb.uri, c.notation, text);
        const shown = vscode.window.visibleTextEditors.find((e) => e.document.uri.fsPath === file)?.document.getText();
        if (!text.startsWith('0 HEAD') || !file?.endsWith(`.${c.notation}`) || shown !== text) bad.push(`${c.file}: the notation did not open as ${c.notation}: ${file}, ${shown === text ? 'same text' : `text ${JSON.stringify((shown ?? '').slice(0, 60))}`}`);
      }
      if (c.compare) { const [m, t] = c.compare, got = drawn.at(-1)?.marks[m]?.tags ?? []; if (!got.includes(t)) bad.push(`${c.file}: the what-if draws ${m} with the tags [${got}], not ${t}`); }
      // the renderer's own picture module, as the webview runs it: the form the view is drawn in, its status mark and the what-if's change on a drawn element
      if (c.form) {
        const { pictureOf } = await import('../visual/pictures.ts');
        const html = async (v: any) => { const el = { innerHTML: '' }; await pictureOf(v)?.mount(el as any, v, { libs: async () => false }, () => {}, () => {}); return el.innerHTML; };
        const marked = (h: string, [m, t]: [string, string]) => new RegExp(`data-mark="${m.replace(/[$()[\]\\.*+?^{}|]/g, '\\$&')}" class="[^"]*\\b${t}\\b`).test(h);
        const first = await html(drawn[0]), last = await html(drawn.at(-1));
        if (!first.includes(`aria-label="${c.form}"`) || !marked(first, c.status!)) bad.push(`${c.file}: the renderer does not draw a ${c.form} with ${c.status!.join(' tagged ')}: ${first.slice(0, 300)}`);
        if (c.compare && !marked(last, c.compare)) bad.push(`${c.file}: the renderer does not draw the what-if's ${c.compare.join(' tagged ')}`);
      }
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
    });
    console.log(`${c.file}: ${Date.now() - t0} ms`);
    if (bad.length && !planted) break;
  }
  if (extras && (planted || !bad.length)) await guard('translate', () => translate(process.env.ROFL_NB_TRANSLATE!, bad));
  if (extras && (planted || !bad.length)) await guard('stop', () => interrupt(process.env.ROFL_NB_RUNAWAY!, cases[0], api, bad));
  writeFileSync(process.env.ROFL_NB_REPORT!, bad.join('\n'));
  if (bad.length) throw new Error(bad.join('\n'));
}

/** Each verdict in its outputs as the renderer drew it: one colour a meaning, the three apart, none the colour of the text around it.
 *  A cell is brought into view for each meaning not yet drawn, since an output out of view may not be. */
async function colours(nb: vscode.NotebookDocument, runs: vscode.NotebookCell[], said: (x: vscode.NotebookCell) => string, file: string, bad: string[]) {
  type Seen = { text: string; colour: string; around: string };
  const signs = (t: string) => [...t.matchAll(/class="verdict \w+">(\S)/g)].map((m) => m[1]), want = [...new Set(runs.flatMap((x) => signs(said(x))))];
  let seen: Seen[] = [];
  const get = async () => { seen = await vscode.commands.executeCommand<Seen[]>('rofl-notebook.verdicts', nb.uri); return seen; };
  for (const g of want) {
    const x = runs.find((y) => signs(said(y)).includes(g))!;
    vscode.window.activeNotebookEditor?.revealRange(new vscode.NotebookRange(x.index, x.index + 1), vscode.NotebookEditorRevealType.InCenter);
    await until(async () => (await get()).some((v) => v.text.startsWith(g)) || undefined, 10_000, `a verdict ${g} drawn`).catch(() => {});
  }
  const by = new Map<string, Set<string>>();
  for (const v of seen) by.set(v.text[0], (by.get(v.text[0]) ?? new Set()).add(v.colour));
  const one = [...by.values()].map((cs) => [...cs][0]);
  if (want.some((g) => !by.has(g)) || [...by.values()].some((cs) => cs.size !== 1) || new Set(one).size !== one.length || seen.some((v) => !v.colour || v.colour === v.around))
    bad.push(`${file}: the verdicts are not coloured by meaning: ${JSON.stringify([...by].map(([g, cs]) => [g, [...cs]]))}, of ${JSON.stringify(want)}, around ${JSON.stringify([...new Set(seen.map((v) => v.around))])}`);
}

/** Each answer row's why as a person clicks it: the proof of that row shown under it, and hidden at a second click; none on a row that is
 *  no answer of its own; and once the notebook has changed, the kernel restarted or run another notebook, why there is no proof in place of one. */
async function asks(nb: vscode.NotebookDocument, runs: vscode.NotebookCell[], api: Api, file: string, bad: string[]) {
  type Shown = { row: string; tree: string | null };
  const press = (m: object) => vscode.commands.executeCommand('rofl-notebook.press', nb.uri, m);
  const whys = () => vscode.commands.executeCommand<Shown[]>('rofl-notebook.whys', nb.uri);
  const OWN = ['bike leaves the line', 'car leaves the line', 'scooter leaves the line', 'n(0)', 'low(0)'], NONE = ['? X leaves the line: 3 -> 2', 'no longer: bike leaves the line'];
  const more = (r: string) => r.startsWith('\u2026 ') && r.endsWith('not sent by the kernel'), said = (r: string) => r.startsWith('said(');
  const seen = new Map<string, boolean>(), all = () => [...OWN, ...NONE].every((r) => seen.has(r)) && [...seen.keys()].some(more) && [...seen.keys()].some(said);
  for (const x of runs) {   // an output out of view may not be drawn
    vscode.window.activeNotebookEditor?.revealRange(new vscode.NotebookRange(x.index, x.index + 1), vscode.NotebookEditorRevealType.InCenter);
    await press({ rows: true });
    await new Promise((f) => setTimeout(f, 300));
  }
  await until(async () => {
    for (const { row, why } of await vscode.commands.executeCommand<{ row: string; why: boolean }[]>('rofl-notebook.rows', nb.uri)) seen.set(row, (seen.get(row) ?? true) && why);
    if (all()) return true;
    await press({ rows: true });
  }, 20_000, 'every row drawn').catch(() => {});
  for (const r of [...OWN, [...seen.keys()].find(said) ?? 'said(…)']) if (!seen.has(r)) bad.push(`${file}: the row "${r}" is not drawn`); else if (!seen.get(r)) bad.push(`${file}: the row "${r}" has no why button`);
  for (const r of [...NONE, [...seen.keys()].find(more) ?? '… more']) if (seen.get(r)) bad.push(`${file}: a row with no answer of its own has a why: "${r}"`);
  if (!OWN.every((r) => seen.get(r))) return;
  const click = async (row: string) => {
    const n = (await whys()).length;
    await press({ why: row });
    return (await until(async () => (await whys()).slice(n).find((s) => s.row === row && s.tree !== 'asking the kernel\u2026'), 20_000, `the why of "${row}"`).catch(() => undefined))?.tree;
  };
  const own = async (row: string, begins: string, what = '') => {
    const tree = await click(row);
    if (!tree?.startsWith(begins)) bad.push(`${file}: the why under "${row}"${what} is not the proof of its own row: ${JSON.stringify(tree)}`);
    if (await click(row) !== null) bad.push(`${file}: a second click did not hide the why under "${row}"`);
  };
  await own('bike leaves the line', '`bike` leaves the line, because\n  `bike` is on the plan (given)');
  await own('low(0)', 'low(0), because\n  n(0) (given)', ', a failing never\'s row,');
  const string = [...seen.keys()].find(said);
  if (string) await own(string, 'said("a \\"q\\" `b` [c] (d) <e> *f*") (given)');
  // the notebook changed after its run: no proof; the change undone, the proof again; the kernel restarted: no proof
  const edit = async (e: vscode.NotebookEdit) => { const w = new vscode.WorkspaceEdit(); w.set(nb.uri, [e]); await vscode.workspace.applyEdit(w); };
  await edit(vscode.NotebookEdit.insertCells(nb.cellCount, [new vscode.NotebookCellData(vscode.NotebookCellKind.Markup, 'A line written after the run.', 'markdown')]));
  const after = await click('bike leaves the line');
  if (!after?.startsWith('No proof: the notebook changed')) bad.push(`${file}: after an edit, a why showed a proof, or nothing: ${JSON.stringify(after)}`);
  await click('bike leaves the line');
  await edit(vscode.NotebookEdit.deleteCells(new vscode.NotebookRange(nb.cellCount - 1, nb.cellCount)));
  await own('bike leaves the line', '`bike` leaves the line, because', ', the edit undone,');
  await vscode.commands.executeCommand('rofl-notebook.restart');
  const restarted = await click('bike leaves the line');
  if (!restarted?.startsWith('No proof: the kernel no longer holds')) bad.push(`${file}: after a restart, a why showed a proof, or nothing: ${JSON.stringify(restarted)}`);
  await click('bike leaves the line');
  // run again, the proof is back; another notebook run in the one kernel since, it is gone
  const execute = async (doc: vscode.NotebookDocument) => {
    const before = api.result(doc.uri);
    await vscode.window.showNotebookDocument(doc);
    await vscode.commands.executeCommand('notebook.execute');
    await until(() => api.result(doc.uri) !== before || undefined, 60_000, `a run of ${doc.uri.fsPath}`).catch(() => bad.push(`${file}: ${doc.uri.fsPath} did not run again`));
  };
  // a run draws its outputs anew, and an output out of view is not drawn: the question brought into view until its rows are
  const drawn = async () => {
    const x = runs.find((y) => y.document.getText().includes('? X leaves the line'))!;
    vscode.window.activeNotebookEditor?.revealRange(new vscode.NotebookRange(x.index, x.index + 1), vscode.NotebookEditorRevealType.InCenter);
    await until(async () => { await press({ rows: true }); await new Promise((f) => setTimeout(f, 200)); return (await vscode.commands.executeCommand<{ row: string; why: boolean }[]>('rofl-notebook.rows', nb.uri)).some((r) => r.row === 'bike leaves the line' && r.why) || undefined; }, 20_000, 'the answers drawn again').catch(() => {});
  };
  await execute(nb);
  await drawn();
  await own('bike leaves the line', '`bike` leaves the line, because', ', run again,');
  await execute(await vscode.workspace.openNotebookDocument(vscode.Uri.file(process.env.ROFL_NB_STARTUP!)));
  await vscode.window.showNotebookDocument(nb);
  await drawn();
  const other = await click('bike leaves the line');
  if (!other?.startsWith('No proof: the kernel no longer holds')) bad.push(`${file}: after another notebook ran, a why showed a proof, or nothing: ${JSON.stringify(other)}`);
}

/** Every picture fits its box: drawn with the side bar shut, measured again with it open, and drawn in an editor tab of its own by its Open in editor, sized to the tab. */
async function fitted(nb: vscode.NotebookDocument, file: string, n: number, bad: string[]) {
  type Report = { kind: string; spill: string[]; size: [number, number]; panel?: [number, number] };
  const reports = () => vscode.commands.executeCommand<Report[]>('rofl-notebook.drawn', nb.uri);
  await vscode.commands.executeCommand('workbench.view.explorer');
  await vscode.window.showNotebookDocument(nb);
  await new Promise((f) => setTimeout(f, 800));
  await vscode.commands.executeCommand('rofl-notebook.press', nb.uri, { measure: true });
  const now = (await until(async () => { const r = (await reports()).slice(n); return r.length ? r : undefined; }, 10_000, 'the pictures measured again').catch(() => [])).filter((d) => !d.panel);
  if (!now.length) bad.push(`${file}: no picture said what it drew when asked again`);
  for (const d of now) if (d.spill.length) bad.push(`${file}: the ${d.kind} reaches past its picture: ${d.spill.join('; ')}`);
  const m = (await reports()).length;
  await vscode.commands.executeCommand('rofl-notebook.press', nb.uri, { show: true });
  const shown = await until(async () => (await reports()).slice(m).find((d) => d.panel), 20_000, 'the picture in its tab').catch(() => undefined);
  const tab = vscode.window.tabGroups.all.flatMap((g) => g.tabs).find((x) => x.input instanceof vscode.TabInputWebview && x.input.viewType.endsWith('rofl-picture'));
  if (!shown || !tab) bad.push(`${file}: Open in editor opened no picture in an editor tab (${tab ? 'a tab, no picture' : 'no tab'})`);
  else if (shown.spill.length || shown.size[1] < shown.panel![1] / 2) bad.push(`${file}: the picture in its tab is not fitted to the tab: ${JSON.stringify(shown)}`);
  if (tab) await vscode.window.tabGroups.close(tab);
}

/** What is checked once per window and is not a case: cells wrap, the notebook named at launch and one opened as a click opens it are notebooks, the language server answers. */
async function beforeCases(bad: string[]) {
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
      if (!a.text.includes('The answers:')) return progress.report(new Text('? C is blocked by T'));
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
  if (!asked[1]?.text.includes('> ? C is blocked by T\nholds') && !asked[1]?.text.match(/> \? C is blocked by T\n[^\n]*\n- `c2` is blocked by `platform`/)) bad.push(`${file}: VS Code's model asked the notebook a question through the read protocol and was not answered: ${JSON.stringify(asked[1]?.text.slice(-400))}`);
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
  // Cmd/Ctrl+Enter in a natural cell: its binding, and the command it runs with no argument over the selected cell, as a key press runs it
  const keys = (vscode.extensions.getExtension(ID)?.packageJSON?.contributes?.keybindings ?? []) as { command: string; key: string; mac?: string; when?: string }[];
  const key = keys.find((k) => k.command === 'rofl-notebook.translateCell');
  if (!key || key.key !== 'ctrl+enter' || key.mac !== 'cmd+enter' || !key.when?.includes('notebookCellResource in rofl-notebook.naturals')) bad.push(`${nb.uri.fsPath}: Cmd/Ctrl+Enter in a natural cell does not translate: ${JSON.stringify(key)}`);
  const editor = vscode.window.activeNotebookEditor;
  if (editor?.notebook !== nb) bad.push(`${nb.uri.fsPath}: the notebook is not the one in the editor, so the key's path was not tried`);
  else editor.selections = [new vscode.NotebookRange(natural, natural + 1)];
  await vscode.commands.executeCommand('rofl-notebook.translateCell');
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
  // a cell that only models: what it adds is said where the translation's result is
  await vscode.commands.executeCommand('rofl-notebook.refine', nb.cellAt(natural), 'model it');
  await until(() => under().includes('keeps') || undefined, 10_000, 'the modelling cell').catch(() => {});
  if (!said(nb.cellAt(natural)).includes('adds 1 fact in 1 sentence')) bad.push(`${nb.uri.fsPath}: the translation's facts are not said under the natural cell: ${said(nb.cellAt(natural))} / ${JSON.stringify(under())}`);
}

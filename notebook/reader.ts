// What the translator lets a model read, for every model alike: the notebook's repository, its tracked files only, less those that look like
// secrets, nothing outside it and no link out of it. A model asks in lines (`list`, `grep`, `show`, `?`), this answers them, within a number
// of rounds and a number of bytes, and says each read. The model's own tools stay off (notebook/model.ts); this is the only way it reads.
import { spawnSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import * as path from 'node:path';

export const ROUNDS = Number(process.env.ROFL_NB_READ_ROUNDS ?? 6);
export const BUDGET = Number(process.env.ROFL_NB_READ_BUDGET ?? 200_000);
/** Left out even when tracked: a file whose name looks like a secret. */
export const SECRET = /(^|\/)(\.env[^/]*|[^/]*\.(pem|key|p12|pfx)|id_[^/]*|[^/]*credential[^/]*|[^/]*secret[^/]*)$/i;
const SHOWN = { list: 200, grep: 100, show: 400 };

export type Repo = { root: string; files: Set<string>; git: boolean };

/** The repository a notebook is in: git's top level and the files it tracks; outside git, the notebook's own directory and nothing in it. */
export function gitFiles(dir: string): Repo {
  const top = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: dir, encoding: 'utf8' });
  if (top.status !== 0) return { root: realpathSync(dir), files: new Set(), git: false };
  const root = realpathSync(top.stdout.trim()), ls = spawnSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 2 ** 20 });
  return { root, files: new Set((ls.stdout ?? '').split('\0').filter((f) => f && !SECRET.test(f))), git: true };
}

/** A path the model named, as the tracked file it is, or why it may not be read. */
export function resolve(repo: Repo, asked: string): { file: string } | { refused: string } {
  let real: string;
  try { real = realpathSync(path.resolve(repo.root, asked)); } catch { return { refused: `${asked}: no such file` }; }
  const rel = path.relative(repo.root, real);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return { refused: `${asked}: outside the repository` };
  if (SECRET.test(rel)) return { refused: `${asked}: looks like a secret, not read` };
  if (!repo.files.has(rel)) return { refused: `${asked}: not a file git tracks here` };
  return { file: rel };
}

/** The lines of an answer that are requests; none when the answer is a cell or words. */
export const requestsOf = (answer: string) => /```/.test(answer) ? [] : answer.split('\n').map((l) => l.trim()).filter((l) => /^(list|grep|show) \S|^\? \S/.test(l));

/** One request answered, at most `room` bytes of it, and the line that says what was read. `ask` puts a question to the notebook's kernel. */
export function answer(repo: Repo, req: string, room: number, ask: (question: string) => string): { text: string; read: string } {
  const [verb, ...rest] = req.split(/\s+/), arg = req.slice(verb.length).trim();
  const fit = (lines: string[], cap: number, more: string) => {
    const out: string[] = [];
    let used = 0;
    for (const l of lines.slice(0, cap)) { if (used + l.length + 1 > room) break; out.push(l); used += l.length + 1; }
    return [...out, ...(out.length < lines.length ? [`(${lines.length - out.length} more ${more}${out.length < Math.min(lines.length, cap) ? ': the read budget is spent' : ''})`] : [])].join('\n');
  };
  const matches = (glob: string) => [...repo.files].filter((f) => path.matchesGlob(f, glob)).sort();
  if (verb === 'list') {
    const found = matches(arg);
    return { text: fit(found, SHOWN.list, 'files'), read: `list ${arg} (${found.length})` };
  }
  if (verb === 'grep') {
    const globbed = rest.length > 1 && /[*/]/.test(rest.at(-1)!), glob = globbed ? rest.at(-1)! : '**', pattern = globbed ? rest.slice(0, -1).join(' ') : arg;
    let re: RegExp;
    try { re = new RegExp(pattern); } catch (e) { return { text: `refused: ${(e as Error).message}`, read: `grep ${pattern} (not a regex)` }; }
    const hits = matches(glob).flatMap((f) => { if ('refused' in resolve(repo, f)) return []; try { return readFileSync(path.join(repo.root, f), 'utf8').split('\n').flatMap((l, i) => re.test(l) ? [`${f}:${i + 1}: ${l.trim().slice(0, 200)}`] : []); } catch { return []; } });
    return { text: fit(hits, SHOWN.grep, 'lines'), read: `grep ${pattern} in ${glob} (${hits.length})` };
  }
  if (verb === 'show') {
    const m = /^(.+?)(?::(\d+)(?:-(\d+))?)?$/.exec(arg)!, r = resolve(repo, m[1]);
    if ('refused' in r) return { text: `refused: ${r.refused}`, read: `show ${m[1]} refused` };
    const lines = readFileSync(path.join(repo.root, r.file), 'utf8').split('\n'), from = Math.max(1, Number(m[2] ?? 1)), to = Math.min(lines.length, Number(m[3] ?? from + SHOWN.show - 1));
    return { text: fit(lines.slice(from - 1, to).map((l, i) => `${from + i}  ${l}`), SHOWN.show, 'lines'), read: `${r.file}:${from}-${to}` };
  }
  const said = ask(arg);
  return { text: said.slice(0, room), read: `? ${arg}` };
}

export const PROTOCOL = (rounds: number, budget: number) => `You may read the notebook's repository before you answer: its files that git tracks, less those that look like secrets. To read, answer with request lines only, one per line, and no fence:
  list <glob>                 the tracked files that match, e.g. list src/**/*.ts
  grep <regex> [<glob>]       matching lines as path:line: text (a glob holds * or /)
  show <path>:<from>-<to>     those lines of a file
  ? <sentence>                what the notebook answers to that question now, e.g. ? F is exported
They are answered and you are asked again. A "?" line is also how to check, before you answer, that a sentence you mean to use reads: one that does not comes back with the nearest sentences that do. It cannot see rules you have not written yet, so ask with the model's own sentences what your rule's conditions find, e.g. whether "? C is a call site in F" gives the file names you expect. At most ${rounds} rounds and ${Math.round(budget / 1000)} KB of answers in all; then write the cell with what you have.`;

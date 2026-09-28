// What the translator lets a model read, for every model alike: the notebook's repository, its tracked files only, less those that look like
// secrets, nothing outside it and no link out of it. A model asks in lines (`list`, `grep`, `show`, `?`), this answers them, within a number
// of rounds and a number of bytes, and says each read. The model's own tools stay off (notebook/model.ts); this is the only way it reads.
import { spawnSync } from 'node:child_process';
import { closeSync, existsSync, openSync, readSync, realpathSync, statSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export const ROUNDS = Number(process.env.ROFL_NB_READ_ROUNDS ?? 6);
export const BUDGET = Number(process.env.ROFL_NB_READ_BUDGET ?? 200_000);
export const PER_ROUND = 20;
/** The most of one file read: a request for line 1 of a huge file does not read the whole of it. */
const FILE_BYTES = Number(process.env.ROFL_NB_READ_FILE_BYTES ?? 1_000_000);
/** Left out even when tracked: a file whose name looks like a secret. */
export const SECRET = new RegExp(String.raw`(^|/)(\.env[^/]*|[^/]*\.(pem|key|p12|pfx|kdbx|jks|asc|tfstate|tfstate\.backup)|id_[^/]*|[^/]*credential[^/]*|[^/]*secret[^/]*`
  + String.raw`|\.npmrc|\.netrc|\.pgpass|\.pypirc|\.vault-token|kubeconfig|auth\.json|service-account[^/]*\.json|\.[^/]*_history|\.kube/config|\.docker/config\.json)$|(^|/)\.gnupg/`, 'i');
const SHOWN = { list: 200, grep: 100, show: 400 };
/** How long one grep may run: its pattern is the model's, steered by the text it has just read. */
const GREP_MS = Number(process.env.ROFL_NB_GREP_MS ?? 5000);

/** `refused`: why nothing of it is read. */
/** The one way this starts a process: git, in `cwd`, without GIT_* in its environment (GIT_DIR, GIT_WORK_TREE or GIT_INDEX_FILE set around
 *  translate would point it at another repository), stopped at `timeout` ms. */
function runGit(cwd: string, args: string[], timeout?: number, maxBuffer = 64 * 2 ** 20) {
  return spawnSync('git', args, { cwd, encoding: 'utf8', timeout, maxBuffer, env: Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_'))) });
}

export type Repo = { root: string; files: Set<string>; git: boolean; refused?: string };

/** The repository a notebook is in: git's top level and the files it tracks. None to read outside git, when the top level is the home
 *  directory (a dotfiles repository), or when git does not track the notebook itself. */
export function gitFiles(notebook: string): Repo {
  if (!existsSync(notebook)) return { root: path.dirname(notebook), files: new Set(), git: false, refused: 'the notebook is not a file on disk' };
  const dir = path.dirname(realpathSync(notebook)), top = runGit(dir, ['rev-parse', '--show-toplevel']);
  if (top.status !== 0) return { root: dir, files: new Set(), git: false, refused: 'the notebook is not in a git repository' };
  const root = realpathSync(top.stdout.trim()), ls = runGit(root, ['ls-files', '-z']);
  const files = new Set((ls.stdout ?? '').split('\0').filter((f) => f && !SECRET.test(f)));
  if (root === realpathSync(os.homedir())) return { root, files: new Set(), git: true, refused: 'the repository is the home directory' };
  if (!files.has(path.relative(root, realpathSync(notebook)))) return { root, files: new Set(), git: true, refused: 'git does not track this notebook: `git add` it to let the model read its repository' };
  return { root, files, git: true };
}

/** git grep over the tracked files: its regex engine does not backtrack, and it is stopped at GREP_MS; lines as `path:line: text`, or why none. */
function gitGrep(repo: Repo, pattern: string, glob?: string): { lines: string[] } | { refused: string } {
  const g = runGit(repo.root, ['grep', '-n', '-I', '-E', '-e', pattern, '--', ...(glob ? [`:(glob)${glob}`] : [])], GREP_MS, 16 * 2 ** 20);
  if ((g.error as NodeJS.ErrnoException | undefined)?.code === 'ENOBUFS') return { refused: 'more than 16 MB of matching lines: narrow the pattern or the glob' };
  if (g.error || g.signal) return { refused: `timed out after ${GREP_MS / 1000} s` };
  if (g.status !== 0 && g.status !== 1) return { refused: g.stderr.trim().split('\n').pop() ?? `git grep exited with ${g.status}` };
  return { lines: g.stdout.split('\n').flatMap((l) => { const m = /^(.*?):(\d+):(.*)$/.exec(l); return m ? [`${m[1]}:${m[2]}: ${m[3].trim().slice(0, 200)}`] : []; }) };
}

/** A path the model named, as the tracked file it is, or why it may not be read. */
function resolve(repo: Repo, asked: string): { file: string } | { refused: string } {
  if (repo.refused) return { refused: `${asked}: ${repo.refused}` };
  let real: string;
  try { real = realpathSync(path.resolve(repo.root, asked)); } catch { return { refused: `${asked}: no such file` }; }
  const rel = path.relative(repo.root, real);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return { refused: `${asked}: outside the repository` };
  if (SECRET.test(rel)) return { refused: `${asked}: looks like a secret, not read` };
  if (!repo.files.has(rel)) return { refused: `${asked}: not a file git tracks here` };
  if (!statSync(real).isFile()) return { refused: `${asked}: not a regular file` };
  return { file: rel };
}

/** The one way to read a file of the repository: the path resolved and checked, then read; its lines, or why not. */
export function readTracked(repo: Repo, asked: string): { file: string; lines: string[] } | { refused: string } {
  const r = resolve(repo, asked);
  if ('refused' in r) return r;
  const at = path.join(repo.root, r.file), size = statSync(at).size, buf = Buffer.alloc(Math.min(size, FILE_BYTES)), fd = openSync(at, 'r');
  try { readSync(fd, buf, 0, buf.length, 0); } finally { closeSync(fd); }
  const lines = buf.toString('utf8').split('\n');
  return { file: r.file, lines: size > FILE_BYTES ? [...lines.slice(0, -1), `(the file is ${size} bytes; only its first ${FILE_BYTES} are read)`] : lines };
}
/** Whether a path may be read, without reading it: for a line git grep found. */
export const readable = (repo: Repo, asked: string) => !('refused' in resolve(repo, asked));

/** The lines of an answer when every one is a request; none when the answer is a cell or holds any words to the person. */
export const requestsOf = (answer: string) => {
  const lines = answer.split('\n').map((l) => l.trim()).filter(Boolean);
  return lines.every((l) => /^(list|grep|show) \S|^\? \S/.test(l)) ? lines : [];
};

/** One request answered, at most `room` bytes of it, and the line that says what was read. `ask` puts a question to the notebook's kernel. */
export function answer(repo: Repo, req: string, room: number, ask: (question: string) => string): { text: string; read: string } {
  const [verb, ...rest] = req.split(/\s+/), arg = req.slice(verb.length).trim();
  const fit = (lines: string[], cap: number, more: string) => {
    const out: string[] = [];
    let used = 0;
    for (const l of lines.slice(0, cap)) { if (used + l.length + 1 > room) break; out.push(l); used += l.length + 1; }
    return [...out, ...(out.length < lines.length ? [`(${lines.length - out.length} more ${more}${out.length < Math.min(lines.length, cap) ? ': the read budget is spent' : ''})`] : [])].join('\n');
  };
  if (verb === 'list') {
    // git's glob, as grep's: a dotfile matches ** like any other; what is not readable (a secret name) stays out
    const found = repo.refused ? [] : runGit(repo.root, ['ls-files', '-z', '--', `:(glob)${arg}`], GREP_MS).stdout.split('\0').filter((f) => repo.files.has(f)).sort();
    return { text: found.length ? fit(found, SHOWN.list, 'files') : '(no tracked file matches)', read: `list ${arg} (${found.length})` };
  }
  if (verb === 'grep') {
    const globbed = rest.length > 1 && /[*/]/.test(rest.at(-1)!), glob = globbed ? rest.at(-1)! : '**', pattern = globbed ? rest.slice(0, -1).join(' ') : arg;
    const g = repo.refused ? { refused: repo.refused } : gitGrep(repo, pattern, globbed ? glob : undefined);
    if ('refused' in g) return { text: `refused: grep ${pattern}: ${g.refused}`, read: `grep ${pattern} refused` };
    const hits = g.lines.filter((l) => readable(repo, l.slice(0, l.search(/:\d+: /))));
    return { text: hits.length ? fit(hits, SHOWN.grep, 'lines') : '(no tracked line matches)', read: `grep ${pattern} in ${glob} (${hits.length})` };
  }
  if (verb === 'show') {
    const m = /^(.+?)(?::(\d+)(?:-(\d+))?)?$/.exec(arg)!, r = readTracked(repo, m[1]);
    if ('refused' in r) return { text: `refused: ${r.refused}`, read: `show ${m[1]} refused` };
    const lines = r.lines, from = Math.max(1, Number(m[2] ?? 1)), to = Math.min(lines.length, Number(m[3] ?? from + SHOWN.show - 1));
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

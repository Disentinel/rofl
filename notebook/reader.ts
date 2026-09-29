// What the translator lets a model read, for every model alike: the notebook's workspace, its files less those git ignores (or, without git,
// the build and dependency folders) and those that look like secrets, nothing outside it and no link out of it. A model asks in lines (`list`,
// `grep`, `show`, `?`), this answers them, within a number of rounds and a number of bytes, and says each read. The model's own tools stay off
// (notebook/model.ts); this is the only way it reads.
import { spawnSync } from 'node:child_process';
import { closeSync, existsSync, openSync, readdirSync, readFileSync, readSync, realpathSync, statSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export const ROUNDS = Number(process.env.ROFL_NB_READ_ROUNDS ?? 6);
export const BUDGET = Number(process.env.ROFL_NB_READ_BUDGET ?? 200_000);
export const PER_ROUND = 20;
/** The most of one file read: a request for line 1 of a huge file does not read the whole of it. */
const FILE_BYTES = Number(process.env.ROFL_NB_READ_FILE_BYTES ?? 1_000_000);
/** Left out wherever it is: a file whose name looks like a secret. */
export const SECRET = new RegExp(String.raw`(^|/)(\.env[^/]*|[^/]*\.(pem|key|p12|pfx|kdbx|jks|asc|tfstate|tfstate\.backup)|id_[^/]*|[^/]*credential[^/]*|[^/]*secret[^/]*`
  + String.raw`|\.npmrc|\.netrc|\.pgpass|\.pypirc|\.vault-token|kubeconfig|auth\.json|service-account[^/]*\.json|\.[^/]*_history|\.kube/config|\.docker/config\.json)$|(^|/)\.gnupg/`, 'i');
/** Left out without git, at any depth: what a build or a package manager wrote. */
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'out', 'target', '.venv', 'venv', '__pycache__', '.cache', 'coverage', '.next', '.vscode-test']);
const SHOWN = { list: 200, grep: 100, show: 400 };
/** How long one grep may run: its pattern is the model's, steered by the text it has just read. */
const GREP_MS = Number(process.env.ROFL_NB_GREP_MS ?? 5000);

/** git, in `cwd`, without GIT_* in its environment (GIT_DIR, GIT_WORK_TREE or GIT_INDEX_FILE set around translate would point it at another
 *  repository), stopped at `timeout` ms. */
function runGit(cwd: string, args: string[], timeout?: number, maxBuffer = 64 * 2 ** 20) {
  return spawnSync('git', args, { cwd, encoding: 'utf8', timeout, maxBuffer, env: Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_'))) });
}

/** Whether `glob` matches the path `p` as git reads a glob: `*` and `?` within a name, `**` across names. A row of the table at a time,
 *  so its time is the product of their lengths whatever the glob: it comes from the model, or from a .gitignore in the workspace. */
export function globbed(glob: string, p: string): boolean {
  let row = Array.from({ length: p.length + 1 }, (_, j) => j === 0);
  for (let i = 0; i < glob.length;) {
    const next: boolean[] = Array(p.length + 1).fill(false);
    if (glob.startsWith('**/', i)) { let on = false; for (let j = 0; j <= p.length; j++) { on ||= row[j]; if (row[j]) next[j] = true; if (on && p[j] === '/') next[j + 1] = true; } i += 3; }
    else if (glob[i] === '*') { const deep = glob[i + 1] === '*'; for (let j = 0; j <= p.length; j++) next[j] = row[j] || (j > 0 && next[j - 1] && (deep || p[j - 1] !== '/')); i += deep ? 2 : 1; }
    else { for (let j = 0; j < p.length; j++) next[j + 1] = row[j] && (glob[i] === '?' ? p[j] !== '/' : p[j] === glob[i]); i++; }
    row = next;
  }
  return row[p.length];
}
/** A path matches a glob when it or a folder it is in does, as git's pathspec: `list src` is every file under src. */
const under = (glob: string, p: string) => p.split('/').some((_, k, all) => globbed(glob, all.slice(0, k + 1).join('/')));

/** Every file under `root`, without git: less SKIP, and less what the .gitignore at `root` names (a `!` line, which would let one back in,
 *  is not read). A link is listed as a file, and read only if it resolves inside. */
function walk(root: string): string[] {
  let text = '';
  try { text = readFileSync(path.join(root, '.gitignore'), 'utf8'); } catch { /* none */ }
  const ignored = text.split('\n').map((l) => l.trim().replace(/\/+$/, '')).filter((l) => l && !/^[#!]/.test(l))
    .map((l) => l.includes('/') ? (_: string, r: string) => globbed(l.replace(/^\//, ''), r) : (name: string) => globbed(l, name));
  const files: string[] = [], dirs = [''];
  for (let d; (d = dirs.pop()) !== undefined;) {
    let entries;
    try { entries = readdirSync(path.join(root, d), { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const r = d ? `${d}/${e.name}` : e.name;
      if (SKIP.has(e.name) || ignored.some((m) => m(e.name, r))) continue;
      if (e.isDirectory()) dirs.push(r); else files.push(r);
    }
  }
  return files;
}

export type Repo = { root: string; files: Set<string>; git: boolean; refused?: string };

const within = (dir: string, p: string) => { const r = path.relative(dir, p); return r !== '' && r !== '..' && !r.startsWith(`..${path.sep}`) && !path.isAbsolute(r); };
/** What the model may read of a notebook's workspace `root` (by default the notebook's directory): its files, less what git ignores when the
 *  workspace is in a git repository, else less SKIP and its .gitignore; less secret-looking names. Nothing when the workspace does not hold
 *  the notebook, or is the home directory, one of its ancestors or the filesystem root. */
export function workspace(notebook: string, root?: string): Repo {
  const none = (dir: string, refused: string): Repo => ({ root: dir, files: new Set(), git: false, refused });
  if (!existsSync(notebook)) return none(path.dirname(notebook), 'the notebook is not a file on disk');
  const nb = realpathSync(notebook), home = existsSync(os.homedir()) ? realpathSync(os.homedir()) : path.resolve(os.homedir());
  let dir: string;
  try { dir = realpathSync(root ?? path.dirname(nb)); } catch { return none(root!, 'the workspace is not on disk'); }
  if (!within(dir, nb)) return none(dir, 'the workspace does not hold the notebook');
  if (dir === home) return none(dir, 'the workspace is the home directory: open the project\'s folder, or name it with --root');
  if (within(dir, home) || path.dirname(dir) === dir) return none(dir, 'the workspace holds the home directory: open the project\'s folder, or name it with --root');
  const git = runGit(dir, ['rev-parse', '--show-toplevel']).status === 0;
  const listed = git ? (runGit(dir, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']).stdout ?? '').split('\0') : walk(dir);
  return { root: dir, files: new Set(listed.filter((f) => f && !SECRET.test(f))), git };
}

/** Every line that matches, as `path:line: text`, or why none: git grep, whose regex engine does not backtrack, over the repository's files
 *  and those it does not ignore, or over the folder without one; with no git on the machine, a search in a process of its own. Stopped at GREP_MS. */
function grep(repo: Repo, pattern: string, glob?: string): { lines: string[] } | { refused: string } {
  const skip = repo.git ? [] : [...SKIP].map((d) => `:(exclude,glob)**/${d}/**`);
  let g = runGit(repo.root, ['grep', ...repo.git ? ['--untracked'] : ['--no-index', '--exclude-standard'], '-n', '-I', '-E', '-e', pattern, '--', ...(glob ? [`:(glob)${glob}`] : []), ...skip], GREP_MS, 16 * 2 ** 20);
  if ((g.error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') g = search(repo, pattern, glob);
  if ((g.error as NodeJS.ErrnoException | undefined)?.code === 'ENOBUFS') return { refused: 'more than 16 MB of matching lines: narrow the pattern or the glob' };
  if (g.error || g.signal) return { refused: `timed out after ${GREP_MS / 1000} s` };
  if (g.status !== 0 && g.status !== 1) return { refused: g.stderr.trim().split('\n').pop() ?? `grep exited with ${g.status}` };
  return { lines: g.stdout.split('\n').flatMap((l) => { const m = /^(.*?):(\d+):(.*)$/.exec(l); return m ? [`${m[1]}:${m[2]}: ${m[3].trim().slice(0, 200)}`] : []; }) };
}
/** Without git: JavaScript's regex, which can backtrack for ever, in a process of its own that is killed at GREP_MS, over the readable files only. */
function search(repo: Repo, pattern: string, glob?: string) {
  const files = [...repo.files].filter((f) => (!glob || under(glob, f)) && readable(repo, f));
  const code = `const fs = require('fs'), { root, files, pattern } = JSON.parse(fs.readFileSync(0, 'utf8')); let re;
try { re = new RegExp(pattern); } catch (e) { console.error(e.message); process.exit(2); }
for (const f of files) { const t = fs.readFileSync(root + '/' + f); if (!t.subarray(0, 8000).includes(0)) t.toString('utf8').split('\\n').forEach((l, i) => { if (re.test(l)) process.stdout.write(f + ':' + (i + 1) + ':' + l + '\\n'); }); }`;
  return spawnSync(process.execPath, ['-e', code], { input: JSON.stringify({ root: repo.root, files, pattern }), encoding: 'utf8', timeout: GREP_MS, maxBuffer: 16 * 2 ** 20, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
}

/** A path the model named, as the file of the workspace it is, or why it may not be read. */
function resolve(repo: Repo, asked: string): { file: string } | { refused: string } {
  if (repo.refused) return { refused: `${asked}: ${repo.refused}` };
  let real: string;
  try { real = realpathSync(path.resolve(repo.root, asked)); } catch { return { refused: `${asked}: no such file` }; }
  const rel = path.relative(repo.root, real);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return { refused: `${asked}: outside the workspace` };
  if (SECRET.test(rel)) return { refused: `${asked}: looks like a secret, not read` };
  if (!repo.files.has(rel)) return { refused: `${asked}: not among the files read here (ignored, or skipped)` };
  if (!statSync(real).isFile()) return { refused: `${asked}: not a regular file` };
  return { file: rel };
}

/** The one way to read a file of the workspace: the path resolved and checked, then read; its lines, or why not. */
export function readTracked(repo: Repo, asked: string): { file: string; lines: string[] } | { refused: string } {
  const r = resolve(repo, asked);
  if ('refused' in r) return r;
  const at = path.join(repo.root, r.file), size = statSync(at).size, buf = Buffer.alloc(Math.min(size, FILE_BYTES)), fd = openSync(at, 'r');
  try { readSync(fd, buf, 0, buf.length, 0); } finally { closeSync(fd); }
  const lines = buf.toString('utf8').split('\n');
  return { file: r.file, lines: size > FILE_BYTES ? [...lines.slice(0, -1), `(the file is ${size} bytes; only its first ${FILE_BYTES} are read)`] : lines };
}
/** Whether a path may be read, without reading it: for a line grep found. */
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
    // git's glob, as grep's: a dotfile matches ** like any other
    const found = repo.refused ? [] : [...repo.files].filter((f) => under(arg, f)).sort();
    return { text: found.length ? fit(found, SHOWN.list, 'files') : '(no file matches)', read: `list ${arg} (${found.length})` };
  }
  if (verb === 'grep') {
    const named = rest.length > 1 && /[*/]/.test(rest.at(-1)!), glob = named ? rest.at(-1)! : '**', pattern = named ? rest.slice(0, -1).join(' ') : arg;
    const g = repo.refused ? { refused: repo.refused } : grep(repo, pattern, named ? glob : undefined);
    if ('refused' in g) return { text: `refused: grep ${pattern}: ${g.refused}`, read: `grep ${pattern} refused` };
    const hits = g.lines.filter((l) => readable(repo, l.slice(0, l.search(/:\d+: /))));
    return { text: hits.length ? fit(hits, SHOWN.grep, 'lines') : '(no line matches)', read: `grep ${pattern} in ${glob} (${hits.length})` };
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

export const PROTOCOL = (rounds: number, budget: number) => `You may read the notebook's workspace before you answer: its files, less those git ignores and those that look like secrets. To read, answer with request lines only, one per line, and no fence:
  list <glob>                 the files that match, e.g. list src/**/*.ts
  grep <regex> [<glob>]       matching lines as path:line: text (a glob holds * or /)
  show <path>:<from>-<to>     those lines of a file
  ? <sentence>                what the notebook answers to that question now, e.g. ? F is exported
They are answered and you are asked again. A "?" line is also how to check, before you answer, that a sentence you mean to use reads: one that does not comes back with the nearest sentences that do. It cannot see rules you have not written yet, so ask with the model's own sentences what your rule's conditions find, e.g. whether "? C is a call site in F" gives the file names you expect. At most ${rounds} rounds and ${Math.round(budget / 1000)} KB of answers in all; then write the cell with what you have.`;

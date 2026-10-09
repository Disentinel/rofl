// The model translate asks: a command-line harness run for text alone, with no tools, no MCP servers and no project or user instructions,
// from a directory made for the one call and removed after it. A natural cell is text from whoever wrote the file.
// Which: `--model NAME[:MODEL]`, else ROFL_NB_MODEL_CMD, else a harness whose ROFL_NB_<NAME> points at its binary,
// else the first installed in the order below. A harness that keeps a tool is refused unless ROFL_NB_ALLOW_TOOLS=1.
import { spawn } from 'node:child_process';
import { accessSync, constants, existsSync, mkdirSync, mkdtempSync, realpathSync, rmdirSync, rmSync, symlinkSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export type Ask = ((prompt: string, signal?: AbortSignal) => Promise<{ ok: true; text: string } | { ok: false; error: string }>) & { who?: string };

type Harness = {
  bin: string;
  /** the arguments; `prompt` is there only for a harness that takes it in argv, and then stdin is empty */
  argv: (model: string | undefined, prompt: string) => string[];
  env?: (dir: string) => Record<string, string>;
  /** what the directory needs before the call, and what the harness left elsewhere after it */
  prepare?: (dir: string) => void;
  after?: (dir: string) => void;
  /** the tools the flags cannot take away; none, and the harness runs for text alone */
  keeps?: string;
  verified: boolean;
};

/** Sources: the harness's --help and docs, cited in the ledger (f_model_harness); `verified`: a recorder in place of the provider saw no tool offered, and one without the flags saw them. */
export const HARNESSES: Record<string, Harness> = {
  claude: { bin: 'claude', argv: (m) => ['-p', `--model=${m ?? 'sonnet'}`, '--tools', '', '--strict-mcp-config', '--setting-sources', '', '--no-session-persistence'], verified: true,
    // with no session saved it still makes an empty project folder, and a memory folder in it, named after the directory: removed if still empty
    after: (dir) => {
      const project = path.join(process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), '.claude'), 'projects', realpathSync(dir).replace(/[^a-zA-Z0-9]/g, '-'));
      for (const d of [path.join(project, 'memory'), project]) try { rmdirSync(d); } catch { /* not there, or not empty: left */ }
    } },
  codex: {
    bin: 'codex', verified: true,
    argv: (m) => ['exec', '--ephemeral', '--skip-git-repo-check', '--ignore-user-config', '--ignore-rules', '-s', 'read-only', '--color', 'never',
      ...['shell_tool', 'unified_exec', 'multi_agent', 'apps', 'plugins', 'browser_use', 'computer_use', 'image_generation', 'goals'].flatMap((f) => ['--disable', f]),
      '-c', 'web_search="disabled"', '-c', 'project_doc_max_bytes=0', ...(m ? [`--model=${m}`] : []), '-'],
    keeps: 'view_image, which reads an image file anywhere on disk, and on some models apply_patch, whose writes its read-only sandbox refuses',
  },
  opencode: {
    bin: 'opencode', verified: true, argv: (m) => ['run', '--pure', ...(m ? [`--model=${m}`] : [])],
    // its data directory too, where it keeps a snapshot of the working tree and every prompt; only the login is linked in
    env: (dir) => ({ OPENCODE_CONFIG_CONTENT: '{"permission":{"*":"deny"}}', OPENCODE_DISABLE_PROJECT_CONFIG: '1', OPENCODE_DISABLE_CLAUDE_CODE: '1', XDG_CONFIG_HOME: dir, XDG_DATA_HOME: path.join(dir, 'data') }),
    prepare: (dir) => {
      const auth = path.join(process.env.XDG_DATA_HOME ?? path.join(os.homedir(), '.local/share'), 'opencode/auth.json');
      mkdirSync(path.join(dir, 'data/opencode'), { recursive: true });
      if (existsSync(auth)) symlinkSync(auth, path.join(dir, 'data/opencode/auth.json'));
    },
  },
  // piped stdin comes before its first prompt (docs/cli.md), so the request stays out of argv
  pi: { bin: 'pi', verified: false, argv: (m) => ['-p', '--no-tools', '--no-extensions', '--no-skills', '--no-context-files', '--no-session', ...(m ? ['--model', m] : []), 'Answer the request above.'] },
  copilot: {
    // it ignores stdin under -p, so the request is in argv: seen by ps, and cut at the system's argument limit
    bin: 'copilot', verified: false, keeps: 'whatever is not in its --excluded-tools list: it has no switch that leaves none',
    argv: (m, p) => ['-p', p, '-s', '--no-custom-instructions', '--disable-builtin-mcps', '--no-ask-user', '--stream=off', ...(m ? ['--model', m] : []),
      '--excluded-tools=bash,powershell,list_bash,read_bash,stop_bash,write_bash,apply_patch,create,edit,view,list_agents,read_agent,task,write_agent,ask_user,glob,grep,rg,skill,web_fetch', '--deny-tool=shell,write,read,url,memory'],
  },
  hermes: {
    bin: 'hermes', verified: false, keeps: 'its `safe` toolset, which searches the web: it has no toolset that is empty',
    argv: (m) => ['chat', '--safe-mode', '--ignore-user-config', '--ignore-rules', '-Q', '--toolsets', 'safe', '--max-turns', '1', ...(m ? ['--model', m] : []), '--query-file', '-'],
  },
};
const ARG_BYTES = 100_000;
const ORDER = ['claude', 'codex', 'opencode', 'pi', 'copilot', 'hermes'];
const envOf = (name: string) => `ROFL_NB_${name.toUpperCase()}`;

/** Where each harness's binary is: ROFL_NB_<NAME> if set, else the first on the PATH; undefined when it is not there. */
export function located(name: string, env = process.env): string | undefined {
  const set = env[envOf(name)], bin = set ?? HARNESSES[name].bin;
  const runnable = (f: string) => { try { accessSync(f, constants.X_OK); return true; } catch { return false; } };
  return bin.includes('/') ? (runnable(bin) ? bin : undefined) : (env.PATH ?? '').split(path.delimiter).map((d) => path.join(d, bin)).find(runnable);
}

export type Choice = { name: string; model?: string; path?: string; command?: string; refused?: string; error?: string; limit?: number };
/** The harness a translation asks, and why not when it cannot. */
export function choose(asked?: string, env = process.env): Choice {
  const allow = env.ROFL_NB_ALLOW_TOOLS === '1', limit = Number(env.ROFL_NB_MODEL_TIMEOUT ?? 180) * 1000;
  const refusal = (name: string) => !allow && HARNESSES[name].keeps ? `${name} cannot be run without tools: it keeps ${HARNESSES[name].keeps}. ROFL_NB_ALLOW_TOOLS=1 runs it anyway` : undefined;
  if (asked) {
    const [name, model] = asked.split(/:(.*)/s);
    if (model && !/^[\w.:/@+][\w.:/@+-]*$/.test(model)) return { name, error: `${JSON.stringify(model)} is not a model name: one word of letters, digits and . : / @ + -, not starting with -` };
    if (name === 'command') return env.ROFL_NB_MODEL_CMD ? { name, command: env.ROFL_NB_MODEL_CMD, limit } : { name, error: 'the harness `command` runs ROFL_NB_MODEL_CMD, which is not set' };
    if (!Object.hasOwn(HARNESSES, name)) return { name, error: `${name} is not a harness; one of: ${ORDER.join(', ')}, command (see npm run nb -- models)` };
    const at = located(name, env);
    return { name, model: model || undefined, path: at, limit, refused: refusal(name), ...(!at && { error: `${env[envOf(name)] ?? name} is not installed or not on the PATH` }) };
  }
  if (env.ROFL_NB_MODEL_CMD) return { name: 'command', command: env.ROFL_NB_MODEL_CMD, limit };
  const named = ORDER.find((n) => env[envOf(n)] !== undefined);
  if (named) return choose(named, env);
  const found = ORDER.filter((n) => located(n, env));
  const usable = found.find((n) => !refusal(n));
  if (usable) return choose(usable, env);
  if (found.length) return choose(found[0], env);
  return { name: 'none', error: `no model to ask: none of ${ORDER.join(', ')} is on the PATH, and ROFL_NB_MODEL_CMD is not set (see npm run nb -- models)` };
}

/** The harness chosen, as the translator calls a model. */
export function llm(c: Choice = choose()): Ask {
  const who = c.name === 'claude' ? 'Claude' : c.name;
  return Object.assign((prompt: string, signal?: AbortSignal) => runHarness(c, who, prompt, signal), { who });
}

/** One call: the harness started in a directory made for it, the prompt on stdin or in argv, its stdout the answer; `signal` stops it. */
function runHarness(c: Choice, who: string, prompt: string, signal?: AbortSignal): ReturnType<Ask> {
  if (c.error || c.refused) return Promise.resolve({ ok: false, error: (c.error ?? c.refused)! });
  const limit = c.limit ?? 180_000;
  const dir = mkdtempSync(path.join(os.tmpdir(), 'rofl-nb-model-')), h = HARNESSES[c.name];
  const [cmd, args] = c.command ? ['/bin/sh', ['-c', c.command]] : [c.path!, h.argv(c.model, prompt)];
  // copilot ignores stdin under -p, so its request is one argument, which Linux caps at 128 KB (E2BIG)
  if (args.includes(prompt) && Buffer.byteLength(prompt) > ARG_BYTES) { rmSync(dir, { recursive: true, force: true }); return Promise.resolve({ ok: false, error: `${who} takes the request as one argument, at most ${ARG_BYTES / 1000} KB, and this one is ${Math.round(Buffer.byteLength(prompt) / 1000)} KB: choose a model that reads it on stdin` }); }
  h?.prepare?.(dir);
  // PWD too: a harness that asks the shell's variable rather than its own cwd would take the notebook's directory for its project
  const p = spawn(cmd, args, { timeout: limit, signal, cwd: dir, env: { ...process.env, PWD: dir, ...h?.env?.(dir) } });
  let out = '', err = '', error: NodeJS.ErrnoException | undefined;
  p.stdout.on('data', (d) => { out += d; });
  p.stderr.on('data', (d) => { err += d; });
  p.stdin.on('error', () => {});
  p.stdin.end(c.command || !args.includes(prompt) ? prompt : '');
  const said = () => err.replace(/\x1b\[[0-9;]*m/g, '').trim().split('\n').filter(Boolean).pop()?.slice(0, 300) ?? '';
  return new Promise((done) => {
    p.on('error', (e) => { error = e; });
    p.on('close', (status) => {
      h?.after?.(dir);
      rmSync(dir, { recursive: true, force: true });
      if (error?.code === 'ENOENT') return done({ ok: false, error: `${cmd} is not installed or not on the PATH` });
      if (signal?.aborted) return done({ ok: false, error: 'stopped' });
      if (p.killed) return done({ ok: false, error: `${who} gave no answer in ${limit / 1000} s to a prompt of ${prompt.length} characters and was stopped; it printed ${out.length} characters${err ? `, and on stderr: ${said()}` : ''}. ROFL_NB_MODEL_TIMEOUT sets the limit in seconds` });
      if (error) return done({ ok: false, error: error.message });
      if (status !== 0) return done({ ok: false, error: `${who} exited with ${status}: ${said() || out.trim().slice(0, 300)}` });
      if (!out.trim()) return done({ ok: false, error: `${who} printed nothing${err ? `; on stderr: ${said()}` : ''}` });
      done({ ok: true, text: out });
    });
  });
}

/** Where a harness stands: not installed, run with no tools, or refused for the tools it keeps. */
export const standing = (name: string, env = process.env) => !located(name, env) ? 'not installed'
  : `${HARNESSES[name].keeps ? `keeps ${HARNESSES[name].keeps}; refused unless ROFL_NB_ALLOW_TOOLS=1` : 'no tools'}${HARNESSES[name].verified ? '' : ' (from its docs, not verified here)'}`;

/** What `npm run nb -- models` prints: each harness, where it is, how it is run, and which one translate asks. */
export function models(env = process.env): string[] {
  const c = choose(undefined, env);
  const rows = ORDER.map((n) => {
    const at = located(n, env), argv = [at, ...HARNESSES[n].argv(undefined, '<prompt>')].map((a) => /^[\w/.=,:<>-]+$/.test(a!) ? a : JSON.stringify(a));
    return `${n === c.name ? '*' : ' '} ${n.padEnd(9)}${standing(n, env)}${at ? `\n            ${argv.join(' ')}${HARNESSES[n].env ? ` (and ${Object.keys(HARNESSES[n].env!('<dir>')).join(', ')})` : ''}` : ''}`;
  });
  const cmd = `${c.name === 'command' ? '*' : ' '} command  ${env.ROFL_NB_MODEL_CMD ? `sh -c ${JSON.stringify(env.ROFL_NB_MODEL_CMD)}, the prompt on stdin; its isolation is its own` : 'ROFL_NB_MODEL_CMD is not set'}`;
  return [...rows, cmd, '', c.error || c.refused ? `translate asks none: ${c.error ?? c.refused}` : `translate asks ${c.name}${c.model ? ` (${c.model})` : ''}; choose with --model NAME[:MODEL].`];
}

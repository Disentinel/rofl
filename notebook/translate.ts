// A natural cell translated: the prompt, the model's reading, and its cell tried against the kernel before it is kept. No I/O: the command line
// (notebook/cli.ts) reads the workspace for the model, a page answers only its `?` lines.
import { cellsOf, translated, type NbCell } from './front.ts';
import type { NbResult } from './kernel.ts';
import type { Ask } from './model.ts';

const FORM = `A cell is written in ROFL's Markdown sentence form:
- A rule is one sentence ending in a period: "<head> if <condition>, <condition> and <condition>." A condition that must not hold follows "unless", after a comma: "<head> if <condition>, unless <condition>."
- A long rule: "<head> if all of:" and then a list, one condition per item "  - <condition>;", the last ending in ".".
- Alternatives: "<head> either:" and then a numbered list, each item "1. if <condition>, <condition>;".
- Variables are capitalised words: C, F. "a call C" introduces C and says what it is; "something" or "some team" is anything, unnamed. An atom is in backticks, \`true\`; a string is in double quotes. Only variables are capitalised.
- A condition is a sentence from the lists below with your own terms in its holes, or a sentence a rule in the cell defines. Built in: "L > 6", "X is Y", "X differs from Y", "N is A + B".
- A rule whose head no sentence reads yet defines a new relation, and its words become its sentence. Keep a new head short and in words no listed sentence starts with.
- Asking lines, each on its own line, no final period: "? <sentence>" lists every answer; "never <sentence>" is an invariant that holds when nothing answers; "unsure <sentence>" right under a never lists what the invariant could not see; "why <sentence>" explains one answer; "whynot <sentence>" says why a sentence does not hold.
- A new head names what it is about with a noun and a variable: "A call C is a stray write if ...", "A file F is a handler file if ...". Never start a head with a variable and "is" ("Key is a disk write"): that reads as the built-in "X is Y". Every rule's conditions include at least one sentence of the model.
- An asking line holds one sentence. To ask about several conditions together, write a rule and ask its head.
- A call into a Node module's function, like fs's writeFileSync, however it was imported: "C is a host site of \`node\` from "node:fs" at "writeFileSync"".
- A picture is a line "draw <kind>": graph, architecture, state, process, causal, proof, time, timeline, timing, table, heatmap, chart, space. It draws only what rules conclude in the view's own sentences, which the notebook declares when it reads a view (for a graph: "A mark M is a node", "A mark M links to a mark N", "A mark M is inside a mark G", "A mark M is tagged a tag K", "A mark M is at the level I"). So a request to draw or diagram something is answered with rules that map its things onto those sentences, "A mark X is a node if X is a service." and "A mark X links to a mark Y if X calls Y.", and then the draw line.
Prefer "never" for something that must always hold and "?" for a question. Say what must hold of any data, not of the rows there happen to be.`;

/** The lines of an answer when every one is a request; none when the answer is a cell or holds any words to the person. */
export const requestsOf = (answer: string) => {
  const lines = answer.split('\n').map((l) => l.trim()).filter(Boolean);
  return lines.every((l) => /^(list|grep|show) \S|^\? \S/.test(l)) ? lines : [];
};

/** How a host with no workspace lets the model read: only the notebook, by asking it. */
export const QUESTIONS = (rounds: number) => `Before you answer you may ask the notebook questions. To ask, answer with request lines only, one per line, and no fence:
  ? <sentence>                what the notebook answers to that question now, e.g. ? A calls B
They are answered and you are asked again. A "?" line is also how to check that a sentence you mean to use reads: one that does not comes back with the nearest sentences that do. At most ${rounds} rounds; then write the cell with what you have.`;

/** What a request is answered with where there are no files: a `?` line by the notebook, anything else refused. */
export const questionsOnly = (req: string, room: number, ask: (question: string) => string) => req.startsWith('? ')
  ? { text: ask(req.slice(2).trim()).slice(0, room), read: req } : { text: 'refused: there are no files here, only "?" lines are answered', read: `${req.split(/\s/)[0]} refused` };

function prompt(request: string, vocab: string[], own: string[], functions: string[], notebook: string, code: string[], slice: string, protocol: string): string {
  return `You turn one plain-language request into one notebook cell.

${FORM}
${functions.length ? `Functions, written "R is <phrase>":\n${functions.join('\n')}\n` : ''}
The sentences of the model, a noun before each variable saying what it stands for:
${vocab.join('\n') || '(none)'}

The sentences this notebook and the worlds it reads declare:
${own.join('\n') || '(none)'}

${code.length ? `The code files, by the names the book gives them (a file in a sentence is one of these strings, not the path in the front matter): ${code.map((c) => JSON.stringify(c)).join(', ')}\n\n` : ''}The notebook as it stands:
${notebook}

${slice}The request: ${request}

${protocol}

Answer with the cell alone inside one \`\`\`rofl fence, nothing else. When you cannot write it without guessing what the person means, answer instead with your questions to them, briefly, in the language of the request, and no fence.`;
}

/** A phrase fact as the sentence a cell writes, a noun before each hole. */
export const sentenceOf = (p: string) => /^phrase\(\w+, "(.*)"\)\.$/.exec(p)?.[1].replace(/<\d+:([\w ]+)>/g, (_, n) => `a ${n} ${n[0].toUpperCase()}`) ?? p;

const fenced = (text: string) => /```(?:rofl)?\s*\n([\s\S]*?)\n```/.exec(text)?.[1].trim();

export type Translation = {
  /** the notebook's name in what is said */
  file: string; text: string; c: NbCell; ask: Ask;
  /** the notebook run as it would stand with this text */
  run(text: string): NbResult;
  vocab: string[]; functions: string[]; own: string[]; code: string[];
  /** what the first prompt reads without asking, and the reads it made */
  first?: { text: string; read: string[] };
  protocol: string; rounds: number; budget: number; perRound: number;
  /** one request answered, at most `room` bytes of it; `question` puts a `?` line to the notebook */
  answer(req: string, room: number, question: (q: string) => string): { text: string; read: string };
  said?: string[]; follow?: string; step?(s: string): void;
};

/** One natural cell: its rofl cell tried against the kernel, asked again once with what went wrong, and put under it. `failed`: the model gave no answer. */
export async function translateOne(o: Translation): Promise<{ code: number; said: string[]; text: string; failed?: boolean; reply?: string }> {
  const { file, text, c, ask, rounds, perRound, step = () => {} } = o;
  const said = [...o.said ?? []], lines = text.split('\n'), close = c.line - 1 + c.text.split('\n').length;   // the natural cell's closing fence
  const cells = cellsOf(text), under = translated(cells, c) ? cells[c.index + 1] : undefined;
  const shut = under ? lines.findIndex((l, i) => i >= under.line - 1 && /^```\s*$/.test(l)) : -1;
  const from = under ? under.line - 2 : close + 1, to = !under ? close + 1 : shut < 0 ? lines.length : shut + 1;
  const tryCell = (cell: string) => {
    const next = [...lines.slice(0, from), ...(under ? [] : ['']), '```rofl', cell, '```', ...lines.slice(to)].join('\n');
    const r = o.run(next);
    const out = r.cells.find((x) => x.index === c.index + 1)!;
    const silent = out.lines.length ? [] : ['the cell asks nothing: a request for something that must hold ends in a never line, a question in a ? line'];
    // a never that holds over nothing checks nothing: the model is asked again with the condition that finds no row
    const vacuous = out.lines.filter((l) => l.note?.startsWith('holds over nothing')).map((l) => `${l.text}: ${l.note}`);
    // a picture of nothing shows nothing: no rule concludes a mark in the view's sentences
    const blank = out.lines.filter((l) => l.kind === 'draw' && l.verdict !== 'unasked' && !Object.keys(l.view?.marks ?? {}).length).map((l) => `${l.text}: draws nothing: no rule concludes a mark in the view's sentences`);
    return { next, errors: [...r.errors, ...out.errors, ...blank, ...silent, ...vacuous], lines: out.lines };
  };
  const words = (a: string) => ({ code: 2, said: [...said, ...readLine(), `${file}:${c.line}: ${ask.who ?? 'the model'} answered in words, not with a cell:`, ...a.trim().split('\n').map((l) => `  ${l}`)], text, reply: a.trim() });
  const who = ask.who ?? 'the model', first = o.first ?? { text: '', read: [] }, reads = [...first.read];
  const base = prompt(c.text.trim(), o.vocab, o.own, o.functions, text, o.code, first.text, o.protocol) + (o.follow ?? '');
  /** A question the model puts to the notebook, answered by the kernel over the notebook with one more cell. */
  const question = (q: string) => {
    const r = o.run(`${text}\n\n\`\`\`rofl\n? ${q}\n\`\`\`\n`), out = r.cells.at(-1), l = out?.lines[0];
    return l ? [`${l.verdict}${l.total ? ` · ${l.total}` : ''}`, ...l.answers.slice(0, 30).map((x) => `- ${x.sentence}`)].join('\n') : `not asked: ${[...r.errors, ...out?.errors ?? []].join('; ') || 'no line'}`;
  };
  let left = o.budget, convo = '';
  /** The model asked, and asked again with what it read, while it answers with requests: at most `rounds` rounds and `budget` bytes of answers. */
  const converse = async (p: string) => {
    let a = await ask(p + convo);
    for (let round = 1; a.ok && requestsOf(a.text).length && round <= rounds; round++) {
      // at most perRound requests are answered, and none once the budget is spent: an answer costs work before it costs bytes
      const reqs = requestsOf(a.text), got = reqs.map((r, i) => {
        if (i >= perRound) return `> ${r}\n(not answered: at most ${perRound} requests a round)`;
        if (left <= 0) return `> ${r}\nrefused: the read budget is spent`;
        const x = o.answer(r, left, question); left -= x.text.length; reads.push(x.read); return `> ${r}\n${x.text}`;
      });
      step(`${who} read: ${reads.slice(-3).join(' · ')}`);
      convo += `\n\nYou asked:\n${reqs.join('\n')}\nThe answers:\n${got.join('\n')}${round === rounds || left <= 0 ? '\nThat was the last of the reading: write the cell now.' : ''}`;
      a = await ask(p + convo);
    }
    return a;
  };
  const readLine = () => reads.length ? [`${file}:${c.line}: ${who} read: ${reads.join(' · ')}`] : [];
  step(`${who} is writing the cell`);
  let a = await converse(base);
  if (a.ok && requestsOf(a.text).length) return { code: 2, said: [...said, ...readLine(), `${file}:${c.line}: ${who} still asked to read after ${rounds} rounds, and wrote no cell`], text, failed: true };
  if (!a.ok) return { code: 2, said: [...said, `translation failed: ${a.error}`], text, failed: true };
  let cell = fenced(a.text);
  if (cell === undefined) return words(a.text);
  let t = tryCell(cell);
  if (t.errors.length) {
    // a cell that read and whose never holds over nothing is said as that, not as a cell that did not read
    const how = (e: string[]) => e.every((x) => x.includes(': holds over nothing')) ? 'read, and checks nothing' : 'did not read';
    said.push(`${file}:${c.line}: the first try ${how(t.errors)}:`, ...cell.split('\n').map((l) => `  | ${l}`), ...t.errors.map((e) => `  ${e}`));
    step(`the first try ${how(t.errors)} (${t.errors[0]}); asking again`);
    convo += `\n\nYou answered:\n\`\`\`rofl\n${cell}\n\`\`\`\nThe notebook could not read it:\n${t.errors.join('\n')}\nCheck with \`?\` lines the sentences you are unsure of, then write the cell again.`;
    a = await converse(base);
    if (!a.ok) return { code: 2, said: [...said, `translation failed: ${a.error}`], text, failed: true };
    cell = fenced(a.text);
    if (cell === undefined) return words(a.text);
    t = tryCell(cell);
  }
  said.push(...readLine());
  if (t.errors.length) return { code: 2, said: [...said, `${file}:${c.line}: ${t.errors.every((x) => x.includes(': holds over nothing')) ? 'no cell that checks something' : 'no cell read'} after two tries, nothing written:`, ...cell.split('\n').map((l) => `  | ${l}`), ...t.errors.map((e) => `  ${e}`)], text };
  return { code: 0, said: [...said, `${file}:${c.line}: translated`, ...cell.split('\n').map((l) => `  ${l}`), ...t.lines.map((l) => `  -> ${l.text}: ${l.verdict}${l.total ? ` (${l.total})` : ''}`)], text: t.next };
}

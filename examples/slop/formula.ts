// formula.ts — Excel formula text to a reified expression tree, and that
// tree to ROFL facts.
//
// This is SLOP's tokenizer, and it sits exactly where examples/huh's does:
// the kernel has no string builtins, so taking `IF(D5>0,D5-(D5-C10)*D6,D5)`
// apart is the host's job, and everything ABOVE the tree — evaluation,
// provenance, uncertainty, cycles — is rules. The boundary is visible in a
// why tree: it bottoms out at `num`, `input`, `label` or `empty`, never
// inside the characters of a formula.
//
// THE SUBSET, exhaustively. Arithmetic (+ - * / unary minus), comparison
// (= <> < <= > >=), SUM over a range, IF, VLOOKUP with an exact-match key,
// cell references, cross-sheet references, and absolute/relative $ forms.
// Anything else — ^ & % : outside a range argument, every other function —
// is parsed as `unsupported` and reported by name, so a cell SLOP cannot
// compute is a named refusal instead of a wrong number.
//
// NUMBERS ARE SCALED INTEGERS. `is` is integer-only and `/` truncates, so a
// value is carried as round(v * SCALE). See README.md, "Money in cents, and
// where that bites", for what the scale buys and what it costs.

import { type Cell, type Sheet, type Workbook, colToNum, numToCol, parseRef } from './xlsx.ts';

// ---------------------------------------------------------------------------
// the carrier

/** One carrier unit is 1e-8 of a sheet value, so a cent of a dollar model is
 *  1 000 000 units. Eight decimals is not caution: at six, representing a
 *  ratio like 0.14063146094259696 as an integer costs 5e-7, and a DCF
 *  multiplies that into a revenue of 21765 — an error of a cent. See the
 *  carrier note at the top of slop.rofl. */
export const SCALE = 100_000_000;

/** The largest magnitude the split multiply in slop.rofl stays exact for: a
 *  cell outside it is refused at load rather than computed wrongly, and the
 *  refusal is reported by name. */
export const SAFE_MAX = 10_000_000;

/** Decimal text to scaled integer, EXACTLY — no float ever holds the value.
 *  Excel writes cached numbers in full double notation ("4.9160000000000002E-2")
 *  and `Number()` on that then `* SCALE` rounds twice. This rounds once,
 *  half away from zero, on the decimal digits themselves. */
export function toScaled(text: string): number | null {
  const m = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(text.trim());
  if (!m || (m[2] === '' && (m[3] ?? '') === '')) return null;
  const sign = m[1] === '-' ? -1n : 1n;
  const int = m[2] === '' ? '0' : m[2];
  const frac = m[3] ?? '';
  const exp = m[4] ? Number(m[4]) : 0;
  // digits as one integer, with the decimal point at -(frac.length) + exp
  let digits = BigInt(int + (frac === '' ? '' : frac));
  let shift = exp - frac.length + 8;          // 8 = log10(SCALE)
  if (shift >= 0) {
    digits *= 10n ** BigInt(shift);
  } else {
    const d = 10n ** BigInt(-shift);
    const q = digits / d;
    const r = digits % d;
    digits = r * 2n >= d ? q + 1n : q;        // half away from zero (digits >= 0)
  }
  const v = Number(sign * digits);
  return Number.isSafeInteger(v) ? v : null;
}

/** Scaled integer back to a number, for comparison against an oracle. */
export const unscale = (v: number): number => v / SCALE;

// ---------------------------------------------------------------------------
// the expression tree

export type Node =
  | { k: 'num'; v: number }                                   // scaled literal
  | { k: 'str'; v: string }
  | { k: 'ref'; cell: string }                                // "Sheet!A1"
  | { k: 'bin'; op: '+' | '-' | '*' | '/'; l: Node; r: Node }
  | { k: 'neg'; a: Node }
  | { k: 'cmp'; op: string; l: Node; r: Node }                // eq ne lt le gt ge
  | { k: 'if'; c: Node; t: Node; e: Node }
  | { k: 'sum'; cells: string[] }
  | { k: 'vlookup'; key: Node; table: string; col: number; exact: boolean }
  | { k: 'unsupported'; what: string };

export class FormulaError extends Error {}

const CMP_NAME: Record<string, string> = {
  '=': 'eq', '<>': 'ne', '<': 'lt', '<=': 'le', '>': 'gt', '>=': 'ge',
};

interface Tok { t: string; v: string }

/** Excel formula text to tokens. Sheet-qualified references arrive as one
 *  `ref` token because a sheet name may contain anything, including the
 *  operators, once it is quoted. */
function lex(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  const refBody = String.raw`\$?[A-Za-z]{1,3}\$?\d{1,7}`;
  const re = new RegExp(
    String.raw`^(?:'((?:[^']|'')+)'|([A-Za-z_][A-Za-z0-9_. ]*))!(${refBody}(?::${refBody})?)`);
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
    if (c === '"') {
      let j = i + 1, s = '';
      while (j < src.length) {
        if (src[j] === '"') { if (src[j + 1] === '"') { s += '"'; j += 2; continue; } break; }
        s += src[j++];
      }
      out.push({ t: 'str', v: s });
      i = j + 1;
      continue;
    }
    const q = re.exec(src.slice(i));
    if (q) {
      const sheet = q[1] !== undefined ? q[1].replace(/''/g, "'") : q[2];
      out.push({ t: 'ref', v: `${sheet}!${q[3]}` });
      i += q[0].length;
      continue;
    }
    const r = /^\$?[A-Za-z]{1,3}\$?\d{1,7}(?::\$?[A-Za-z]{1,3}\$?\d{1,7})?/.exec(src.slice(i));
    if (r && !/[A-Za-z0-9_.]/.test(src[i + r[0].length] ?? '')) {
      out.push({ t: 'ref', v: r[0] });
      i += r[0].length;
      continue;
    }
    const n = /^\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|^\.\d+/.exec(src.slice(i));
    if (n) { out.push({ t: 'num', v: n[0] }); i += n[0].length; continue; }
    const id = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(src.slice(i));
    if (id) { out.push({ t: 'name', v: id[0] }); i += id[0].length; continue; }
    const two = src.slice(i, i + 2);
    if (two === '<=' || two === '>=' || two === '<>') { out.push({ t: two, v: two }); i += 2; continue; }
    if ('+-*/()<>=,:&^%'.includes(c)) { out.push({ t: c, v: c }); i++; continue; }
    throw new FormulaError(`unexpected character '${c}'`);
  }
  out.push({ t: 'eof', v: '' });
  return out;
}

/** Range text to the list of cells it covers, row-major. `home` supplies the
 *  sheet for an unqualified reference. */
export function expandRange(text: string, home: string): string[] {
  const [sheetPart, body] = splitSheet(text, home);
  const [a, b] = body.split(':');
  const p = parseRef(a.replace(/\$/g, ''));
  if (b === undefined) return [`${sheetPart}!${a.replace(/\$/g, '')}`];
  const q = parseRef(b.replace(/\$/g, ''));
  const out: string[] = [];
  for (let row = Math.min(p.row, q.row); row <= Math.max(p.row, q.row); row++) {
    for (let col = Math.min(p.col, q.col); col <= Math.max(p.col, q.col); col++) {
      out.push(`${sheetPart}!${numToCol(col)}${row}`);
    }
  }
  return out;
}

function splitSheet(text: string, home: string): [string, string] {
  const bang = text.lastIndexOf('!');
  if (bang < 0) return [home, text];
  return [text.slice(0, bang), text.slice(bang + 1)];
}

/** Canonical cell id: "Sheet!A1", with $ dropped — a pin is a property of the
 *  formula text, not of the cell it names. */
export function cellId(text: string, home: string): string {
  const [sheet, body] = splitSheet(text, home);
  return `${sheet}!${body.replace(/\$/g, '')}`;
}

class Parser {
  toks: Tok[];
  i = 0;
  home: string;
  constructor(toks: Tok[], home: string) { this.toks = toks; this.home = home; }
  peek(): Tok { return this.toks[this.i]; }
  next(): Tok { return this.toks[this.i++]; }
  eat(t: string): boolean { if (this.peek().t === t) { this.i++; return true; } return false; }
  expect(t: string): Tok {
    const tok = this.next();
    if (tok.t !== t) throw new FormulaError(`expected '${t}', got '${tok.v || tok.t}'`);
    return tok;
  }

  expr(): Node { return this.comparison(); }

  comparison(): Node {
    let l = this.concat();
    for (;;) {
      const t = this.peek().t;
      if (t === '=' || t === '<' || t === '>' || t === '<=' || t === '>=' || t === '<>') {
        this.next();
        l = { k: 'cmp', op: CMP_NAME[t], l, r: this.concat() };
      } else return l;
    }
  }

  /** `&` is string concatenation. Out of the subset, and it must still be
   *  consumed so the rest of the formula reports the real reason. */
  concat(): Node {
    let l = this.additive();
    while (this.peek().t === '&') {
      this.next();
      this.additive();
      l = { k: 'unsupported', what: 'string concatenation (&)' };
    }
    return l;
  }

  additive(): Node {
    let l = this.multiplicative();
    for (;;) {
      const t = this.peek().t;
      if (t === '+' || t === '-') { this.next(); l = { k: 'bin', op: t, l, r: this.multiplicative() }; }
      else return l;
    }
  }

  multiplicative(): Node {
    let l = this.power();
    for (;;) {
      const t = this.peek().t;
      if (t === '*' || t === '/') { this.next(); l = { k: 'bin', op: t, l, r: this.power() }; }
      else return l;
    }
  }

  power(): Node {
    let l = this.unary();
    while (this.peek().t === '^') {
      this.next();
      this.unary();
      l = { k: 'unsupported', what: 'exponentiation (^)' };
    }
    return l;
  }

  unary(): Node {
    if (this.eat('-')) return { k: 'neg', a: this.unary() };
    if (this.eat('+')) return this.unary();
    let a = this.primary();
    while (this.peek().t === '%') { this.next(); a = { k: 'unsupported', what: 'percent (%)' }; }
    return a;
  }

  primary(): Node {
    const tok = this.next();
    if (tok.t === 'num') {
      const v = toScaled(tok.v);
      if (v === null) throw new FormulaError(`number out of the carrier's range: ${tok.v}`);
      return { k: 'num', v };
    }
    if (tok.t === 'str') return { k: 'str', v: tok.v };
    if (tok.t === 'ref') {
      if (tok.v.includes(':')) return { k: 'unsupported', what: 'a range outside SUM or VLOOKUP' };
      return { k: 'ref', cell: cellId(tok.v, this.home) };
    }
    if (tok.t === '(') { const e = this.expr(); this.expect(')'); return e; }
    if (tok.t === 'name') {
      const name = tok.v.toUpperCase();
      if (name === 'TRUE') return { k: 'num', v: SCALE };
      if (name === 'FALSE') return { k: 'num', v: 0 };
      if (this.peek().t !== '(') return { k: 'unsupported', what: `defined name ${tok.v}` };
      this.next();
      const args = this.args();
      if (name === 'SUM') return this.sumNode(args);
      if (name === 'IF') return this.ifNode(args);
      if (name === 'VLOOKUP') return this.vlookupNode(args);
      return { k: 'unsupported', what: `${name}()` };
    }
    throw new FormulaError(`expected a value, got '${tok.v || tok.t}'`);
  }

  /** Argument list. A bare range argument is kept as its text, because SUM
   *  and VLOOKUP want the range and nothing else in the subset does. */
  args(): (Node | { range: string })[] {
    const out: (Node | { range: string })[] = [];
    if (this.eat(')')) return out;
    for (;;) {
      if (this.peek().t === ',' || this.peek().t === ')') {
        // an omitted argument, as in `IF(H16>0,H16/$H$18,)`. Excel reads one
        // as zero, and this model has thirteen of them.
        out.push({ k: 'num', v: 0 });
      } else if (this.peek().t === 'ref' && this.peek().v.includes(':')
          && (this.toks[this.i + 1].t === ',' || this.toks[this.i + 1].t === ')')) {
        out.push({ range: this.next().v });
      } else {
        out.push(this.expr());
      }
      if (this.eat(',')) continue;
      this.expect(')');
      return out;
    }
  }

  sumNode(args: (Node | { range: string })[]): Node {
    const cells: string[] = [];
    for (const a of args) {
      if ('range' in a) cells.push(...expandRange(a.range, this.home));
      else if (a.k === 'ref') cells.push(a.cell);
      else return { k: 'unsupported', what: 'SUM over something other than ranges and cells' };
    }
    return { k: 'sum', cells };
  }

  ifNode(args: (Node | { range: string })[]): Node {
    if (args.length !== 3 || args.some((a) => 'range' in a)) {
      return { k: 'unsupported', what: `IF with ${args.length} arguments` };
    }
    const [c, t, e] = args as Node[];
    return { k: 'if', c, t, e };
  }

  vlookupNode(args: (Node | { range: string })[]): Node {
    if (args.length < 3 || args.length > 4) {
      return { k: 'unsupported', what: `VLOOKUP with ${args.length} arguments` };
    }
    const key = args[0];
    const table = args[1];
    const col = args[2];
    if ('range' in key || !('range' in table) || 'range' in col || col.k !== 'num') {
      return { k: 'unsupported', what: 'VLOOKUP with a non-literal column or a non-range table' };
    }
    let exact = false;
    if (args.length === 4) {
      const f = args[3];
      exact = !('range' in f) && f.k === 'num' && f.v === 0;
    }
    const [sheet, body] = splitSheet(table.range, this.home);
    return { k: 'vlookup', key, table: `${sheet}!${body.replace(/\$/g, '')}`, col: col.v / SCALE, exact };
  }
}

/** Parse one formula (without the leading '='), resolving unqualified
 *  references against `home`, the sheet the formula lives on. */
export function parseFormula(text: string, home: string): Node {
  const p = new Parser(lex(text), home);
  const e = p.expr();
  if (p.peek().t !== 'eof') throw new FormulaError(`trailing input at '${p.peek().v}'`);
  return e;
}

// ---------------------------------------------------------------------------
// the tree to facts

export interface Emitted {
  /** the ROFL program text: one fact per line */
  facts: string;
  /** cells given a value by the host: manual entries and text */
  inputs: string[];
  /** cells the loader refused, with the reason */
  refused: Map<string, string>;
  /** formula cells successfully compiled */
  compiled: string[];
  /** every cell mentioned anywhere, including the empty ones */
  seen: Set<string>;
  factCount: number;
}

const q = (s: string): string => JSON.stringify(s);

/** Which cells a node reads, so the loader can close over precedents. */
function precedents(n: Node, out: Set<string>): void {
  switch (n.k) {
    case 'ref': out.add(n.cell); break;
    case 'bin': precedents(n.l, out); precedents(n.r, out); break;
    case 'cmp': precedents(n.l, out); precedents(n.r, out); break;
    case 'neg': precedents(n.a, out); break;
    case 'if': precedents(n.c, out); precedents(n.t, out); precedents(n.e, out); break;
    case 'sum': for (const c of n.cells) out.add(c); break;
    case 'vlookup': precedents(n.key, out); break;
    default: break;
  }
}

/** A VLOOKUP table, as the loader must publish it: the key column and the
 *  columns some call actually asks for. Emitting the whole rectangle would
 *  be tens of thousands of facts nothing reads. */
interface Table { range: string; cols: Set<number> }

export interface LoadOptions {
  /** Sheets to take formulas from. Others are read only as precedents. */
  sheets?: string[];
  /** Cells to compute, with their precedent closure. Default: every formula
   *  cell on the named sheets. */
  targets?: string[];
}

/** Compile a workbook into ROFL facts.
 *
 *  The loader emits the PRECEDENT CLOSURE of its targets and nothing else: a
 *  workbook holds thousands of label cells no formula reads, and loading
 *  them would be loading the parts of the file the question does not touch.
 *  What it emits for a cell is decided by the file alone —
 *
 *    a formula        -> `formula(Cell, Node)` plus the node's tree
 *    a typed number   -> `input(Cell, V)`      -- A MANUAL ENTRY
 *    typed text       -> `label(Cell, S)`
 *    nothing at all   -> `empty(Cell)`         -- Excel reads a blank as 0
 *
 *  — which is what makes `manual_entry` in slop.rofl a fact about the file
 *  rather than a guess. */
export function compile(wb: Workbook, opts: LoadOptions = {}): Emitted {
  const sheetNames = opts.sheets ?? wb.sheets.map((s) => s.name);
  const lines: string[] = [];
  const refused = new Map<string, string>();
  const compiled: string[] = [];
  const inputs: string[] = [];
  const seen = new Set<string>();
  const tables = new Map<string, Table>();
  let nodeId = 0;

  const cellAt = (id: string): { sheet: Sheet; cell?: Cell } | null => {
    const bang = id.lastIndexOf('!');
    const sheet = wb.byName.get(id.slice(0, bang));
    if (!sheet) return null;
    return { sheet, cell: sheet.cells.get(id.slice(bang + 1)) };
  };

  /** Emit a node's facts, returning its id. */
  const emit = (n: Node): number => {
    const id = ++nodeId;
    switch (n.k) {
      case 'num': lines.push(`num(${id}, ${n.v}).`); break;
      case 'str': lines.push(`lit_text(${id}, ${q(n.v)}).`); break;
      case 'ref': lines.push(`ref(${id}, ${q(n.cell)}).`); break;
      case 'neg': lines.push(`negate(${id}, ${emit(n.a)}).`); break;
      case 'bin': {
        const rel = n.op === '+' ? 'plus' : n.op === '-' ? 'minus' : n.op === '*' ? 'times' : 'over';
        lines.push(`${rel}(${id}, ${emit(n.l)}, ${emit(n.r)}).`);
        break;
      }
      case 'cmp': lines.push(`cmp(${id}, ${n.op}, ${emit(n.l)}, ${emit(n.r)}).`); break;
      case 'if': lines.push(`pick(${id}, ${emit(n.c)}, ${emit(n.t)}, ${emit(n.e)}).`); break;
      case 'sum': {
        // a range becomes a chain, one item per cell: the kernel has no
        // aggregation, so a total is a fold the rules can walk
        const cells = n.cells;
        const head = ++nodeId;
        lines.push(`sum_head(${id}, ${head}).`);
        for (let i = 0; i < cells.length; i++) {
          const item = i === 0 ? head : ++nodeId;
          if (i === cells.length - 1) lines.push(`sum_last(${item}, ${q(cells[i])}).`);
          else lines.push(`sum_item(${item}, ${q(cells[i])}, ${nodeId + 1}).`);
        }
        break;
      }
      case 'vlookup': {
        const t = tables.get(n.table) ?? { range: n.table, cols: new Set<number>() };
        t.cols.add(n.col);
        tables.set(n.table, t);
        lines.push(`find(${id}, ${emit(n.key)}, ${q(n.table)}, ${n.col}).`);
        break;
      }
      case 'unsupported': lines.push(`outside_subset(${id}, ${q(n.what)}).`); break;
    }
    return id;
  };

  // --- work list: targets, then their precedents ---------------------------
  //
  // A VLOOKUP publishes its table only after its own node is emitted, and a
  // table cell may itself be a formula with precedents of its own, so the
  // two are drained together until neither has anything left. The closure is
  // what gets loaded and nothing else: a workbook holds thousands of label
  // cells no formula reads.
  const queue: string[] = [];
  const push = (id: string) => { if (!seen.has(id)) { seen.add(id); queue.push(id); } };
  const expanded = new Set<string>();

  if (opts.targets) {
    for (const t of opts.targets) push(t);
  } else {
    for (const name of sheetNames) {
      const sheet = wb.byName.get(name);
      if (!sheet) continue;
      for (const c of sheet.cells.values()) if (c.formula !== undefined) push(`${name}!${c.ref}`);
    }
  }

  const drain = (): void => {
    while (queue.length > 0) {
      const id = queue.shift()!;
      const at = cellAt(id);
      if (!at) { refused.set(id, 'no such sheet'); continue; }
      const cell = at.cell;
      if (!cell) { lines.push(`empty(${q(id)}).`); continue; }
      if (cell.formula !== undefined) {
        let tree: Node;
        try {
          tree = parseFormula(cell.formula, at.sheet.name);
        } catch (e) {
          refused.set(id, `parse: ${(e as Error).message}`);
          continue;
        }
        const p = new Set<string>();
        precedents(tree, p);
        for (const c of p) push(c);
        lines.push(`formula(${q(id)}, ${emit(tree)}).`);
        lines.push(`formula_text(${q(id)}, ${q(cell.formula)}).`);
        compiled.push(id);
        continue;
      }
      // a value cell: a number a human typed, or text
      if (cell.value === undefined) { lines.push(`empty(${q(id)}).`); continue; }
      if (cell.type === 's' || cell.type === 'str' || cell.type === 'inlineStr') {
        lines.push(`label(${q(id)}, ${q(cell.value)}).`);
        continue;
      }
      if (cell.type === 'e') { refused.set(id, `the file records an error: ${cell.value}`); continue; }
      if (cell.type === 'b') {
        lines.push(`input(${q(id)}, ${cell.value === '1' ? SCALE : 0}).`);
        inputs.push(id);
        continue;
      }
      const v = toScaled(cell.value);
      if (v === null) { lines.push(`label(${q(id)}, ${q(cell.value)}).`); continue; }
      if (Math.abs(v) > SAFE_MAX * SCALE) {
        refused.set(id, `magnitude ${cell.value} is outside the carrier's safe range`);
        continue;
      }
      lines.push(`input(${q(id)}, ${v}).`);
      inputs.push(id);
    }
  };

  /** Publish the key column and the requested columns of one lookup table.
   *  Emitting the whole rectangle would be tens of thousands of facts that
   *  nothing reads. */
  const publish = (t: Table): void => {
    const bang = t.range.lastIndexOf('!');
    const sheetName = t.range.slice(0, bang);
    const body = t.range.slice(bang + 1).replace(/\$/g, '');
    const first = parseRef(body.split(':')[0]);
    const rows = new Set<number>();
    for (const c of expandRange(t.range, '')) rows.add(parseRef(c.slice(c.lastIndexOf('!') + 1)).row);
    for (const row of [...rows].sort((a, b) => a - b)) {
      const at = cellAt(`${sheetName}!${numToCol(first.col)}${row}`);
      const keyCell = at?.cell;
      if (!keyCell || keyCell.value === undefined) continue;
      const key = keyCell.type === 's' || keyCell.type === 'str' || keyCell.type === 'inlineStr'
        ? q(keyCell.value)
        : String(toScaled(keyCell.value) ?? 0);
      lines.push(`tkey(${q(t.range)}, ${row}, ${key}).`);
      for (const col of [...t.cols].sort((a, b) => a - b)) {
        const target = `${sheetName}!${numToCol(first.col + col - 1)}${row}`;
        lines.push(`tcell(${q(t.range)}, ${row}, ${col}, ${q(target)}).`);
        push(target);
      }
    }
  };

  for (;;) {
    drain();
    let more = false;
    for (const t of tables.values()) {
      const stamp = `${t.range}|${[...t.cols].sort((a, b) => a - b).join(',')}`;
      if (expanded.has(stamp)) continue;
      expanded.add(stamp);
      publish(t);
      more = true;
    }
    if (!more && queue.length === 0) break;
  }

  return {
    facts: lines.join('\n'),
    inputs, refused, compiled, seen, factCount: lines.length,
  };
}

/** Every column letter used by a range, for a report. */
export const columnOf = (id: string): string =>
  /([A-Z]+)\d+$/.exec(id)?.[1] ?? '';

export { colToNum };

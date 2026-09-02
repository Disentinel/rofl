// xlsx.ts — an .xlsx reader in the standard library and nothing else.
//
// An .xlsx is a ZIP archive of XML parts. Node can open both without a
// package: `node:zlib` inflates the deflate streams, and the parts this
// reader needs are shallow enough that a scan beats a DOM. ZERO
// DEPENDENCIES is load-bearing for this repository, so the alternative — a
// plain-text formula table with the boundary declared — was not taken. See
// README.md, "Reading the file".
//
// WHAT IS PARSED, exhaustively: the ZIP central directory; workbook.xml and
// its rels (sheet names in tab order); sharedStrings.xml; and, per sheet,
// every <c> element's reference, type, <f> formula and <v> cached value.
// Shared formulas (<f t="shared">) are expanded by translating the master
// formula's relative references — see `translate`.
//
// WHAT IS NOT: styles (so a date is a number here, as it is in the file),
// defined names, charts, pivot caches, external links, and the calcChain.
// A cell carrying an error (#DIV/0!, #N/A) keeps its literal text as a
// string value, since the point of this reader is to hand the kernel what
// the file actually says.

import * as zlib from 'node:zlib';

// ---------------------------------------------------------------------------
// ZIP

/** One archive member, already decompressed. */
export interface ZipEntry { name: string; data: Buffer; }

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;

/** Read the ZIP central directory and inflate every member.
 *
 *  Only the two methods a spreadsheet writer emits are supported: 0 (stored)
 *  and 8 (deflate). Anything else throws by name rather than returning
 *  plausible bytes. The local file header is re-read for each entry because
 *  its variable-length name and extra fields are what the data offset is
 *  measured from; the central directory's offset points at the header, not
 *  at the data. */
export function unzip(buf: Buffer): Map<string, Buffer> {
  // the End Of Central Directory record is last, after a comment of unknown
  // length, so it is found by scanning backwards for its signature
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 65536; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('xlsx: not a ZIP archive (no end-of-central-directory record)');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = new Map<string, Buffer>();
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== CEN_SIG) throw new Error(`xlsx: bad central directory entry ${i}`);
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    // local header: 30 fixed bytes, then its own name and extra fields
    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const dataOff = localOff + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(dataOff, dataOff + compSize);
    if (method === 0) out.set(name, Buffer.from(raw));
    else if (method === 8) out.set(name, zlib.inflateRawSync(raw));
    else throw new Error(`xlsx: ${name}: unsupported compression method ${method}`);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

// ---------------------------------------------------------------------------
// XML, to the depth this file needs

const ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'",
};

/** XML text to characters. Numeric character references are decoded too:
 *  a sheet name or a string literal may carry one. */
export function unescapeXml(s: string): string {
  return s.replace(/&(?:#(\d+)|#x([0-9a-fA-F]+)|[a-z]+);/g, (m, dec: string, hex: string) => {
    if (dec !== undefined) return String.fromCodePoint(Number(dec));
    if (hex !== undefined) return String.fromCodePoint(parseInt(hex, 16));
    return ENTITIES[m] ?? m;
  });
}

/** Attribute value out of a start tag, or undefined. */
function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return m ? unescapeXml(m[1]) : undefined;
}

// ---------------------------------------------------------------------------
// A1 references

/** Column letters to a 1-based index: A=1, Z=26, AA=27. */
export function colToNum(col: string): number {
  let n = 0;
  for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

/** The inverse, for rendering a translated shared formula. */
export function numToCol(n: number): string {
  let s = '';
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = (n - r - 1) / 26; }
  return s;
}

export interface RefParts { col: number; row: number; }

export function parseRef(ref: string): RefParts {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!m) throw new Error(`xlsx: bad cell reference ${ref}`);
  return { col: colToNum(m[1]), row: Number(m[2]) };
}

// ---------------------------------------------------------------------------
// the workbook

/** A cell as the file records it. `formula` is Excel's formula text without
 *  the leading '='; `value` is the value Excel COMPUTED AND CACHED when it
 *  last saved — the file's own record of what Excel thinks the answer is,
 *  which examples/slop/demo.ts uses as one of its two oracles. */
export interface Cell {
  ref: string;
  row: number;
  col: number;
  formula?: string;
  /** 'n' number, 's' shared string, 'str' formula string, 'b' boolean,
   *  'e' error, 'inlineStr'. Absent means 'n'. */
  type?: string;
  /** the cached value, as text; numbers are kept as text so no precision is
   *  lost before the reader's caller decides what to do with them */
  value?: string;
}

export interface Sheet {
  name: string;
  /** cells by A1 reference, in file order (row-major, as Excel writes them) */
  cells: Map<string, Cell>;
}

export interface Workbook {
  sheets: Sheet[];
  byName: Map<string, Sheet>;
}

/** The <si> entries of sharedStrings.xml, flattened: a string may be split
 *  into several runs by formatting, and the value is their concatenation. */
function sharedStrings(parts: Map<string, Buffer>): string[] {
  const raw = parts.get('xl/sharedStrings.xml');
  if (!raw) return [];
  const xml = raw.toString('utf8');
  const out: string[] = [];
  for (const m of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    let s = '';
    for (const t of m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) s += unescapeXml(t[1]);
    out.push(s);
  }
  return out;
}

/** Shift every RELATIVE reference in a formula by (dCol, dRow).
 *
 *  This is what <f t="shared"> means: one master formula plus a rectangle of
 *  cells that repeat it, each with its relative references moved by its own
 *  offset from the master. A $ pins the part it precedes, so `$B$29` never
 *  moves and `B$29` moves only sideways. Quoted string literals are stepped
 *  over so a reference-shaped substring inside one is not rewritten. */
export function translate(formula: string, dCol: number, dRow: number): string {
  let out = '';
  let i = 0;
  while (i < formula.length) {
    const ch = formula[i];
    if (ch === '"') {                       // a string literal: copy verbatim
      const end = formula.indexOf('"', i + 1);
      const stop = end < 0 ? formula.length : end + 1;
      out += formula.slice(i, stop);
      i = stop;
      continue;
    }
    if (ch === "'") {                       // a quoted sheet name: likewise
      const end = formula.indexOf("'", i + 1);
      const stop = end < 0 ? formula.length : end + 1;
      out += formula.slice(i, stop);
      i = stop;
      continue;
    }
    const m = /^(\$?)([A-Z]{1,3})(\$?)(\d{1,7})/.exec(formula.slice(i));
    // a reference must not be preceded by a letter, digit or '_': that would
    // make it the tail of a function name or a defined name
    const prev = out.length > 0 ? out[out.length - 1] : '';
    if (m && !/[A-Za-z0-9_.]/.test(prev)) {
      const col = m[1] === '$' ? m[2] : numToCol(colToNum(m[2]) + dCol);
      const row = m[3] === '$' ? m[4] : String(Number(m[4]) + dRow);
      out += m[1] + col + m[3] + row;
      i += m[0].length;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/** Parse one sheet part. Shared formulas are resolved against `masters`,
 *  which is per-workbook because `si` indices are workbook-global in
 *  practice for the writers that emit them. */
function parseSheet(name: string, xml: string, strings: string[]): Sheet {
  const cells = new Map<string, Cell>();
  const masters = new Map<string, { formula: string; col: number; row: number }>();
  for (const m of xml.matchAll(/<c ([^>]*?)(\/>|>([\s\S]*?)<\/c>)/g)) {
    const tag = ' ' + m[1];
    const body = m[3] ?? '';
    const ref = attr(tag, 'r');
    if (!ref) continue;
    const { col, row } = parseRef(ref);
    const cell: Cell = { ref, row, col };
    const t = attr(tag, 't');
    if (t) cell.type = t;

    const fm = /<f([^>]*?)(\/>|>([\s\S]*?)<\/f>)/.exec(body);
    if (fm) {
      const fTag = ' ' + fm[1];
      const text = fm[3] === undefined ? '' : unescapeXml(fm[3]);
      const si = attr(fTag, 'si');
      if (attr(fTag, 't') === 'shared' && si !== undefined) {
        if (text !== '') masters.set(si, { formula: text, col, row });
        const master = masters.get(si);
        if (master) {
          cell.formula = text !== '' ? text
            : translate(master.formula, col - master.col, row - master.row);
        }
      } else if (text !== '') {
        cell.formula = text;
      }
    }

    const vm = /<v>([\s\S]*?)<\/v>/.exec(body);
    if (vm) {
      const v = unescapeXml(vm[1]);
      cell.value = t === 's' ? (strings[Number(v)] ?? '') : v;
    } else {
      const im = /<is>([\s\S]*?)<\/is>/.exec(body);
      if (im) {
        let s = '';
        for (const tt of im[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) s += unescapeXml(tt[1]);
        cell.value = s;
      }
    }
    if (cell.formula !== undefined || cell.value !== undefined) cells.set(ref, cell);
  }
  return { name, cells };
}

/** Open a workbook from the bytes of an .xlsx file. */
export function readWorkbook(bytes: Buffer): Workbook {
  const parts = unzip(bytes);
  const wbXml = parts.get('xl/workbook.xml');
  if (!wbXml) throw new Error('xlsx: no xl/workbook.xml — not a spreadsheet');
  const relsXml = parts.get('xl/_rels/workbook.xml.rels');
  const target = new Map<string, string>();
  if (relsXml) {
    for (const m of relsXml.toString('utf8').matchAll(/<Relationship ([^>]*)\/>/g)) {
      const tag = ' ' + m[1];
      const id = attr(tag, 'Id');
      const t = attr(tag, 'Target');
      if (id && t) target.set(id, t.replace(/^\/?xl\//, '').replace(/^\//, ''));
    }
  }
  const strings = sharedStrings(parts);
  const sheets: Sheet[] = [];
  let n = 0;
  for (const m of wbXml.toString('utf8').matchAll(/<sheet ([^>]*)\/>/g)) {
    const tag = ' ' + m[1];
    const name = attr(tag, 'name') ?? `Sheet${++n}`;
    const rid = attr(tag, 'r:id') ?? attr(tag, 'id');
    const part = 'xl/' + (rid !== undefined ? target.get(rid) ?? '' : '');
    const raw = parts.get(part);
    if (!raw) continue;   // a chart sheet or a part the rels do not name
    sheets.push(parseSheet(name, raw.toString('utf8'), strings));
  }
  return { sheets, byName: new Map(sheets.map((s) => [s.name, s])) };
}

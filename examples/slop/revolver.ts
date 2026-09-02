// revolver.ts — the cyclic model, and a minimal .xlsx WRITER for it.
//
// THE MODEL IS NOT REAL AND SAYS SO. examples/slop/fcffsimpleginzu.xlsx is a
// real financial model taken from outside (see README.md); this one is built
// here, because what it has to demonstrate is a CIRCULAR REFERENCE and the
// downloaded model does not contain one. The circularity is the textbook one
// and every practitioner has met it:
//
//   interest is charged on the AVERAGE debt balance over the period
//   the closing balance depends on the interest charged
//   the average balance depends on the closing balance
//
// Excel refuses to compute that until you tick File > Options > Formulas >
// Enable iterative calculation, and then it gives you a number with no
// statement of whether the iteration converged. The file this writes carries
// that checkbox as data — `<calcPr iterate="1" iterateCount="200">` — so
// LibreOffice will compute it and can serve as the oracle.
//
// MONEY IS IN DOLLARS, and the carrier holds 1e-8 of a value, so a cent is
// 1 000 000 carrier units and every figure here is exactly representable.
// That is why this model can be checked TO THE CENT and the analyst DCF
// cannot: see README.md, "To the cent is a property of the model".

import * as zlib from 'node:zlib';

// ---------------------------------------------------------------------------
// the model

export interface Revolver {
  /** debt at the start of period 1 */
  opening: number;
  /** operating profit per period, before interest */
  ebit: number[];
  /** the annual rate charged on the average balance */
  rate: number;
}

/** The converging case: a plausible revolving credit facility. */
export const CONVERGING: Revolver = {
  opening: 4_000_000,
  ebit: [900_000, 950_000],
  rate: 0.0625,
};

/** The diverging case. ONE NUMBER IS DIFFERENT — the rate — and it is set
 *  past the point where the feedback loop is a contraction: interest on the
 *  average balance now adds more to the closing balance each round than the
 *  round before removed. No rate is like this in the world; the point is
 *  that a circular model CAN be like this and the sheet will not say so.
 *  Excel returns whatever its hundredth iteration happened to hold. */
export const DIVERGING: Revolver = {
  opening: 400_000,
  ebit: [90_000, 95_000],
  rate: 2.04,
};

/** The layout, as it appears in the file. Column A is labels, column B the
 *  first period, C the second. The four rows in the middle are the cycle. */
export function cells(m: Revolver): Map<string, { text?: string; num?: number; f?: string }> {
  const out = new Map<string, { text?: string; num?: number; f?: string }>();
  const cols = ['B', 'C', 'D', 'E'].slice(0, m.ebit.length);
  out.set('A1', { text: 'Revolving credit facility' });
  out.set('A2', { text: 'Period' });
  out.set('A3', { text: 'Opening debt' });
  out.set('A4', { text: 'EBIT' });
  out.set('A5', { text: 'Average debt' });
  out.set('A6', { text: 'Interest expense' });
  out.set('A7', { text: 'Cash flow after interest' });
  out.set('A8', { text: 'Closing debt' });
  out.set('A10', { text: 'Interest rate' });
  out.set('B10', { num: m.rate });
  cols.forEach((c, i) => {
    const prev = i === 0 ? null : cols[i - 1];
    out.set(`${c}2`, { num: i + 1 });
    out.set(`${c}3`, prev === null ? { num: m.opening } : { f: `${prev}8` });
    out.set(`${c}4`, { num: m.ebit[i] });
    out.set(`${c}5`, { f: `(${c}3+${c}8)/2` });     // <- reads the closing balance
    out.set(`${c}6`, { f: `${c}5*$B$10` });
    out.set(`${c}7`, { f: `${c}4-${c}6` });
    out.set(`${c}8`, { f: `${c}3-${c}7` });         // <- which reads this
  });
  return out;
}

/** The closed form of the converging case, for a comparison that does not go
 *  through anybody's iteration:
 *    c = o - E + r*(o + c)/2   =>   c = (o*(1 + r/2) - E) / (1 - r/2)
 *  Computed in doubles here ON PURPOSE — it is a third opinion, independent
 *  of both the kernel's fixed point and the spreadsheet's. */
export function closedForm(m: Revolver): number[] {
  const out: number[] = [];
  let o = m.opening;
  for (const e of m.ebit) {
    const c = (o * (1 + m.rate / 2) - e) / (1 - m.rate / 2);
    out.push(c);
    o = c;
  }
  return out;
}

// ---------------------------------------------------------------------------
// the writer
//
// A .xlsx is a ZIP of XML parts, and `node:zlib` is not even needed to write
// one: STORED entries (method 0) are the bytes themselves, so the only
// arithmetic is a CRC-32. Deflate is used anyway, because the reader in
// xlsx.ts handles both and a file that exercises both paths is a better test
// of it than one that exercises neither.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

interface Part { name: string; data: Buffer }

/** Build a ZIP archive. Deflated where that is smaller, stored otherwise. */
export function zip(parts: Part[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const p of parts) {
    const name = Buffer.from(p.name, 'utf8');
    const deflated = zlib.deflateRawSync(p.data, { level: 9 });
    const stored = deflated.length >= p.data.length;
    const body = stored ? p.data : deflated;
    const crc = crc32(p.data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(stored ? 0 : 8, 8);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(body.length, 18);
    lh.writeUInt32LE(p.data.length, 22);
    lh.writeUInt16LE(name.length, 26);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(stored ? 0 : 8, 10);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(body.length, 20);
    cd.writeUInt32LE(p.data.length, 24);
    cd.writeUInt16LE(name.length, 28);
    cd.writeUInt32LE(offset, 42);
    locals.push(lh, name, body);
    centrals.push(cd, name);
    offset += 30 + name.length + body.length;
  }
  const central = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(parts.length, 8);
  eocd.writeUInt16LE(parts.length, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, central, eocd]);
}

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PNS = 'http://schemas.openxmlformats.org/package/2006/relationships';

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A number as XML text, in full double precision. */
const numText = (v: number): string => String(v);

/** The whole workbook as bytes.
 *
 *  `iterate="1"` in `<calcPr>` IS the iterative-calculation checkbox, stored
 *  in the file. `fullCalcOnLoad="1"` is what makes a reader recompute rather
 *  than trust the cached values, and this writer emits NO cached values at
 *  all — every formula cell is `<f>` with no `<v>` — so anything a
 *  spreadsheet shows for this file, it worked out itself. */
export function workbook(sheetName: string, m: Revolver): Buffer {
  const cs = cells(m);
  const byRow = new Map<number, string[]>();
  for (const [ref, c] of [...cs.entries()].sort((a, b) => {
    const ra = Number(/\d+/.exec(a[0])![0]), rb = Number(/\d+/.exec(b[0])![0]);
    return ra - rb || (a[0] < b[0] ? -1 : 1);
  })) {
    const row = Number(/\d+/.exec(ref)![0]);
    const xml = c.f !== undefined ? `<c r="${ref}"><f>${esc(c.f)}</f></c>`
      : c.text !== undefined ? `<c r="${ref}" t="inlineStr"><is><t>${esc(c.text)}</t></is></c>`
      : `<c r="${ref}"><v>${numText(c.num!)}</v></c>`;
    byRow.set(row, [...(byRow.get(row) ?? []), xml]);
  }
  const rows = [...byRow.entries()].sort((a, b) => a[0] - b[0])
    .map(([r, xs]) => `<row r="${r}">${xs.join('')}</row>`).join('');

  const parts: Part[] = [
    { name: '[Content_Types].xml', data: Buffer.from(XML
      + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      + '</Types>', 'utf8') },
    { name: '_rels/.rels', data: Buffer.from(XML
      + `<Relationships xmlns="${PNS}">`
      + `<Relationship Id="rId1" Type="${RNS}/officeDocument" Target="xl/workbook.xml"/>`
      + '</Relationships>', 'utf8') },
    { name: 'xl/workbook.xml', data: Buffer.from(XML
      + `<workbook xmlns="${NS}" xmlns:r="${RNS}">`
      + `<sheets><sheet name="${esc(sheetName)}" sheetId="1" r:id="rId1"/></sheets>`
      + '<calcPr calcId="0" iterate="1" iterateCount="200" iterateDelta="1E-10" fullCalcOnLoad="1"/>'
      + '</workbook>', 'utf8') },
    { name: 'xl/_rels/workbook.xml.rels', data: Buffer.from(XML
      + `<Relationships xmlns="${PNS}">`
      + `<Relationship Id="rId1" Type="${RNS}/worksheet" Target="worksheets/sheet1.xml"/>`
      + `<Relationship Id="rId2" Type="${RNS}/styles" Target="styles.xml"/>`
      + '</Relationships>', 'utf8') },
    { name: 'xl/styles.xml', data: Buffer.from(XML
      + `<styleSheet xmlns="${NS}">`
      + '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>'
      + '<fills count="1"><fill><patternFill patternType="none"/></fill></fills>'
      + '<borders count="1"><border/></borders>'
      + '<cellStyleXfs count="1"><xf/></cellStyleXfs>'
      + '<cellXfs count="1"><xf xfId="0"/></cellXfs>'
      + '</styleSheet>', 'utf8') },
    { name: 'xl/worksheets/sheet1.xml', data: Buffer.from(XML
      + `<worksheet xmlns="${NS}"><sheetData>${rows}</sheetData></worksheet>`, 'utf8') },
  ];
  return zip(parts);
}

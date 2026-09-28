// A notation: the domain's own standard, for its own engine to draw. GEDCOM 7: a person an INDI with its NAME and BIRT, a family a FAM
// with its partners (HUSB, WIFE: GEDCOM's two partner roles) and its children (CHIL).
import { unquote, type Backend, type View } from './draw.ts';

function gedcom(v: View): string {
  const of = (rel: string) => v.facts.filter((f) => f.rel === rel);
  const people = [...new Set([...of('named'), ...of('born')].map((f) => f.args[0]).concat([...of('partner'), ...of('child')].map((f) => f.args[1])))].sort();
  const families = [...new Set([...of('partner'), ...of('child')].map((f) => f.args[0]))].sort();
  const id = (m: string, p: string, xs: string[]) => `@${p}${xs.indexOf(m) + 1}@`;
  const out = ['0 HEAD', '1 GEDC', '2 VERS 7.0', '1 NOTE drawn from a ROFL notebook by `draw notation`'];
  for (const p of people) {
    out.push(`0 ${id(p, 'I', people)} INDI`, `1 NAME ${unquote(of('named').find((f) => f.args[0] === p)?.args[1] ?? p)}`);
    for (const f of of('born').filter((x) => x.args[0] === p)) out.push('1 BIRT', `2 DATE ${unquote(f.args[1])}`);
    for (const fam of families) {
      if (of('partner').some((f) => f.args[0] === fam && f.args[1] === p)) out.push(`1 FAMS ${id(fam, 'F', families)}`);
      if (of('child').some((f) => f.args[0] === fam && f.args[1] === p)) out.push(`1 FAMC ${id(fam, 'F', families)}`);
    }
  }
  for (const fam of families) {
    out.push(`0 ${id(fam, 'F', families)} FAM`);
    of('partner').filter((f) => f.args[0] === fam).map((f) => f.args[1]).sort().forEach((p, k) => out.push(`1 ${k ? 'WIFE' : 'HUSB'} ${id(p, 'I', people)}`));
    for (const c of of('child').filter((f) => f.args[0] === fam).map((f) => f.args[1]).sort()) out.push(`1 CHIL ${id(c, 'I', people)}`);
  }
  return [...out, '0 TRLR'].join('\n');
}

export const backends: Backend[] = [{ kind: 'notation', format: 'gedcom', fence: 'gedcom', write: gedcom }];

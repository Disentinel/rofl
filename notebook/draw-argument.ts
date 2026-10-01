// The argument dialect of the graph as Argdown.
import { linkTags, nodes, unquote, type Backend, type View } from './draw.ts';

/** Argdown: a mark that only links to others is an argument `<..>`, any other a statement `[..]`; a link is `+`, tagged `attack` it is `-`. */
function argdown(v: View): string {
  const links = v.facts.filter((f) => f.rel === 'link'), out: string[] = [];
  const title = (m: string) => (v.marks[m]?.label ?? unquote(m)).replace(/[[\]<>]/g, '');
  const hashes = (m: string) => (v.marks[m]?.tags ?? []).map((t) => ` #${t.replace(/\W+/g, '-')}`).join('');
  const argument = new Set(links.map((f) => f.args[0]).filter((m) => !links.some((f) => f.args[1] === m)));
  const shape = (m: string) => argument.has(m) ? `<${title(m)}>` : `[${title(m)}]`;
  const walk = (m: string, pad: string, path: Set<string>) => {
    for (const f of links.filter((x) => x.args[1] === m)) {
      const s = f.args[0], attack = linkTags(v, f).includes('attack');
      out.push(`${pad}${attack ? '-' : '+'} ${shape(s)}${path.has(s) ? '' : hashes(s)}`);
      if (!path.has(s)) walk(s, pad + '  ', new Set([...path, s]));
    }
  };
  const roots = nodes(v).filter((m) => !links.some((f) => f.args[0] === m));
  for (const m of roots) { out.push(`${shape(m)}${hashes(m)}`); walk(m, '  ', new Set([m])); out.push(''); }
  return out.join('\n').trim();
}


export const backends: Backend[] = [{ kind: 'argument', format: 'argdown', fence: 'argdown', write: argdown }];

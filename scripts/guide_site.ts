// npm run guide:site -- [--out DIR]   the guide (guide/*.md) as static HTML pages, one a chapter, with the chapter list beside
// each: what the Pages workflow publishes under /guide/. The Markdown is the GitHub flavour the guide is written in: headings,
// paragraphs, fenced code (any fence length), indented code, quotes, lists, tables, images, links, inline code, bold and italic.
// The guide's `<!-- BEGIN ... -->` markers are dropped; a `<a id>` anchor is kept as an id. Code is coloured here, at build time
// (`rofl` rules and questions, `js`, and the `$` sessions). A picture scripts/guide.ts drew is marked `<!-- view pictures/x.json -->`:
// the page keeps the still form and, once loaded, draws the view with the modules VS Code and the workbench draw with (lib/), zoom and
// full screen included; without the script, or offline, the still form stands.
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { emitAll, finish } from './emit.ts';

const ROOT = new URL('..', import.meta.url).pathname, GUIDE = path.join(ROOT, 'guide');
const argv = process.argv.slice(2), oi = argv.indexOf('--out');
const OUT = path.resolve(oi >= 0 ? argv[oi + 1] : path.join(GUIDE, 'dist'));

// the chapters in reading order; README.md is the index and becomes index.html
const ORDER = ['README', 'WHAT', 'INSTALL', 'QUICKSTART', 'ASKING', 'CONCEPTS', 'WRITING', 'CHEATSHEET', 'DRAWING', 'MODELS', 'AGENTS', 'ADAPTERS'];
const SKIP = new Set(['README-npm', 'README-marketplace']);
const stems = [...ORDER, ...readdirSync(GUIDE).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3)).filter((s) => !ORDER.includes(s) && !SKIP.has(s)).sort()];
const page = (s: string) => (s === 'README' ? 'index' : s) + '.html';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const title = (stem: string) => /^# (.*)$/m.exec(readFileSync(path.join(GUIDE, `${stem}.md`), 'utf8'))?.[1] ?? stem;

// a link in the guide: another chapter (`X.md`, `X.md#a`), a path into the tree (`../docs/...`, `pictures/x.svg`), or a URL
function href(target: string): string {
  const m = /^([\w-]+)\.md(#.*)?$/.exec(target);
  if (m) return page(m[1]) + (m[2] ?? '');
  if (/^\.\.\//.test(target)) return `https://github.com/Disentinel/rofl/blob/main/${target.replace(/^\.\.\//, '')}`;
  return target;
}

function inline(s: string): string {
  // code spans are set aside first, so nothing inside them is read as markup
  const spans: string[] = [];
  const text = s.replace(/(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/g, (_, __, code) => `\u0000${spans.push(`<code>${esc(code.trim())}</code>`) - 1}\u0000`);
  return inlineText(text).replace(/\u0000(\d+)\u0000/g, (_, n) => spans[Number(n)]);
}
function inlineText(s: string): string {
  return esc(s)
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => `<img src="${href(src)}" alt="${alt}">`)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, target) => `<a href="${href(target)}">${text}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\s][^*]*?)\*(?=[\s.,;:)]|$)/g, '$1<em>$2</em>')
    .replace(/&lt;a id=&quot;([\w-]+)&quot;&gt;&lt;\/a&gt;/g, '<a id="$1"></a>')
    .replace(/&lt;br&gt;/g, '<br>');
}

// ------------------------------------------------------------ code, coloured
// Each language is a list of token patterns tried in order at each position; what none matches is plain text.
type Rule = [RegExp, string];
const ROFL: Rule[] = [
  [/^--.*$/m, 'c'],
  [/^(?:reads|extends|model):?\b.*$/m, 'k'],                                  // a cell's header line
  [/^(?:\?|why(?:not)?|never|excise|draw|each|how many|is there|count|list)(?=\s)/m, 'q'],
  [/`[^`\n]*`|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/, 's'],
  [/(?<![\w-])(?:if|and|or|not|unless|either|else|then|otherwise|where|with|of|as|all|some|no|exists|holds|fails|given|sealed|asks)(?![\w-])/, 'k'],
  [/:-|\\\+|->|=>|\[\w+\]/, 'k'],
  [/(?<![\w`])(?!(?:A|An|The)\b)[A-Z][A-Z0-9_]*\b(?![\w(])/, 'v'],      // a variable: N, F, F2, FILE; not an article
  [/\b\d+(?:\.\d+)?\b/, 'n'],
];
const JS: Rule[] = [
  [/\/\/.*$|\/\*[\s\S]*?\*\//m, 'c'],
  [/`(?:[^`\\]|\\.)*`|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/, 's'],
  [/\b(?:async|await|break|case|catch|class|const|continue|default|delete|do|else|export|extends|finally|for|from|function|if|import|in|instanceof|let|new|of|return|static|switch|this|throw|try|typeof|var|while|yield)\b/, 'k'],
  [/\b(?:true|false|null|undefined)\b|\b\d+(?:\.\d+)?\b/, 'n'],
];
const LANGS: Record<string, Rule[]> = { rofl: ROFL, datalog: ROFL, js: JS, javascript: JS, ts: JS };

function colour(code: string, rules: Rule[]): string {
  let out = '', rest = code;
  while (rest) {
    let best: [number, string, string] | undefined;
    for (const [re, cls] of rules) { const m = re.exec(rest); if (m && (!best || m.index < best[0])) best = [m.index, m[0], cls]; if (m?.index === 0) break; }
    if (!best) { out += esc(rest); break; }
    out += esc(rest.slice(0, best[0])) + `<span class="t-${best[2]}">${esc(best[1])}</span>`;
    rest = rest.slice(best[0] + best[1].length);
  }
  return out;
}
// a session: the `$` lines are the commands, a verdict word is coloured, the rest is what was printed
function session(code: string): string {
  return code.split('\n').map((l) => /^\$ /.test(l) ? `<span class="t-prompt">$</span> <span class="t-cmd">${esc(l.slice(2))}</span>`
    : esc(l).replace(/\b(FAILS|refused|unknown|STALE)\b/g, '<span class="t-fail">$1</span>').replace(/\b(holds|HOLDS)\b/g, '<span class="t-pass">$1</span>')).join('\n');
}
// a notebook: its prose is rules and questions too, so it is coloured as rofl; the fences, the front matter and the quotes are set back
function notebook(text: string): string {
  let front = 0;
  return text.split('\n').map((l) => {
    if (l === '---' && front < 2) { front++; return `<span class="t-c">${l}</span>`; }
    if (front === 1 || /^(`{3,}|>)/.test(l)) return `<span class="t-c">${esc(l)}</span>`;
    if (/^#+ /.test(l)) return `<span class="t-h">${esc(l)}</span>`;
    return colour(l, ROFL);
  }).join('\n');
}
function code(text: string, lang: string): string {
  const body = LANGS[lang] ? colour(text, LANGS[lang]) : lang === 'markdown' ? notebook(text) : !lang && /^\$ /m.test(text) ? session(text) : esc(text);
  return `<pre><code${lang ? ` class="lang-${lang}"` : ''}>${body}</code></pre>`;
}

function render(md: string): string {
  const lines = md.replace(/<!-- (BEGIN|END) [^>]*-->\n/g, '').split('\n'), out: string[] = [];
  let i = 0, para: string[] = [], view = '';
  const flush = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; } };
  // a block scripts/guide.ts drew: the still form inside a figure the page's script draws the view into
  const picture = (still: string) => { if (!view) return still; const f = `<figure class="pic" data-view="${esc(view)}">${still}</figure>`; view = ''; return f; };
  while (i < lines.length) {
    const l = lines[i]; let m;
    if (!l.trim()) { flush(); i++; continue; }
    if ((m = /^<!-- view (\S+) -->$/.exec(l))) { flush(); view = m[1]; i++; continue; }
    if ((m = /^(`{3,})(\w*)/.exec(l))) {
      flush(); const fence = m[1], text: string[] = []; i++;
      while (i < lines.length && !lines[i].startsWith(fence)) text.push(lines[i++]);
      i++; out.push(picture(code(text.join('\n'), m[2]))); continue;
    }
    if (/^ {4}/.test(l) && !para.length) {
      flush(); const text: string[] = [];
      while (i < lines.length && (/^ {4}/.test(lines[i]) || (!lines[i].trim() && /^ {4}/.test(lines[i + 1] ?? '')))) text.push(lines[i++].slice(4));
      out.push(code(text.join('\n'), '')); continue;
    }
    if ((m = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(l))) { flush(); out.push(picture(`<img src="${href(m[2])}" alt="${esc(m[1])}">`)); i++; continue; }
    if ((m = /^(#{1,4}) (.*)$/.exec(l))) { flush(); const id = m[2].toLowerCase().replace(/[^\w]+/g, '-').replace(/^-|-$/g, ''); out.push(`<h${m[1].length} id="${id}">${inline(m[2])}</h${m[1].length}>`); i++; continue; }
    if (/^>/.test(l)) { flush(); const q: string[] = []; while (i < lines.length && /^>/.test(lines[i])) q.push(lines[i++].replace(/^> ?/, '')); out.push(`<blockquote>${render(q.join('\n'))}</blockquote>`); continue; }
    if (/^\|/.test(l)) {
      flush(); const rows: string[][] = [];
      while (i < lines.length && /^\|/.test(lines[i])) { const c = lines[i++].replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((s) => s.trim()); if (!c.every((x) => /^:?-+:?$/.test(x))) rows.push(c); }
      const [head, ...body] = rows;
      out.push(picture(`<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`)); continue;
    }
    if ((m = /^(-|\d+\.) /.exec(l))) {
      flush(); const tag = m[1] === '-' ? 'ul' : 'ol', items: string[] = [];
      while (i < lines.length && (m = /^(-|\d+\.) (.*)$/.exec(lines[i])) && (m[1] === '-') === (tag === 'ul')) {
        const item = [m[2]]; i++;
        while (i < lines.length && /^ {2,}\S/.test(lines[i])) item.push(lines[i++].trim());
        items.push(`<li>${inline(item.join(' '))}</li>`);
      }
      out.push(`<${tag}>${items.join('')}</${tag}>`); continue;
    }
    para.push(l.trim()); i++;
  }
  flush(); return out.join('\n');
}

const CSS = readFileSync(path.join(ROOT, 'playground/tokens.css'), 'utf8') + `
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.55 var(--sans); }
  .wrap { display: flex; gap: 2.5rem; max-width: 72rem; margin: 0 auto; padding: 1.5rem 1rem 4rem; }
  nav { flex: 0 0 13rem; position: sticky; top: 1.5rem; align-self: flex-start; font-size: 0.92rem; }
  nav a { display: block; color: var(--mute); text-decoration: none; padding: 0.15rem 0; }
  nav a[aria-current] { color: var(--fg); font-weight: 600; }
  nav a:hover { color: var(--accent); }
  nav .top { font-weight: 600; color: var(--fg); margin-bottom: 0.6rem; }
  main { flex: 1 1 auto; min-width: 0; max-width: 46rem; }
  h1 { font-size: 1.8rem; line-height: 1.2; margin: 0 0 1rem; }
  h2 { font-size: 1.25rem; margin: 2.2rem 0 0.6rem; }
  h3 { font-size: 1.05rem; margin: 1.6rem 0 0.4rem; }
  a { color: var(--accent); }
  code { font: 0.9em var(--mono); background: var(--soft); padding: 0.05em 0.3em; border-radius: 3px; }
  pre, code { font-variant-ligatures: none; }
  pre { background: var(--code-bg); border: 1px solid var(--line); border-radius: 6px; padding: 0.8rem 1rem; overflow-x: auto; font-size: 0.82rem; line-height: 1.45; }
  pre code { background: none; padding: 0; font-size: inherit; }
  blockquote { margin: 1rem 0; padding: 0.2rem 1rem; border-left: 3px solid var(--line); color: var(--mute); }
  blockquote p { margin: 0.4rem 0; }
  table { border-collapse: collapse; margin: 1rem 0; font-size: 0.92rem; }
  th, td { text-align: left; vertical-align: top; padding: 0.35rem 0.7rem; border-bottom: 1px solid var(--line); }
  th:empty { padding: 0; border: 0; }
  img { max-width: 100%; }
  li { margin: 0.2rem 0; }
  .t-c { color: var(--mute); font-style: italic; } .t-k { color: var(--kw); } .t-q { color: var(--accent); font-weight: 600; }
  .t-s { color: var(--pass); } .t-h { font-weight: 700; } .t-v { color: var(--warn); } .t-n { color: var(--warn); }
  .t-prompt { color: var(--mute); } .t-cmd { color: var(--fg); font-weight: 600; } .t-fail { color: var(--fail); font-weight: 600; } .t-pass { color: var(--pass); font-weight: 600; }
  figure.pic { margin: 1rem 0; }
  figure.pic .rofl-pic { font: 13px/1.4 var(--sans); }
  figure.pic .rofl-pic .pbar { margin-bottom: 0; }
  @media (max-width: 48rem) { .wrap { flex-direction: column; gap: 1rem; } nav { position: static; display: flex; flex-wrap: wrap; gap: 0 0.9rem; } nav .top { width: 100%; } }
`;

// the page's script: each figure's view fetched and drawn in place of its still form; a failure leaves the still form
const SCRIPT = `import { draw, graphLibs } from './lib/pictures.js';
for (const fig of document.querySelectorAll('figure.pic[data-view]')) {
  try {
    const view = await (await fetch(fig.dataset.view)).json(), el = document.createElement('div');
    await draw(el, view, { libs: () => graphLibs(document) });
    fig.replaceChildren(el);
  } catch (e) { console.warn(fig.dataset.view, e); }
}
`;

rmSync(OUT, { recursive: true, force: true });
mkdirSync(path.join(OUT, 'pictures'), { recursive: true });
mkdirSync(path.join(OUT, 'lib'), { recursive: true });
for (const f of readdirSync(path.join(GUIDE, 'pictures'))) copyFileSync(path.join(GUIDE, 'pictures', f), path.join(OUT, 'pictures', f));
emitAll(ROOT, path.join(OUT, 'lib'), ['vscode/visual/pictures.ts']);
finish(path.join(OUT, 'lib'));
writeFileSync(path.join(OUT, 'guide.js'), SCRIPT);
for (const stem of stems) {
  const md = readFileSync(path.join(GUIDE, `${stem}.md`), 'utf8');
  const nav = stems.map((s) => `<a href="${page(s)}"${s === stem ? ' aria-current="page"' : ''}>${esc(s === 'README' ? 'The guide' : title(s))}</a>`).join('\n');
  const html = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title(stem))} · ROFL</title>
<style>${CSS}</style>
<script type="module" src="guide.js"></script>
<div class="wrap">
<nav><div class="top"><a href="index.html">ROFL guide</a></div>
${nav}
<div style="margin-top:1rem"><a href="https://github.com/Disentinel/rofl">GitHub</a><a href="../">Workbench</a><a href="../playground/">Playground</a></div></nav>
<main>
${render(md)}
</main>
</div>
</html>
`;
  writeFileSync(path.join(OUT, page(stem)), html);
}
console.log(`${OUT}: ${stems.length} pages`);

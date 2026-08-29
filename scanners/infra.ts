// scanners/infra.ts — infrastructure-to-facts extractors for the wiring
// demo: DNS zone files, nginx configs, k8s manifests (a small YAML subset),
// and interface-surface extraction from Node/Go sources.
//
// Deliberate scope: these extract the WIRING SURFACE (who listens where,
// who calls what, which fields cross the wire), not full ASTs. An extractor
// here is an attributed witness, not a compiler; rules do the joining.
// All identifiers are emitted as quoted strings (hosts, paths and service
// names are not valid atoms).

// ------------------------------------------------------------ helpers ---

function q(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** http(s)://host/first-segment -> [host, "/segment"] (segment may be ""). */
export function splitUrl(url: string): { host: string; seg: string } | null {
  const m = /^https?:\/\/([^/?#]+)(\/[^/?#]*)?/.exec(url);
  if (!m) return null;
  return { host: m[1], seg: m[2] ?? '' };
}

function lastSeg(path: string): string {
  const parts = path.split('/').filter(Boolean);
  return parts.length ? '/' + parts[parts.length - 1] : path;
}

// ---------------------------------------------------------- DNS zones ---

/** BIND-style zone subset: $ORIGIN, `name IN A ip`, `name IN CNAME target`. */
export function zoneFacts(text: string): string[] {
  const out: string[] = [];
  let origin = '';
  const fqdn = (n: string): string => {
    if (n.endsWith('.')) return n.slice(0, -1);
    return origin ? `${n}.${origin}` : n;
  };
  for (const raw of text.split('\n')) {
    const line = raw.replace(/;.*$/, '').trim();
    if (!line) continue;
    const om = /^\$ORIGIN\s+(\S+)/.exec(line);
    if (om) { origin = om[1].replace(/\.$/, ''); continue; }
    const am = /^(\S+)\s+IN\s+A\s+(\S+)/.exec(line);
    if (am) { out.push(`dns_a(${q(fqdn(am[1]))}, ${q(am[2])}).`); continue; }
    const cm = /^(\S+)\s+IN\s+CNAME\s+(\S+)/.exec(line);
    if (cm) out.push(`dns_cname(${q(fqdn(cm[1]))}, ${q(fqdn(cm[2]))}).`);
  }
  return out;
}

// ---------------------------------------------------------------- nginx ---

/** upstream blocks, server_name, location -> proxy_pass. */
export function nginxFacts(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/upstream\s+(\S+)\s*\{[^}]*server\s+([^:;\s]+):(\d+)/g)) {
    out.push(`nginx_upstream(${q(m[1])}, ${q(m[2])}, ${q(m[3])}).`);
  }
  for (const m of text.matchAll(/server_name\s+([^;]+);/g)) {
    for (const host of m[1].trim().split(/\s+/)) out.push(`nginx_server(${q(host)}).`);
  }
  for (const m of text.matchAll(/location\s+(\S+)\s*\{[^}]*proxy_pass\s+http:\/\/([^;/\s]+)/g)) {
    out.push(`nginx_route(${q(m[1])}, ${q(m[2])}).`);
  }
  return out;
}

// -------------------------------------------------- YAML subset parser ---

type Yaml = string | number | boolean | Yaml[] | { [k: string]: Yaml };

/** Minimal YAML: nested maps, block lists, scalars, quoted strings.
 *  No anchors, no flow collections, no multiline scalars. Enough for
 *  ordinary k8s manifests and docker-compose files. */
export function parseYamlDocs(text: string): Yaml[] {
  return text.split(/^---\s*$/m).map(parseYamlDoc).filter((d) => d !== null) as Yaml[];
}

function parseYamlDoc(doc: string): Yaml | null {
  const lines = doc.split('\n')
    .map((l) => l.replace(/\t/g, '  '))
    .filter((l) => l.trim() && !l.trim().startsWith('#'));
  if (lines.length === 0) return null;
  let pos = 0;

  function indentOf(line: string): number {
    return line.length - line.trimStart().length;
  }

  function scalar(s: string): Yaml {
    const t = s.trim();
    if (/^".*"$/.test(t) || /^'.*'$/.test(t)) return t.slice(1, -1);
    if (/^-?\d+$/.test(t)) return parseInt(t, 10);
    if (t === 'true') return true;
    if (t === 'false') return false;
    return t;
  }

  function block(indent: number): Yaml {
    const first = lines[pos].trim();
    return first.startsWith('- ') || first === '-' ? list(indent) : map(indent);
  }

  function map(indent: number): { [k: string]: Yaml } {
    const obj: { [k: string]: Yaml } = {};
    while (pos < lines.length) {
      const line = lines[pos];
      const ind = indentOf(line);
      if (ind < indent) break;
      if (ind > indent) throw new Error(`yaml: unexpected indent at: ${line}`);
      const t = line.trim();
      if (t.startsWith('- ')) break;
      const m = /^([^:]+):\s*(.*)$/.exec(t);
      if (!m) throw new Error(`yaml: expected key: at: ${line}`);
      pos++;
      if (m[2] !== '') obj[m[1].trim()] = scalar(m[2]);
      else if (pos < lines.length && indentOf(lines[pos]) > indent) obj[m[1].trim()] = block(indentOf(lines[pos]));
      else obj[m[1].trim()] = '';
    }
    return obj;
  }

  function list(indent: number): Yaml[] {
    const arr: Yaml[] = [];
    while (pos < lines.length) {
      const line = lines[pos];
      const ind = indentOf(line);
      if (ind < indent) break;
      const t = line.trim();
      if (!t.startsWith('-')) break;
      const rest = t.slice(1).trim();
      if (rest === '') { pos++; arr.push(block(ind + 2)); continue; }
      if (/^[^:]+:\s*/.test(rest) && !/^".*"$|^'.*'$/.test(rest)) {
        // list item opening an inline map: rewrite `- k: v` as `k: v` at ind+2
        lines[pos] = ' '.repeat(ind + 2) + rest;
        arr.push(map(ind + 2));
      } else {
        pos++;
        arr.push(scalar(rest));
      }
    }
    return arr;
  }

  return block(indentOf(lines[0]));
}

// ------------------------------------------------------- k8s manifests ---

function get(obj: Yaml, path: string[]): Yaml | undefined {
  let cur: Yaml | undefined = obj;
  for (const k of path) {
    if (cur === undefined || typeof cur !== 'object' || Array.isArray(cur)) return undefined;
    cur = (cur as { [k: string]: Yaml })[k];
  }
  return cur;
}

export function k8sFacts(text: string): string[] {
  const out: string[] = [];
  for (const doc of parseYamlDocs(text)) {
    const kind = get(doc, ['kind']);
    if (kind === 'Service') {
      const name = String(get(doc, ['metadata', 'name']) ?? '');
      const app = String(get(doc, ['spec', 'selector', 'app']) ?? '');
      const ports = get(doc, ['spec', 'ports']);
      const p0 = Array.isArray(ports) ? ports[0] : undefined;
      const port = String(get(p0 ?? {}, ['port']) ?? '');
      const target = String(get(p0 ?? {}, ['targetPort']) ?? port);
      out.push(`k8s_service(${q(name)}, ${q(port)}, ${q(target)}, ${q(app)}).`);
    } else if (kind === 'Deployment') {
      const name = String(get(doc, ['metadata', 'name']) ?? '');
      const app = String(get(doc, ['spec', 'template', 'metadata', 'labels', 'app']) ?? '');
      const containers = get(doc, ['spec', 'template', 'spec', 'containers']);
      const c0 = Array.isArray(containers) ? containers[0] : undefined;
      if (!c0) continue;
      const ports = get(c0, ['ports']);
      const cport = Array.isArray(ports) ? String(get(ports[0] ?? {}, ['containerPort']) ?? '') : '';
      out.push(`k8s_deployment(${q(name)}, ${q(app)}, ${q(cport)}).`);
      const env = get(c0, ['env']);
      if (Array.isArray(env)) {
        for (const e of env) {
          const v = String(get(e, ['value']) ?? '');
          const varName = String(get(e, ['name']) ?? '');
          out.push(`k8s_env(${q(name)}, ${q(varName)}, ${q(v)}).`);
          const u = splitUrl(v);
          if (u) out.push(`k8s_env_url(${q(name)}, ${q(varName)}, ${q(u.host)}, ${q(u.seg)}).`);
        }
      }
      const args = get(c0, ['args']);
      if (Array.isArray(args)) {
        for (const a of args) {
          const u = splitUrl(String(a));
          if (u) out.push(`call_url(${q(name)}, ${q(u.host)}, ${q(u.seg)}).`);
        }
      }
    }
  }
  return out;
}

// ------------------------------------------------- code (Node surface) ---

export function nodeFacts(text: string, svc: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/app\.listen\((\d+)/g)) {
    out.push(`svc_listen(${q(svc)}, ${q(m[1])}).`);
  }
  const calls = [...text.matchAll(/process\.env\.([A-Z_]+)\s*\+\s*'([^']*)'/g)];
  for (const m of calls) out.push(`svc_call_env(${q(svc)}, ${q(m[1])}, ${q(m[2])}).`);
  const schema = /const\s+\w*Payload\s*=\s*\{([^}]*)\}/.exec(text);
  if (schema && calls.length > 0) {
    const endpoint = lastSeg(calls[0][2]);
    for (const f of schema[1].matchAll(/(\w+)\s*:\s*'(\w+)'/g)) {
      out.push(`producer_field(${q(svc)}, ${q(endpoint)}, ${q(f[1])}, ${q(f[2])}).`);
    }
  }
  return out;
}

// --------------------------------------------------- code (Go surface) ---

const GO_TYPES: Record<string, string> = {
  string: 'string', int: 'number', int32: 'number', int64: 'number',
  float32: 'number', float64: 'number', bool: 'bool',
};

export function goFacts(text: string, svc: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/ListenAndServe\(":(\d+)"/g)) {
    out.push(`svc_listen(${q(svc)}, ${q(m[1])}).`);
  }
  const handled = [...text.matchAll(/HandleFunc\("([^"]+)"/g)].map((m) => m[1]);
  for (const h of handled) out.push(`svc_handles(${q(svc)}, ${q(h)}).`);
  const endpoint = handled.length ? lastSeg(handled[0]) : null;
  if (endpoint) {
    for (const f of text.matchAll(/\w+\s+(\w+)\s+`json:"(\w+)"`/g)) {
      const t = GO_TYPES[f[1]] ?? f[1];
      out.push(`consumer_field(${q(svc)}, ${q(endpoint)}, ${q(f[2])}, ${q(t)}).`);
    }
  }
  return out;
}

/**
 * Extração de dados Next.js — port de keiyoushi/utils/NextJs.kt (Apache 2.0).
 *
 * Usado pelo tema Aurora: as páginas do site embutem os dados (lista de
 * séries, capítulos, páginas) no flight data do App Router
 * (`self.__next_f.push`) ou no `__NEXT_DATA__` do Pages Router. O flight
 * bruto usa referências React (`$<id>`, `$L<id>`, `$Q<id>`, …) que são
 * resolvidas contra os chunks/modelos extraídos do próprio stream.
 */

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

type Decoder<T> = (element: Json) => T | null;

const NEXT_F_REGEX = /self\.__next_f\.push\(\s*(\[[\s\S]*])\s*\)\s*;?\s*$/;
const SCRIPT_REGEX = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const SRC_ATTR_REGEX = /\bsrc\s*=/i;
const HEX_ID_REGEX = /^[0-9a-fA-F]+$/;

function isObject(value: Json): value is { [key: string]: Json } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function base64ToBytes(value: string): Uint8Array | null {
  try {
    const normalized = value.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

/** Concatena os pushes do App Router (tipo 1 = texto, tipo 3 = binário). */
function joinFlightStream(html: string): string {
  const decoder = new TextDecoder('utf-8');
  const parts: string[] = [];
  SCRIPT_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SCRIPT_REGEX.exec(html))) {
    const attrs = match[1] ?? '';
    if (SRC_ATTR_REGEX.test(attrs)) continue;
    const data = match[2] ?? '';
    if (!data.includes('self.__next_f.push')) continue;
    const push = data.match(NEXT_F_REGEX);
    if (!push) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(push[1]);
    } catch {
      continue;
    }
    if (!Array.isArray(parsed)) continue;
    const kind = parsed[0];
    const content = parsed[1];
    if (typeof content !== 'string') continue;
    if (kind === 1) parts.push(content);
    else if (kind === 3) {
      const bytes = base64ToBytes(content);
      if (bytes) parts.push(decoder.decode(bytes));
    }
  }
  return parts.join('');
}

/** Port de parseJsonAt: JSON delimitado por profundidade de chaves. */
function parseJsonAt(body: string, start: number): { element: Json | null; end: number } {
  if (start >= body.length) return { element: null, end: start };

  let depth = 0;
  let inString = false;
  let escape = false;
  let i = start;

  while (i < body.length) {
    const char = body[i++];
    if (escape) {
      escape = false;
      continue;
    }
    if (char === '\\' && inString) {
      escape = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === '{' || char === '[') depth++;
    else if (char === '}' || char === ']') {
      if (--depth === 0) {
        try {
          return { element: JSON.parse(body.slice(start, i)) as Json, end: i };
        } catch {
          return { element: null, end: i };
        }
      }
    }
    if (depth === 0 && /\s/.test(char)) {
      try {
        return { element: JSON.parse(body.slice(start, i - 1)) as Json, end: i };
      } catch {
        return { element: null, end: i };
      }
    }
  }
  return { element: null, end: i };
}

interface FlightCaches {
  chunkCache: Map<string, string>;
  modelCache: Map<string, Json>;
}

/** Port de extractRscPayloads: linhas `<hex>:` do stream React Flight. */
function extractRscPayloads(body: string, caches: FlightCaches): Json[] {
  const results: Json[] = [];
  let pos = 0;

  while (pos < body.length) {
    const colonIdx = body.indexOf(':', pos);
    if (colonIdx === -1) break;

    const id = body.slice(pos, colonIdx);
    if (!id.length || !HEX_ID_REGEX.test(id)) {
      pos++;
      continue;
    }

    pos = colonIdx + 1;
    if (pos >= body.length) break;

    if (body[pos] === 'T') {
      // Chunk binário: T<hexLen>,<conteúdo> — hexLen é o tamanho em bytes UTF-8
      pos++;
      const commaIdx = body.indexOf(',', pos);
      if (commaIdx === -1) break;
      const byteLen = parseInt(body.slice(pos, commaIdx), 16);
      if (!Number.isFinite(byteLen)) break;
      pos = commaIdx + 1;

      let bytes = 0;
      const start = pos;
      while (pos < body.length && bytes < byteLen) {
        const code = body.charCodeAt(pos);
        if (code < 0x80) bytes += 1;
        else if (code < 0x800) bytes += 2;
        else if (code >= 0xd800 && code <= 0xdbff) {
          bytes += 4;
          pos++;
        } else bytes += 3;
        pos++;
      }

      const chunkContent = body.slice(start, pos);
      caches.chunkCache.set(id, chunkContent);
      try {
        results.push(JSON.parse(chunkContent) as Json);
      } catch {
        /* chunk não é JSON */
      }
    } else {
      const { element, end } = parseJsonAt(body, pos);
      if (element !== null) {
        results.push(element);
        caches.modelCache.set(id, element);
      }
      pos = end;
    }
  }

  return results;
}

function walkRefSegment(value: Json, segment: string): Json | undefined {
  if (Array.isArray(value)) {
    if (value.length >= 4 && value[0] === '$') {
      if (segment === 'type') return value[1];
      if (segment === 'key') return value[2];
      if (segment === 'props') return value[3];
    }
    const index = Number(segment);
    return Number.isInteger(index) ? value[index] : undefined;
  }
  if (isObject(value)) return value[segment];
  return undefined;
}

function resolveMapRef(id: string, caches: FlightCaches, resolving: Set<string>): Json | null {
  if (resolving.has(id)) return null;
  const entries = caches.modelCache.get(id);
  if (!Array.isArray(entries)) return null;
  const resolved = resolveFlightRefs(entries, caches, new Set([...resolving, id]));
  if (!Array.isArray(resolved)) return null;
  const out: { [key: string]: Json } = {};
  for (const entry of resolved) {
    if (!Array.isArray(entry) || entry.length !== 2) continue;
    const key = entry[0];
    const keyText =
      typeof key === 'string'
        ? key
        : typeof key === 'number' || typeof key === 'boolean'
          ? String(key)
          : JSON.stringify(key);
    out[keyText] = entry[1];
  }
  return out;
}

function resolveSetRef(id: string, caches: FlightCaches, resolving: Set<string>): Json | null {
  if (resolving.has(id)) return null;
  const values = caches.modelCache.get(id);
  if (!Array.isArray(values)) return null;
  return resolveFlightRefs(values, caches, new Set([...resolving, id]));
}

function resolveModelRef(
  reference: string,
  caches: FlightCaches,
  resolving: Set<string>,
): Json | null {
  const segments = reference.split(':');
  const id = segments[0];
  if (segments.length === 1) {
    const chunk = caches.chunkCache.get(id);
    if (chunk !== undefined) return chunk;
  }
  if (resolving.has(id)) return null;
  const guard = new Set([...resolving, id]);

  let value: Json | undefined = caches.modelCache.get(id);
  if (value === undefined) return null;

  for (let i = 1; i < segments.length; i++) {
    if (typeof value === 'string' && value.startsWith('$')) {
      const resolved = resolveFlightRefs(value, caches, guard);
      if (resolved === null) return null;
      value = resolved;
    }
    const next = walkRefSegment(value, segments[i]);
    if (next === undefined) return null;
    value = next;
  }
  return resolveFlightRefs(value, caches, guard);
}

/** Resolve as referências React Flight (`$…`) de forma recursiva. */
function resolveFlightRefs(element: Json, caches: FlightCaches, resolving = new Set<string>()): Json {
  if (Array.isArray(element)) return element.map((child) => resolveFlightRefs(child, caches, resolving));
  if (isObject(element)) {
    const out: { [key: string]: Json } = {};
    for (const [key, value] of Object.entries(element)) out[key] = resolveFlightRefs(value, caches, resolving);
    return out;
  }
  if (typeof element !== 'string' || !element.startsWith('$') || element.length < 2) return element;

  const ref = element;
  if (ref === '$undefined') return null;
  if (ref === '$Infinity' || ref === '$-Infinity' || ref === '$NaN' || ref === '$-0') return ref.slice(1);
  switch (ref[1]) {
    case '$':
      return ref.slice(1);
    case 'D':
      return ref.slice(2);
    case 'n':
      return ref.slice(2);
    case 'Q':
      return resolveMapRef(ref.slice(2), caches, resolving) ?? element;
    case 'W':
      return resolveSetRef(ref.slice(2), caches, resolving) ?? element;
    case 'L':
    case '@':
      return resolveModelRef(ref.slice(2), caches, resolving) ?? element;
    default:
      return resolveModelRef(ref.slice(1), caches, resolving) ?? element;
  }
}

/** Percorre a árvore em busca do primeiro elemento que o decoder aceita. */
function findValue<T>(payload: Json, decode: Decoder<T>): T | null {
  if (payload === null || typeof payload !== 'object') return null;
  const decoded = decode(payload);
  if (decoded !== null) return decoded;
  const children: Json[] = Array.isArray(payload) ? payload : Object.values(payload);
  for (const child of children) {
    const found = findValue(child, decode);
    if (found !== null) return found;
  }
  return null;
}

function makeCaches(): FlightCaches {
  return { chunkCache: new Map<string, string>(), modelCache: new Map<string, Json>() };
}

/** Extrai payloads do HTML (App Router, com fallback para Pages Router). */
function htmlPayloads(html: string): { payloads: Json[]; caches: FlightCaches } {
  const caches = makeCaches();
  const stream = joinFlightStream(html);
  const payloads = stream ? extractRscPayloads(stream, caches) : [];
  if (!payloads.length) {
    const nextData = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
    if (nextData) {
      try {
        const root = JSON.parse(nextData[1]) as Json;
        if (isObject(root)) {
          const props = root.props;
          if (isObject(props) && props.pageProps !== undefined) payloads.push(props.pageProps);
          payloads.push(root);
        }
      } catch {
        /* JSON inválido */
      }
    }
  }
  return { payloads, caches };
}

/** Extrai o primeiro elemento do flight data de um HTML (Document.extractNextJs). */
export function extractNextJs<T>(html: string, decode: Decoder<T>): T | null {
  const { payloads, caches } = htmlPayloads(html);
  for (const payload of payloads) {
    const found = findValue(resolveFlightRefs(payload, caches), decode);
    if (found !== null) return found;
  }
  return null;
}

/**
 * Extrai de uma resposta RSC pura (`text/x-component`, com rsc=1)
 * (String.extractNextJsRsc). Aceita também HTML, detectando pelo início.
 */
export function extractNextJsAuto<T>(text: string, decode: Decoder<T>): T | null {
  if (text.trimStart().startsWith('<')) return extractNextJs(text, decode);
  const caches = makeCaches();
  for (const payload of extractRscPayloads(text, caches)) {
    const found = findValue(resolveFlightRefs(payload, caches), decode);
    if (found !== null) return found;
  }
  return null;
}

/**
 * Tema Madara (WordPress wp-manga) — port TS de
 * keiyoushi/extensions-source/lib-multisrc/madara (Apache 2.0).
 *
 * Cobre as extensões PT-BR que estendem Madara/MadaraNoAjax:
 * - listas via admin-ajax.php (madara_load_more) ou páginas de arquivo HTML
 * - detalhes/capítulos/páginas com os seletores do tema
 * - "WP Manga Protector" (capítulos protegidos com AES) descriptografado
 *
 * O jsoup usa seletores como `:contains(Status)` que não existem em CSS —
 * queryJsoup() traduz isso para filtro de texto + combinator relativo.
 */

import type {
  Chapter,
  MangaDetails,
  MangaPage,
  MangaSource,
  MangaStatus,
  MangasPage,
  MangaSummary,
} from '../../../types';
import { extGet, extImage, extPost, ExtError } from '../http';

// ── Configuração por site ────────────────────────────────────────────────────

export type ChapterMode =
  | 'MangaPage'
  | 'AdminAjax'
  | 'MangaAjax'
  | 'MangaAjaxPaginated'
  | 'MangaAjaxQuery';

export interface MadaraConfig {
  /** ID estável da fonte (keiyoushi-pt-<pkg>) */
  id: string;
  name: string;
  baseUrl: string;
  /** true = MadaraNoAjax (listas em HTML de arquivo) */
  noAjax?: boolean;
  mangaSubString?: string;
  chapterMode?: ChapterMode;
  supportsPostId?: boolean;
  pageSize?: number;
  ajaxTemplate?: string;
  genreDirectory?: string;
  chapterDateFormat?: string;
  chapterDateSelector?: string;
  chapterListSelector?: string;
  chapterNameSelector?: string;
  archiveSelector?: string;
  archiveUrlSelector?: string;
  searchCardSelector?: string;
  filterGenresSelector?: string;
  seriesTypeSelector?: string;
  altNameSelector?: string;
  orderQueryParameter?: string;
  searchQueryParameter?: string;
  nextPageSelector?: string;
  mangaDetailsSelectorTitle?: string;
  mangaDetailsSelectorAuthor?: string;
  mangaDetailsSelectorArtist?: string;
  mangaDetailsSelectorStatus?: string;
  mangaDetailsSelectorDescription?: string;
  mangaDetailsSelectorThumbnail?: string;
  mangaDetailsSelectorGenre?: string;
  mangaDetailsSelectorTag?: string;
  /** Hunters Scan: páginas em <canvas class="protected-chapter-canvas"> */
  pagesCanvas?: boolean;
  /** PortalYaoi (antigo): URL de imagem em atributo data-obf (base64 invertido) */
  imageObfuscation?: 'reverse-b64' | 'content-node-xor';
  /** Site redireciona para wp-login.php em conteúdo restrito */
  loginWall?: boolean;
  /** Site usa ?password-protected= nas páginas de capítulo */
  passwordProtected?: boolean;
}

const DEFAULTS = {
  mangaSubString: 'manga',
  chapterMode: 'MangaPage' as ChapterMode,
  supportsPostId: true,
  pageSize: 25,
  ajaxTemplate: 'madara-core/content/content-archive',
  genreDirectory: 'manga-genre',
  chapterDateFormat: 'MMMM d, yyyy',
  chapterDateSelector: 'span.chapter-release-date',
  chapterListSelector: 'li.wp-manga-chapter',
  archiveSelector: 'div.page-item-detail, .manga__item, .c-tabs-item__content',
  archiveUrlSelector: '.post-title a',
  searchCardSelector: '.c-tabs-item__content',
  seriesTypeSelector: '.post-content_item:contains(Type) .summary-content',
  altNameSelector: '.post-content_item:contains(Alt) .summary-content',
  orderQueryParameter: 'm_orderby',
  searchQueryParameter: 's',
  nextPageSelector: 'div.nav-previous, a.nextpostslink, #navigation-ajax',
  mangaDetailsSelectorTitle: 'div.post-title h3, div.post-title h1, #manga-title > h1',
  mangaDetailsSelectorAuthor: 'div.author-content > a, div.manga-authors > a',
  mangaDetailsSelectorArtist: 'div.artist-content > a',
  mangaDetailsSelectorStatus: 'div.summary-content, div.summary-heading:contains(Status) + div',
  mangaDetailsSelectorDescription:
    'div.description-summary div.summary__content, div.summary_content div.post-content_item > h5 + div, div.summary_content div.manga-excerpt',
  mangaDetailsSelectorThumbnail: 'div.summary_image img',
  mangaDetailsSelectorGenre: 'div.genres-content a',
  mangaDetailsSelectorTag: 'div.tags-content a',
};

// ── IDs opacos (paths com "/" quebrariam rotas da UI) ────────────────────────

function bytesToB64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), '='));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function encodeId(raw: string): string {
  return bytesToB64url(new TextEncoder().encode(raw));
}

export function decodeId(id: string): string {
  return new TextDecoder().decode(b64urlToBytes(id));
}

// ── MD5 (para o WP Manga Protector; WebCrypto não tem MD5) ───────────────────

/* eslint-disable no-bitwise */
const MD5_K = new Uint32Array([
  0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
  0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
  0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
  0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
  0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
  0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
  0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
  0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
]);
const MD5_S = new Uint32Array([
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
]);

function md5(bytes: Uint8Array): Uint8Array {
  const bitLen = bytes.length * 8;
  const padded = new Uint8Array((((bytes.length + 8) >> 6) + 1) * 64);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, bitLen >>> 0, true);
  view.setUint32(padded.length - 4, Math.floor(bitLen / 0x100000000), true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  for (let offset = 0; offset < padded.length; offset += 64) {
    const m = new Uint32Array(16);
    for (let i = 0; i < 16; i++) m[i] = view.getUint32(offset + i * 4, true);
    let [a, b, c, d] = [a0, b0, c0, d0];
    for (let i = 0; i < 64; i++) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }
      const tmp = d;
      d = c;
      c = b;
      b = (b + (((a + f + MD5_K[i] + m[g]) << MD5_S[i]) | ((a + f + MD5_K[i] + m[g]) >>> (32 - MD5_S[i])))) >>> 0;
      a = tmp;
    }
    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }

  const out = new Uint8Array(16);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, a0, true);
  outView.setUint32(4, b0, true);
  outView.setUint32(8, c0, true);
  outView.setUint32(12, d0, true);
  return out;
}
/* eslint-enable no-bitwise */

/**
 * MD5 de uma string em hex minúsculo — usado por fontes com URL assinada
 * (ex.: ManGeek: key = md5("M<...#MANG33K>D").toHexString()).
 */
export function md5HexString(value: string): string {
  const digest = md5(new TextEncoder().encode(value));
  let hex = '';
  for (const byte of digest) hex += byte.toString(16).padStart(2, '0');
  return hex;
}

function utf8Bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * PortalYaoi (redesign 2026, plugin lbl-shield): URL de imagem em
 * data-content-node = base64 invertido, XOR com chave que o site ROTACIONA
 * por página (script inline #lbl-shield-decrypt). Port daquele script.
 */
function decryptContentNode(obfuscated: string, key: string): string | null {
  try {
    const reversed = obfuscated.split('').reverse().join('');
    const raw = base64ToBytes(reversed);
    let out = '';
    for (let i = 0; i < raw.length; i++) {
      out += String.fromCharCode(raw[i] ^ key.charCodeAt(i % key.length));
    }
    return out.startsWith('http') ? out : null;
  } catch {
    return null;
  }
}

/** Extrai a chave XOR vigente do script inline do site (atob fixo → hex). */
function extractContentNodeKey(doc: Document): string | null {
  const script = selectFirst(doc, 'script#lbl-shield-decrypt');
  const source = script?.textContent || '';
  const match = /atob\("([A-Za-z0-9+/=]+)"\)/.exec(source);
  if (!match) return null;
  try {
    const key = new TextDecoder().decode(base64ToBytes(match[1]));
    return key.length ? key : null;
  } catch {
    return null;
  }
}

/** Descriptografa chapter_data do WP Manga Protector (AES-256-CBC + KDF MD5). */
async function decryptChapterData(encryptedJson: string, password: string): Promise<string[]> {
  const data = JSON.parse(encryptedJson) as { salt?: string; ciphertext?: string };
  if (!data.salt || !data.ciphertext) throw new ExtError('Capítulo protegido com formato desconhecido.', 'parsing');

  const salt = base64ToBytes(data.salt);
  const passwordBytes = utf8Bytes(password);
  const keyAndIvParts: Uint8Array[] = [];
  let previous = new Uint8Array(0);
  let total = 0;
  while (total < 48) {
    previous = md5(concatBytes(previous, passwordBytes, salt));
    keyAndIvParts.push(previous);
    total += previous.length;
  }
  const keyAndIv = concatBytes(...keyAndIvParts);

  const key = await crypto.subtle.importKey('raw', keyAndIv.slice(0, 32), { name: 'AES-CBC' }, false, ['decrypt']);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-CBC', iv: keyAndIv.slice(32, 48) },
    key,
    base64ToBytes(data.ciphertext),
  );
  const raw = JSON.parse(new TextDecoder().decode(plain));
  if (!Array.isArray(raw)) throw new ExtError('Capítulo protegido com formato desconhecido.', 'parsing');
  return raw.map((url) => String(url));
}

// ── Datas ────────────────────────────────────────────────────────────────────

const MONTHS: Record<string, number> = {};
const MONTH_NAMES_EN = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];
const MONTH_NAMES_PT = [
  'janeiro', 'fevereiro', 'março', 'marco', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];
const MONTH_NAMES_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
[...MONTH_NAMES_EN, ...MONTH_NAMES_PT, ...MONTH_NAMES_ES].forEach((name, index) => {
  MONTHS[name] = index % 12;
});
// "set"/"out" abreviaturas PT
MONTH_NAMES_PT.forEach((name, index) => {
  MONTHS[name.slice(0, 3)] = index;
});

const UNIT_WORDS: Record<string, number> = {
  year: 365 * 24 * 3600e3, years: 365 * 24 * 3600e3, año: 365 * 24 * 3600e3, anos: 365 * 24 * 3600e3, ano: 365 * 24 * 3600e3,
  month: 30 * 24 * 3600e3, months: 30 * 24 * 3600e3, mês: 30 * 24 * 3600e3, mes: 30 * 24 * 3600e3, meses: 30 * 24 * 3600e3,
  week: 7 * 24 * 3600e3, weeks: 7 * 24 * 3600e3, semana: 7 * 24 * 3600e3, semanas: 7 * 24 * 3600e3,
  day: 24 * 3600e3, days: 24 * 3600e3, dia: 24 * 3600e3, dias: 24 * 3600e3, día: 24 * 3600e3,
  hour: 3600e3, hours: 3600e3, hora: 3600e3, horas: 3600e3,
  minute: 60e3, minutes: 60e3, minuto: 60e3, minutos: 60e3, min: 60e3,
  second: 1e3, seconds: 1e3, segundo: 1e3, segundos: 1e3,
};

function parseByPattern(value: string, pattern: string): number | null {
  // Tokeniza o padrão (yyyy, MMMM, MM, dd, d, 'literal', demais literais)
  const tokens: Array<{ kind: 'literal' | 'year' | 'monthName' | 'month' | 'day'; text?: string }> = [];
  for (let i = 0; i < pattern.length; ) {
    const rest = pattern.slice(i);
    if (rest.startsWith('yyyy')) {
      tokens.push({ kind: 'year' });
      i += 4;
    } else if (rest.startsWith('yy')) {
      tokens.push({ kind: 'year' });
      i += 2;
    } else if (rest.startsWith('MMMM')) {
      tokens.push({ kind: 'monthName' });
      i += 4;
    } else if (rest.startsWith('MMM')) {
      tokens.push({ kind: 'monthName' });
      i += 3;
    } else if (rest.startsWith('MM')) {
      tokens.push({ kind: 'month' });
      i += 2;
    } else if (rest.startsWith('dd')) {
      tokens.push({ kind: 'day' });
      i += 2;
    } else if (pattern[i] === "'") {
      const end = pattern.indexOf("'", i + 1);
      const stop = end === -1 ? pattern.length : end;
      tokens.push({ kind: 'literal', text: pattern.slice(i + 1, stop) });
      i = stop + 1;
    } else if (rest.startsWith('d') || rest.startsWith('M')) {
      tokens.push({ kind: rest[0] === 'd' ? 'day' : 'month' });
      i += 1;
    } else {
      const last = tokens[tokens.length - 1];
      if (last && last.kind === 'literal') last.text += pattern[i];
      else tokens.push({ kind: 'literal', text: pattern[i] });
      i += 1;
    }
  }

  let regexSource = '';
  const groups: Array<'year' | 'monthName' | 'month' | 'day'> = [];
  for (const token of tokens) {
    if (token.kind === 'literal') {
      regexSource += (token.text ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    } else if (token.kind === 'year') {
      regexSource += '(\\d{4})';
      groups.push('year');
    } else if (token.kind === 'monthName') {
      regexSource += '([A-Za-zÀ-ÿ]+)';
      groups.push('monthName');
    } else if (token.kind === 'month') {
      regexSource += '(\\d{1,2})';
      groups.push('month');
    } else {
      regexSource += '(\\d{1,2})';
      groups.push('day');
    }
  }

  const match = value.trim().match(new RegExp(`^${regexSource}$`, 'i'));
  if (!match) return null;

  let year = 1970;
  let month = 0;
  let day = 1;
  groups.forEach((group, index) => {
    const raw = match[index + 1];
    if (group === 'year') year = parseInt(raw, 10);
    else if (group === 'month') month = Math.max(0, parseInt(raw, 10) - 1);
    else if (group === 'day') day = parseInt(raw, 10);
    else {
      const name = raw.toLowerCase();
      const found = Object.keys(MONTHS).find((key) => name.startsWith(key.slice(0, 3)) && name.includes(key.slice(0, 3)));
      const byPrefix = MONTHS[name] ?? (found !== undefined ? MONTHS[found] : undefined);
      if (byPrefix !== undefined) month = byPrefix;
    }
  });
  if (year < 100) year += 2000;
  const date = new Date(Date.UTC(year, month, day));
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

const FALLBACK_PATTERNS = [
  'dd/MM/yyyy', 'dd.MM.yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd', 'MMMM d, yyyy',
  'MMMM dd, yyyy', 'd MMMM yyyy', 'dd MMM yyyy', 'dd/MM/yy',
];

function startOfUtcDay(offsetDays: number): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offsetDays);
}

/** Port de MadaraBase.parseChapterDate (sem os duais árabes — irrelevantes em PT). */
export function parseChapterDate(date: string | null | undefined, pattern: string): number | undefined {
  if (!date) return undefined;
  const value = date.trim();
  if (!value) return undefined;

  const normalized = value.toLowerCase();
  if (/^(today|hoje|hoy)\b/.test(normalized)) return startOfUtcDay(0);
  if (/^(yesterday|ontem|ayer)\b/.test(normalized)) return startOfUtcDay(-1);

  const relative = normalized.match(
    /(\d+(?:[.,]\d+)?)\s*(years?|años?|anos?|ano|months?|m[êe]s|mes|meses|weeks?|semanas?|days?|dias?|día|hours?|horas?|minutes?|minutos?|min|seconds?|segundos?|segundo)\b/,
  );
  if (relative) {
    const amount = parseFloat(relative[1].replace(',', '.'));
    const unit = UNIT_WORDS[relative[2]];
    if (unit && Number.isFinite(amount)) return Date.now() - amount * unit;
  }

  const fromPattern = parseByPattern(value, pattern);
  if (fromPattern !== null) return fromPattern;
  for (const fallback of FALLBACK_PATTERNS) {
    const parsed = parseByPattern(value, fallback);
    if (parsed !== null) return parsed;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    const iso = Date.parse(value);
    if (!Number.isNaN(iso)) return iso;
  }
  return undefined;
}

// ── Status ───────────────────────────────────────────────────────────────────

const COMPLETED_WORDS = [
  'completed', 'completo', 'completado', 'completa', 'concluído', 'concluido', 'finalizado', 'finish',
];
const ONGOING_WORDS = [
  'ongoing', 'on going', 'updating', 'em lançamento', 'em lancamento', 'em andamento', 'ativo',
  'lançando', 'lancando', 'em curso', 'em exibição', 'em exibicao', 'publicandose', 'publicándose',
];
const HIATUS_WORDS = ['on hold', 'hiatus', 'pausado', 'em espera'];
const CANCELLED_WORDS = ['canceled', 'cancelled', 'cancelado', 'cancelada'];

export function toStatus(text: string): MangaStatus {
  const lower = text.toLowerCase();
  if (COMPLETED_WORDS.some((word) => lower.includes(word))) return 'completed';
  if (ONGOING_WORDS.some((word) => lower.includes(word))) return 'ongoing';
  if (HIATUS_WORDS.some((word) => lower.includes(word))) return 'on_hiatus';
  if (CANCELLED_WORDS.some((word) => lower.includes(word))) return 'cancelled';
  return 'unknown';
}

// ── Helpers de HTML (jsoup → DOM) ────────────────────────────────────────────

function splitSelectorList(selector: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of selector) {
    if (char === '(') depth++;
    if (char === ')') depth--;
    if (char === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

/**
 * jsoup aceita valores de atributo não-aspados com espaços (`[title=Abrir
 * galeria]`); o CSS estrito do navegador rejeita. Aspas o valor quando preciso.
 */
export function quoteAttrValues(selector: string): string {
  return selector.replace(
    /\[([^\s~|^$*=\]]+)([*|^$~]?=)(?!\s*["'])([^\]"']*)\]/g,
    (_match, name: string, op: string, value: string) =>
      `[${name}${op}"${value.trim().replace(/"/g, '\\"')}"]`,
  );
}

function safeQueryAll(root: ParentNode, selector: string): Element[] {
  try {
    return Array.from(root.querySelectorAll(quoteAttrValues(selector)));
  } catch {
    console.warn('[Madara] seletor CSS inválido:', selector);
    return [];
  }
}

/**
 * select() do jsoup: entende `:contains(texto)` (não existe em CSS)
 * filtrando por texto e aplicando o resto do seletor relativamente.
 */
export function queryJsoup(root: ParentNode, selector: string): Element[] {
  const seen = new Set<Element>();
  const out: Element[] = [];
  for (const part of splitSelectorList(selector)) {
    let matches: Element[];
    const containsIndex = part.indexOf(':contains(');
    if (containsIndex === -1) {
      matches = safeQueryAll(root, part);
    } else {
      const open = part.indexOf('(', containsIndex);
      let depth = 0;
      let close = -1;
      for (let i = open; i < part.length; i++) {
        if (part[i] === '(') depth++;
        else if (part[i] === ')') {
          depth--;
          if (depth === 0) {
            close = i;
            break;
          }
        }
      }
      if (close === -1) continue;
      const before = part.slice(0, containsIndex).trim();
      const text = part.slice(open + 1, close);
      const after = part.slice(close + 1).trim();
      const candidates = safeQueryAll(root, before || ':scope');
      // jsoup: :contains é case-insensitive e normaliza whitespace (Evaluator.ContainsText)
      const needle = text.replace(/\s+/g, ' ').toLowerCase();
      const filtered = candidates.filter((el) =>
        (el.textContent || '').replace(/\s+/g, ' ').toLowerCase().includes(needle),
      );
      if (!after) {
        matches = filtered;
      } else if (after[0] === '+' || after[0] === '~') {
        // irmãos: querySelectorAll não retorna irmãos, então navegamos manualmente
        const rest = after.slice(1).trim();
        matches = filtered.flatMap((el) => {
          const siblings: Element[] = [];
          if (after[0] === '+') {
            const next = el.nextElementSibling;
            if (next) siblings.push(next);
          } else {
            for (let sib = el.nextElementSibling; sib; sib = sib.nextElementSibling) {
              siblings.push(sib);
            }
          }
          return siblings.filter((sib) => {
            try {
              return rest ? sib.matches(quoteAttrValues(rest)) : true;
            } catch {
              return false;
            }
          });
        });
      } else {
        const relative = after[0] === '>' ? `:scope ${after}` : after;
        matches = filtered.flatMap((el) => safeQueryAll(el, relative));
      }
    }
    for (const el of matches) {
      if (!seen.has(el)) {
        seen.add(el);
        out.push(el);
      }
    }
  }
  // ordem do documento (como o select() do jsoup)
  out.sort((a, b) => {
    if (a === b) return 0;
    return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  });
  return out;
}

export function selectFirst(root: ParentNode, selector: string): Element | null {
  return queryJsoup(root, selector)[0] ?? null;
}

/** Lowercase + sem acento — comparação de gêneros (pt/en) nas fontes. */
export function normalizeGenre(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function ownText(el: Element): string {
  let text = '';
  el.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) text += node.textContent;
  });
  text = text.trim();
  return text || (el.textContent || '').trim();
}

export function eachText(root: ParentNode, selector: string): string[] {
  return queryJsoup(root, selector)
    .map((el) => (el.textContent || '').trim())
    .filter(Boolean);
}

export function absUrl(value: string | null | undefined, base: string): string | null {
  if (!value) return null;
  try {
    return new URL(value, base).toString();
  } catch {
    return null;
  }
}

function srcsetImage(url: string | null): string | null {
  if (!url) return null;
  const images = url
    .split(',')
    .map((entry) => entry.trim().split(/\s+/, 2))
    .filter((parts) => parts[0] && /^https?:\/\//.test(parts[0]));
  if (!images.length) return null;
  const withDescriptor = images
    .map((parts) => ({ url: parts[0], size: parts[1] ? parseFloat(parts[1]) : NaN }))
    .filter((entry) => Number.isFinite(entry.size));
  if (withDescriptor.length) {
    return withDescriptor.reduce((best, entry) => (entry.size > best.size ? entry : best)).url;
  }
  return images[0][0];
}

/** Port de MadaraBase.imageFromElement — lazy-load e variants. */
export function imageFromElement(element: Element, base: string): string | null {
  const attr =
    ['data-src', 'data-lazy-src', 'data-lzl-src', 'data-cfsrc', 'data-manga-src'].find((name) => element.hasAttribute(name)) ||
    null;
  if (attr) return absUrl(element.getAttribute(attr), base);
  const srcset = element.getAttribute('srcset');
  if (srcset) return absUrl(srcsetImage(srcset), base);
  return absUrl(element.getAttribute('src'), base);
}

function parseNumberFromName(name: string): number {
  const match = name.match(/\d+(?:\.\d+)?/);
  return match ? parseFloat(match[0]) : 0;
}

/** "Capítulo 12 – Arco final" → { number: 12, title: "Arco final" }. */
export function splitChapterName(name: string): { number: number; title?: string } {
  const number = parseNumberFromName(name);
  const title = name
    .replace(/^\s*(?:cap[ií]tulo|cap|chapter|ep(?:isode)?|ch)?\s*#?\s*\d+(?:\.\d+)?\s*[:.\-–—]?\s*/i, '')
    .trim();
  return { number, title: title || undefined };
}

// ── Motor ────────────────────────────────────────────────────────────────────

interface ResolvedConfig extends MadaraConfig {
  mangaSubString: string;
  chapterMode: ChapterMode;
  supportsPostId: boolean;
  pageSize: number;
  ajaxTemplate: string;
  genreDirectory: string;
  chapterDateFormat: string;
  chapterDateSelector: string;
  chapterListSelector: string;
  archiveSelector: string;
  archiveUrlSelector: string;
  searchCardSelector: string;
  seriesTypeSelector: string;
  altNameSelector: string;
  orderQueryParameter: string;
  searchQueryParameter: string;
  nextPageSelector: string;
  mangaDetailsSelectorTitle: string;
  mangaDetailsSelectorAuthor: string;
  mangaDetailsSelectorArtist: string;
  mangaDetailsSelectorStatus: string;
  mangaDetailsSelectorDescription: string;
  mangaDetailsSelectorThumbnail: string;
  mangaDetailsSelectorGenre: string;
  mangaDetailsSelectorTag: string;
}

function resolveConfig(config: MadaraConfig): ResolvedConfig {
  return { ...DEFAULTS, ...config, chapterMode: config.chapterMode ?? DEFAULTS.chapterMode };
}

export abstract class MadaraBaseSource implements MangaSource {
  readonly id: string;
  readonly name: string;
  readonly lang = 'pt-br';
  readonly baseUrl: string;
  readonly supportsLatest = true;
  /** Só habilitada quando o usuário escolhe na Loja */
  readonly defaultEnabled = false;
  readonly family = 'keiyoushi';

  protected readonly cfg: ResolvedConfig;

  constructor(config: MadaraConfig) {
    this.cfg = resolveConfig(config);
    this.id = config.id;
    this.name = config.name;
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
  }

  // ── Listas (filhos definem) ───────────────────────────────────────────────
  abstract getPopular(page: number): Promise<MangasPage>;
  abstract getLatest(page: number): Promise<MangasPage>;
  abstract search(page: number, query: string): Promise<MangasPage>;

  // ── Detalhes ──────────────────────────────────────────────────────────────

  async getMangaDetails(id: string): Promise<MangaDetails | null> {
    const path = decodeId(id);
    const url = absUrl(path, `${this.baseUrl}/`) || `${this.baseUrl}/`;
    const html = await extGet(url);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    if (!selectFirst(doc, this.cfg.mangaDetailsSelectorTitle)) return null;
    return this.parseDetails(doc, path);
  }

  protected parseDetails(doc: Document, path: string): MangaDetails {
    const cfg = this.cfg;
    const base = absUrl(path, `${this.baseUrl}/`) || `${this.baseUrl}/`;

    const titleEl = selectFirst(doc, cfg.mangaDetailsSelectorTitle);
    const title = titleEl ? ownText(titleEl) : '';

    const authors = eachText(doc, cfg.mangaDetailsSelectorAuthor).filter((text) => !/updating|atualizando/i.test(text));
    const artists = eachText(doc, cfg.mangaDetailsSelectorArtist).filter((text) => !/updating|atualizando/i.test(text));

    let description: string | undefined;
    const descEl = selectFirst(doc, cfg.mangaDetailsSelectorDescription);
    if (descEl) {
      const paragraphs = safeQueryAll(descEl, 'p')
        .map((p) => (p.textContent || '').trim())
        .filter(Boolean);
      description = paragraphs.length ? paragraphs.join('\n\n') : (descEl.textContent || '').trim();
    }
    const altEl = selectFirst(doc, cfg.altNameSelector);
    if (altEl) {
      const alt = ownText(altEl);
      if (alt && !/updating|atualizando/i.test(alt)) {
        description = description ? `${description}\n\nNomes alternativos: ${alt}` : `Nomes alternativos: ${alt}`;
      }
    }

    const thumbEl = selectFirst(doc, cfg.mangaDetailsSelectorThumbnail);
    const coverUrl = thumbEl ? imageFromElement(thumbEl, base) : null;

    const statusEls = queryJsoup(doc, cfg.mangaDetailsSelectorStatus);
    const statusText = statusEls.length ? (statusEls[statusEls.length - 1].textContent || '').trim() : '';

    const genres = eachText(doc, cfg.mangaDetailsSelectorGenre);
    const tags = eachText(doc, cfg.mangaDetailsSelectorTag);
    const seriesType = selectFirst(doc, cfg.seriesTypeSelector);
    const type = seriesType ? (seriesType.textContent || '').trim() : '';
    if (type) genres.push(type);

    const details: MangaDetails = {
      id: encodeId(path),
      title,
      coverUrl: coverUrl ? extImage(coverUrl) : undefined,
      status: statusText ? toStatus(statusText) : 'unknown',
      genres: genres.length ? Array.from(new Set(genres)) : undefined,
      tags: tags.length ? Array.from(new Set(tags)) : undefined,
      description: description || undefined,
      authors: authors.length ? authors : undefined,
      artists: artists.length ? artists : undefined,
    };
    return details;
  }

  // ── Capítulos ─────────────────────────────────────────────────────────────

  async getChapters(mangaId: string): Promise<Chapter[]> {
    const path = decodeId(mangaId);
    const mode = this.cfg.chapterMode;

    if (mode === 'MangaAjax' || mode === 'MangaAjaxPaginated' || mode === 'MangaAjaxQuery') {
      return this.fetchChaptersByAjax(path);
    }

    // MangaPage/AdminAjax: a lista (ou o id numérico) está na página de detalhes
    const doc = await this.getDetailsDocument(path);
    if (mode === 'MangaPage') return this.parseChapterList(doc, path);

    const numericId = this.extractNumericId(doc);
    if (!numericId) throw new ExtError('Não foi possível identificar o mangá no site.', 'parsing');
    const body = await extPost(
      `${this.baseUrl}/wp-admin/admin-ajax.php`,
      { action: 'manga_get_chapters', manga: numericId },
      { xhr: true },
    );
    const ajaxDoc = new DOMParser().parseFromString(body, 'text/html');
    return this.parseChapterList(ajaxDoc, path);
  }

  async getChapter(chapterId: string): Promise<Chapter | null> {
    const decoded = decodeId(chapterId);
    const separator = decoded.lastIndexOf('|');
    if (separator === -1) return null;
    const path = decoded.slice(0, separator);
    const chapters = await this.getChapters(encodeId(path));
    return chapters.find((chapter) => chapter.id === chapterId) ?? null;
  }

  private async fetchChaptersByAjax(path: string): Promise<Chapter[]> {
    const slug = path.replace(/\/+$/, '').split('/').pop() || '';
    const mode = this.cfg.chapterMode;

    if (mode === 'MangaAjaxQuery') {
      const body = await extPost(
        `${this.baseUrl}/index.php`,
        { 'manga-core': slug, manga_ajax: '1', maction: 'get_chapters' },
        { xhr: true },
      );
      const doc = new DOMParser().parseFromString(body, 'text/html');
      return this.parseChapterList(doc, path);
    }

    const ajaxUrl = `${this.baseUrl}${path.replace(/\/+$/, '')}/ajax/chapters/`;
    if (mode === 'MangaAjax') {
      const body = await extPost(ajaxUrl, {}, { xhr: true });
      const doc = new DOMParser().parseFromString(body, 'text/html');
      return this.parseChapterList(doc, path);
    }

    // MangaAjaxPaginated: ?t=1, ?t=2… até 404/lista repetida
    const chapters: Chapter[] = [];
    let lastUrl = '';
    for (let page = 1; page <= 20; page++) {
      let body: string;
      try {
        body = await extPost(`${ajaxUrl}?t=${page}`, {}, { xhr: true });
      } catch (error) {
        if (error instanceof ExtError && error.status === 404) break;
        throw error;
      }
      const doc = new DOMParser().parseFromString(body, 'text/html');
      const parsed = this.parseChapterList(doc, path);
      if (!parsed.length) break;
      const currentLast = parsed[parsed.length - 1].id;
      if (currentLast === lastUrl) break;
      chapters.push(...parsed);
      lastUrl = currentLast;
    }
    return chapters;
  }

  protected async getDetailsDocument(path: string): Promise<Document> {
    const url = absUrl(path, `${this.baseUrl}/`) || `${this.baseUrl}/`;
    const html = await extGet(url);
    return new DOMParser().parseFromString(html, 'text/html');
  }

  protected extractNumericId(doc: Document): string | null {
    const holder = selectFirst(doc, '[id^=manga-chapters-holder]');
    const holderId = holder?.getAttribute('data-id');
    if (holderId) return holderId;
    const rating = selectFirst(doc, 'input.rating-post-id');
    const ratingId = rating?.getAttribute('value');
    if (ratingId) return ratingId;
    const post = selectFirst(doc, 'a[data-post]');
    const postId = post?.getAttribute('data-post');
    if (postId) return postId;
    const shortlink = selectFirst(doc, 'link[rel=shortlink]');
    const href = shortlink?.getAttribute('href') || '';
    if (href.includes('?p=')) {
      const id = href.split('?p=')[1].split('&')[0];
      if (id) return id;
    }
    return null;
  }

  protected parseChapterList(doc: Document, path: string): Chapter[] {
    const cfg = this.cfg;
    const base = absUrl(path, `${this.baseUrl}/`) || `${this.baseUrl}/`;
    const chapters: Chapter[] = [];

    for (const el of queryJsoup(doc, cfg.chapterListSelector)) {
      const link = selectFirst(el, 'a');
      const href = link ? absUrl(link.getAttribute('href'), base) : null;
      if (!href) continue;
      const slug = new URL(href).pathname.replace(/\/+$/, '').split('/').pop();
      if (!slug) continue;

      let name = link ? (link.textContent || '').trim() : '';
      if (cfg.chapterNameSelector) {
        const nameEl = selectFirst(el, cfg.chapterNameSelector);
        if (nameEl) name = (nameEl.textContent || '').trim();
      }
      if (!name) continue;

      const dateSource =
        selectFirst(el, 'img:not(.thumb)')?.getAttribute('alt') ||
        selectFirst(el, 'span a')?.getAttribute('title') ||
        selectFirst(el, cfg.chapterDateSelector)?.textContent ||
        null;
      const uploadedAt = parseChapterDate(dateSource, cfg.chapterDateFormat);

      const { number, title } = splitChapterName(name);
      chapters.push({
        id: encodeId(`${path}|${slug}`),
        mangaId: encodeId(path),
        number,
        title,
        uploadedAt,
        language: 'pt-br',
      });
    }

    // Contrato: mais recente primeiro (os sites variam a ordem)
    return chapters.sort((a, b) => b.number - a.number || (b.uploadedAt || 0) - (a.uploadedAt || 0));
  }

  /** Lista de mangás de uma página de arquivo/busca (ambos os modos Madara). */
  protected parseArchive(doc: Document, base = `${this.baseUrl}/`): MangaSummary[] {
    const cfg = this.cfg;
    const out: MangaSummary[] = [];

    for (const el of queryJsoup(doc, cfg.archiveSelector)) {
      if (cfg.supportsPostId) {
        const postId = el.getAttribute('data-post-id') || selectFirst(el, '[data-post-id]')?.getAttribute('data-post-id');
        if (!postId) continue;
      }
      const link = selectFirst(el, cfg.archiveUrlSelector);
      const href = link ? absUrl(link.getAttribute('href'), base) : null;
      if (!href) continue;
      const title = link ? (link.textContent || '').trim() : '';
      if (!title) continue;
      const img = selectFirst(el, 'img');
      const cover = img ? imageFromElement(img, base) : null;
      out.push({
        id: encodeId(new URL(href).pathname),
        title,
        coverUrl: cover ? extImage(cover) : undefined,
      });
    }
    return out;
  }

  // ── Páginas ───────────────────────────────────────────────────────────────
  async getPages(chapterId: string): Promise<MangaPage[]> {
    const decoded = decodeId(chapterId);
    const separator = decoded.lastIndexOf('|');
    if (separator === -1) throw new ExtError('ID de capítulo inválido.', 'parsing');
    const path = decoded.slice(0, separator);
    const slug = decoded.slice(separator + 1);
    const chapterUrl = `${this.baseUrl}${path.replace(/\/+$/, '')}/${slug}/`;

    const html = await extGet(chapterUrl);
    let doc = new DOMParser().parseFromString(html, 'text/html');

    if (selectFirst(doc, '#single-pager')) {
      const listHtml = await extGet(`${chapterUrl}?style=list`);
      doc = new DOMParser().parseFromString(listHtml, 'text/html');
    }

    return this.parsePages(doc, chapterUrl);
  }

  protected async parsePages(doc: Document, chapterUrl: string): Promise<MangaPage[]> {
    const cfg = this.cfg;
    const base = chapterUrl;

    // WP Manga Protector (capítulo cifrado com senha da página)
    const protector = selectFirst(doc, '#chapter-protector-data');
    if (protector) {
      const src = protector.getAttribute('src') || '';
      let script: string;
      if (src.startsWith('data:text/javascript;base64,')) {
        script = new TextDecoder().decode(base64ToBytes(src.slice(src.indexOf(',') + 1)));
      } else {
        script = protector.textContent || '';
      }
      const password = script.split("wpmangaprotectornonce='")[1]?.split("';")[0];
      const encrypted = script.split("chapter_data='")[1]?.split("';")[0]?.replace(/\\\//g, '/');
      if (!password || !encrypted) throw new ExtError('Capítulo protegido não pôde ser decodificado.', 'parsing');
      const urls = await decryptChapterData(encrypted, password);
      return urls.map((url, index) => ({ index, imageUrl: extImage(url) }));
    }

    // Hunters Scan: canvas com data-page-url
    if (cfg.pagesCanvas) {
      return queryJsoup(doc, 'canvas.protected-chapter-canvas[data-page-url]')
        .map((canvas) => absUrl(canvas.getAttribute('data-page-url'), base))
        .filter((url): url is string => !!url)
        .map((url, index) => ({ index, imageUrl: extImage(url) }));
    }

    const pages: MangaPage[] = [];
    let contentNodeKey: string | null = null;
    for (const el of queryJsoup(doc, this.pageListParseSelector)) {
      const img = selectFirst(el, 'img');
      if (!img) continue;
      let url = imageFromElement(img, base);
      if (!url) continue;
      if (cfg.imageObfuscation === 'reverse-b64') {
        const obf = img.getAttribute('data-obf');
        if (obf) {
          try {
            const reversed = obf.split('').reverse().join('');
            url = new TextDecoder().decode(base64ToBytes(reversed));
          } catch {
            /* mantém a URL normal */
          }
        }
      }
      if (cfg.imageObfuscation === 'content-node-xor') {
        const node = img.getAttribute('data-content-node');
        if (node) {
          const key = contentNodeKey ?? (contentNodeKey = extractContentNodeKey(doc));
          const real = key ? decryptContentNode(node, key) : null;
          if (real) url = real;
        }
      }
      pages.push({ index: pages.length, imageUrl: extImage(url) });
    }
    return pages;
  }

  protected get pageListParseSelector(): string {
    return DEFAULT_PAGE_SELECTOR;
  }

  // ── Filtro de gênero (GenreRoute do Madara upstream) ──────────────────────

  /** Rotas de gênero da home do catálogo: nome normalizado → path. */
  private genreRoutes: Map<string, string> | null = null;

  /**
   * Extrai os gêneros dos links em `div.genres` (mesmo caminho do
   * fetchFilterData do Madara upstream: /manga-genre/<slug>/).
   */
  private async fetchGenreRoutes(): Promise<Map<string, string>> {
    if (this.genreRoutes) return this.genreRoutes;
    const routes = new Map<string, string>();
    try {
      const html = await extGet(`${this.baseUrl}/${this.cfg.mangaSubString}/`);
      const doc = new DOMParser().parseFromString(html, 'text/html');
      for (const el of queryJsoup(doc, 'div.genres a')) {
        const href = el.getAttribute('href');
        if (!href) continue;
        let path: string;
        try {
          path = new URL(href, `${this.baseUrl}/`).pathname;
        } catch {
          continue;
        }
        if (!/\/manga-genre\/[^/]+\/?$/.test(path)) continue;
        const name = (el.textContent || '').trim();
        if (name) routes.set(normalizeGenre(name), path);
      }
    } catch {
      /* site bloqueado (CF) — fica vazio e o filtro responde lista vazia */
    }
    this.genreRoutes = routes;
    return routes;
  }

  async searchByGenre(page: number, genre: string): Promise<MangasPage> {
    const routes = await this.fetchGenreRoutes();
    const path = routes.get(normalizeGenre(genre));
    if (!path) return { mangas: [], hasNextPage: false };

    // Página do gênero (archive paginado) — mesma URL do GenreRoute.path
    const url = new URL(path, `${this.baseUrl}/`);
    if (page > 1) url.pathname = `${url.pathname.replace(/\/+$/, '')}/page/${page}/`;
    const html = await extGet(url.toString());
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const mangas = this.parseArchive(doc, url.toString());
    return { mangas, hasNextPage: selectFirst(doc, this.cfg.nextPageSelector) !== null };
  }
}

const DEFAULT_PAGE_SELECTOR =
  'div.page-break, li.blocks-gallery-item, .reading-content .text-left:not(:has(.blocks-gallery-item))';

// ── Madara (listas via admin-ajax.php) ───────────────────────────────────────

export class MadaraSource extends MadaraBaseSource {
  private async ajaxList(
    page: number,
    mode: 'popular' | 'latest' | 'search',
    query = '',
  ): Promise<MangasPage> {
    const cfg = this.cfg;
    const form: Record<string, string> = {
      action: 'madara_load_more',
      page: String(page - 1),
      template: cfg.ajaxTemplate,
      'vars[paged]': '1',
      'vars[template]': 'archive',
      'vars[posts_per_page]': String(cfg.pageSize),
      'vars[post_type]': 'wp-manga',
      'vars[post_status]': 'publish',
      'vars[manga_archives_item_layout]': 'big_thumbnail',
      'vars[meta_query][0][key]': '_wp_manga_chapter_type',
      'vars[meta_query][0][value]': 'manga',
    };

    if (mode === 'popular') {
      form['vars[orderby]'] = 'meta_value_num';
      form['vars[meta_key]'] = '_wp_manga_views';
      form['vars[order]'] = 'DESC';
    } else if (mode === 'latest') {
      form['vars[orderby]'] = 'meta_value_num';
      form['vars[meta_key]'] = '_latest_update';
      form['vars[order]'] = 'DESC';
    } else if (query.trim()) {
      form['vars[s]'] = query.trim();
    }

    const body = await extPost(`${this.baseUrl}/wp-admin/admin-ajax.php`, form, { xhr: true });
    const doc = new DOMParser().parseFromString(body, 'text/html');
    const mangas = this.parseArchive(doc, `${this.baseUrl}/`);
    return { mangas, hasNextPage: mangas.length === cfg.pageSize };
  }

  getPopular(page: number): Promise<MangasPage> {
    return this.ajaxList(page, 'popular');
  }

  getLatest(page: number): Promise<MangasPage> {
    return this.ajaxList(page, 'latest');
  }

  search(page: number, query: string): Promise<MangasPage> {
    return this.ajaxList(page, 'search', query);
  }
}

// ── MadaraNoAjax (listas em páginas de arquivo HTML) ─────────────────────────

export class MadaraNoAjaxSource extends MadaraBaseSource {
  private async archivePage(page: number, order: string, path = `/${this.cfg.mangaSubString}/`): Promise<MangasPage> {
    const url = new URL(path, `${this.baseUrl}/`);
    if (page > 1) url.pathname = `${url.pathname.replace(/\/+$/, '')}/page/${page}/`;
    if (order) url.searchParams.set(this.cfg.orderQueryParameter, order);
    const html = await extGet(url.toString());
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const mangas = this.parseArchive(doc, url.toString());
    return { mangas, hasNextPage: selectFirst(doc, this.cfg.nextPageSelector) !== null };
  }

  getPopular(page: number): Promise<MangasPage> {
    return this.archivePage(page, 'views');
  }

  getLatest(page: number): Promise<MangasPage> {
    return this.archivePage(page, 'latest');
  }

  async search(page: number, query: string): Promise<MangasPage> {
    const trimmed = query.trim();
    if (!trimmed) return this.archivePage(page, '');
    if (page > 1 && this.cfg.supportsPostId) return { mangas: [], hasNextPage: false };

    const url = new URL(`${this.baseUrl}/`);
    if (page > 1) url.pathname = `/page/${page}/`;
    url.searchParams.set(this.cfg.searchQueryParameter, trimmed);
    url.searchParams.set('post_type', 'wp-manga');
    const html = await extGet(url.toString());
    const doc = new DOMParser().parseFromString(html, 'text/html');

    const archive = this.parseArchive(doc, url.toString());
    const hasNextPage = !this.cfg.supportsPostId && selectFirst(doc, this.cfg.nextPageSelector) !== null;
    if (archive.length) return { mangas: archive, hasNextPage };

    // Fallback: cards de busca sem data-post-id (id = path do mangá)
    const base = url.toString();
    const cards: MangaSummary[] = [];
    for (const el of queryJsoup(doc, this.cfg.searchCardSelector)) {
      const link = selectFirst(el, this.cfg.archiveUrlSelector);
      const href = link ? absUrl(link.getAttribute('href'), base) : null;
      if (!href) continue;
      const title = link ? (link.textContent || '').trim() : '';
      if (!title) continue;
      const img = selectFirst(el, 'img');
      const cover = img ? imageFromElement(img, base) : null;
      cards.push({
        id: encodeId(new URL(href).pathname),
        title,
        coverUrl: cover ? extImage(cover) : undefined,
      });
    }
    return { mangas: cards, hasNextPage };
  }
}

/** Fábrica: Madara (ajax) ou MadaraNoAjax conforme a configuração. */
export function createMadaraSource(config: MadaraConfig): MadaraSource | MadaraNoAjaxSource {
  return config.noAjax ? new MadaraNoAjaxSource(config) : new MadaraSource(config);
}

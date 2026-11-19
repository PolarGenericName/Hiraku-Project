/**
 * Tema Aurora (Next.js + API de leitura com páginas criptografadas) —
 * port TS de keiyoushi/extensions-source/lib-multisrc/aurora (Apache 2.0).
 *
 * Cobre LeitorDeMangas, MangaNYX, MangasBrasuka e MugiwarasOficial:
 * - listas em `/catalogo` e `/novidades` (dados no flight data do Next.js)
 * - busca filtrando o catálogo no cliente (como no original)
 * - detalhes + capítulos na página da série (JSON-LD ComicSeries / flight)
 * - páginas: POST `/api/reader/unlock` (libera o gate), GET do capítulo com
 *   `rsc: 1` e descriptografia HMAC-SHA256 dos URLs das imagens
 *
 * O gate e os cookies (`mnx_adulto`, `mnx_gate_*`) ficam num jar por fonte;
 * a chave de descriptografia vem de `/api/atfield/key?v=&e=` (cacheada).
 */

import type {
  Chapter,
  MangaDetails,
  MangaPage,
  MangaSource,
  MangasPage,
  MangaSummary,
} from '../../../types';
import { extGetRaw, extImage, extPostJsonRaw, ExtError } from '../http';
import { decodeId, encodeId } from './madara';
import { extractNextJs, extractNextJsAuto, type Json } from './nextjs';

export interface AuroraConfig {
  /** ID estável da fonte (keiyoushi-pt-<pkg>) */
  id: string;
  name: string;
  baseUrl: string;
}

interface SeriesItem {
  title: string;
  coverUrl?: string;
  description?: string;
  genres?: string[];
  author?: string;
  /** caminho `type/slug` */
  path: string;
}

interface ChapterItem {
  id: string;
  number: string;
  title: string;
  uploadedAt?: number;
}

const PT_MONTHS: Record<string, number> = {
  jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5,
  jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11,
  janeiro: 0, fevereiro: 1, março: 2, marco: 2, abril: 3, maio: 4, junho: 5,
  julho: 6, agosto: 7, setembro: 8, outubro: 9, novembro: 10, dezembro: 11,
};

function isObject(value: Json | undefined): value is { [key: string]: Json } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: Json | undefined): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

/** "08 de nov. de 2026" (dd 'de' MMM 'de' yyyy, pt-BR) ou ISO. */
function parseAuroraDate(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const value = text.trim();
  const match = value.match(/^(\d{1,2})\s+de\s+([a-zç]+)\.?\s+de\s+(\d{4})$/i);
  if (match) {
    const monthKey = match[2].toLowerCase();
    const month =
      PT_MONTHS[monthKey] ??
      Object.keys(PT_MONTHS).find((key) => key.startsWith(monthKey.slice(0, 3)));
    if (month !== undefined) return Date.UTC(Number(match[3]), month, Number(match[1]));
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

/** `type/slug` vindo do campo `url` (absoluto, caminho ou slug puro). */
function resolvePath(url: string, type?: string): string | null {
  const value = url.trim();
  if (!value) return null;
  let parts: string[];
  try {
    const parsed = new URL(value, 'https://placeholder.invalid');
    parts = parsed.pathname.split('/').filter(Boolean);
  } catch {
    parts = value.replace(/^\/+/, '').split('/').filter(Boolean);
  }
  if (!parts.length) return null;
  const resolvedType = (type ?? (parts.length > 1 ? parts[0] : '')).toLowerCase();
  const slug = parts[parts.length - 1];
  if (!resolvedType || !slug) return null;
  return `${resolvedType}/${slug}`;
}

function textOf(value: Json | undefined): string | undefined {
  if (typeof value === 'string') return value;
  if (isObject(value)) return asString(value.name) ?? asString(value.url);
  return undefined;
}

/** Decodifica um objeto ComicSeries (JSON-LD ou flight). */
function decodeSeries(el: Json): SeriesItem | null {
  if (!isObject(el)) return null;
  const title = asString(el.name) ?? asString(el.title);
  const rawUrl = asString(el.url) ?? asString(el.slug);
  if (!title || !rawUrl) return null;

  const image = el.image ?? el.coverUrl;
  let coverUrl: string | undefined;
  if (typeof image === 'string') coverUrl = image;
  else if (isObject(image)) coverUrl = asString(image.url);

  const genreRaw = el.genre;
  const genres =
    typeof genreRaw === 'string'
      ? genreRaw.split(',').map((name) => name.trim()).filter(Boolean)
      : Array.isArray(genreRaw)
        ? genreRaw.map((name) => textOf(name)).filter((name): name is string => !!name)
        : undefined;

  const authorRaw = el.author;
  const author =
    typeof authorRaw === 'string'
      ? authorRaw
      : Array.isArray(authorRaw)
        ? authorRaw.map((entry) => textOf(entry)).filter((name): name is string => !!name).join(', ')
        : textOf(authorRaw);

  return {
    title,
    coverUrl,
    description: asString(el.description),
    genres: genres?.length ? genres : undefined,
    author: author || undefined,
    path: resolvePath(rawUrl, asString(el.type)) ?? '',
  };
}

/** Variante estrita para o flight de detalhes (exige capa, como no original). */
function decodeSeriesStrict(el: Json): SeriesItem | null {
  const series = decodeSeries(el);
  return series?.coverUrl ? series : null;
}

function decodeSeriesList(el: Json): SeriesItem[] | null {
  if (!isObject(el)) return null;
  const list = el.series ?? el.updates;
  if (!Array.isArray(list) || !list.length) return null;
  const items: SeriesItem[] = [];
  for (const entry of list) {
    const item = decodeSeries(entry);
    if (item?.path) items.push(item);
  }
  return items.length ? items : null;
}

function decodeChapterList(el: Json): ChapterItem[] | null {
  if (!isObject(el)) return null;
  const chapters = el.chapters;
  if (!Array.isArray(chapters) || !chapters.length) return null;
  if (asString(el.slug) === undefined && asString(el.serieSlug) === undefined) return null;
  const out: ChapterItem[] = [];
  for (const entry of chapters) {
    if (!isObject(entry)) continue;
    const id = asString(entry.id);
    const number = asString(entry.number);
    if (!id || !number) continue;
    out.push({
      id,
      number,
      title: `Capítulo ${number}`,
      uploadedAt: parseAuroraDate(asString(entry.releaseDate)),
    });
  }
  return out.length ? out : null;
}

function decodePages(el: Json): Array<{ url: string }> | null {
  if (!isObject(el)) return null;
  const pages = el.pages;
  if (!Array.isArray(pages) || !pages.length) return null;
  const out: Array<{ url: string }> = [];
  for (const entry of pages) {
    if (!isObject(entry)) continue;
    const url = asString(entry.url);
    if (url) out.push({ url });
  }
  return out.length ? out : null;
}

// ── Descriptografia das páginas (Decrypt.kt) ────────────────────────────────

function b64ToBytes(value: string, urlSafe: boolean): Uint8Array {
  let normalized = value.replace(/\s+/g, '');
  if (urlSafe) normalized = normalized.replace(/-/g, '+').replace(/_/g, '/');
  while (normalized.length % 4) normalized += '=';
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** byte[0] = v (sinalizado como no Kotlin), int32BE em [1..4) = e. */
function getParams(payload: string): { v: number; e: number } {
  const bytes = b64ToBytes(payload, true);
  if (bytes.length < 5) throw new ExtError('Payload de página inválido.', 'parsing');
  const signed = bytes[0] > 127 ? bytes[0] - 256 : bytes[0];
  const view = new DataView(bytes.buffer, bytes.byteOffset + 1, 4);
  return { v: signed, e: view.getInt32(0) };
}

async function auroraDecrypt(payload: string, key: string): Promise<string> {
  const bytes = b64ToBytes(payload, true);
  if (bytes.length < 14) throw new ExtError('Payload de página inválido.', 'parsing');
  const baseData = bytes.subarray(5, 13);
  const cipherText = bytes.subarray(13);

  const chapterKey = b64ToBytes(key, false);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    chapterKey as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const keystream = new Uint8Array(cipherText.length);
  let offset = 0;
  let counter = 0;
  while (offset < cipherText.length) {
    const block = new Uint8Array(baseData.length + 1);
    block.set(baseData, 0);
    block[baseData.length] = counter & 0xff;
    const hash = new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, block as BufferSource));
    const copy = Math.min(hash.length, cipherText.length - offset);
    keystream.set(hash.subarray(0, copy), offset);
    offset += copy;
    counter++;
  }

  const out = new Uint8Array(cipherText.length);
  for (let i = 0; i < cipherText.length; i++) out[i] = cipherText[i] ^ keystream[i];
  return new TextDecoder().decode(out);
}

// ── Motor ───────────────────────────────────────────────────────────────────

export class AuroraSource implements MangaSource {
  readonly id: string;
  readonly name: string;
  readonly lang = 'pt-br';
  readonly baseUrl: string;
  readonly supportsLatest = true;
  readonly defaultEnabled = false;
  readonly family = 'keiyoushi';

  private readonly origin: string;
  private readonly host: string;
  private readonly jar = new Map<string, string>();
  private readonly keyCache = new Map<string, string>();
  private readonly pageCache = new Map<string, { html: string; at: number }>();

  constructor(config: AuroraConfig) {
    this.id = config.id;
    this.name = config.name;
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.origin = new URL(this.baseUrl).origin;
    this.host = new URL(this.baseUrl).hostname;
  }

  // ── Cookies ───────────────────────────────────────────────────────────────

  private absorb(setCookie: string): void {
    for (const pair of setCookie.split(';')) {
      const trimmed = pair.trim();
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const name = trimmed.slice(0, eq).trim();
      if (name) this.jar.set(name, trimmed.slice(eq + 1).trim());
    }
  }

  private cookieHeader(extra?: Record<string, string>): string {
    const all = new Map(this.jar);
    all.set('mnx_adulto', '1');
    if (extra) for (const [name, value] of Object.entries(extra)) all.set(name, value);
    return [...all].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  private opts(extraHeaders: Record<string, string> = {}): {
    headers: Record<string, string>;
  } {
    return {
      headers: {
        'alt-used': this.host,
        cookie: this.cookieHeader(),
        ...extraHeaders,
      },
    };
  }

  /**
   * GET de texto pelo proxy. `h2` força HTTP/2 no proxy — usado pela key do
   * Aurora, que responde só a conexões h2 (como as do navegador).
   */
  private async get(
    url: string,
    extraHeaders: Record<string, string> = {},
    h2 = false,
  ): Promise<string> {
    const result = await extGetRaw(url, { ...this.opts(extraHeaders), h2 });
    this.absorb(result.cookies);
    return result.text;
  }

  // ── Listas ────────────────────────────────────────────────────────────────

  async getPopular(_page: number): Promise<MangasPage> {
    return this.listFrom(`${this.baseUrl}/catalogo`);
  }

  async getLatest(_page: number): Promise<MangasPage> {
    return this.listFrom(`${this.baseUrl}/novidades`);
  }

  async search(page: number, query: string): Promise<MangasPage> {
    const { mangas } = await this.getPopular(page);
    const needle = query.trim().toLowerCase();
    if (!needle) return { mangas, hasNextPage: false };
    return {
      mangas: mangas.filter((manga) => manga.title.toLowerCase().includes(needle)),
      hasNextPage: false,
    };
  }

  private async listFrom(url: string): Promise<MangasPage> {
    const html = await this.get(url);
    const items = extractNextJs(html, decodeSeriesList);
    const mangas: MangaSummary[] = (items ?? []).map((item) => ({
      id: encodeId(item.path),
      title: item.title,
      coverUrl: item.coverUrl ? extImage(item.coverUrl) : undefined,
    }));
    return { mangas, hasNextPage: false };
  }

  // ── Página da série (detalhes + capítulos) ────────────────────────────────

  private async seriesHtml(path: string): Promise<string> {
    const cached = this.pageCache.get(path);
    if (cached && Date.now() - cached.at < 60_000) return cached.html;
    const html = await this.get(`${this.baseUrl}/${path}`);
    this.pageCache.set(path, { html, at: Date.now() });
    return html;
  }

  async getMangaDetails(id: string): Promise<MangaDetails | null> {
    const path = decodeId(id);
    if (!path.includes('/')) return null;
    const html = await this.seriesHtml(path);
    const doc = new DOMParser().parseFromString(html, 'text/html');

    let series = this.fromJsonLd(html) ?? extractNextJs(html, decodeSeriesStrict);

    let description = series?.description;
    let genres = series?.genres;
    let author = series?.author;
    let coverUrl = series?.coverUrl;

    if (!description || !genres || !author) {
      const fallback = this.fromScriptRegex(html);
      description ??= fallback.description;
      genres ??= fallback.genres;
      author ??= fallback.author;
      coverUrl ??= fallback.coverUrl;
    }

    const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute('content');
    const title =
      series?.title?.trim() ||
      ogTitle?.split('|')[0].split(' - ')[0].trim() ||
      doc.querySelector('title')?.textContent?.trim();
    if (!title) return null;

    return {
      id,
      title,
      coverUrl: coverUrl ? extImage(coverUrl) : undefined,
      status: 'unknown',
      genres: genres?.length ? genres : undefined,
      description: description || undefined,
      authors: author ? [author] : undefined,
    };
  }

  /** JSON-LD (script com type) contendo ComicSeries. */
  private fromJsonLd(html: string): SeriesItem | null {
    const scripts = html.match(/<script\b[^>]*type=["'][^"']+["'][^>]*>([\s\S]*?)<\/script>/gi) ?? [];
    for (const tag of scripts) {
      if (!tag.includes('ComicSeries')) continue;
      const content = tag.replace(/^<script\b[^>]*>/i, '').replace(/<\/script>$/i, '');
      try {
        const parsed = JSON.parse(content) as Json;
        const found = findSeries(parsed);
        if (found) return found;
      } catch {
        /* não é JSON puro */
      }
    }
    return null;
  }

  /** Fallback com regex sobre o script que cita ComicSeries (como no original). */
  private fromScriptRegex(html: string): {
    description?: string;
    genres?: string[];
    author?: string;
    coverUrl?: string;
  } {
    const scripts = html.match(/<script\b[^>]*>([\s\S]*?)<\/script>/gi) ?? [];
    for (const tag of scripts) {
      if (!tag.includes('ComicSeries')) continue;
      let text = tag.replace(/^<script\b[^>]*>/i, '').replace(/<\/script>$/i, '');
      text = text.replace(/\\{2,}/g, '').replace(/\\"/g, '"');

      const description = text.match(/description":"([^"]+)"/)?.[1];
      const genreRaw = text.match(/genre":([^]]+])/)?.[1];
      let genres: string[] | undefined;
      if (genreRaw) {
        try {
          const parsed = JSON.parse(genreRaw) as unknown;
          if (Array.isArray(parsed)) {
            genres = parsed.filter((name): name is string => typeof name === 'string');
          }
        } catch {
          /* lista inválida */
        }
      }
      const author = text.match(/author[^.]+name":"([^"]+)"/)?.[1];
      const coverUrl = text.match(/"image":"([^"]+)"/)?.[1];
      if (description || genres || author || coverUrl) {
        return { description, genres, author, coverUrl };
      }
    }
    return {};
  }

  async getChapters(mangaId: string): Promise<Chapter[]> {
    const path = decodeId(mangaId);
    if (!path.includes('/')) return [];
    const [type, slug] = path.split('/');
    const html = await this.seriesHtml(path);

    const chapters = extractNextJs(html, decodeChapterList) ?? [];
    return chapters.map((chapter) => ({
      id: encodeId(`${type}/${slug}/${chapter.number}`),
      mangaId,
      number: Number.parseFloat(chapter.number) || 0,
      title: chapter.title,
      uploadedAt: chapter.uploadedAt,
      language: 'pt-br',
    }));
  }

  // ── Páginas ───────────────────────────────────────────────────────────────

  private async unlock(chapterPath: string): Promise<void> {
    const result = await extPostJsonRaw(
      `${this.baseUrl}/api/reader/unlock`,
      { returnTo: chapterPath },
      {
        headers: {
          origin: this.origin,
          referer: `${this.baseUrl}/`,
          accept: 'application/json',
        },
      },
    );
    this.absorb(result.cookies);
  }

  private async getKey(payload: string, refererPath: string): Promise<string> {
    const { v, e } = getParams(payload);
    const cacheKey = `${v}:${e}`;
    const cached = this.keyCache.get(cacheKey);
    if (cached) return cached;

    // O servidor valida o Referer contra o scope do gate (capítulo) — referer
    // da raiz devolve 403 "unauthorized". A key exige HTTP/2 (h1.1 recebe
    // 403); headers padrão do proxy já bastam.
    const text = await this.get(
      `${this.baseUrl}/api/atfield/key?v=${encodeURIComponent(String(v))}&e=${encodeURIComponent(String(e))}`,
      { referer: `${this.baseUrl}${refererPath}` },
      true,
    );
    let key: string | undefined;
    try {
      const parsed = JSON.parse(text) as { k?: unknown };
      key = typeof parsed.k === 'string' ? parsed.k : undefined;
    } catch {
      /* corpo inválido */
    }
    if (!key) throw new ExtError('Não foi possível obter a chave das páginas.', 'parsing');
    this.keyCache.set(cacheKey, key);
    return key;
  }

  async getPages(chapterId: string): Promise<MangaPage[]> {
    const parts = decodeId(chapterId).split('/');
    if (parts.length < 3) return [];
    const [type, slug, number] = parts;
    const mangaPath = `/${type}/${slug}`;
    const chapterPath = `${mangaPath}/${number}`;

    await this.unlock(chapterPath);

    const text = await this.get(`${this.baseUrl}${chapterPath}`, {
      rsc: '1',
      referer: `${this.baseUrl}${mangaPath}`,
      'next-url': mangaPath,
      cookie: this.cookieHeader({ [`mnx_gate_${number}`]: '1' }),
      accept: 'text/x-component, text/html, */*',
    });

    const pages = extractNextJsAuto(text, decodePages);
    if (!pages) throw new ExtError('Nenhuma página encontrada no capítulo.', 'parsing');

    const out: MangaPage[] = [];
    for (const image of pages) {
      const key = await this.getKey(image.url, chapterPath);
      const url = await auroraDecrypt(image.url, key);
      if (!url) continue;
      out.push({ index: out.length, imageUrl: extImage(url) });
    }
    if (!out.length) throw new ExtError('Nenhuma página encontrada no capítulo.', 'parsing');
    return out;
  }
}

function findSeries(root: Json): SeriesItem | null {
  if (root === null || typeof root !== 'object') return null;
  const decoded = decodeSeries(root);
  if (decoded) return decoded;
  const children: Json[] = Array.isArray(root) ? root : Object.values(root);
  for (const child of children) {
    const found = findSeries(child);
    if (found) return found;
  }
  return null;
}

export function createAuroraSource(config: AuroraConfig): AuroraSource {
  return new AuroraSource(config);
}

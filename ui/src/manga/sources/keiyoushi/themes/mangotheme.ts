/**
 * Tema MangoTheme (API JSON com payload às vezes criptografado) — port TS de
 * keiyoushi/extensions-source/lib-multisrc/mangotheme (Apache 2.0).
 *
 * Cobre o Sagrado Império da Britannia:
 * - listas/detalhes/capítulos/páginas via API (`/obras`, `/capitulos/recentes`)
 * - capas e páginas no CDN (caminho relativo → cdnUrl)
 * - respostas com header `x-encrypted` descriptografadas com AES-256-CBC
 *   (chave = SHA-256 de encryptionKey + "salt") — WebCrypto remove o PKCS7
 * - headers do Império: X-Brit-Cache / X-Noencryptionbritta (evitam a
 *   criptografia) e X-API-Token scrapeado da home (best-effort)
 *
 * IDs opacos: mangá = encodeId(id), capítulo = encodeId(mangaId|número).
 */

import type {
  Chapter,
  MangaDetails,
  MangaPage,
  MangaSource,
  MangasPage,
  MangaStatus,
  MangaSummary,
} from '../../../types';
import { extGetRaw, extImage, ExtError } from '../http';
import { decodeId, encodeId, queryJsoup } from './madara';

export interface MangoThemeConfig {
  /** ID estável da fonte (keiyoushi-pt-<pkg>) */
  id: string;
  name: string;
  baseUrl: string;
  /** Raiz da API (padrão `${baseUrl}/api`) */
  apiUrl?: string;
  /** CDN de imagens (padrão = baseUrl) */
  cdnUrl?: string;
  /** Chave de descriptografia AES (quando o site devolve x-encrypted) */
  encryptionKey?: string;
  /** Imperio: headers X-Brit-Cache/X-Noencryptionbritta + scrape do token */
  britannia?: boolean;
}

interface RawTag {
  nome?: string;
  name?: string;
}

interface RawChapter {
  id?: number;
  obra_id?: number;
  numero?: string | number;
  nome?: string;
  title?: string;
  criado_em?: string;
  atualizado_em?: string;
}

interface RawPage {
  numero?: number;
  cdn_id?: string;
  imagem?: string;
  image?: string;
  src?: string;
  link?: string;
  path?: string;
  arquivo?: string;
}

interface RawManga {
  id?: number;
  title?: string;
  nome?: string;
  slug?: string;
  coverImage?: string;
  imagem?: string;
  banner_imagem?: string;
  descricao?: string;
  status_id?: number;
  status_nome?: string;
  tags?: RawTag[];
  capitulos?: RawChapter[];
}

interface RawPagination {
  pagina?: number;
  limite?: number;
  total?: number;
  totalPaginas?: number;
  hasNextPage?: boolean;
  hasPreviousPage?: boolean;
}

interface RawResponse {
  pagination?: RawPagination;
  [key: string]: unknown;
}

const LATEST_PAGE_SIZE = 24;
const SEARCH_PAGE_SIZE = 20;

const PAYLOAD_KEYS = [
  'payload', 'dados', 'obras', 'obra', 'data',
  'capitulos', 'capitulo', 'formatos', 'status', 'tags',
];

// ── Payload / status / datas ────────────────────────────────────────────────

/** Primeira chave da ordem do tema cujo valor é array|objeto. */
function pickPayload(response: RawResponse): unknown {
  for (const key of PAYLOAD_KEYS) {
    const value = response[key];
    if (Array.isArray(value)) return value;
    if (typeof value === 'object' && value !== null) return value;
  }
  return undefined;
}

function parseStatus(name?: string | null, id?: number | null): MangaStatus {
  const trimmed = name?.trim();
  if (trimmed === 'Ativo' || trimmed === 'Em Andamento') return 'ongoing';
  if (trimmed === 'Concluído' || trimmed === 'Concluido') return 'completed';
  if (trimmed === 'Hiato' || trimmed === 'Pausado') return 'on_hiatus';
  if (trimmed === 'Cancelado') return 'cancelled';
  switch (id) {
    case 1:
    case 6:
      return 'ongoing';
    case 2:
    case 5:
      return 'on_hiatus';
    case 3:
      return 'completed';
    case 4:
      return 'cancelled';
    default:
      return 'unknown';
  }
}

/** "2026-11-09T24:30:00" → próximo dia 00:30 (port de normalizeMidnightOverflow). */
function normalizeMidnight(value: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})T24:(\d{2}:\d{2}(?:\.\d{1,3})?)(.*)$/.exec(value);
  if (!match) return value;
  const day = new Date(`${match[1]}T00:00:00Z`);
  if (Number.isNaN(day.getTime())) return value;
  day.setUTCDate(day.getUTCDate() + 1);
  return `${day.toISOString().slice(0, 10)}T00:${match[2]}${match[3]}`;
}

function parseApiDate(value?: string | null): number | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const parsed = Date.parse(normalizeMidnight(trimmed));
  return Number.isNaN(parsed) ? undefined : parsed;
}

/** "137.00" → "137" (port de formatChapterNumber). */
function formatChapterNumber(value: string | number): string {
  const text = String(value).trim();
  const parsed = Number.parseFloat(text);
  if (!Number.isFinite(parsed) || !/^-?\d+(\.\d+)?$/.test(text)) return text;
  return String(parsed);
}

function absoluteUrl(value: string | null | undefined, cdn: string): string | null {
  if (!value || !value.trim()) return null;
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `${cdn.replace(/\/+$/, '')}/${trimmed.replace(/^\/+/, '')}`;
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new ExtError('Resposta criptografada inválida.', 'parsing');
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    const byte = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) throw new ExtError('Resposta criptografada inválida.', 'parsing');
    bytes[i] = byte;
  }
  return bytes;
}

/** Descriptografa o payload `iv_hex:cipher_hex` (AES-256-CBC, PKCS7). */
async function mangoDecrypt(payload: string, keyString: string): Promise<string> {
  const trimmed = payload.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return trimmed;
  const separator = trimmed.indexOf(':');
  if (separator < 0) throw new ExtError('Resposta criptografada inválida.', 'parsing');

  const iv = hexToBytes(trimmed.slice(0, separator));
  const cipher = hexToBytes(trimmed.slice(separator + 1));
  const keyBytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(keyString + 'salt'),
  );
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-CBC' }, false, [
    'decrypt',
  ]);
  const plain = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, key, cipher);
  return new TextDecoder().decode(plain);
}

// ── Motor ───────────────────────────────────────────────────────────────────

export class MangoThemeSource implements MangaSource {
  readonly id: string;
  readonly name: string;
  readonly lang = 'pt-br';
  readonly baseUrl: string;
  readonly supportsLatest = true;
  readonly defaultEnabled = false;
  readonly family = 'keiyoushi';

  private readonly apiUrl: string;
  private readonly cdnUrl: string;
  private readonly encryptionKey?: string;
  private readonly britannia: boolean;
  private readonly jar = new Map<string, string>();
  private apiToken?: string;
  private readonly detailCache = new Map<string, { response: RawResponse; at: number }>();

  constructor(config: MangoThemeConfig) {
    this.id = config.id;
    this.name = config.name;
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.apiUrl = (config.apiUrl ?? `${this.baseUrl}/api`).replace(/\/+$/, '');
    this.cdnUrl = (config.cdnUrl ?? this.baseUrl).replace(/\/+$/, '');
    this.encryptionKey = config.encryptionKey;
    this.britannia = config.britannia === true;
  }

  // ── HTTP ──────────────────────────────────────────────────────────────────

  private absorb(setCookie: string): void {
    for (const pair of setCookie.split(';')) {
      const trimmed = pair.trim();
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const name = trimmed.slice(0, eq).trim();
      if (name) this.jar.set(name, trimmed.slice(eq + 1).trim());
    }
  }

  /** Scrape do X-API-Token na home (`link[href*=env]` → script → regex). */
  private async token(): Promise<string | undefined> {
    if (!this.britannia) return undefined;
    if (this.apiToken !== undefined) return this.apiToken || undefined;
    try {
      const html = (await extGetRaw(this.baseUrl)).text;
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const link = queryJsoup(doc, 'link[href*=env]')[0];
      const href = link ? link.getAttribute('href') : null;
      const target = href ? new URL(href, `${this.baseUrl}/`).toString() : null;
      if (target) {
        const script = (await extGetRaw(target)).text;
        const match = /apiToken:.([^`]+)/.exec(script);
        this.apiToken = match ? match[1] : '';
      } else {
        this.apiToken = '';
      }
    } catch {
      this.apiToken = '';
    }
    return this.apiToken || undefined;
  }

  private async headers(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      'accept-language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    };
    if (this.jar.size) {
      headers.cookie = [...this.jar].map(([name, value]) => `${name}=${value}`).join('; ');
    }
    if (this.britannia) {
      headers['x-brit-cache'] = 'true';
      headers['x-noencryptionbritta'] = '1';
      const apiToken = await this.token();
      if (apiToken) headers['x-api-token'] = apiToken;
    }
    return headers;
  }

  /** GET da API com descriptografia de respostas x-encrypted. */
  private async apiGet(path: string): Promise<RawResponse> {
    const url = `${this.apiUrl}${path}`;
    const result = await extGetRaw(url, { xhr: true, headers: await this.headers() });
    this.absorb(result.cookies);

    let text = result.text;
    if (result.encrypted && this.encryptionKey) {
      text = await mangoDecrypt(text, this.encryptionKey);
    }
    try {
      return JSON.parse(text) as RawResponse;
    } catch {
      throw new ExtError('O site retornou uma resposta inválida.', 'parsing');
    }
  }

  /** Detalhes + capítulos vêm do mesmo endpoint (cache de 60s). */
  private async obra(mangaId: string): Promise<RawResponse> {
    const cached = this.detailCache.get(mangaId);
    if (cached && Date.now() - cached.at < 60_000) return cached.response;
    const response = await this.apiGet(`/obras/${encodeURIComponent(mangaId)}`);
    this.detailCache.set(mangaId, { response, at: Date.now() });
    return response;
  }

  private payloadManga(response: RawResponse): RawManga | null {
    const payload = pickPayload(response);
    if (!payload || Array.isArray(payload) || typeof payload !== 'object') return null;
    return payload as RawManga;
  }

  private payloadList(response: RawResponse): RawManga[] {
    const payload = pickPayload(response);
    return Array.isArray(payload) ? (payload as RawManga[]) : [];
  }

  // ── Listas ────────────────────────────────────────────────────────────────

  async getPopular(): Promise<MangasPage> {
    const response = await this.apiGet('/obras/top10/views?periodo=total');
    return { mangas: this.payloadList(response).map((raw) => this.toSummary(raw)), hasNextPage: false };
  }

  async getLatest(page: number): Promise<MangasPage> {
    const response = await this.apiGet(
      `/capitulos/recentes?pagina=${page}&limite=${LATEST_PAGE_SIZE}`,
    );
    return this.toPage(response);
  }

  async search(page: number, query: string): Promise<MangasPage> {
    const trimmed = query.trim();
    let path = `/obras?pagina=${page}&limite=${SEARCH_PAGE_SIZE}`;
    if (trimmed) path += `&busca=${encodeURIComponent(trimmed)}`;
    return this.toPage(await this.apiGet(path));
  }

  private toPage(response: RawResponse): MangasPage {
    const pagination = response.pagination;
    return {
      mangas: this.payloadList(response).map((raw) => this.toSummary(raw)),
      hasNextPage: pagination?.hasNextPage === true,
    };
  }

  private toSummary(raw: RawManga): MangaSummary {
    const cover = absoluteUrl(raw.coverImage ?? raw.imagem ?? raw.banner_imagem, this.cdnUrl);
    return {
      id: encodeId(String(raw.id ?? '')),
      title: raw.title ?? raw.nome ?? '',
      coverUrl: cover ? extImage(cover) : undefined,
      status: parseStatus(raw.status_nome, raw.status_id),
    };
  }

  // ── Detalhes ──────────────────────────────────────────────────────────────

  async getMangaDetails(id: string): Promise<MangaDetails | null> {
    const mangaId = decodeId(id);
    if (!mangaId) return null;
    const response = await this.obra(mangaId);
    const raw = this.payloadManga(response);
    if (!raw) return null;

    const cover = absoluteUrl(raw.coverImage ?? raw.imagem ?? raw.banner_imagem, this.cdnUrl);
    const genres = (raw.tags ?? [])
      .map((tag) => (tag.nome ?? tag.name ?? '').trim())
      .filter(Boolean);
    const description = raw.descricao?.trim();

    return {
      id,
      title: raw.title ?? raw.nome ?? '',
      coverUrl: cover ? extImage(cover) : undefined,
      status: parseStatus(raw.status_nome, raw.status_id),
      genres: genres.length ? genres : undefined,
      description: description || undefined,
    };
  }

  // ── Capítulos ─────────────────────────────────────────────────────────────

  async getChapters(mangaId: string): Promise<Chapter[]> {
    const rawId = decodeId(mangaId);
    if (!rawId) return [];
    const response = await this.obra(rawId);
    const raw = this.payloadManga(response);
    const chapters = raw?.capitulos ?? [];

    return chapters
      .map<Chapter>((cap) => {
        const number = formatChapterNumber(cap.numero ?? '');
        const parsedNumber = Number.parseFloat(number);
        return {
          id: encodeId(`${cap.obra_id ?? rawId}|${number}`),
          mangaId,
          number: Number.isFinite(parsedNumber) ? parsedNumber : -1,
          // rótulo gerado em PT-BR (o original usa "Capitulo")
          title: `Capítulo ${number}`,
          uploadedAt: parseApiDate(cap.criado_em ?? cap.atualizado_em),
          language: 'pt-br',
        };
      })
      .sort((a, b) => b.number - a.number);
  }

  // ── Páginas ───────────────────────────────────────────────────────────────

  async getPages(chapterId: string): Promise<MangaPage[]> {
    const decoded = decodeId(chapterId);
    const separator = decoded.indexOf('|');
    if (separator <= 0) return [];
    const mangaId = decoded.slice(0, separator);
    const number = decoded.slice(separator + 1);

    const response = await this.apiGet(
      `/obras/${encodeURIComponent(mangaId)}/capitulos/${encodeURIComponent(number)}`,
    );
    const payload = pickPayload(response);
    if (!payload || Array.isArray(payload) || typeof payload !== 'object') {
      throw new ExtError('Nenhuma página encontrada no capítulo.', 'parsing');
    }
    const pages = (payload as { paginas?: RawPage[] }).paginas ?? [];

    const sorted = pages
      .slice()
      .sort((a, b) => (a.numero ?? 0) - (b.numero ?? 0))
      .map((page) =>
        absoluteUrl(
          page.cdn_id ?? page.imagem ?? page.image ?? page.src ?? page.link ?? page.path ?? page.arquivo,
          this.cdnUrl,
        ),
      )
      .filter((url): url is string => !!url);

    if (!sorted.length) {
      throw new ExtError('Nenhuma página encontrada no capítulo.', 'parsing');
    }
    return sorted.map((url, index) => ({ index, imageUrl: extImage(url) }));
  }
}

export function createMangoThemeSource(config: MangoThemeConfig): MangoThemeSource {
  return new MangoThemeSource(config);
}

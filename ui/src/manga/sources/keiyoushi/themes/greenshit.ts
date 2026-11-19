/**
 * Tema GreenShit (API própria com scan-id) — port TS de
 * keiyoushi/extensions-source/lib-multisrc/greenshit (Apache 2.0).
 *
 * Cobre MaidScan e Vegitoons (+18 conforme contentWarning do índice):
 * - listas/detalhes/capítulos via API JSON (`scan-id` no header)
 * - páginas em `/capitulos/{id}` (403 = capítulo restrito → mensagem do site)
 * - capas/páginas montadas no CDN a partir de `scans/{scan}/obras/{id}/…`
 *
 * Login (email/senha nas preferências do Mihon) não se aplica ao app —
 * conteúdo gratuito segue funcionando; restrito devolve o erro do site.
 */

import type {
  Chapter,
  MangaDetails,
  MangaPage,
  MangaSource,
  MangasPage,
  MangaSummary,
} from '../../../types';
import { extGet, extImage, ExtError } from '../http';
import { toStatus } from './madara';

export interface GreenShitConfig {
  /** ID estável da fonte (keiyoushi-pt-<pkg>) */
  id: string;
  name: string;
  baseUrl: string;
  /** Raiz da API JSON (ex.: https://api.verdinha.wtf) */
  apiUrl: string;
  /** CDN de imagens de página (ex.: https://cdn.verdinha.wtf) */
  cdnUrl: string;
  /** CDN de capas com `?width=` (ex.: https://api…/cdn) */
  cdnApiUrl: string;
  /** ID da scan enviado no header `scan-id` */
  scanId: string;
  /** Gênero padrão do ranking (gen_id) */
  defaultGenreId?: string;
}

const LIMIT_PER_PAGE = '26';

interface RawChapter {
  cap_id: number;
  cap_nome: string;
  cap_numero?: number | null;
  cap_criado_em?: string | null;
  cap_liberado?: boolean;
}

interface RawManga {
  obr_id: number;
  obr_nome: string;
  obr_descricao?: string | null;
  obr_imagem?: string | null;
  genero?: { gen_nome?: string } | null;
  tags?: Array<{ tag_nome?: string }> | null;
  status?: { stt_nome?: string } | null;
  scan_id?: number;
  capitulos?: RawChapter[];
}

interface RawError {
  message?: string;
}

// ── Montagem de URL de imagem (port de buildImageUrl) ───────────────────────

const MD5_PATH_RE = /^\/[0-9a-fA-F]{32}\//;

function isWpLikePath(src: string): boolean {
  return (
    src.startsWith('uploads/') ||
    src.startsWith('wp-content/') ||
    src.startsWith('manga_') ||
    src.startsWith('WP-manga') ||
    MD5_PATH_RE.test(src)
  );
}

function normalizeSlashes(url: string): string {
  return url.replace(/(?<!:)\/{2,}/g, '/');
}

function buildImageUrl(options: {
  path?: string;
  src?: string;
  width?: number | null;
  base: string;
  isWp?: boolean;
}): string {
  const src = options.src ?? '';
  if (!src.trim()) return '';
  if (src.startsWith('http')) return src;

  if (isWpLikePath(src) || options.isWp) {
    let mapped: string;
    if (src.startsWith('WP-manga')) mapped = `wp-content/uploads/${src}`;
    else if (src.startsWith('uploads/')) mapped = `wp-content/${src}`;
    else if (src.startsWith('manga_')) mapped = `wp-content/uploads/WP-manga/data/${src}`;
    else if (src.startsWith('wp-content/')) mapped = src;
    else mapped = `wp-content/uploads/WP-manga/data/${src.replace(/^\/+/, '')}`;
    return normalizeSlashes(`${options.base}/${mapped}`);
  }

  const query = options.width ? `?width=${options.width}` : '';
  const path = options.path ?? '';
  return normalizeSlashes(`${options.base}${path}/${src}${query}`);
}

// ── Status ──────────────────────────────────────────────────────────────────

function parseStatus(name?: string | null): MangaDetails['status'] {
  if (!name) return 'unknown';
  const lower = name.trim().toLowerCase();
  if (lower === 'em andamento' || lower === 'ativo') return 'ongoing';
  if (lower === 'concluído' || lower === 'concluido') return 'completed';
  if (lower === 'hiato') return 'on_hiatus';
  if (lower === 'cancelado' || lower === 'cancelada') return 'cancelled';
  return toStatus(lower);
}

// ── Motor ───────────────────────────────────────────────────────────────────

export class GreenShitSource implements MangaSource {
  readonly id: string;
  readonly name: string;
  readonly lang = 'pt-br';
  readonly baseUrl: string;
  readonly supportsLatest = true;
  readonly defaultEnabled = false;
  readonly family = 'keiyoushi';

  private readonly apiUrl: string;
  private readonly cdnUrl: string;
  private readonly cdnApiUrl: string;
  private readonly scanId: string;
  private readonly defaultGenreId: string;

  constructor(config: GreenShitConfig) {
    this.id = config.id;
    this.name = config.name;
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.apiUrl = config.apiUrl.replace(/\/+$/, '');
    this.cdnUrl = config.cdnUrl.replace(/\/+$/, '');
    this.cdnApiUrl = config.cdnApiUrl.replace(/\/+$/, '');
    this.scanId = config.scanId;
    this.defaultGenreId = config.defaultGenreId ?? '1';
  }

  private get opts(): { xhr: true; headers: Record<string, string> } {
    return { xhr: true, headers: { 'scan-id': this.scanId } };
  }

  private async fetchJson(url: string): Promise<unknown> {
    const text = await extGet(url, this.opts);
    try {
      return JSON.parse(text);
    } catch {
      throw new ExtError('O site retornou uma resposta inválida.', 'parsing');
    }
  }

  // ── Listas ────────────────────────────────────────────────────────────────

  async getPopular(page: number): Promise<MangasPage> {
    const url =
      `${this.apiUrl}/obras/ranking?tipo=visualizacoes_geral` +
      `&limite=${LIMIT_PER_PAGE}&pagina=${page}&gen_id=${this.defaultGenreId}`;
    return this.parseList(await this.fetchJson(url));
  }

  async getLatest(page: number): Promise<MangasPage> {
    const url =
      `${this.apiUrl}/obras/atualizacoes?pagina=${page}` +
      `&limite=${LIMIT_PER_PAGE}&gen_id=${this.defaultGenreId}`;
    return this.parseList(await this.fetchJson(url));
  }

  async search(page: number, query: string): Promise<MangasPage> {
    let url = `${this.apiUrl}/obras/buscar?limite=${LIMIT_PER_PAGE}&pagina=${page}`;
    if (query.trim()) url += `&obr_nome=${encodeURIComponent(query.trim())}`;
    return this.parseList(await this.fetchJson(url));
  }

  private parseList(json: unknown): MangasPage {
    const body = (json ?? {}) as {
      obras?: RawManga[];
      currentPage?: number;
      pagina_atual?: number;
      pagina?: number;
      totalPages?: number;
      paginas?: number;
      totalPaginas?: number;
    };
    const obras = Array.isArray(body.obras) ? body.obras : [];
    const current = body.currentPage ?? body.pagina_atual ?? body.pagina ?? 0;
    const total = body.totalPages ?? body.paginas ?? body.totalPaginas ?? 0;
    return {
      mangas: obras.map((raw) => this.toSummary(raw)),
      hasNextPage: total > current,
    };
  }

  private coverOf(raw: RawManga): string | null {
    const scanId = raw.scan_id || Number(this.scanId) || 0;
    return buildImageUrl({
      path: `/scans/${scanId}/obras/${raw.obr_id}/`,
      src: raw.obr_imagem ?? '',
      width: 300,
      base: this.cdnApiUrl,
    }) || null;
  }

  private toSummary(raw: RawManga): MangaSummary {
    const cover = this.coverOf(raw);
    return {
      id: String(raw.obr_id),
      title: raw.obr_nome,
      coverUrl: cover ? extImage(cover) : undefined,
      status: parseStatus(raw.status?.stt_nome),
    };
  }

  private async fetchManga(id: string): Promise<RawManga | null> {
    const json = await this.fetchJson(`${this.apiUrl}/obras/${id}`);
    if (!json || typeof json !== 'object') return null;
    return json as RawManga;
  }

  // ── Detalhes ──────────────────────────────────────────────────────────────

  async getMangaDetails(id: string): Promise<MangaDetails | null> {
    const raw = await this.fetchManga(id);
    if (!raw) return null;

    const genres = [
      raw.genero?.gen_nome ?? '',
      ...(raw.tags ?? []).map((tag) => tag.tag_nome ?? ''),
    ].filter((name) => name.trim());

    const cover = this.coverOf(raw);
    let description: string | undefined;
    if (raw.obr_descricao?.trim()) {
      description = new DOMParser()
        .parseFromString(raw.obr_descricao, 'text/html')
        .body.textContent?.trim() || undefined;
    }

    return {
      id: String(raw.obr_id),
      title: raw.obr_nome,
      coverUrl: cover ? extImage(cover) : undefined,
      status: parseStatus(raw.status?.stt_nome),
      genres: genres.length ? genres : undefined,
      description,
    };
  }

  // ── Capítulos (vêm junto dos detalhes) ────────────────────────────────────

  async getChapters(mangaId: string): Promise<Chapter[]> {
    const raw = await this.fetchManga(mangaId);
    if (!raw) return [];

    const chapters = (raw.capitulos ?? []).map<Chapter>((cap) => {
      const locked = cap.cap_liberado === false;
      return {
        id: String(cap.cap_id),
        mangaId,
        number: cap.cap_numero ?? 0,
        title: `${locked ? '🔒 ' : ''}${cap.cap_nome}`,
        uploadedAt: cap.cap_criado_em ? Date.parse(cap.cap_criado_em) || undefined : undefined,
        language: 'pt-br',
      };
    });
    return chapters.sort((a, b) => b.number - a.number);
  }

  // ── Páginas ───────────────────────────────────────────────────────────────

  async getPages(chapterId: string): Promise<MangaPage[]> {
    const url = `${this.apiUrl}/capitulos/${chapterId}`;
    let text: string;
    try {
      text = await extGet(url, this.opts);
    } catch (error) {
      // O site devolve 403 com a mensagem de restrição no corpo
      if (error instanceof ExtError && error.status === 403) {
        throw new ExtError(
          'Este capítulo está restrito. Faça login no site para acessá-lo.',
          'blocked',
          403,
        );
      }
      throw error;
    }

    let json: {
      cap_paginas?: Array<string | { src?: string; is_wp?: boolean }>;
      cap_numero?: number | string | null;
      obra?: { obr_id?: number; scan_id?: number } | null;
    };
    try {
      json = JSON.parse(text);
    } catch {
      throw new ExtError('O site retornou uma resposta inválida.', 'parsing');
    }

    const pages = Array.isArray(json.cap_paginas) ? json.cap_paginas : [];
    const obraId = json.obra?.obr_id ?? 0;
    const scanId = json.obra?.scan_id || Number(this.scanId) || 0;
    const chapterNumber =
      json.cap_numero !== null && json.cap_numero !== undefined
        ? String(json.cap_numero).replace(/\.0$/, '').replace('.', '_')
        : '0';

    const out: MangaPage[] = [];
    for (const page of pages) {
      const src = typeof page === 'string' ? page : page.src ?? '';
      const url2 = buildImageUrl({
        path: `/scans/${scanId}/obras/${obraId}/capitulos/${chapterNumber}/`,
        src,
        base: this.cdnUrl,
        isWp: typeof page === 'object' && page.is_wp === true,
      });
      if (url2) out.push({ index: out.length, imageUrl: extImage(url2) });
    }
    return out;
  }
}

/** Exposto para testes/erros de mensagem do site (ex.: "Faça login"). */
export type { RawError };

export function createGreenShitSource(config: GreenShitConfig): GreenShitSource {
  return new GreenShitSource(config);
}

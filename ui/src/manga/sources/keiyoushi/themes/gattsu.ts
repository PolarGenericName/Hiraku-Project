/**
 * Tema Gattsu (galerias/hentai em blog próprio) — port TS de
 * keiyoushi/extensions-source/lib-multisrc/gattsu (Apache 2.0).
 *
 * Cobre HentaiSeason, HentaiTokyo e UniversoHentai (+18):
 * - listas na home (`div.meio div.lista`; o site não tem "popular" e o
 *   latest é usado no lugar — como no original)
 * - detalhes e capítulos na mesma página (capítulo único por obra)
 * - páginas em `ul.post-fotos` / `div.galeriaHtml` (ou `div.galeria` no
 *   UniversoHentai, que tem listas/detalhes próprios)
 */

import type {
  Chapter,
  MangaDetails,
  MangaPage,
  MangaSource,
  MangasPage,
  MangaSummary,
} from '../../../types';
import { extGet, extImage } from '../http';
import {
  absUrl,
  decodeId,
  encodeId,
  parseChapterDate,
  queryJsoup,
  selectFirst,
} from './madara';

export interface GattsuConfig {
  /** ID estável da fonte (keiyoushi-pt-<pkg>) */
  id: string;
  name: string;
  baseUrl: string;
  /** UniversoHentai: listas em div.video e galeria própria no lugar de post-box */
  videoGallery?: boolean;
}

const ACCEPT_LANGUAGE = 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7,es;q=0.6,gl;q=0.5';
/** Remove o sufixo de tamanho do WordPress (-300x400.) das miniaturas. */
const THUMB_SIZE_RE = /-\d+x\d+\./;

export class GattsuSource implements MangaSource {
  readonly id: string;
  readonly name: string;
  readonly lang = 'pt-br';
  readonly baseUrl: string;
  /** O site não tem ranking próprio — a lista de recentes é a home. */
  readonly supportsLatest = false;
  readonly defaultEnabled = false;
  readonly family = 'keiyoushi';

  private readonly videoGallery: boolean;

  constructor(config: GattsuConfig) {
    this.id = config.id;
    this.name = config.name;
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.videoGallery = config.videoGallery === true;
  }

  private get opts(): { headers: Record<string, string> } {
    return { headers: { 'accept-language': ACCEPT_LANGUAGE } };
  }

  private get listSelector(): string {
    return this.videoGallery
      ? 'div.meio div.videos div.video a:not(:has(span.selo-hd))'
      : 'div.meio div.lista ul li a';
  }

  private get detailsSelector(): string {
    return this.videoGallery
      ? 'div.meio div.post[itemscope]:has(a[title=Abrir galeria])'
      : 'div.meio div.post-box';
  }

  private get pageSelector(): string {
    return this.videoGallery
      ? 'div.meio div.galeria div.galeria-foto a img'
      : 'div.meio div.post-box ul.post-fotos li a > img, div.meio div.post-box.listaImagens div.galeriaHtml img';
  }

  // ── Listas ────────────────────────────────────────────────────────────────

  getPopular(page: number): Promise<MangasPage> {
    return this.fetchList(page);
  }

  getLatest(page: number): Promise<MangasPage> {
    return this.fetchList(page);
  }

  private async fetchList(page: number): Promise<MangasPage> {
    const url = page > 1 ? `${this.baseUrl}/page/${page}/` : `${this.baseUrl}/`;
    const html = await extGet(url, this.opts);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return {
      mangas: this.parseList(doc, url),
      hasNextPage: selectFirst(doc, 'ul.paginacao li.next > a') !== null,
    };
  }

  async search(page: number, query: string): Promise<MangasPage> {
    const url = new URL(`${this.baseUrl}/page/${page}/`);
    url.searchParams.set('s', query);
    url.searchParams.set('post_type', 'post');
    const target = url.toString();
    const html = await extGet(target, this.opts);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return {
      mangas: this.parseList(doc, target),
      hasNextPage: selectFirst(doc, 'ul.paginacao li.next > a') !== null,
    };
  }

  private parseList(doc: Document, base: string): MangaSummary[] {
    const titleSelector = this.videoGallery ? 'span.video-titulo' : 'span.thumb-titulo';
    const imgSelector = this.videoGallery
      ? 'img.wp-post-image'
      : 'span.thumb-imagem img.wp-post-image';
    const out: MangaSummary[] = [];
    for (const el of queryJsoup(doc, this.listSelector)) {
      const href = el.getAttribute('href');
      if (!href) continue;
      const title = selectFirst(el, titleSelector);
      if (!title) continue;
      const img = selectFirst(el, imgSelector);
      const cover = img ? absUrl(img.getAttribute('src'), base) : null;
      out.push({
        id: encodeId(this.pathOf(href)),
        title: (title.textContent || '').trim(),
        coverUrl: cover ? extImage(cover) : undefined,
      });
    }
    return out;
  }

  private pathOf(href: string): string {
    try {
      const url = new URL(href, `${this.baseUrl}/`);
      return url.pathname + url.search;
    } catch {
      return href;
    }
  }

  // ── Detalhes ──────────────────────────────────────────────────────────────

  async getMangaDetails(id: string): Promise<MangaDetails | null> {
    const path = decodeId(id);
    const url = absUrl(path, `${this.baseUrl}/`);
    if (!url) return null;
    const html = await extGet(url, this.opts);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const box = selectFirst(doc, this.detailsSelector);
    if (!box) return null;
    const titleEl = selectFirst(box, 'h1.post-titulo');
    if (!titleEl) return null;

    const base = url;
    const authorSelector = this.videoGallery
      ? 'ul.paginaPostItens li:contains(Artista) a'
      : 'ul.post-itens li:contains(Artista) a';
    const genreSelector = this.videoGallery
      ? 'ul.paginaPostItens li:contains(Categorias) a'
      : 'ul.post-itens li:contains(Tags) a';
    const thumbSelector = this.videoGallery
      ? 'div.paginaPostThumb > img.wp-post-image'
      : 'div.post-capa > img.wp-post-image';

    const authors = queryJsoup(box, authorSelector)
      .map((el) => (el.textContent || '').trim())
      .filter(Boolean);
    const genres = queryJsoup(box, genreSelector)
      .map((el) => (el.textContent || '').trim())
      .filter(Boolean);

    let description: string | undefined;
    if (!this.videoGallery) {
      const paragraphs = queryJsoup(box, 'div.post-texto p')
        .map((p) => (p.textContent || '').trim())
        .filter(Boolean)
        .join('\n\n')
        .replace('Sinopse :', '')
        .trim();
      description = paragraphs || undefined;
    }

    const thumb = selectFirst(box, thumbSelector);
    const cover = thumb ? absUrl(thumb.getAttribute('src'), base) : null;

    return {
      id,
      title: (titleEl.textContent || '').trim(),
      coverUrl: cover ? extImage(withoutSize(cover)) : undefined,
      // Gattsu publica tudo como galeria única (paridade com o original)
      status: 'completed',
      genres: genres.length ? genres : undefined,
      description,
      authors: authors.length ? authors : undefined,
    };
  }

  // ── Capítulos (sempre "Capítulo único") ───────────────────────────────────

  async getChapters(mangaId: string): Promise<Chapter[]> {
    const path = decodeId(mangaId);
    const url = absUrl(path, `${this.baseUrl}/`);
    if (!url) return [];
    const html = await extGet(url, this.opts);
    const doc = new DOMParser().parseFromString(html, 'text/html');

    // Sem imagens no post não há capítulo para listar (como no original).
    // No modo videoGallery o UniversoHentai sobrescreve chapterListParse e
    // remove esse guard: as imagens ficam na página da galeria (link
    // "Abrir galeria"), não no post.
    if (!this.videoGallery && !selectFirst(doc, this.pageSelector)) return [];

    const translatorSelector = this.videoGallery
      ? 'ul.paginaPostItens li:contains(Tradutor) a'
      : 'ul.post-itens li:contains(Tradutor) a';
    const published = selectFirst(doc, 'meta[property=article:published_time]');
    const uploadedAt = parseChapterDate(
      published?.getAttribute('content')?.split('T')[0],
      'yyyy-MM-dd',
    );

    const chapters: Chapter[] = [];
    for (const el of queryJsoup(doc, this.detailsSelector)) {
      let chapterPath = path;
      if (this.videoGallery) {
        const link = selectFirst(el, 'a[title=Abrir galeria]');
        const href = link?.getAttribute('href');
        if (!href) continue;
        chapterPath = this.pathOf(href);
      }
      const scanlator = selectFirst(el, translatorSelector);
      chapters.push({
        id: encodeId(`${path}|${chapterPath}`),
        mangaId,
        number: 0,
        title: 'Capítulo único',
        scanlator: scanlator ? (scanlator.textContent || '').trim() : undefined,
        uploadedAt,
        language: 'pt-br',
      });
    }
    return chapters;
  }

  // ── Páginas ───────────────────────────────────────────────────────────────

  async getPages(chapterId: string): Promise<MangaPage[]> {
    const decoded = decodeId(chapterId);
    const separator = decoded.lastIndexOf('|');
    if (separator === -1) return [];
    const chapterPath = decoded.slice(separator + 1);
    const url = absUrl(chapterPath, `${this.baseUrl}/`);
    if (!url) return [];

    const html = await extGet(url, this.opts);
    const doc = new DOMParser().parseFromString(html, 'text/html');

    const pages: MangaPage[] = [];
    for (const img of queryJsoup(doc, this.pageSelector)) {
      const src = img.getAttribute('data-src') || img.getAttribute('src');
      const abs = absUrl(src, url);
      if (!abs) continue;
      pages.push({ index: pages.length, imageUrl: extImage(withoutSize(abs)) });
    }
    return pages;
  }
}

function withoutSize(url: string): string {
  return url.replace(THUMB_SIZE_RE, '.');
}

export function createGattsuSource(config: GattsuConfig): GattsuSource {
  return new GattsuSource(config);
}

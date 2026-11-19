/**
 * Manga section types — espelha o contrato source-api do Mihon/Tachiyomi
 * (Source → MangaSource, SManga → Manga, SChapter → Chapter, Page → MangaPage)
 *
 * Fontes são implementações nativas em TS (não APKs Android).
 * PT-BR apenas.
 */

/** Resultado de listagem (popular/latest/search) — espelha MangasPage */
export interface MangasPage {
  mangas: MangaSummary[];
  hasNextPage: boolean;
}

/** Item de catálogo — espelha SManga enxugado */
export interface MangaSummary {
  id: string;
  title: string;
  coverUrl?: string;
  status?: MangaStatus;
  year?: number;
  genres?: string[];
  /** true se a fonte declara suporte a capítulos recentes */
  latestChapterNumber?: number;
}

export type MangaStatus =
  | 'ongoing'
  | 'completed'
  | 'on_hiatus'
  | 'cancelled'
  | 'unknown';

/** Detalhes completos — espelha SManga */
export interface MangaDetails extends MangaSummary {
  description?: string;
  authors?: string[];
  artists?: string[];
  tags?: string[];
  /** Preferência de idioma dos capítulos (ex.: 'pt-br') */
  preferredLanguage?: string;
}

/** Capítulo — espelha SChapter */
export interface Chapter {
  id: string;
  mangaId: string;
  /** Número do capítulo (pode ser fração, ex.: 10.5) */
  number: number;
  title?: string;
  scanlator?: string;
  /** Timestamp do upload, se conhecido */
  uploadedAt?: number;
  language: string;
}

/** Página do leitor — espelha Page (index + URL da imagem) */
export interface MangaPage {
  index: number;
  imageUrl: string;
}

/**
 * Contrato de fonte de mangá — espelha eu.kanade.tachiyomi.source.Source
 * do Mihon. Toda fonte (MangaDex, futuras) implementa isto.
 */
export interface MangaSource {
  /** ID estável (usado em URLs e storage) */
  id: string;
  /** Nome exibido ao usuário */
  name: string;
  /** Código ISO 639-1 do conteúdo (ex.: 'pt-br', 'en') */
  lang: string;
  /** URL base da fonte (exibida nas configurações) */
  baseUrl: string;
  /** Se a fonte fornece lista de capítulos recentes */
  supportsLatest: boolean;
  /**
   * false = opt-in: a fonte só é usada quando o usuário habilita na Loja
   * (padrão true para fontes "de fábrica" como a MangaDex).
   */
  defaultEnabled?: boolean;
  /** Família da fonte para agrupamento na Loja (ex.: 'keiyoushi') */
  family?: string;
  /** true quando a fonte oferece preferência de idioma dos capítulos */
  supportsLangPref?: boolean;

  getPopular(page: number): Promise<MangasPage>;
  getLatest(page: number): Promise<MangasPage>;
  search(page: number, query: string): Promise<MangasPage>;
  /**
   * Busca por gênero real (opcional — fontes com filtro de tags, ex.:
   * MangaDex). Usada pelas tags de gênero do details; sem este método a
   * fonte cai na busca por texto.
   */
  searchByGenre?(page: number, genre: string): Promise<MangasPage>;
  getMangaDetails(id: string): Promise<MangaDetails | null>;
  /** Retorna capítulos ordenados do mais recente para o mais antigo */
  getChapters(mangaId: string): Promise<Chapter[]>;
  /**
   * Resolve um capítulo específico pelo ID (o leitor pode abrir um capítulo
   * que não está na lista deduplicada de getChapters).
   */
  getChapter?(chapterId: string): Promise<Chapter | null>;
  /** Lista de páginas de um capítulo, em ordem de leitura */
  getPages(chapterId: string): Promise<MangaPage[]>;
}

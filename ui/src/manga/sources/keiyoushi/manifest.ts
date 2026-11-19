/**
 * Catálogo de extensões Keiyoushi portadas para TS — ARQUIVO GERADO.
 * Fonte: keiyoushi/extensions-source (Apache 2.0) — lib-multisrc/* + src/pt/*.
 * Gerado por scripts de port; 45 extensões PT-BR (36 com aviso +18, 21 de temas não-Madara).
 *
 * nsfw = contentWarning != SAFE (mesma regra do Mihon: isNsfw >= MIXED).
 */

import type { MadaraConfig } from './themes/madara';
import type { GattsuConfig } from './themes/gattsu';
import type { GreenShitConfig } from './themes/greenshit';
import type { MangaWorkConfig } from './themes/mangawork';
import type { MangoThemeConfig } from './themes/mangotheme';
import type { HiperConfig } from './themes/hiper';
import type { ZeistConfig } from './themes/zeistmanga';
import type { AuroraConfig } from './themes/aurora';
import type { MangaThemesiaConfig } from './themes/mangathemesia';

/** Campos de loja comuns a todas as extensões portadas. */
export interface KeiyoushiStoreFields {
  /** Sufixo do packageName (eu.kanade.tachiyomi.extension.pt.<pkg>) */
  pkg: string;
  /** Versão da extensão Keiyoushi da qual este port foi feito */
  version: string;
  /** true quando contentWarning = MIXED/NSFW (exibir tag +18) */
  nsfw: boolean;
  /** Ícone oficial da extensão (repositório Keiyoushi) */
  icon?: string;
  /** Hosts extras (CDNs de imagem/API) liberados no proxy */
  extraHosts?: string[];
  /** Hosts que só respondem em http puro (sem TLS) — exceção no proxy */
  insecureHosts?: string[];
}

/**
 * União discriminada por tema — cada membro estende o config da engine
 * correspondente (ver themes/*) e os campos de loja comuns.
 */
export type KeiyoushiEntry =
  | (MadaraConfig & { theme: 'madara' } & KeiyoushiStoreFields)
  | (GattsuConfig & { theme: 'gattsu' } & KeiyoushiStoreFields)
  | (GreenShitConfig & { theme: 'greenshit' } & KeiyoushiStoreFields)
  | (MangaWorkConfig & { theme: 'mangawork' } & KeiyoushiStoreFields)
  | (MangoThemeConfig & { theme: 'mangotheme' } & KeiyoushiStoreFields)
  | (HiperConfig & { theme: 'hiper' } & KeiyoushiStoreFields)
  | (ZeistConfig & { theme: 'zeistmanga' } & KeiyoushiStoreFields)
  | (AuroraConfig & { theme: 'aurora' } & KeiyoushiStoreFields)
  | (MangaThemesiaConfig & { theme: 'mangathemesia' } & KeiyoushiStoreFields)
;

export const KEIYOUSHI_ENTRIES: KeiyoushiEntry[] = [
  {
    "id": "keiyoushi-pt-acervohentai",
    "name": "Acervo Hentai",
    "baseUrl": "https://acervohentai.com",
    "pkg": "acervohentai",
    "version": "1.6.59",
    "nsfw": true,
    "icon": "https://cdn.jsdelivr.net/gh/keiyoushi/extensions-source@main/src/pt/acervohentai/res/mipmap-xhdpi/ic_launcher.png",
    "theme": "madara",
    "chapterMode": "MangaAjax",
    "chapterDateFormat": "dd/MM/yyyy",
    "mangaSubString": "manhwa",
    "genreDirectory": "tag-manhwa",
    "mangaDetailsSelectorStatus": "div.post-status .summary-heading:contains(Status) + .summary-content"
  },
  {
    "id": "keiyoushi-pt-amuy",
    "name": "Amuy",
    "baseUrl": "https://apenasmaisumyaoi.com",
    "pkg": "amuy",
    "version": "1.6.61",
    "nsfw": true,
    "icon": "https://cdn.jsdelivr.net/gh/keiyoushi/extensions-source@main/src/pt/amuy/res/mipmap-xhdpi/ic_launcher.png",
    "theme": "madara",
    "noAjax": true,
    "chapterMode": "MangaAjax",
    "chapterDateFormat": "d 'de' MMMM 'de' yyyy"
  },
  {
    "id": "keiyoushi-pt-arthurscan",
    "name": "Arthur Scan",
    "baseUrl": "https://arthurscan.xyz",
    "pkg": "arthurscan",
    "version": "1.6.66",
    "nsfw": false,
    "icon": "https://cdn.jsdelivr.net/gh/keiyoushi/extensions-source@main/src/pt/arthurscan/res/mipmap-xhdpi/ic_launcher.png",
    "theme": "madara",
    "supportsPostId": false,
    "chapterMode": "MangaAjax",
    "chapterDateFormat": "MMMM d, yyyy",
    "filterGenresSelector": ".genre-item"
  },
  {
    "id": "keiyoushi-pt-borutoexplorer",
    "name": "Boruto Explorer",
    "baseUrl": "https://leitor.borutoexplorer.com.br",
    "pkg": "borutoexplorer",
    "version": "1.6.60",
    "nsfw": false,
    "icon": "https://cdn.jsdelivr.net/gh/keiyoushi/extensions-source@main/src/pt/borutoexplorer/res/mipmap-xhdpi/ic_launcher.png",
    "theme": "madara",
    "chapterDateFormat": "dd 'de' MMMM 'de' yyyy"
  },
  {
    "id": "keiyoushi-pt-cafecomyaoi",
    "name": "Café com Yaoi",
    "baseUrl": "https://cafecomyaoi.com.br",
    "pkg": "cafecomyaoi",
    "version": "1.6.61",
    "nsfw": true,
    "icon": "https://cdn.jsdelivr.net/gh/keiyoushi/extensions-source@main/src/pt/cafecomyaoi/res/mipmap-xhdpi/ic_launcher.png",
    "theme": "madara",
    "chapterMode": "MangaAjax",
    "chapterDateFormat": "dd/MM/yyyy"
  },
  {
    "id": "keiyoushi-pt-covenscan",
    "name": "Coven Scan",
    "baseUrl": "https://covendasbruxonas.com",
    "pkg": "covenscan",
    "version": "1.6.61",
    "nsfw": true,
    "icon": "https://cdn.jsdelivr.net/gh/keiyoushi/extensions-source@main/src/pt/covenscan/res/mipmap-xhdpi/ic_launcher.png",
    "theme": "madara",
    "noAjax": true,
    "supportsPostId": false,
    "chapterMode": "MangaAjax",
    "mangaDetailsSelectorAuthor": "div.post-content_item:contains(Author) > div.summary-content"
  },
  {
    "id": "keiyoushi-pt-euphoriascan",
    "name": "Euphoria Scan",
    "baseUrl": "https://euphoriascan.com",
    "pkg": "euphoriascan",
    "version": "1.6.58",
    "nsfw": true,
    "icon": "https://cdn.jsdelivr.net/gh/keiyoushi/extensions-source@main/src/pt/euphoriascan/res/mipmap-xhdpi/ic_launcher.png",
    "theme": "madara",
    "chapterMode": "MangaAjax",
    "chapterDateFormat": "dd 'de' MMMM 'de' yyyy",
    "mangaDetailsSelectorStatus": "div.summary-heading:contains(Status) + div.summary-content"
  },
  {
    "id": "keiyoushi-pt-fleurblanche",
    "name": "Fleur Blanche",
    "baseUrl": "https://fbsscan.com",
    "pkg": "fleurblanche",
    "version": "1.6.64",
    "nsfw": true,
    "icon": "https://cdn.jsdelivr.net/gh/keiyoushi/extensions-source@main/src/pt/fleurblanche/res/mipmap-xhdpi/ic_launcher.png",
    "theme": "madara",
    "chapterMode": "MangaAjax",
    "chapterDateFormat": "dd/MM/yyyy",
    "mangaDetailsSelectorStatus": "div.post-content_item:contains(Status) > div.summary-content",
    "loginWall": true
  },
  {
    "id": "keiyoushi-pt-flowermanga",
    "name": "FlowerManga.net",
    "baseUrl": "https://flowermangas.net",
    "pkg": "flowermanga",
    "version": "1.6.62",
    "nsfw": true,
    "icon": "https://cdn.jsdelivr.net/gh/keiyoushi/extensions-source@main/src/pt/flowermanga/res/mipmap-xhdpi/ic_launcher.png",
    "theme": "madara",
    "chapterMode": "MangaAjax",
    "chapterDateFormat": "dd.MM.yyyy",
    "chapterDateSelector": ".chapter-release-date .timediff"
  },
  {
    "id": "keiyoushi-pt-hentaiteca",
    "name": "Hentai Teca",
    "baseUrl": "https://hentaiteca.online",
    "pkg": "hentaiteca",
    "version": "1.6.58",
    "nsfw": true,
    "icon": "https://cdn.jsdelivr.net/gh/keiyoushi/extensions-source@main/src/pt/hentaiteca/res/mipmap-xhdpi/ic_launcher.png",
    "theme": "madara",
    "chapterMode": "MangaAjax"
  },
  {
    "id": "keiyoushi-pt-hotcabaretscan",
    "name": "Hot Cabaret Scan",
    "baseUrl": "https://hotcabaretscan.com",
    "pkg": "hotcabaretscan",
    "version": "1.6.59",
    "nsfw": true,
    "icon": "https://cdn.jsdelivr.net/gh/keiyoushi/extensions-source@main/src/pt/hotcabaretscan/res/mipmap-xhdpi/ic_launcher.png",
    "theme": "madara",
    "chapterDateFormat": "MMMM dd, yyyy",
    "passwordProtected": true
  },
  {
    "id": "keiyoushi-pt-huntersscans",
    "name": "Hunters Scan",
    "baseUrl": "https://readhunters.xyz",
    "pkg": "huntersscans",
    "version": "1.6.70",
    "nsfw": true,
    "icon": "https://cdn.jsdelivr.net/gh/keiyoushi/extensions-source@main/src/pt/huntersscans/res/mipmap-xhdpi/ic_launcher.png",
    "theme": "madara",
    "chapterMode": "MangaAjaxPaginated",
    "chapterDateFormat": "dd/MM/yyyy",
    "mangaSubString": "read",
    "mangaDetailsSelectorStatus": "div.summary-heading:contains(Status) + div",
    "pagesCanvas": true
  },
  {
    "id": "keiyoushi-pt-inkapk",
    "name": "Inkapk",
    "baseUrl": "https://inkapk.net",
    "pkg": "inkapk",
    "version": "1.6.61",
    "nsfw": true,
    "icon": "https://cdn.jsdelivr.net/gh/keiyoushi/extensions-source@main/src/pt/inkapk/res/mipmap-xhdpi/ic_launcher.png",
    "theme": "madara",
    "chapterMode": "MangaAjax",
    "chapterDateFormat": "MMMM d, yyyy",
    "mangaSubString": "obras",
    "genreDirectory": "obras-genre",
    "filterGenresSelector": ".ink-genre-bar",
    "mangaDetailsSelectorTitle": ".ink-det-title",
    "mangaDetailsSelectorAuthor": ".lbl:contains(Autor) + span",
    "mangaDetailsSelectorArtist": ".lbl:contains(Arte) + span",
    "mangaDetailsSelectorStatus": ".lbl:contains(Status) + span",
    "mangaDetailsSelectorDescription": ".ink-det-desc",
    "mangaDetailsSelectorThumbnail": ".ink-det-cover img",
    "mangaDetailsSelectorGenre": ".ink-det-genres .ink-genre-pill"
  },
  {
    "id": "keiyoushi-pt-mangalivreto",
    "name": "Manga Livre.to",
    "baseUrl": "https://mangalivre.to",
    "pkg": "mangalivreto",
    "version": "1.6.60",
    "nsfw": true,
    "icon": "https://cdn.jsdelivr.net/gh/keiyoushi/extensions-source@main/src/pt/mangalivreto/res/mipmap-xhdpi/ic_launcher.png",
    "theme": "madara",
    "chapterDateFormat": "dd 'de' MMMM 'de' yyyy",
    "chapterDateSelector": ".chapter-date",
    "chapterListSelector": ".listing-chapters-wrap .chapter-box"
  },
  {
    "id": "keiyoushi-pt-minitwoscan",
    "name": "MiniTwo Scan",
    "baseUrl": "https://minitwoscan.com",
    "pkg": "minitwoscan",
    "version": "1.6.59",
    "nsfw": true,
    "icon": "https://cdn.jsdelivr.net/gh/keiyoushi/extensions-source@main/lib-multisrc/madara/res/mipmap-xhdpi/ic_launcher.png",
    "theme": "madara",
    "chapterMode": "AdminAjax",
    "chapterDateFormat": "dd/MM/yyyy"
  },
  {
    "id": "keiyoushi-pt-mrtenzus",
    "name": "MR Tenzus",
    "baseUrl": "https://mrtenzus.com",
    "pkg": "mrtenzus",
    "version": "1.6.59",
    "nsfw": true,
    "icon": "https://cdn.jsdelivr.net/gh/keiyoushi/extensions-source@main/src/pt/mrtenzus/res/mipmap-xhdpi/ic_launcher.png",
    "theme": "madara",
    "chapterMode": "MangaAjax",
    "chapterDateFormat": "MM/dd/yyyy"
  },
  {
    "id": "keiyoushi-pt-nebulosascan",
    "name": "Nebulosa Scan",
    "baseUrl": "https://nebulosascan.com",
    "pkg": "nebulosascan",
    "version": "1.6.59",
    "nsfw": true,
    "icon": "https://cdn.jsdelivr.net/gh/keiyoushi/extensions-source@main/src/pt/nebulosascan/res/mipmap-xhdpi/ic_launcher.png",
    "theme": "madara",
    "chapterMode": "MangaAjax",
    "chapterDateFormat": "MM/dd/yyyy"
  },
  {
    "id": "keiyoushi-pt-ninjascan",
    "name": "Ninja Scan",
    "baseUrl": "https://ninjacomics.xyz",
    "pkg": "ninjascan",
    "version": "1.6.61",
    "nsfw": false,
    "icon": "https://cdn.jsdelivr.net/gh/keiyoushi/extensions-source@main/src/pt/ninjascan/res/mipmap-xhdpi/ic_launcher.png",
    "theme": "madara",
    "chapterMode": "MangaAjax",
    "chapterDateFormat": "dd 'de' MMMM 'de' yyyy"
  },
  {
    "id": "keiyoushi-pt-nocturnesummer",
    "name": "Nocturne Summer",
    "baseUrl": "https://nocfsb.com",
    "pkg": "nocturnesummer",
    "version": "1.6.60",
    "nsfw": true,
    "icon": "https://cdn.jsdelivr.net/gh/keiyoushi/extensions-source@main/src/pt/nocturnesummer/res/mipmap-xhdpi/ic_launcher.png",
    "theme": "madara",
    "chapterMode": "MangaAjax",
    "chapterDateFormat": "dd 'de' MMMM 'de' yyyy",
    "mangaDetailsSelectorStatus": "div.post-content_item:contains(Estado) > div.summary-content"
  },
  {
    "id": "keiyoushi-pt-portalyaoi",
    "name": "Portal Yaoi",
    "baseUrl": "https://portalyaoi.com",
    "pkg": "portalyaoi",
    "version": "1.6.61",
    "nsfw": true,
    "icon": "https://cdn.jsdelivr.net/gh/keiyoushi/extensions-source@main/src/pt/portalyaoi/res/mipmap-xhdpi/ic_launcher.png",
    "theme": "madara",
    "noAjax": true,
    "chapterDateFormat": "dd/MM/yyyy",
    "imageObfuscation": "content-node-xor",
    "archiveSelector": ".manga-item",
    "archiveUrlSelector": "h3.manga-title a",
    "supportsPostId": false,
    "mangaDetailsSelectorTitle": "h1.manga-hero-title",
    "mangaDetailsSelectorAuthor": "div.manga-hero-author .author-name a",
    "mangaDetailsSelectorDescription": "div.manga-hero-synopsis-box",
    "mangaDetailsSelectorThumbnail": "img.hero-cover-img",
    "mangaDetailsSelectorGenre": "div.manga-hero-genres a",
    "mangaDetailsSelectorTag": "div.manga-hero-tags a",
    "mangaDetailsSelectorStatus": ".brand-badge.badge-status",
    "altNameSelector": "div.manga-hero-alt-titles",
    "seriesTypeSelector": ".brand-badge.badge-type",
    "extraHosts": [
      "cdn.portalyaoi.com"
    ]
  },
  {
    "id": "keiyoushi-pt-tankouhentai",
    "name": "Tankou Hentai",
    "baseUrl": "https://tankouhentai.com",
    "pkg": "tankouhentai",
    "version": "1.6.59",
    "nsfw": true,
    "icon": "https://cdn.jsdelivr.net/gh/keiyoushi/extensions-source@main/lib-multisrc/madara/res/mipmap-xhdpi/ic_launcher.png",
    "theme": "madara",
    "chapterMode": "MangaAjax",
    "chapterDateFormat": "dd 'de' MMMM 'de' yyyy"
  },
  {
    "id": "keiyoushi-pt-tiamanhwa",
    "name": "Tia Manhwa",
    "baseUrl": "https://tiamanhwa.com",
    "pkg": "tiamanhwa",
    "version": "1.6.61",
    "nsfw": true,
    "icon": "https://cdn.jsdelivr.net/gh/keiyoushi/extensions-source@main/src/pt/tiamanhwa/res/mipmap-xhdpi/ic_launcher.png",
    "theme": "madara",
    "noAjax": true,
    "chapterDateFormat": "dd/MM/yyyy",
    "mangaSubString": "manhwa",
    "genreDirectory": "tag-manhwa"
  },
  {
    "id": "keiyoushi-pt-yaoifanclub",
    "name": "Yaoi Fan Club",
    "baseUrl": "https://yaoifanclub.com",
    "pkg": "yaoifanclub",
    "version": "1.6.61",
    "nsfw": true,
    "icon": "https://cdn.jsdelivr.net/gh/keiyoushi/extensions-source@main/src/pt/yaoifanclub/res/mipmap-xhdpi/ic_launcher.png",
    "theme": "madara",
    "noAjax": true,
    "mangaSubString": "obra",
    "genreDirectory": "obra-genre",
    "archiveSelector": "div.page-item-detail.manga"
  },
  {
    "id": "keiyoushi-pt-yuriverso",
    "name": "Yuri on Air",
    "baseUrl": "https://yurionair.top",
    "pkg": "yuriverso",
    "version": "1.6.64",
    "nsfw": true,
    "icon": "https://cdn.jsdelivr.net/gh/keiyoushi/extensions-source@main/src/pt/yuriverso/res/mipmap-xhdpi/ic_launcher.png",
    "theme": "madara",
    "noAjax": true,
    "chapterMode": "MangaAjax",
    "chapterDateFormat": "dd/MM/yyyy",
    "genreDirectory": "manga-genero",
    "archiveUrlSelector": ".post-title a:not(:has(.manga-title-badges))"
  },
  {
    "id": "keiyoushi-pt-apenasumafa",
    "name": "Apenas Uma Fã",
    "baseUrl": "https://apenasuma-fa.blogspot.com",
    "pkg": "apenasumafa",
    "version": "1.6.19",
    "nsfw": false,
    "icon": "https://cdn.jsdelivr.net/gh/keiyoushi/extensions-source@main/core/src/main/res/mipmap-xhdpi/ic_launcher.png",
    "theme": "zeistmanga",
    "supportsLatest": false,
    "detailsSelector": "#main",
    "artistSelector": "span#tartist",
    "authorSelector": "span#tauther",
    "descriptionSelector": "#syn_bod",
    "genresSelector": "a[href*='search/label'].leading-none",
    "statusSelector": "div[class*=bg-green] span",
    "thumbSelector": ".hidden img",
    "chapterLabelSelector": ".chapter_get",
    "pageListSelector": "#reader div.separator",
    "extraHosts": [
      "blogger.googleusercontent.com",
      "bp.blogspot.com",
      "blogblog.com"
    ]
  },
  {
    "id": "keiyoushi-pt-galaxscanlator",
    "name": "GALAX Scans",
    "baseUrl": "https://galaxscanlator.blogspot.com",
    "pkg": "galaxscanlator",
    "version": "1.6.20",
    "nsfw": true,
    "icon": "https://cdn.jsdelivr.net/gh/keiyoushi/extensions-source@main/src/pt/galaxscanlator/res/mipmap-xhdpi/ic_launcher.png",
    "theme": "zeistmanga",
    "popularSelector": "#PopularPosts2 article",
    "popularTitleSelector": "h4",
    "popularUrlSelector": "a",
    "detailsSelector": ".grid.gta-series",
    "genresSelector": "dt:contains(Genre) + dd a[rel=tag]",
    "useNewChapterFeed": true,
    "pageListSelector": ".separator",
    "rawPages": true,
    "extraHosts": [
      "blogger.googleusercontent.com",
      "bp.blogspot.com",
      "blogblog.com"
    ]
  },
  {
    "id": "keiyoushi-pt-hanmokkuscan",
    "name": "Hanmokku Scan",
    "baseUrl": "https://hanmokkuscan.blogspot.com",
    "pkg": "hanmokkuscan",
    "version": "1.6.18",
    "nsfw": true,
    "icon": "https://cdn.jsdelivr.net/gh/keiyoushi/extensions-source@main/src/pt/hanmokkuscan/res/mipmap-xhdpi/ic_launcher.png",
    "theme": "zeistmanga",
    "extraCategories": [
      "Todos os Projetos"
    ],
    "chapterCategory": "Capítulo",
    "htmlSearch": true,
    "extraHosts": [
      "blogger.googleusercontent.com",
      "bp.blogspot.com",
      "blogblog.com"
    ]
  },
  {
    "id": "keiyoushi-pt-ler999",
    "name": "Ler 999",
    "baseUrl": "https://ler999.blogspot.com",
    "pkg": "ler999",
    "version": "1.6.19",
    "nsfw": false,
    "icon": "https://cdn.jsdelivr.net/gh/keiyoushi/extensions-source@main/src/pt/ler999/res/mipmap-xhdpi/ic_launcher.png",
    "theme": "zeistmanga",
    "extraHosts": [
      "blogger.googleusercontent.com",
      "bp.blogspot.com",
      "blogblog.com"
    ]
  },
  {
    "id": "keiyoushi-pt-pinkrosa",
    "name": "Pink Rosa",
    "baseUrl": "https://scanpinkrosa.blogspot.com",
    "pkg": "pinkrosa",
    "version": "1.6.20",
    "nsfw": false,
    "icon": "https://cdn.jsdelivr.net/gh/keiyoushi/extensions-source@main/src/pt/pinkrosa/res/mipmap-xhdpi/ic_launcher.png",
    "theme": "zeistmanga",
    "supportsLatest": false,
    "detailsSelector": "#main",
    "authorSelector": "#tauther",
    "descriptionSelector": "#syn_bod",
    "genresSelector": "a[href*=label][rel]",
    "statusSelector": "div[class*=bg-green] span",
    "thumbSelector": ".hidden img",
    "chapterLabelSelector": ".chapter_get",
    "pageListSelector": "div.separator",
    "extraHosts": [
      "blogger.googleusercontent.com",
      "bp.blogspot.com",
      "blogblog.com"
    ]
  },
  {
    "id": "keiyoushi-pt-traducoesdolipe",
    "name": "Traduções do Lipe",
    "baseUrl": "https://traducoesdolipe.blogspot.com",
    "pkg": "traducoesdolipe",
    "version": "1.6.19",
    "nsfw": false,
    "icon": "https://cdn.jsdelivr.net/gh/keiyoushi/extensions-source@main/src/pt/traducoesdolipe/res/mipmap-xhdpi/ic_launcher.png",
    "theme": "zeistmanga",
    "supportsLatest": false,
    "includedCategories": [
      "Projeto"
    ],
    "chapterCategory": "Capítulo",
    "detailsSelector": ".main-content",
    "authorSelector": "li:contains(Autor) > span",
    "artistSelector": "li:contains(Ilustração) > span",
    "descriptionSelector": ".synopsis",
    "genresSelector": ".genres a",
    "statusSelector": ".status",
    "chapterLabelFromScript": true,
    "scriptPages": true,
    "extraHosts": [
      "blogger.googleusercontent.com",
      "bp.blogspot.com",
      "blogblog.com"
    ]
  },
  {
    "id": "keiyoushi-pt-leitordemangas",
    "name": "Leitor de Mangas",
    "baseUrl": "https://leitordemangas.com",
    "pkg": "leitordemangas",
    "version": "1.6.58",
    "nsfw": true,
    "icon": "https://cdn.jsdelivr.net/gh/keiyoushi/extensions-source@main/src/pt/leitordemangas/res/mipmap-xhdpi/ic_launcher.png",
    "theme": "aurora",
    "extraHosts": [
      "aurora.snipercache.com"
    ]
  },
  {
    "id": "keiyoushi-pt-manganyx",
    "name": "Manga NXY",
    "baseUrl": "https://manganyx.com",
    "pkg": "manganyx",
    "version": "1.6.6",
    "nsfw": true,
    "icon": "https://cdn.jsdelivr.net/gh/keiyoushi/extensions-source@main/src/pt/manganyx/res/mipmap-xhdpi/ic_launcher.png",
    "theme": "aurora",
    "extraHosts": [
      "aurora.snipercache.com"
    ]
  },
  {
    "id": "keiyoushi-pt-mangasbrasuka",
    "name": "Mangas Brasuka",
    "baseUrl": "https://mangasbrasuka.org",
    "pkg": "mangasbrasuka",
    "version": "1.6.61",
    "nsfw": true,
    "icon": "https://cdn.jsdelivr.net/gh/keiyoushi/extensions-source@main/src/pt/mangasbrasuka/res/mipmap-xhdpi/ic_launcher.png",
    "theme": "aurora",
    "extraHosts": [
      "aurora.snipercache.com"
    ]
  },
  {
    "id": "keiyoushi-pt-mugiwarasoficial",
    "name": "Mugiwaras Oficial",
    "baseUrl": "https://mugiwarasoficial.org",
    "pkg": "mugiwarasoficial",
    "version": "1.6.61",
    "nsfw": true,
    "icon": "https://cdn.jsdelivr.net/gh/keiyoushi/extensions-source@main/src/pt/mugiwarasoficial/res/mipmap-xhdpi/ic_launcher.png",
    "theme": "aurora",
    "extraHosts": [
      "aurora.snipercache.com"
    ]
  },
  {
    "id": "keiyoushi-pt-hentaiseason",
    "name": "Hentai Season",
    "baseUrl": "https://hentaiseason.com",
    "pkg": "hentaiseason",
    "version": "1.6.1",
    "nsfw": true,
    "icon": "https://cdn.jsdelivr.net/gh/keiyoushi/extensions-source@main/src/pt/hentaiseason/res/mipmap-xhdpi/ic_launcher.png",
    "theme": "gattsu"
  },
  {
    "id": "keiyoushi-pt-hentaitokyo",
    "name": "Hentai Tokyo",
    "baseUrl": "https://hentaitokyo.net",
    "pkg": "hentaitokyo",
    "version": "1.6.1",
    "nsfw": true,
    "icon": "https://cdn.jsdelivr.net/gh/keiyoushi/extensions-source@main/lib-multisrc/gattsu/res/mipmap-xhdpi/ic_launcher.png",
    "theme": "gattsu"
  },
  {
    "id": "keiyoushi-pt-universohentai",
    "name": "Universo Hentai",
    "baseUrl": "https://universohentai.com",
    "pkg": "universohentai",
    "version": "1.6.1",
    "nsfw": true,
    "icon": "https://cdn.jsdelivr.net/gh/keiyoushi/extensions-source@main/src/pt/universohentai/res/mipmap-xhdpi/ic_launcher.png",
    "theme": "gattsu",
    "videoGallery": true,
    "extraHosts": [
      "filmeshentai.org"
    ]
  },
  {
    "id": "keiyoushi-pt-maidscan",
    "name": "Maid Scan",
    "baseUrl": "https://empreguetes.wtf",
    "pkg": "maidscan",
    "version": "1.6.2",
    "nsfw": true,
    "icon": "https://cdn.jsdelivr.net/gh/keiyoushi/extensions-source@main/src/pt/maidscan/res/mipmap-xhdpi/ic_launcher.png",
    "theme": "greenshit",
    "apiUrl": "https://api.verdinha.wtf",
    "cdnUrl": "https://cdn.verdinha.wtf",
    "cdnApiUrl": "https://api.verdinha.wtf/cdn",
    "scanId": "3",
    "defaultGenreId": "4",
    "extraHosts": [
      "api.verdinha.wtf",
      "cdn.verdinha.wtf"
    ]
  },
  {
    "id": "keiyoushi-pt-vegitoons",
    "name": "Vegitoons",
    "baseUrl": "https://vegitoons.black",
    "pkg": "vegitoons",
    "version": "1.6.2",
    "nsfw": true,
    "icon": "https://cdn.jsdelivr.net/gh/keiyoushi/extensions-source@main/src/pt/vegitoons/res/mipmap-xhdpi/ic_launcher.png",
    "theme": "greenshit",
    "apiUrl": "https://api.vegitoons.black",
    "cdnUrl": "https://cdn.vegitoons.black",
    "cdnApiUrl": "https://api.vegitoons.black/cdn",
    "scanId": "1"
  },
  {
    "id": "keiyoushi-pt-apecomics",
    "name": "Capitoons",
    "baseUrl": "https://capitoons.com",
    "pkg": "apecomics",
    "version": "1.6.1",
    "nsfw": false,
    "icon": "https://cdn.jsdelivr.net/gh/keiyoushi/extensions-source@main/src/pt/apecomics/res/mipmap-xhdpi/ic_launcher.png",
    "theme": "mangawork"
  },
  {
    "id": "keiyoushi-pt-pizzariascan",
    "name": "PizzariaScan",
    "baseUrl": "https://pizzariacomics.com",
    "pkg": "pizzariascan",
    "version": "1.6.1",
    "nsfw": true,
    "icon": "https://cdn.jsdelivr.net/gh/keiyoushi/extensions-source@main/src/pt/pizzariascan/res/mipmap-xhdpi/ic_launcher.png",
    "theme": "mangawork",
    "seriesPath": "todas-as-obras",
    "ptBrDates": true
  },
  {
    "id": "keiyoushi-pt-imperiodabritannia",
    "name": "Sagrado Império da Britannia",
    "baseUrl": "https://imperiodabritannia.net",
    "pkg": "imperiodabritannia",
    "version": "1.6.2",
    "nsfw": false,
    "icon": "https://cdn.jsdelivr.net/gh/keiyoushi/extensions-source@main/src/pt/imperiodabritannia/res/mipmap-xhdpi/ic_launcher.png",
    "theme": "mangotheme",
    "apiUrl": "https://api.imperiodabritannia.net/api",
    "cdnUrl": "https://cdn.imperiodabritannia.net",
    "encryptionKey": "mangotoons_encryption_key_2025",
    "britannia": true
  },
  {
    "id": "keiyoushi-pt-hipercool",
    "name": "Hipercool",
    "baseUrl": "https://lerhentais.com",
    "pkg": "hipercool",
    "version": "1.6.65",
    "nsfw": true,
    "icon": "https://cdn.jsdelivr.net/gh/keiyoushi/extensions-source@main/src/pt/hipercool/res/mipmap-xhdpi/ic_launcher.png",
    "theme": "hiper",
    "fluxNode": "G2ZsDdWhUwdU82Vw",
    "extraHosts": [
      "r2d2storage.com"
    ]
  },
  {
    "id": "keiyoushi-pt-hipertoon",
    "name": "Hipertoon",
    "baseUrl": "https://hipertoon.com",
    "pkg": "hipertoon",
    "version": "1.6.11",
    "nsfw": true,
    "icon": "https://cdn.jsdelivr.net/gh/keiyoushi/extensions-source@main/src/pt/hipertoon/res/mipmap-xhdpi/ic_launcher.png",
    "theme": "hiper"
  },
  {
    "id": "keiyoushi-pt-tsundokutraducoes",
    "name": "Tsundoku Traduções",
    "baseUrl": "https://tsundoku.com.br",
    "pkg": "tsundokutraducoes",
    "version": "1.6.12",
    "nsfw": true,
    "icon": "https://cdn.jsdelivr.net/gh/keiyoushi/extensions-source@main/src/pt/tsundokutraducoes/res/mipmap-xhdpi/ic_launcher.png",
    "theme": "mangathemesia",
    "altNamePrefix": "Nome alternativo: ",
    "searchSelector": ".utao .uta .imgu, .listupd .bs .bsx:not(:has(span.novelabel)), .listo .bs .bsx:not(:has(span.novelabel))",
    "extraHosts": [
      "i0.wp.com",
      "i1.wp.com",
      "i2.wp.com",
      "i3.wp.com",
      "i4.wp.com",
      "i5.wp.com"
    ]
  },
];

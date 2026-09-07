# Hiraku - Catálogo do Projeto

## Visão Geral

Aplicação de streaming de anime em PT-BR. Catálogo via AniList (GraphQL), episódios via AnimeFire REST API, player DASH com dash.js.

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 19, TypeScript 5.6, Vite 7, Tailwind CSS v4 |
| UI | shadcn/ui (new-york), Radix UI, Lucide icons, Framer Motion |
| Roteamento | wouter (patched) |
| Player | dash.js 5.2.1 (DASH streaming) |
| Backend | Express 4 (proxy CORS, port 3001) |
| APIs | AniList GraphQL (`graphql.anilist.co`), AnimeFire REST (`api.animefire.io`) |
| Build | Vite (client), esbuild (server), pnpm 10.4.1 |
| Pacotes | 58 deps, 22 devDeps |

---

## Arquitetura

```
Browser → Vite Dev Server (3000)
              ├── /api/* → Express Proxy (3001) → api.animefire.io
              ├── /stream/* → akumast.net (DASH segments)
              └── /i/* → akumast.net (video segments absolutos)

AniList GraphQL → fetch direto do browser (sem proxy)
```

### Fluxo de Dados

1. **Homepage**: AniList trending/popular/seasonal → cards
2. **Busca**: AniList search com filtros → resultados
3. **Detalhes**: AniList metadata → `findAnimeSlug()` → AnimeFire details
4. **Episódios**: AnimeFire API → lista de episódios por temporada
5. **Player**: AnimeFire episode stream → DASH manifest → dash.js playback

---

## Estrutura de Arquivos

```
client/src/
├── App.tsx                    # Router + ThemeProvider + ErrorBoundary
├── main.tsx                   # Entry point
├── index.css                  # Tailwind v4 + tema purple futurista
├── components/
│   ├── Layout.tsx             # Header sticky + nav (Início/Buscar)
│   ├── VideoPlayer.tsx        # Player DASH completo (614 linhas)
│   ├── ErrorBoundary.tsx      # Error handler com reload
│   └── ui/                    # shadcn/ui (button, card, tooltip, sonner)
├── pages/
│   ├── Home.tsx               # Hero carousel + 3 rows de animes
│   ├── Search.tsx             # Busca com filtros AniList
│   ├── AnimeDetails.tsx       # Detalhe + episódios + player
│   └── NotFound.tsx           # 404 PT-BR
├── hooks/
│   └── useAnime.ts            # 7 hooks (trending, popular, seasonal, details, seasons, episodes, recommendations)
├── lib/
│   ├── anilist.ts             # AniList GraphQL client (6 queries)
│   └── utils.ts               # cn() utility
├── providers/
│   ├── types.ts               # Interfaces (AnimeResult, Episode, Stream, etc.)
│   ├── animefire.ts           # AnimeFire REST API client
│   └── index.ts               # Provider registry + findAnimeSlug()
└── contexts/
    └── ThemeContext.tsx        # Dark theme (não switchable)

server/
└── index.ts                   # Express proxy (CORS bypass)

shared/
└── const.ts                   # COOKIE_NAME, ONE_YEAR_MS
```

---

## APIs Descobertas

### AnimeFire REST API (`api.animefire.io`)

| Endpoint | Descrição |
|----------|-----------|
| `GET /animes/pesquisar?q=X` | Busca por nome |
| `GET /anime/{id}` | Detalhes, temporadas, episódios, recomendações |
| `GET /episode/{id}` | Stream do episódio (DASH manifest URL) |

- **Rate limit**: 200 req/min
- **CORS**: restrito a `animefire.io` (requer proxy)
- **Streams**: URLs em `akumast.net`, formato DASH (MPD)
- **Qualidades**: 360p (640x360, ~996kbps) e 720p (1280x720, ~2560kbps)
- **Idiomas**: `dublado` e/ou `legendado` (stream separada)

### AniList GraphQL (`graphql.anilist.co`)

| Query | Descrição |
|-------|-----------|
| SEARCH_QUERY | Busca com filtros (season, year, status, format, genre) |
| MEDIA_DETAIL_QUERY | Detalhe por ID |
| TRENDING_QUERY | Em alta |
| POPULAR_QUERY | Populares |
| SEASONAL_QUERY | Temporada atual |
| UPCOMING_QUERY | Próximos |

- **Sem CORS** (acesso direto do browser)
- **Timeout**: 15s

---

## Player DASH - Detalhes

### DASH Manifest (MPD)

```xml
<AdaptationSet contentType="video">
  <Representation id="Muu6340l6AM" width="640" height="360" bandwidth="996494"/>
  <Representation id="Mui6340l6AM" width="1280" height="720" bandwidth="2560755"/>
</AdaptationSet>
<AdaptationSet contentType="audio">
  <Representation id="Muu6yI0l6AM" bandwidth="219475"/>
</AdaptationSet>
```

### Detecção de Qualidades (3 camadas)

1. `player.getBitrateInfoListFor('video')` - API nativa dash.js
2. `player.getManifest()` + parser XML - fallback manual
3. `stream.qualities` da API AnimeFire - último fallback

### Proxy DASH

- `/stream/*` → `https://akumast.net/*` (manifesto + segmentos relativos)
- `/i/*` → `https://akumast.net/i/*` (segmentos com path absoluto `/i/...`)

### Controles do Player

- Play/Pause (espaço/K)
- Skip ±10s (setas)
- Volume (setas ↑↓, m=mute)
- Velocidade (0.5x - 2x)
- Qualidade (Auto/360p/720p)
- Idioma (Dublado/Legendado)
- Tela cheia (F)
- Próximo episódio
- Auto-hide controles (3s)

---

## Dependências Não Usadas (limpas)

- 46 componentes shadcn/ui removidos
- hooks: useDebounce, useLocalStorage, useMediaQuery
- providers: allanime.ts (multilíngue)
- lib: api.ts, types.ts, const.ts, cache.ts

---

## Pendências

1. **Homepage redesign** - design atual considerado feio
2. **Créditos da API** - "Catálogo: AniList | Episódios: AnimeFire"
3. **Progressão AniList** - listas de assistindo/concluído
4. **Electron** - empacotamento como .exe
5. **Testes** - vitest instalado, zero testes escritos
6. **Backend** - ver BACKEND-next-steps.md

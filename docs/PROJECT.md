# Hiraku - Documentação do Projeto

## Visão Geral
Hiraku é um aplicativo de streaming de anime em PT-BR, usando AniList para catálogo/metadados e AnimeFire para episódios. Construído com React + Vite + TypeScript + Tailwind CSS.

## Stack Tecnológica
- **Frontend**: React 19, Vite 7, TypeScript, Tailwind CSS 4, shadcn/ui
- **Roteamento**: wouter
- **Player**: dashjs (DASH streaming)
- **Ícones**: lucide-react
- **Backend**: Express (proxy server)
- **Gerenciador de pacotes**: pnpm

## Arquitetura

### Estrutura de Pastas
```
client/
├── public/rating/          # Imagens de classificação indicativa (L, 10, 12, 14, 16, 18)
├── src/
│   ├── components/
│   │   ├── VideoPlayer.tsx  # Player de vídeo com dashjs
│   │   ├── LoadingAnimation.tsx # Animação de loading (page/section)
│   │   ├── Layout.tsx       # Header com navegação
│   │   ├── ErrorBoundary.tsx # Tratamento de erros
│   │   └── ui/              # Componentes shadcn/ui
│   ├── hooks/
│   │   └── useAnime.ts     # Hooks de dados (AniList + AnimeFire)
│   ├── lib/
│   │   ├── anilist.ts      # Cliente GraphQL AniList (via proxy)
│   │   └── watchProgress.ts # Sistema de progressão de assistência
│   ├── pages/
│   │   ├── Home.tsx         # Página inicial com hero slider
│   │   ├── AnimeDetails.tsx # Detalhes do anime + episódios
│   │   ├── Search.tsx       # Busca com filtros
│   │   ├── FilterPage.tsx   # Página de filtro reutilizável
│   │   ├── AnimesPage.tsx   # Lista de animes (format=TV)
│   │   └── FilmesPage.tsx   # Lista de filmes (format=MOVIE)
│   └── providers/
│       ├── animefire.ts     # Cliente REST AnimeFire
│       ├── index.ts         # Funções de busca e matching (slug, cache JP, batch)
│       └── types.ts         # Tipos TypeScript
server/
└── index.ts                 # Express proxy (AniList + AnimeFire + YouTube)
```

### Fluxo de Dados
1. **AniList** → Dados de catálogo (título, sinopse, gêneros, pontuação)
2. **AnimeFire** → Episódios, temporadas, streams de vídeo
3. **Proxy Server** → Evita CORS e rate limits
4. **localStorage** → Favoritos e progresso de assistência

## Funcionalidades Implementadas

### Página Inicial (Home)
- Hero slider com até 5 animes (auto-rotate 6s)
- Ken Burns zoom + fadeSlideUp animations
- Trailer player (YouTube iframe)
- Sistema de favoritos (Bookmark)
- Seções: Continuar Assistindo, Mais Curtidos, Melhores Lançamentos, Top 10, Romances, Comédia, Slice of Life
- Top 10 estilo Netflix (números outlined)
- HorizontalScroll component (setas no hover)
- AnimeCard (w-44, 9:13, hover scale-105)
- Loading centralizado na tela inteira

### Detalhes do Anime (AnimeDetails)
- Banner 550px com sinopse integrada
- Botões: Assistir Agora / Continuar + Favoritar + Trailer
- Classificação indicativa com imagens oficiais (LBRE)
- Gêneros como tags clicáveis (levam à busca)
- Busca de episódios por número/título/sinopse
- Selector de temporadas dropdown
- Cards de episódio com badges de progresso
- Seção "Animes Parecidos" com navegação por título
- Loading centralizado na tela inteira

### Sistema de Busca (Search)
- Busca por título, gênero, ano, temporada, ordenação
- Badges de disponibilidade no AnimeFire
- Filtro "Só com episódios disponíveis"
- Deduplicação de temporadas
- Input com efeito glass/frosted
- Grid 5 colunas (desktop)
- Loading centralizado na área de conteúdo

### Páginas de Filtro (Animes/Filmes)
- `/animes` → format=TV com filtros de ano e gênero
- `/filmes` → format=MOVIE com filtros de ano e gênero
- Reutiliza FilterPage.tsx
- Loading centralizado na área de conteúdo

### Player de Vídeo (VideoPlayer)
- Streaming DASH via dashjs
- Controles: play/pause, seek, volume, fullscreen
- Atalhos de teclado (espaço, setas, F, M)
- Seleção de qualidade (360p/720p)
- Velocidade de reprodução (0.5x-2x)
- Seleção de áudio (Dublado/Legendado)
- Próximo episódio automático
- Animação de buffering customizada (ZacharyCrespin)

### Sistema de Progressão (watchProgress.ts)
- Salva posição a cada 5 segundos
- Retoma de onde parou (após refresh)
- Marca como completo (≥90% assistido)
- Botão "Continuar T1 EP5" dinâmico
- Badge "Assistido" com ícone de olho
- Barra roxa de progresso nos cards

### Busca de Slug (findAnimeSlug)
- Cache de títulos JP (`jpTitleCache`)
- Match exato normalizado
- Match por palavras-chave (60% ratio)
- Fallback para 1 resultado único
- Desambiguação por contagem de episódios
- Verificação de year conflict
- Ignora animes não lançados (NOT_YET_RELEASED)
- Busca no YouTube como fallback de trailer

### Batch Check (batchCheckAvailability)
- Verificação rápida de disponibilidade
- Usa `findAnimeSlugQuick` (sem buscar detalhes)
- Verificação de ratio de episódios (0.5x–3x)
- Paralelizado com batch de 5

## APIs e Endpoints

### Proxy Server (porta 3001)
- `POST /api/anilist` → Proxy GraphQL AniList
- `GET /api/trailer/:id` → Trailer do AniList
- `GET /api/trailer-search?q=` → Busca trailer no YouTube
- `GET /api/proxy?url=` → Proxy genérico (AnimeFire, streams)

### AnimeFire API
- `GET /animes/pesquisar?q=` → Busca
- `GET /anime/:slug` → Detalhes
- `GET /episode/:id` → Stream do episódio
- `hero.titles.JP` → Título original (JP) na página de detalhes

### AniList GraphQL
- Queries: TRENDING, POPULAR, SEASONAL, UPCOMING, GENRE, MEDIA_DETAIL
- Proxy no server para evitar CORS

## Dados Armazenados (localStorage)

### Favoritos (`hiraku-favorites`)
```json
["120377", "11061", "269"]
```

### Progresso (`hiraku-watch-progress`)
```json
{
  "8yRIZuitmcW": {
    "animeId": "8yRIZuitmcW",
    "episodes": {
      "ep123": {
        "episodeId": "ep123",
        "episodeNumber": 5,
        "season": 1,
        "currentTime": 342.5,
        "duration": 1440,
        "completed": false,
        "lastWatched": 1694000000000
      }
    }
  }
}
```

## Convenções de Código

### Estilo
- Componentes funcionais com hooks
- TypeScript estrito
- Tailwind CSS para estilos
- Lucide React para ícones
- wouter para roteamento

### Nomes
- Arquivos: PascalCase (AnimeDetails.tsx)
- Funções: camelCase (findAnimeSlug)
- Constantes: UPPER_CASE (STORAGE_KEY)
- Tipos: PascalCase (EpisodeStream)

### Estrutura de Componentes
```tsx
export default function ComponentName() {
  // Hooks de estado
  // Hooks de efeito
  // Funções auxiliares
  // Render
}
```

## Bugs Corrigidos

### Hunter x Hunter (1999 vs 2011)
- **Problema**: Ambos tinham mesmo título "Hunter x Hunter"
- **Solução**: Desambiguação por contagem de episódios

### Bleach (títulos duplicados)
- **Problema**: `exactMatches` tinha duplicatas de romaji + inglês
- **Solução**: Deduplicação por ID antes de verificar ambiguidade

### Cyberpunk: Edgerunners
- **Problema**: AnimeFire tem "Mercenários", AniList tem "Edgerunners"
- **Solução**: Fallback para 1 resultado único com palavra-chave

### Cyberpunk: Edgerunners 2
- **Problema**: Anime não lançado estava retornando slug do 1
- **Solução**: Ignorar animes com status NOT_YET_RELEASED

### Urusei Yatsura / Turma do Barulho
- **Problema**: AnimeFire usa nome PT-BR "Turma do Barulho"
- **Solução**: `titleJp` do AnimeFire para matching; cache de títulos JP

### Season "Seasons 1 & 2"过滤
- **Problema**: Regex antigo `/Season/` filtrava "Seasons 1 & 2"
- **Solução**: Novo regex `/^Season\s+\d|Season\s+\d|2nd|.../i`

### Loading Animation
- **Problema**: Animação aparecia em posições/tamanhos diferentes
- **Solução**: LoadingAnimation simplificado; pais controlam posição (h-screen ou py-12)

## Próximos Passos

### Curto Prazo
- [ ] Integração Stremio (Froststream, Zeus) como providers alternativos
- [ ] Seletor de provider no player (ao lado de legendas)
- [ ] Fallback de busca entre providers
- [ ] Otimização de performance (lazy loading, memoização)

### Médio Prazo
- [ ] Modo offline (service worker)
- [ ] Notificações de novos episódios
- [ ] Sistema de avaliações
- [ ] Perfil de usuário

### Longo Prazo
- [ ] App mobile (React Native ou Capacitor)
- [ ] Sincronização entre dispositivos
- [ ] IA para recomendações

## Notas de Desenvolvimento

### PowerShell
- Usar `cmd /c` para comandos com espaços
- `pnpm` e `npx` precisam de workaround

### AnimeFire API
- Rate limit: 200 req/min
- CORS: restrito a animefire.io
- Dados retornam em `json.data`
- Busca PT-BR apenas (não funciona com caracteres JP)
- `published_at` para ano (não `year`)

### AniList API
- Requer headers User-Agent e Origin
- Proxy server evita 403/429
- `search: string | undefined` (undefined retorna tudo)

### dashjs
- Tipo default export ( erro TS conhecido)
- Qualidades: 360p e 720p
- URLs em `akumast.net`

### Stremio (Futuro)
- Manifest JSON: `manifest.json` defines capabilities
- Providers: Froststream, Zeus
- Integrar via nova interface `AnimeProvider`
- Seletor no player ao lado de legendas

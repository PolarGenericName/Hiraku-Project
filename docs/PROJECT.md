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
│   │   └── ui/             # Componentes shadcn/ui
│   ├── hooks/
│   │   └── useAnime.ts     # Hooks de dados (AniList + AnimeFire)
│   ├── lib/
│   │   ├── anilist.ts      # Cliente GraphQL AniList (via proxy)
│   │   └── watchProgress.ts # Sistema de progressão de assistência
│   ├── pages/
│   │   ├── Home.tsx         # Página inicial com hero slider
│   │   ├── AnimeDetails.tsx # Detalhes do anime + episódios
│   │   └── Search.tsx       # Busca com filtros
│   └── providers/
│       ├── animefire.ts     # Cliente REST AnimeFire
│       ├── index.ts         # Funções de busca e matching
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

### Detalhes do Anime (AnimeDetails)
- Banner 550px com sinopse integrada
- Botões: Assistir Agora / Continuar + Favoritar + Trailer
- Classificação indicativa com imagens oficiais (LBRE)
- Gêneros como tags clicáveis (levam à busca)
- Busca de episódios por número/título/sinopse
- Selector de temporadas dropdown
- Cards de episódio com badges de progresso
- Seção "Animes Parecidos" com navegação por título

### Sistema de Busca (Search)
- Busca por título, gênero, ano, temporada, ordenação
- Badges de disponibilidade no AnimeFire
- Filtro "Só com episódios disponíveis"
- Deduplicação de temporadas

### Player de Vídeo (VideoPlayer)
- Streaming DASH via dashjs
- Controles: play/pause, seek, volume, fullscreen
- Atalhos de teclado (espaço, setas, F, M)
- Seleção de qualidade (360p/720p)
- Velocidade de reprodução (0.5x-2x)
- Seleção de áudio (Dublado/Legendado)
- Próximo episódio automático

### Sistema de Progressão (watchProgress.ts)
- Salva posição a cada 5 segundos
- Retoma de onde parou (após refresh)
- Marca como completo (≥90% assistido)
- Botão "Continuar T1 EP5" dinâmico
- Badge "Assistido" com ícone de olho
- Barra roxa de progresso nos cards

### Busca de Slug (findAnimeSlug)
- Match exato normalizado
- Match por palavras-chave
- Fallback para 1 resultado único
- Desambiguação por contagem de episódios
- Ignora animes não lançados (NOT_YET_RELEASED)
- Busca no YouTube como fallback de trailer

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

## Próximos Passos

### Curto Prazo
- [ ] Auditoria de segurança e estabilidade
- [ ] Otimização de performance (lazy loading, memoização)
- [ ] Tratamento de erros mais robusto
- [ ] Testes unitários

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

### AniList API
- Requer headers User-Agent e Origin
- Proxy server evita 403/429

### dashjs
- Tipo default export ( erro TS conhecido)
- Qualidades: 360p e 720p
- URLs em `akumast.net`

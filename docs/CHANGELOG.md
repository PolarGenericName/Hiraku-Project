# Changelog - Hiraku

## [1.2.0] - 2026-09-09

### Adicionado
- **Páginas de filtro (Animes/Filmes)**
  - `/animes` → Lista de animes (format=TV) com filtros de ano e gênero
  - `/filmes` → Lista de filmes (format=MOVIE) com filtros de ano e gênero
  - FilterPage.tsx reutilizável para ambas páginas

- **Header com navegação**
  - Links: Início, Animes, Filmes, Busca
  - Fade gradient para transição suave
  - Sem borda visual

- **Input de busca com efeito glass**
  - Fundo frosted/glass effect
  - Botão de filtro
  - Grid 5 colunas (desktop)

- **Loading animation consistente**
  - LoadingAnimation.tsx simplificado (flex center)
  - Page load: centralizado na tela inteira (h-screen)
  - Section load: centralizado na área de conteúdo (py-12)

- **Player buffering animation**
  - Nova animação de loading para o player
  - Baseada em ZacharyCrespin (Uiverse.io)
  - Dois quadrados roxos animando em diagonal

- **Urusei Yatsura / Turma do Barulho fix**
  - `titleJp` adicionado ao tipo AnimeDetails
  - `getAnimeOriginalTitle()` busca título JP do AnimeFire
  - Cache de títulos JP (`jpTitleCache`)
  - `findAnimeSlug` verifica títulos JP na desambiguação

- **Batch check otimizado**
  - `findAnimeSlugQuick` para operações em lote
  - Verificação de ratio de episódios (0.5x–3x)
  - `nativeTitle` passado para matching

- **Year extraction de published_at**
  - AnimeFire retorna `published_at` (string data)
  - Ano extraído via `parseInt(published_at.substring(0,4))`

### Modificado
- **LoadingAnimation.tsx**
  - Removido `fixed inset-0 z-50 pointer-events-none`
  - Apenas `flex items-center justify-center`
  - Pais controlam posição (h-screen ou py-12)

- **Home.tsx / AnimeDetails.tsx**
  - Loading page: wrapper `flex items-center justify-center h-screen bg-black`

- **Search.tsx / FilterPage.tsx**
  - Loading section: wrapper `flex items-center justify-center py-12`

- **VideoPlayer.tsx**
  - Buffering: de `animate-spin border` para animação ZacharyCrespin
  - SVG com div container (não SVG root)

- **index.css**
  - Loader size: 33px → 64px
  - Nova animação player-loader (keyframes pl-up/pl-down)

- **providers/index.ts**
  - `findAnimeSlug`: adicionado parâmetro `nativeTitle`
  - Cache JP verificado antes de busca
  - `batchCheckAvailability`: recebe `nativeTitle`, verifica ratio

- **lib/anilist.ts**
  - `filterSeasonDuplicates`: novo regex que não filtra "Seasons 1 & 2"

### Corrigido
- Urusei Yatsura não aparecia no search (nome PT-BR "Turma do Barulho")
- Loading animation em posições diferentes (fixed → parent-controlled)
- Loading animation tamanhos diferentes (size prop removido)
- Player buffering animation (2 cubos → animação funcional)
- Season "Seasons 1 & 2" sendo filtrada incorretamente
- AnimeFire year extraction (usando published_at)

## [1.1.0] - 2026-09-09

### Adicionado
- **Sistema de progressão de assistência**
  - Salva posição de reprodução a cada 5 segundos
  - Retoma de onde parou (mesmo após refresh)
  - Marca episódio como completo (≥90% assistido)
  - Botão "Continuar T1 EP5" dinâmico
  - Badge "Assistido" com ícone de olho
  - Barra roxa de progresso nos cards

- **Ícones de classificação indicativa**
  - Imagens oficiais do Ministério da Justiça
  - L, 10, 12, 14, 16, 18
  - Fallback para texto se imagem não existir

- **Favoritos estilo Instagram**
  - Ícone Bookmark (estrela → salvar)
  - Salvo no localStorage
  - Sincronizado entre páginas

- **Busca de trailer no YouTube**
  - Fallback quando AniList não tem trailer
  - Endpoint `/api/trailer-search`
  - Busca "nome do anime official trailer"

- **Gêneros como filtros**
  - Tags clicáveis na página de detalhes
  - Levam à busca com filtro de gênero

- **Busca de episódios**
  - Por número, título ou sinopse
  - Filtro em tempo real

### Modificado
- **Hero da página inicial**
  - Capa removida do lado do título
  - Tags (TV, rating, eps, gêneros) removidas
  - Título aumentado (text-4xl md:text-5xl lg:text-6xl)
  - Sinopse aumentada (text-base, line-clamp-4)
  - Botões maiores (px-8 py-3.5)
  - Container maior (max-w-2xl)

- **Página de detalhes do anime**
  - Sinopse movida para dentro do banner
  - Gêneros abaixo dos badges
  - Botão "Assistir Agora" com progressão
  - Cards com indicadores de progresso

- **Sistema de busca de slug**
  - Fallback para 1 resultado único
  - Desambiguação por contagem de episódios
  - Ignora animes não lançados
  - Deduplicação de matches

### Corrigido
- Hunter x Hunter (1999 vs 2011) - desambiguação por eps
- Bleach - deduplicação de exactMatches
- Cyberpunk: Mercenários - fallback para 1 resultado
- Cyberpunk: Edgerunners 2 - ignore NOT_YET_RELEASED

## [1.0.0] - 2026-09-08

### Adicionado
- Estrutura inicial do projeto
- Conexão com AniList e AnimeFire
- Player de vídeo DASH
- Hero slider com auto-rotate
- Sistema de busca
- Página de detalhes do anime
- Top 10 estilo Netflix
- Seções de gênero

# Changelog - Hiraku

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

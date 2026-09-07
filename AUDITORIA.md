# Hiraku - Auditoria do Projeto

## Resumo Executivo

| Área | Nota | Crítico | Alto | Médio | Baixo |
|------|------|---------|------|-------|-------|
| Segurança | 4/10 | 3 | 4 | 3 | 2 |
| Estabilidade | 6/10 | 1 | 3 | 4 | 2 |
| Performance | 5/10 | 1 | 3 | 5 | 3 |

---

## 1. SEGURANÇA

### CRÍTICO

#### 1.1 Proxy aberto (SSRF)
**Arquivo**: `server/index.ts:15`
```
GET /api/proxy?url=<qualquer-url>
```
- O proxy aceita **qualquer URL** sem validação
- Um atacante pode usar o servidor como proxy para acessar:
  - `http://localhost:3001/api/proxy?url=http://169.254.169.254` (AWS metadata)
  - `http://localhost:3001/api/proxy?url=file:///etc/passwd`
  - Redes internas (`192.168.x.x`, `10.x.x.x`)
- **Impacto**: Acesso a recursos internos, vazamento de dados
- **Correção**: Whitelist de domínios permitidos

#### 1.2 Sem autenticação
- Não há sistema de usuários
- Qualquer pessoa pode acessar tudo
- Sem rate limiting por usuário
- **Impacto**: Abuso, scraping, DDOS

#### 1.3 Secrets não protegidos
- `.env` não existe (nem `.env.example`)
- `JWT_SECRET` não definido (quando implementado)
- API keys do Forge estão em `vite.config.ts` (visível no bundle)
- **Impacto**: Vazamento de credenciais

### ALTO

#### 1.4 CORS mal configurado
**Arquivo**: `server/index.ts:55`
```typescript
res.setHeader("Access-Control-Allow-Origin", "*");
```
- `Access-Control-Allow-Origin: *` em todas as respostas
- Permite que qualquer site faça requests via proxy
- **Correção**: Configurar origens específicas

#### 1.5 Sem headers de segurança
- Não há `X-Content-Type-Options`
- Não há `X-Frame-Options`
- Não há `X-XSS-Protection`
- Não há `Content-Security-Policy`
- Não há `Strict-Transport-Security`
- **Impacto**: XSS, clickjacking, MIME sniffing

#### 1.6 User-Agent spoofing
**Arquivo**: `server/index.ts:28`
```typescript
"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)..."
```
- O servidor finge ser um browser
- Poderia ser bloqueado pelo AnimeFire
- Se bloqueado, o app inteiro para de funcionar
- **Impacto**: Risco de bloqueio, dependência frágil

#### 1.7 Sem validação de input
- Parâmetro `url` não é sanitizado
- Poderia conter `javascript:`, `data:`, ou paths locais
- **Correção**: Validar com Zod que é HTTP/HTTPS para domínios permitidos

### MÉDIO

#### 1.8 Console.log em produção
- `console.log('[Proxy] Fetching:', ...)` em todas as requests
- `console.log('[AnimeFire] ...')` em todas as chamadas
- `console.log('[Player] ...')` no VideoPlayer
- **Impacto**: Vazamento de informação, performance

#### 1.9 Sem HTTPS
- Servidor roda em HTTP (port 3001)
- Em produção, precisa de TLS
- **Impacto**: Tráfego em texto plano

#### 1.10 bundle.js expõe código
- O bundle de 1.2MB contém todo o código client-side
- Source maps podem expor código fonte
- **Impacto**: Engenharia reversa

### BAIXO

#### 1.11 Sem Content-Security-Policy
- Permite inline scripts
- Não restringe domínios de recursos
- **Impacto**: XSS mais fácil de explorar

#### 1.12 .manus-logs acessível
- `.manus-logs/` contém logs do browser
- Poderia conter dados sensíveis
- **Impacto**: Vazamento de dados

---

## 2. ESTABILIDADE

### CRÍTICO

#### 2.1 Zero testes
- `vitest` instalado mas nenhum teste escrito
- Nenhuma cobertura de código
- Regressões silenciosas
- **Impacto**: Bugs em produção sem detecção

### ALTO

#### 2.2 Sem Error Boundary por rota
- ErrorBoundary envolve toda a app
- Um erro em uma página derruba tudo
- **Correção**: ErrorBoundary por rota no Router

#### 2.3 Race conditions no provider
**Arquivo**: `client/src/hooks/useAnime.ts`
- `useAnimeDetails` faz 3 requests sequenciais (AniList → findSlug → AnimeFire)
- Se o usuário navegar rápido, respostas anteriores podem sobrescrever posteriores
- Não há cancelamento de requests anteriores (AbortController não propagado)
- **Correção**: Usar `AbortController` no cleanup dos hooks

#### 2.4 Sem retry em falhas
- Se o AnimeFire API falhar, o app mostra vazio
- Não há retry automático
- Não há fallback (ex: cache local)
- **Correção**: Implementar retry com backoff exponencial

#### 2.5 Erros silenciosos no provider
**Arquivo**: `client/src/providers/animefire.ts`
```typescript
} catch (error) {
  console.error('[AnimeFire] Search error:', error);
  return [];  // Falha silenciosa
}
```
- Todos os erros retornam arrays/vazios
- Usuário não vê mensagem de erro
- **Correção**: Propagar erros para UI mostrar feedback

### MÉDIO

#### 2.6 Memory leak potencial no player
**Arquivo**: `client/src/components/VideoPlayer.tsx`
- `dash.js` player é destruído no cleanup
- Mas intervalos (`setTimeout`) podem não ser limpos
- `hideControlsTimer` pode executar após unmount
- **Correção**: Limpar todos os timers no cleanup

#### 2.7 Sem loading states consistentes
- Alguns hooks têm `loading`, outros não
- `useAnimeDetails` tem 3 estados de loading
- Usuário pode ver layout quebrado durante carregamento
- **Correção**: Padronizar loading states

#### 2.8 `findAnimeSlug` faz requests excessivos
- Para cada busca, faz múltiplos requests ao AnimeFire
- Pode exceder rate limit (200 req/min)
- **Correção**: Cache de slug por título

#### 2.9 Sem offline support
- Se perder internet, o app para completamente
- Não há service worker
- Não há cache offline
- **Impacto**: Experiência ruim em conexão instável

### BAIXO

#### 2.10 Tema dark forçado
- `switchable: false` no ThemeProvider
- Usuário não pode mudar tema
- **Impacto**: Acessibilidade

#### 2.11 Sem i18n
- Tudo hardcoded em PT-BR
- Não há sistema de tradução
- **Impacto**: Expansão limitada

---

## 3. PERFORMANCE / CARREGAMENTO

### CRÍTICO

#### 3.1 Bundle gigante
- `index.js`: **1.25 MB** (374 KB gzip)
- Causa: shadcn/ui (46 componentes instalados, 4 usados), recharts, framer-motion
- **Impacto**: Tempo de carregamento inicial > 3s em conexões lentas
- **Correção**: Tree-shaking agressivo, dynamic imports, code splitting

### ALTO

#### 3.2 Sem code splitting
- Tudo é carregado em um único bundle
- Home, Search, Details, Player — tudo junto
- **Correção**: Lazy load por rota:
```typescript
const Home = lazy(() => import('./pages/Home'));
const Search = lazy(() => import('./pages/Search'));
const AnimeDetails = lazy(() => import('./pages/AnimeDetails'));
```

#### 3.3 Imagens sem otimização
- Imagens do AniList e AnimeFire carregadas sem lazy loading
- Sem `loading="lazy"` nas imagens
- Sem `srcset` para diferentes resoluções
- Banner images são 1920px (muito grandes)
- **Correção**: Adicionar `loading="lazy"`, usar Intersection Observer

#### 3.4 Sem prefetch
- Nenhum prefetch de rotas ou dados
- Cada navegação faz requests novos
- **Correção**: Prefetch de dados da próxima página

### MÉDIO

#### 3.5 Requests redundantes
- `useAnimeDetails` faz 3 requests (AniList + 2x AnimeFire)
- `getAnimeDetails` e `getSeasons` e `getEpisodes` e `getRecommendations` cada um faz request separado ao mesmo endpoint `/anime/{id}`
- **Correção**: Batch ou cache no servidor

#### 3.6 CSS warning
```
@import rules must precede all rules aside from @charset and @layer
```
- `@import url('https://fonts.googleapis.com/...')` no final do CSS
- Causa re-renderização do CSS
- **Correção**: Mover para `<link>` no HTML

#### 3.7 Google Fonts blocking
- Fonts Poppins e Space Mono carregadas via CSS `@import`
- Bloqueia renderização
- **Correção**: Usar `<link rel="preload">` ou self-host

#### 3.8 Sem Service Worker
- Não há cache de assets
- Não há offline support
- **Impacto**: Recarrega tudo a cada visita

#### 3.9 Hero carousel re-renderiza
- `Home.tsx` re-renderiza a cada 5s (auto-rotate)
- Pode causar jank em dispositivos lentos
- **Correção**: Usar CSS animation em vez de state

### BAIXO

#### 3.10 Sem compression
- Servidor Express não configura `gzip`/`brotli`
- **Correção**: Adicionar `compression` middleware

#### 3.11 Sem preload de API
- AniList API é chamada após o componente montar
- Poderia ser pré-carregada no `<link rel="preload">`

#### 3.12 Bundle CSS inclui todos os componentes
- `index.css`: 48 KB (8.38 KB gzip)
- Inclui estilos de componentes não usados
- **Correção**: Tree-shaking do CSS

---

## Ações Recomendadas (Por Prioridade)

### Imediato (esta semana)
1. **Whitelist no proxy** — bloquear URLs não-allowlistadas
2. **Validar input do proxy** — sanitizar parâmetro `url`
3. **Adicionar headers de segurança** — helmet ou manual
4. **Limpar console.logs** — usar variável `DEBUG`

### Curto prazo (2 semanas)
5. **Code splitting** — lazy load por rota
6. **Lazy loading de imagens** — `loading="lazy"` + Intersection Observer
7. **Retry com backoff** — em chamadas de API
8. **Cache de respostas** — no proxy (Redis ou in-memory)
9. **Error Boundary por rota**

### Médio prazo (1 mês)
10. **Testes** — pelo menos para provider e hooks
11. **Autenticação** — JWT + usuários
12. **Rate limiting** — por IP e por usuário
13. **Service Worker** — cache offline básico
14. **Compression** — gzip/brotli no Express

### Longo prazo (3 meses)
15. **Progressão do usuário** — watchlist + histórico
16. **Banco de dados** — PostgreSQL
17. **Monitoring** — métricas + alertas
18. **Electron** — empacotamento desktop

---

## Métricas de Bundle

| Arquivo | Tamanho | Gzip | % do Total |
|---------|---------|------|------------|
| index.js | 1,250 KB | 375 KB | 96% |
| index.css | 51 KB | 8.4 KB | 4% |
| **Total** | **1,301 KB** | **383 KB** | 100% |

### Top dependências por tamanho (estimado)
1. `recharts` — ~200 KB (não usado em nenhuma página!)
2. `framer-motion` — ~150 KB
3. `@radix-ui/*` (22 pacotes) — ~120 KB
4. `dashjs` — ~100 KB
5. `react` + `react-dom` — ~45 KB

### Otimização máxima possível
- Remover `recharts` (não usado): -200 KB
- Code splitting: carregar dashjs só no player: -100 KB
- Dynamic import de páginas: carregar só o necessário
- **Resultado estimado**: bundle inicial ~150 KB (de 1,250 KB)

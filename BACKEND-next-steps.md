# Hiraku - Próximos Passos do Backend

## Estado Atual

O backend é apenas um proxy CORS Express (78 linhas) que encaminha requests para `api.animefire.io`. Não há autenticação, banco de dados, cache, nem lógica de negócio.

```
server/index.ts
├── GET /api/proxy?url=<encoded-url>  →  proxy para AnimeFire API
└── Port 3001
```

---

## Fase 1: Proxy Robusto

### 1.1 Rate Limiting
- Implementar rate limit por IP (ex: 100 req/min por client)
- Usar `express-rate-limit` ou `rate-limiter-flexible`
- Retornar `429 Too Many Requests` com `Retry-After` header

### 1.2 Cache de Respostas
- Cache em memória ou Redis para respostas da AnimeFire API
- TTLs diferentes por tipo de dado:
  - `/animes/pesquisar` → 5 min (resultados de busca mudam pouco)
  - `/anime/{id}` → 30 min (detalhes são relativamente estáticos)
  - `/episode/{id}` → 10 min (streams podem mudar)
- Usar `Cache-Control` headers para o browser também cachear
- Implementar ETag/If-None-Match para requests condicionais

### 1.3 Rate Limit do AnimeFire
- AnimeFire permite 200 req/min
- Implementar fila de requests com throttle no servidor
- Se o AnimeFire retornar 429, fazer retry com backoff exponencial
- Compartilhar rate limit entre todos os clients (o servidor é o único que fala com o AnimeFire)

### 1.4 Error Handling Padronizado
```typescript
// Resposta de erro padrão
{
  error: boolean;
  message: string;
  code: string;
  retryAfter?: number;
}
```

### 1.5 Logging Estruturado
- Substituir `console.log` por `pino` ou `winston`
- Logs em formato JSON parafacilitar parsing
- Níveis: error, warn, info, debug
- Rotacionar logs automaticamente

---

## Fase 2: Autenticação

### 2.1 Sistema de Usuários
- Cadastro/login com email + senha (bcrypt)
- Login social (Google OAuth) - opcional
- JWT tokens (access + refresh)
- Armazenamento: SQLite (Produção: PostgreSQL)

### 2.2 Sessões
- `shared/const.ts` já define `COOKIE_NAME = "app_session_id"`
- Usar cookie HttpOnly + Secure + SameSite=Lax
- TTL: 1 ano (já definido em `ONE_YEAR_MS`)

### 2.3 Middleware de Auth
```typescript
// Rotas protegidas
app.use('/api/user/*', authMiddleware);
app.use('/api/watchlist', authMiddleware);
app.use('/api/history', authMiddleware);

// Rotas públicas
app.use('/api/proxy', proxyMiddleware);
```

---

## Fase 3: Progressão do Usuário

### 3.1 Banco de Dados

```sql
-- Tabelas principais
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE watchlist (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  anime_id INTEGER NOT NULL,       -- AniList ID
  animefire_slug TEXT,              -- AnimeFire ID para epódios
  status TEXT CHECK(status IN ('watching','completed','planned','dropped','paused')),
  progress INTEGER DEFAULT 0,      -- episódios assistidos
  score INTEGER,                   -- nota 0-10
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, anime_id)
);

CREATE TABLE episode_history (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  anime_id INTEGER NOT NULL,
  episode_id TEXT NOT NULL,         -- AnimeFire episode ID
  season INTEGER,
  episode_number REAL,
  progress_seconds REAL DEFAULT 0, -- posição no vídeo
  duration_seconds REAL,
  completed BOOLEAN DEFAULT FALSE,
  watched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, episode_id)
);

CREATE TABLE user_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  default_quality TEXT DEFAULT 'auto',
  default_audio TEXT DEFAULT 'legendado',
  default_speed REAL DEFAULT 1,
  theme TEXT DEFAULT 'dark'
);
```

### 3.2 API de Progressão

```
GET    /api/user/profile              → perfil do usuário
PUT    /api/user/profile              → atualizar perfil
POST   /api/auth/register             → cadastro
POST   /api/auth/login                → login
POST   /api/auth/logout               → logout
POST   /api/auth/refresh              → renovar token

GET    /api/watchlist                 → lista de assistindo
POST   /api/watchlist                 → adicionar à lista
PUT    /api/watchlist/:id             → atualizar status/progresso
DELETE /api/watchlist/:id             → remover da lista

GET    /api/history                   → histórico de episódios
POST   /api/history                   → registrar episódio assistido
PUT    /api/history/:episodeId        → atualizar posição
GET    /api/history/:animeId          → progresso de um anime

GET    /api/user/settings             → configurações
PUT    /api/user/settings             → atualizar configurações
```

### 3.3 Sync entre Devices
- Usar timestamp `updated_at` para merge de conflitos
- Última escrita vence (simple)
- Ou implementar CRDT para campos específicos (complexo)

---

## Fase 4: Segurança

### 4.1 Proxy Seguro
- Whitelist de domínios permitidos no proxy (não aceitar qualquer URL)
- Bloquear URLs internas (localhost, 127.0.0.1, 10.x, 192.168.x)
- Validar que URLs são do AnimeFire API ou akumast.net
- Max size de resposta (ex: 50MB para binários)

### 4.2 Headers de Segurança
```typescript
app.use(helmet());
// ou manualmente:
res.setHeader('X-Content-Type-Options', 'nosniff');
res.setHeader('X-Frame-Options', 'DENY');
res.setHeader('X-XSS-Protection', '1; mode=block');
res.setHeader('Strict-Transport-Security', 'max-age=31536000');
res.setHeader('Content-Security-Policy', "default-src 'self'");
```

### 4.3 CORS Configurável
```typescript
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
}));
```

### 4.4 Input Validation
- Validar todos os parâmetros de query com Zod (já instalado)
- Sanitizar URLs no proxy
- Rate limit por endpoint

### 5.5 Env Vars
- Criar `.env.example` com todas as variáveis necessárias
- Nunca commitar `.env`
- Usar `dotenv` ou `envalid` para validação

```
# .env.example
PORT=3001
NODE_ENV=development
DATABASE_URL=file:./hiraku.db
JWT_SECRET=CHANGE_ME
ALLOWED_ORIGINS=http://localhost:3000
ANIMEFIRE_RATE_LIMIT=200
CACHE_TTL_SEARCH=300
CACHE_TTL_DETAILS=1800
CACHE_TTL_EPISODE=600
```

---

## Fase 5: Performance do Backend

### 5.1 Conexão HTTP
- Usar `undici` (Node.js built-in) em vez de `fetch` global
- Connection pooling para requests ao AnimeFire
- Keep-alive nas conexões

### 5.2 Streaming de Binários
- O proxy atual carrega o buffer inteiro na memória
- Usar streaming pipe para arquivos grandes:
```typescript
const response = await fetch(targetUrl);
response.body.pipe(res);
```

### 5.3 Monitoramento
- Health check endpoint: `GET /api/health`
- Métricas: requests/min, latency, error rate
- Uptime monitoring

---

## Fase 6: Deploy

### 6.1 Docker
```dockerfile
FROM node:22-slim
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
EXPOSE 3001
CMD ["node", "dist/index.js"]
```

### 6.2 Variáveis de Ambiente por Ambiente
- Development: SQLite file, debug logs
- Staging: PostgreSQL, cache habilitado
- Production: PostgreSQL, Redis cache, rate limiting agressivo

### 6.3 Reverse Proxy (nginx)
```nginx
server {
    listen 80;
    server_name hiraku.app;

    location / {
        proxy_pass http://localhost:3000;  # Vite
        proxy_set_header Host $host;
    }

    location /api/ {
        proxy_pass http://localhost:3001;  # Express
        proxy_set_header Host $host;
    }
}
```

---

## Prioridade de Implementação

| Fase | Esforço | Impacto | Prioridade |
|------|---------|---------|------------|
| 1. Proxy Robusto | 2 dias | Alto | ⭐⭐⭐ |
| 4. Segurança | 2 dias | Crítico | ⭐⭐⭐ |
| 2. Autenticação | 3 dias | Alto | ⭐⭐ |
| 3. Progressão | 4 dias | Alto | ⭐⭐ |
| 5. Performance | 2 dia | Médio | ⭐ |
| 6. Deploy | 1 dia | Médio | ⭐ |

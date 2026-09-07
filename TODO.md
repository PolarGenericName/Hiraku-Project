# Hiraku - TODO

## Concluído ✅

- [x] Dead code cleanup (63 arquivos removidos)
- [x] Multilíngue removido (PT-BR only)
- [x] Express proxy server (CORS bypass)
- [x] AnimeFire provider (REST API, não scraping)
- [x] Season selector com agrupamento por temporada
- [x] Episode cards com thumbnail, badge, sinopse
- [x] Hero section com romaji, age rating, next air
- [x] Recommendations section ("Animes Parecidos")
- [x] Sticky header (logo + nav)
- [x] Full-width layout
- [x] VideoPlayer com dash.js (play/pause, seek, volume, fullscreen)
- [x] Language switcher (Dublado/Legendado)
- [x] Keyboard shortcuts
- [x] Quality detection (3 camadas: dash.js API, XML parser, API fallback)
- [x] Quality switching (360p/720p)
- [x] Playback speed (0.5x-2x)
- [x] Logo no header

## Pendente

### Frontend
- [ ] Homepage redesign (design atual considerado feio)
- [ ] Code splitting (lazy load por rota)
- [ ] Lazy loading de imagens
- [ ] Testes (vitest instalado, zero testes)

### Backend
- [ ] Rate limiting no proxy
- [ ] Cache de respostas (Redis/in-memory)
- [ ] Whitelist de domínios no proxy (segurança)
- [ ] Headers de segurança (helmet)
- [ ] Autenticação (JWT + usuários)
- [ ] Banco de dados (SQLite → PostgreSQL)
- [ ] Progressão do usuário (watchlist + histórico)
- [ ] Logging estruturado (pino/winston)

### Infra
- [ ] Créditos da API: "Catálogo: AniList | Episódios: AnimeFire"
- [ ] .env.example
- [ ] HTTPS/TLS
- [ ] Docker
- [ ] Electron (.exe)

## Documentação

- `CATALOGO.md` — conocimiento del proyecto
- `BACKEND-next-steps.md` — roadmap do backend
- `AUDITORIA.md` — segurança, estabilidade, performance

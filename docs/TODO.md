# Próximos Passos - Hiraku

## 🔌 Integração Stremio (PRÓXIMO)

### Prioridade: Alta
- [ ] Estudar manifest.json dos addons (Froststream, Zeus)
- [ ] Criar interface `AnimeProvider` para Stremio
- [ ] Implementar FroststreamProvider
- [ ] Implementar ZeusProvider
- [ ] Adicionar seletor de provider no player (ao lado de legendas)
- [ ] Fallback de busca entre providers (se AnimeFire não tiver)
- [ ] Testar streams de cada provider

### Manifest URLs
- Froststream: `https://froststream.cloutteam.com/.../manifest.json`
- Zeus: `https://398fe185fed6-zeus.baby-beamup.club/.../manifest.json`

### Estrutura Planejada
```
providers/
├── animefire.ts      # Provider atual
├── stremio.ts        # Base para addons Stremio
├── froststream.ts    # Froststream addon
├── zeus.ts           # Zeus addon
├── index.ts          # Registry + fallback logic
└── types.ts          # Tipos compartilhados
```

### UI Planejada
- Player: menu de provider ao lado de legendas
- Estilo: dropdown/ pills estilo Netflix
- Opções: AnimeFire, Froststream, Zeus

## 🔒 Auditoria de Segurança e Estabilidade

### Prioridade: Média
- [ ] Revisar headers de segurança no proxy
- [ ] Validar inputs do usuário (XSS, injetção)
- [ ] Rate limiting no server
- [ ] Tratamento de erros robusto
- [ ] Validação de URLs de stream

### Prioridade: Baixa
- [ ] Testes unitários (Vitest)
- [ ] Testes de integração
- [ ] Coverage mínimo de 70%

## ⚡ Performance

### Otimizações
- [ ] Lazy loading de páginas
- [ ] Memoização de componentes (React.memo)
- [ ] Virtualização de listas longas
- [ ] Compressão de imagens (WebP)

### Bundle
- [ ] Code splitting por rota
- [ ] Tree shaking de lucide-react
- [ ] Análise de bundle (rollup-plugin-visualizer)

## 🐛 Bugs Conhecidos

### Críticos
- [ ] dashjs: erro TS1192 (default export)
- [ ] VideoPlayer: useRef args (TS2554)
- [ ] VideoPlayer: implicit 'any' (TS7006)

### Menores
- [ ] Set iteration (TS2802) - requer downlevelIteration

## 🎨 UX/UI

### MELHORIAS
- [ ] Skeleton loading em vez de spinner
- [ ] Animações de transição entre páginas
- [ ] Toast notifications para ações
- [ ] Responsividade mobile completa

### Acessibilidade
- [ ] ARIA labels em botões
- [ ] Navegação por teclado
- [ ] Contraste de cores

## 📱 Mobile

### Curto Prazo
- [ ] PWA (manifest.json, service worker)
- [ ] Ícones de instalação
- [ ] Modo standalone

### Longo Prazo
- [ ] React Native ou Capacitor
- [ ] Gestos de swipe
- [ ] Bottom navigation

## 🔧 Backend

### Proxy Server
- [ ] Cache de respostas (Redis/Memory)
- [ ] Rate limiting por IP
- [ ] Health check endpoint

### APIs
- [ ] Retry automático em falhas
- [ ] Circuit breaker
- [ ] Fallback para APIs secundárias

## 📊 Analytics

### Métricas
- [ ] Episódios assistidos
- [ ] Tempo de permanência
- [ ] Animes mais populares

### Implementação
- [ ] Google Analytics ou Plausible
- [ ] Event tracking customizado

## 🚀 Deploy

### Produção
- [ ] Variáveis de ambiente
- [ ] Domínio personalizado
- [ ] SSL/HTTPS
- [ ] CDN para assets

### Infraestrutura
- [ ] Vercel/Netlify (frontend)
- [ ] Railway/Render (server)
- [ ] Docker para server

## 🎯 Features Futuras

### Médio Prazo
- [ ] Notificações de novos episódios
- [ ] Perfil de usuário
- [ ] Sync entre dispositivos
- [ ] Sistema de avaliações

### Longo Prazo
- [ ] IA para recomendações
- [ ] Modo offline completo
- [ ] Download de episódios

## 📋 Manutenção

### Regular
- [ ] Atualizar dependências (pnpm update)
- [ ] Revisar logs de erro
- [ ] Monitorar performance

# Próximos Passos - Hiraku

## 🔒 Auditoria de Segurança e Estabilidade (PRÓXIMO)

### Prioridade: Alta
- [ ] Revisar headers de segurança no proxy
- [ ] Validar inputs do usuário (XSS, injetção)
- [ ] Rate limiting no server
- [ ] Tratamento de erros robusto
- [ ] Validação de URLs de stream
- [ ] Proteção contra CSRF
- [ ] Logs de auditoria

### Prioridade: Média
- [ ] Testes unitários (Vitest)
- [ ] Testes de integração
- [ ] Coverage mínimo de 70%
- [ ] CI/CD pipeline

## ⚡ Performance

### Otimizações
- [ ] Lazy loading de páginas
- [ ] Memoização de componentes (React.memo)
- [ ] Virtualização de listas longas
- [ ] Compressão de imagens (WebP)
- [ ] Service worker para cache

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
- [ ] Trailer modal: fecha ao clicar fora (pode ser melhorado)

## 🎨 UX/UI

### MELHORIAS
- [ ] Skeleton loading em vez de spinner
- [ ] Animações de transição entre páginas
- [ ] Toast notifications para ações
- [ ] Modo escuro/claro (já usa shadcn)
- [ ] Responsividade mobile completa

### Acessibilidade
- [ ] ARIA labels em botões
- [ ] Navegação por teclado
- [ ] Contraste de cores
- [ ] Tamanhos de toque (mobile)

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
- [ ] Métricas de uso

### APIs
- [ ] Retry automático em falhas
- [ ] Circuit breaker
- [ ] Fallback para APIs secundárias

## 📊 Analytics

### Métricas
- [ ] Episódios assistidos
- [ ] Tempo de permanência
- [ ] Animes mais populares
- [ ] Erros frequentes

### Implementação
- [ ] Google Analytics ou Plausible
- [ ] Event tracking customizado
- [ ] Dashboard interno

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

## 📝 Documentação

### Completar
- [ ] API documentation (OpenAPI)
- [ ] Guia de contribuição
- [ ] CODE_OF_CONDUCT.md
- [ ] LICENSE

### Manter
- [ ] Atualizar README.md
- [ ] Screenshots/GIFs
- [ ] Changelog atualizado

## 🎯 Features Futuras

### Curto Prazo
- [ ] Sistema de avaliações (1-5 estrelas)
- [ ] Comentários em episódios
- [ ] Lista de assistidos

### Médio Prazo
- [ ] Notificações de novos episódios
- [ ] Perfil de usuário
- [ ] Sync entre dispositivos

### Longo Prazo
- [ ] IA para recomendações
- [ ] Modo offline completo
- [ ] Download de episódios

## 📋 Manutenção

### Regular
- [ ] Atualizar dependências (pnpm update)
- [ ] Revisar logs de erro
- [ ] Monitorar performance
- [ ] Backup de dados

### Security
- [ ] Auditoria de vulnerabilidades
- [ ] Atualizar packages de segurança
- [ ] Revisar permissões

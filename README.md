# 🎬 Hiraku - Anime Streaming PT-BR

![Hiraku](https://img.shields.io/badge/Hiraku-v1.1.0-purple)
![React](https://img.shields.io/badge/React-19-61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6)
![Tailwind](https://img.shields.io/badge/Tailwind-4-06B6D4)

Aplicativo de streaming de anime em português brasileiro, construído com tecnologias modernas e focado em experiência do usuário.

## ✨ Funcionalidades

- **Catálogo completo** via AniList (10.000+ animes)
- **Streaming HD** via AnimeFire (360p e 720p DASH)
- **Player avançado** com controles completos
- **Sistema de progressão** - salva onde você parou
- **Favoritos** - salve seus animes preferidos
- **Busca inteligente** por título, gênero, ano
- **Top 10** estilo Netflix
- **Trailers** do YouTube
- **Classificação indicativa** oficial

## 🚀 Stack Tecnológica

| Tecnologia | Versão | Uso |
|------------|--------|-----|
| React | 19 | UI Framework |
| Vite | 7 | Build Tool |
| TypeScript | 5.5 | Type Safety |
| Tailwind CSS | 4 | Styling |
| dashjs | 5.2 | DASH Streaming |
| wouter | 3 | Routing |
| Express | 4 | Backend Proxy |
| Lucide React | 0.4 | Icons |

## 📦 Instalação

```bash
# Clonar o repositório
git clone https://github.com/PolarGenericName/Hiraku-Project.git
cd Hiraku-Project

# Instalar dependências
pnpm install

# Iniciar servidor de desenvolvimento
pnpm dev
```

O app estará disponível em `http://localhost:3000`

## 🏗️ Estrutura do Projeto

```
hiraku/
├── client/                 # Frontend React
│   ├── public/rating/     # Ícones de classificação
│   ├── src/
│   │   ├── components/    # Componentes React
│   │   ├── hooks/         # Custom hooks
│   │   ├── lib/           # Utilitários
│   │   ├── pages/         # Páginas
│   │   └── providers/     # API providers
│   └── ...
├── server/                 # Backend Express
│   └── index.ts           # Proxy server
└── docs/                   # Documentação
    ├── PROJECT.md         # Documentação completa
    ├── CHANGELOG.md       # Histórico de versões
    └── TODO.md            # Próximos passos
```

## 🔧 Comandos Úteis

```bash
# Desenvolvimento
pnpm dev                    # Inicia server + Vite

# Build
pnpm build                  # Build para produção

# Lint
pnpm lint                   # Verifica código

# Type Check
pnpm typecheck              # Verifica tipos TypeScript
```

## 📚 Documentação

- [Documentação do Projeto](docs/PROJECT.md)
- [Changelog](docs/CHANGELOG.md)
- [Próximos Passos](docs/TODO.md)

## 🔐 Segurança

- Proxy server evita CORS e rate limits
- Validação de inputs
- Headers de segurança
- Rate limiting em desenvolvimento

## 🤝 Contribuindo

1. Fork o projeto
2. Crie uma branch (`git checkout -b feature/nova-feature`)
3. Commit suas mudanças (`git commit -m 'Add nova feature'`)
4. Push para a branch (`git push origin feature/nova-feature`)
5. Abra um Pull Request

## 📄 Licença

Este projeto é para uso educacional. Os conteúdos de anime são direitos autorais de seus respectivos criadores.

## 🔗 Links

- [GitHub](https://github.com/PolarGenericName/Hiraku-Project)
- [AniList API](https://anilist.gitbook.io/anilist-apiv2-docs/)
- [AnimeFire API](https://animefire.io)

---

Feito com 💜 para a comunidade de anime brasileira

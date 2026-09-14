<div align="center">

<img src="client/public/logo.png" alt="Hiraku Logo" width="120" />

# Hiraku

[![Version](https://img.shields.io/badge/version-1.0.0-purple)](https://github.com/PolarGenericName/Hiraku-Project/releases)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)

[Características](#características) • [Instalação](#instalação) • [Licença](#licença)

</div>

---

## Screenshots

<div align="center">

![Home](docs/screenshots/homapage.png)

</div>


---

## Características

- Player com seleção de qualidade e áudio
- Sistema de progressão e favoritos
- Trailers via YouTube
- Discord Rich Presence
- Atalhos de teclado


## Instalação

### Pré-requisitos

- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/) 10+

### Passo a passo

```bash
# 1. Clone o repositório
git clone https://github.com/PolarGenericName/Hiraku-Project.git
cd Hiraku-Project

# 2. Instale as dependências
pnpm install

# 3. Inicie em modo de desenvolvimento (navegador)
pnpm dev

# 4. Ou inicie no Electron (desktop)
pnpm electron
```

O app estará disponível em `http://localhost:3000`

### Build para Produção

```bash
# Build do frontend + backend
pnpm build

# Iniciar em produção
pnpm start
```

## Comandos

| Comando | Descrição |
|---------|-----------|
| `pnpm dev` | Inicia server + Vite (dev) |
| `pnpm electron` | Inicia server + Vite + Electron |
| `pnpm build` | Build para produção |
| `pnpm start` | Inicia em produção |
| `pnpm check` | Verifica tipos TypeScript |


## Atalhos do Player

| Tecla | Ação |
|-------|------|
| `Espaço` / `K` | Play / Pause |
| `F` | Tela cheia |
| `M` | Mudo |
| `←` / `→` | Retroceder / Avançar 10s |
| `↑` / `↓` | Aumentar / Diminuir volume |
| `Esc` | Fechar player |

## Printscreens Adicionais

<div align="center">

![Detalhes](docs/screenshots/details.png)
![Busca](docs/screenshots/search.png)

</div>

## Créditos

- **[AniList](https://anilist.co/)**
- **[AnimeFire](https://animefire.plus/)** 
- **[hls.js](https://github.com/video-dev/hls.js/)**
- **[Electron](https://www.electronjs.org/)**
- **[shadcn/ui](https://ui.shadcn.com/)**

## Licença

[GNU General Public License v3.0](LICENSE).



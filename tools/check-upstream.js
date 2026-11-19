#!/usr/bin/env node
/**
 * check-upstream.js — verifica se as extensões Keiyoushi portadas aqui estão
 * desatualizadas em relação ao repositório público do Keiyoushi.
 *
 * Compara a `version` do nosso catálogo (manifest.ts + custom/index.ts) com a
 * `versionName` do índice público (keiyoushi/extensions) e, para cada
 * divergência, mostra o histórico do código upstream daquela extensão.
 *
 * Uso:
 *   node tools/check-upstream.js               # lista de divergências
 *   node tools/check-upstream.js --pull        # git pull no checkout antes
 *   node tools/check-upstream.js --unshallow   # baixa o histórico git completo
 *   node tools/check-upstream.js --diff        # + log com patch (o que mudou)
 *   node tools/check-upstream.js --cached      # usa o índice em cache (offline)
 *   node tools/check-upstream.js mangafire ... # filtra por pacote(s)
 *
 * Env:
 *   KEIYOUSHI_SRC  checkout de keiyoushi/extensions-source
 *                  (padrão: %TEMP%/opencode/keiyoushi-src)
 *   HIRAKU_TMP     diretório temporário do Hiraku (índice em cache)
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');
const UPSTREAM =
  process.env.KEIYOUSHI_SRC ||
  'C:/Users/PolarGeneric/AppData/Local/Temp/opencode/keiyoushi-src';
const TMP =
  process.env.HIRAKU_TMP || 'C:/Users/PolarGeneric/AppData/Local/Temp/opencode';
const INDEX_CACHE = path.join(TMP, 'keiyoushi-index.json');
const INDEX_URL = 'https://raw.githubusercontent.com/keiyoushi/extensions/repo/index.json';
const PT_PREFIX = 'eu.kanade.tachiyomi.extension.pt.';

const C = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

// ── Nosso catálogo ───────────────────────────────────────────────────────────

/** Extrai {pkg → versão} das fontes Keiyoushi portadas. */
function ourSources() {
  const out = new Map();

  const manifestPath = path.join(REPO, 'ui/src/manga/sources/keiyoushi/manifest.ts');
  const manifest = fs.readFileSync(manifestPath, 'utf8');
  for (const block of manifest.matchAll(/\{[^{}]*\}/g)) {
    const pkg = /"pkg":\s*"([^"]+)"/.exec(block[0])?.[1];
    if (!pkg) continue;
    out.set(pkg, {
      version: /"version":\s*"([^"]+)"/.exec(block[0])?.[1] ?? '?',
      id: /"id":\s*"([^"]+)"/.exec(block[0])?.[1] ?? '',
      name: /"name":\s*"([^"]+)"/.exec(block[0])?.[1] ?? pkg,
      origin: 'manifesto',
    });
  }

  const customPath = path.join(REPO, 'ui/src/manga/sources/keiyoushi/custom/index.ts');
  const custom = fs.readFileSync(customPath, 'utf8');
  for (const block of custom.matchAll(/\{[^{}]*\}/g)) {
    const pkg = /\bpkg:\s*'([^']+)'/.exec(block[0])?.[1];
    if (!pkg || out.has(pkg)) continue;
    out.set(pkg, {
      version: /\bversion:\s*'([^']+)'/.exec(block[0])?.[1] ?? '?',
      id: /\bid:\s*'([^']+)'/.exec(block[0])?.[1] ?? '',
      name: /\bname:\s*'([^']+)'/.exec(block[0])?.[1] ?? pkg,
      origin: 'custom',
    });
  }

  return out;
}

// ── Índice público do Keiyoushi ──────────────────────────────────────────────

function getText(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { headers: { 'user-agent': 'hiraku-check-upstream/1.0' }, timeout: 30000 },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          resolve(getText(res.headers.location));
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve(data));
      },
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

/** pkg → extensão do índice (versionName, etc). */
async function upstreamIndex(useCached) {
  let raw = null;
  if (!useCached) {
    try {
      raw = await getText(INDEX_URL);
      fs.writeFileSync(INDEX_CACHE, raw, 'utf8');
    } catch (e) {
      console.error(`${C.yellow}aviso:${C.reset} índice ao vivo falhou (${e.message}) — usando cache.`);
    }
  }
  if (!raw) {
    if (!fs.existsSync(INDEX_CACHE)) throw new Error('sem índice (rede e cache indisponíveis)');
    raw = fs.readFileSync(INDEX_CACHE, 'utf8');
  }

  const index = JSON.parse(raw);
  const byPkg = new Map();
  for (const ext of index.extensionList?.extensions ?? []) {
    // fontes ficam em pt.* (PT-BR) ou all.* (multilíngues, ex.: mangafire)
    if (ext.packageName?.startsWith(PT_PREFIX)) {
      byPkg.set(ext.packageName.slice(PT_PREFIX.length), ext);
    } else if (ext.packageName?.startsWith('eu.kanade.tachiyomi.extension.all.')) {
      byPkg.set(ext.packageName.slice('eu.kanade.tachiyomi.extension.all.'.length), ext);
    }
  }
  return byPkg;
}

// ── Git do checkout upstream ─────────────────────────────────────────────────

function git(args, { allowFail = false } = {}) {
  try {
    return execFileSync('git', ['-C', UPSTREAM, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (e) {
    if (allowFail) return null;
    throw e;
  }
}

/**
 * Diretório da extensão no checkout (fontes ficam em src/pt, src/all, ...).
 * Com sparse checkout o diretório pode existir no git sem estar no disco —
 * nesse caso retorna materialized: false para o aviso.
 */
function upstreamDir(pkg) {
  const candidates = [`src/pt/${pkg}`, `src/all/${pkg}`, `src/en/${pkg}`];
  for (const rel of candidates) {
    if (fs.existsSync(path.join(UPSTREAM, rel))) return { rel, materialized: true };
  }
  for (const rel of candidates) {
    const ls = git(['ls-tree', '--name-only', 'HEAD', `${rel}/`], { allowFail: true });
    if (ls) return { rel, materialized: false };
  }
  return null;
}

// ── Comparação de versões ────────────────────────────────────────────────────

function cmpVer(a, b) {
  const pa = String(a).split('.').map((n) => Number(n) || 0);
  const pb = String(b).split('.').map((n) => Number(n) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

// ── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  const args = process.argv.slice(2);
  const pull = args.includes('--pull');
  const showDiff = args.includes('--diff');
  const useCached = args.includes('--cached');
  const filters = args.filter((a) => !a.startsWith('--'));

  if (!fs.existsSync(UPSTREAM)) {
    console.error(`checkout upstream não encontrado: ${UPSTREAM}`);
    console.error('defina KEIYOUSHI_SRC ou faça o clone de keiyoushi/extensions-source.');
    process.exit(1);
  }

  if (pull) {
    console.log(`${C.dim}git pull no checkout upstream...${C.reset}`);
    const before = git(['rev-parse', 'HEAD']);
    const ok = git(['pull', '--ff-only'], { allowFail: true });
    const after = git(['rev-parse', 'HEAD']);
    if (ok === null) console.error(`${C.yellow}aviso:${C.reset} git pull falhou (seguindo com o checkout atual).`);
    else if (before !== after) console.log(`${C.green}checkout atualizado:${C.reset} ${before.slice(0, 8)} → ${after.slice(0, 8)}`);
    else console.log(`${C.dim}checkout já estava atualizado.${C.reset}`);
  }

  if (args.includes('--unshallow')) {
    console.log(`${C.dim}baixando o histórico git completo (pode demorar na 1a vez)...${C.reset}`);
    const ok = git(['fetch', '--unshallow'], { allowFail: true });
    if (ok === null) console.error(`${C.yellow}aviso:${C.reset} fetch --unshallow falhou.`);
    else console.log(`${C.green}histórico completo baixado.${C.reset}`);
  }

  const ours = ourSources();
  const upstream = await upstreamIndex(useCached);

  // Histórico raso limita o `git log`/`--diff` a um único commit (o de
  // criação dos arquivos) — avisa e oferece o --unshallow.
  const isShallow = git(['rev-parse', '--is-shallow-repository'], { allowFail: true }) === 'true';

  const rows = [];
  for (const [pkg, mine] of ours) {
    if (filters.length && !filters.includes(pkg)) continue;
    const ext = upstream.get(pkg);
    if (!ext) {
      rows.push({ pkg, mine, theirs: null, status: 'sem-upstream' });
      continue;
    }
    const status = cmpVer(mine.version, ext.versionName) === 0 ? 'ok' : 'divergente';
    rows.push({ pkg, mine, theirs: ext, status });
  }

  const divergent = rows.filter((r) => r.status === 'divergente');
  const missing = rows.filter((r) => r.status === 'sem-upstream');

  // ── Tabela ────────────────────────────────────────────────────────────────
  const wPkg = Math.max(12, ...rows.map((r) => r.pkg.length));
  console.log('');
  console.log(`${C.bold}Extensões Keiyoushi — nosso catálogo × índice público${C.reset}`);
  console.log(C.dim + '─'.repeat(wPkg + 42) + C.reset);
  console.log(
    `${'pacote'.padEnd(wPkg)}  ${'nosso'.padEnd(9)}  ${'upstream'.padEnd(9)}  status`,
  );
  console.log(C.dim + '─'.repeat(wPkg + 42) + C.reset);

  for (const r of rows) {
    const theirs = r.theirs?.versionName ?? '—';
    let status;
    if (r.status === 'ok') status = `${C.green}ok${C.reset}`;
    else if (r.status === 'divergente') {
      const ahead = cmpVer(r.theirs.versionName, r.mine.version) > 0;
      status = ahead
        ? `${C.yellow}atualizada upstream${C.reset}`
        : `${C.red}divergente (nosso à frente)${C.reset}`;
    } else status = `${C.red}não está no índice${C.reset}`;
    console.log(
      `${r.pkg.padEnd(wPkg)}  ${String(r.mine.version).padEnd(9)}  ${String(theirs).padEnd(9)}  ${status}`,
    );
  }

  console.log(C.dim + '─'.repeat(wPkg + 42) + C.reset);
  console.log(
    `${rows.length} no catálogo · ${C.green}${rows.length - divergent.length - missing.length} ok${C.reset}` +
      ` · ${C.yellow}${divergent.length} atualizadas upstream${C.reset}` +
      ` · ${C.red}${missing.length} sem upstream${C.reset}`,
  );

  // ── Histórico do código upstream das divergentes ──────────────────────────
  if (divergent.length && isShallow) {
    console.log(
      `\n${C.yellow}checkout com histórico raso (shallow):${C.reset} o log/diff mostra só o commit` +
        ` de criação dos arquivos.\n  Rode ${C.bold}node tools/check-upstream.js --unshallow${C.reset} uma vez para baixar o histórico completo.`,
    );
  }
  if (divergent.length) {
    for (const r of divergent) {
      const dir = upstreamDir(r.pkg);
      console.log(`\n${C.cyan}${C.bold}${r.pkg}${C.reset} ${C.dim}(${r.mine.name})${C.reset}`);
      console.log(
        `  nosso ${r.mine.version} → upstream ${r.theirs.versionName}` +
          ` ${C.dim}[${r.theirs.versionCode ? `versionCode ${r.theirs.versionCode}` : ''}]${C.reset}`,
      );
      if (!dir) {
        console.log(`  ${C.dim}diretório não encontrado no checkout (renomeada/removida?)${C.reset}`);
        continue;
      }
      if (!dir.materialized) {
        const lang = dir.rel.split('/')[1];
        console.log(
          `  ${C.yellow}existe no git, mas não está materializado (sparse checkout):${C.reset}` +
            `\n    git -C <checkout> sparse-checkout add ${lang}`,
        );
        continue;
      }
      const log = git(['log', '--format=%h %ad %s', '--date=short', '-8', '--', dir.rel], {
        allowFail: true,
      });
      if (log) console.log(`  ${C.dim}commits em ${dir.rel}:${C.reset}\n${indent(log, '    ')}`);
      if (showDiff) {
        const patch = git(['log', '-p', '-1', '--format=%h %s', '--', dir.rel], { allowFail: true });
        if (patch) console.log(`\n${indent(truncate(patch, 220), '  ')}`);
      } else {
        console.log(`  ${C.dim}use --diff para ver o patch do último commit.${C.reset}`);
      }
    }
  }

  if (missing.length) {
    console.log(`\n${C.red}Fora do índice público (verificar se foram removidas upstream):${C.reset}`);
    for (const r of missing) console.log(`  - ${r.pkg} (${r.mine.name}, ${r.mine.origin})`);
  }

  if (!divergent.length && !missing.length) {
    console.log(`\n${C.green}Tudo em dia — nenhuma extensão desatualizada.${C.reset}`);
  }

  process.exit(divergent.length ? 2 : 0);
})().catch((e) => {
  console.error('ERRO:', e.message);
  process.exit(1);
});

function indent(text, pad) {
  return String(text)
    .split('\n')
    .map((l) => pad + l)
    .join('\n');
}

function truncate(text, maxLines) {
  const lines = String(text).split('\n');
  if (lines.length <= maxLines) return text;
  return lines.slice(0, maxLines).join('\n') + `\n${C.dim}… (${lines.length - maxLines} linhas restantes)${C.reset}`;
}

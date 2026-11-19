/**
 * Harness E2E das extensões Keiyoushi portadas (ferramenta de teste, não entra no bundle).
 *
 * Uso: /e2e-keiyoushi.html?src=<id>  — roda o pipeline completo de uma fonte:
 *   popular → detalhes → capítulos → páginas → imagem da 1ª página
 * e escreve o resultado em JSON no <pre id="result">. O runner (Edge headless
 * --dump-dom) lê esse JSON.
 *
 * Também aceita ?src=todas para rodar todas sequencialmente na mesma página.
 */

import { listSources } from './sources';
import { getKeiyoushiEntry, isKeiyoushiSourceId } from './sources/keiyoushi';

interface SourceReport {
  id: string;
  name?: string;
  ok: boolean;
  popular?: number;
  latest?: number;
  search?: number;
  mangaId?: string;
  detailsTitle?: string;
  status?: string;
  cover?: boolean;
  coverStatus?: number;
  chapters?: number;
  firstChapter?: string;
  pages?: number;
  page1Status?: number;
  page1Type?: string;
  page1Raw?: string;
  error?: string;
  errorStatus?: number;
  searchError?: string;
}

async function probeUrl(url: string): Promise<{ status: number; type: string }> {
  const response = await fetch(url);
  const type = response.headers.get('content-type') || '';
  // não baixa o corpo inteiro (capas/páginas podem ser pesadas)
  if (response.body) await response.body.cancel().catch(() => undefined);
  return { status: response.status, type };
}

/** Erro que carrega os campos parciais já coletados (diagnóstico). */
class PartialFieldsError extends Error {
  constructor(
    message: string,
    readonly fields: Partial<SourceReport>,
  ) {
    super(message);
    this.name = 'PartialFieldsError';
  }
}

/** Roda detalhes→capítulos→páginas→imagem para um mangá; lança em falha. */
async function attemptManga(source: ReturnType<typeof listSources>[number], mangaId: string) {
  const fields: Partial<SourceReport> = { mangaId };

  try {
    const details = await source.getMangaDetails(mangaId);
    if (!details) throw new Error('detalhes nulos (seletor de titulo nao bateu)');
    fields.detailsTitle = details.title;
    fields.status = details.status;
    fields.cover = !!details.coverUrl;
    if (details.coverUrl) {
      const probe = await probeUrl(details.coverUrl);
      fields.coverStatus = probe.status;
    }

    const chapters = await source.getChapters(mangaId);
    fields.chapters = chapters.length;
    if (!chapters.length) throw new Error('sem capitulos');

    const first = chapters[0];
    fields.firstChapter = first.title || String(first.number);

    const pages = await source.getPages(first.id);
    fields.pages = pages.length;
    if (!pages.length) throw new Error('sem paginas');

    const raw = pages[0].imageUrl;
    fields.page1Raw = raw.startsWith('/api/ext/image?url=')
      ? decodeURIComponent(raw.slice('/api/ext/image?url='.length))
      : raw;

    const probe = await probeUrl(pages[0].imageUrl);
    fields.page1Status = probe.status;
    fields.page1Type = probe.type;
    if (probe.status !== 200 || !probe.type.startsWith('image/')) {
      throw new Error(`1a pagina nao carregou: HTTP ${probe.status} (${probe.type})`);
    }
  } catch (error) {
    if (error instanceof PartialFieldsError) throw error;
    throw new PartialFieldsError(error instanceof Error ? error.message : String(error), fields);
  }
  return fields;
}

async function runPipeline(id: string): Promise<SourceReport> {
  const source = listSources().find((s) => s.id === id);
  if (!source) return { id, ok: false, error: 'fonte nao encontrada' };

  const report: SourceReport = { id, name: source.name, ok: false };
  try {
    const popular = await source.getPopular(1);
    report.popular = popular.mangas.length;
    const candidates = popular.mangas.map((m) => m.id);
    if (!candidates.length) {
      const latest = await source.getLatest(1);
      report.latest = latest.mangas.length;
      candidates.push(...latest.mangas.map((m) => m.id));
    }
    if (!candidates.length) throw new Error('lista popular/latest vazia');

    try {
      const search = await source.search(1, 'a');
      report.search = search.mangas.length;
    } catch (error) {
      report.search = -1;
      report.searchError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      console.warn('[e2e] busca falhou', id, error);
    }

    // Um mangá com conteúdo quebrado no site (imagem apagada etc.) não
    // derruba a fonte: tenta os 3 primeiros do popular.
    let lastError: unknown = null;
    for (const mangaId of candidates.slice(0, 3)) {
      try {
        Object.assign(report, await attemptManga(source, mangaId));
        report.ok = true;
        return report;
      } catch (error) {
        lastError = error;
        // preserva os campos parciais para diagnóstico (page1Raw etc.)
        report.mangaId = mangaId;
        if (error instanceof PartialFieldsError) Object.assign(report, error.fields);
      }
    }
    throw lastError;
  } catch (error) {
    report.error = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    const status = (error as { status?: number })?.status;
    if (typeof status === 'number') report.errorStatus = status;
  }
  return report;
}

function finish(payload: unknown): void {
  const el = document.getElementById('result');
  if (el) el.textContent = JSON.stringify(payload, null, 1);
  document.title = 'E2E-DONE';
  document.body.dataset.done = '1';
}

async function main(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const target = params.get('src');
  if (!target) {
    finish({ error: 'parametro ?src= ausente' });
    return;
  }

  if (target === 'todas') {
    const ids = listSources().filter((s) => isKeiyoushiSourceId(s.id)).map((s) => s.id);
    const reports: SourceReport[] = [];
    for (const id of ids) {
      reports.push(await runPipeline(id));
      finish(reports); // atualiza incrementalmente (defesa contra timeout)
    }
    const nsfw = reports.filter((r) => getKeiyoushiEntry(r.id)?.nsfw).length;
    finish({
      total: reports.length,
      ok: reports.filter((r) => r.ok).length,
      failed: reports.filter((r) => !r.ok).length,
      nsfw,
      reports,
    });
    return;
  }

  finish(await runPipeline(target));
}

main().catch((error) => finish({ error: `fatal: ${String(error)}` }));

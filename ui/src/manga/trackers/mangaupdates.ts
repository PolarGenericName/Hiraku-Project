/**
 * MangaUpdates (BakaUpdates) — API v1.
 * Login: PUT /account/login {username,password} → session_token
 *        (Authorization: Bearer <token>)
 * Busca: POST /series/search {search} → results[].record
 * Envio: POST /lists/series (adiciona) + POST /lists/series/update
 *        com list_id = status (0 lendo, 1 planejando, 2 concluído,
 *        3 unfinished/dropado, 4 em espera).
 * Fluxo espelhado do Mihon MangaUpdatesApi.kt.
 */
import type {
  TrackerAccount,
  TrackerClient,
  TrackerSearchResult,
  TrackerStatus,
} from './types';

const BASE = 'https://api.mangaupdates.com/v1';

/** status → list_id da MangaUpdates (constantes do Mihon). */
const STATUS_TO_LIST: Record<TrackerStatus, number> = {
  reading: 0, // READING_LIST
  planned: 1, // WISH_LIST
  completed: 2, // COMPLETE_LIST
  dropped: 3, // UNFINISHED_LIST
  on_hold: 4, // ON_HOLD_LIST
};

async function mu<T>(
  path: string,
  options: { method?: string; body?: unknown; token?: string } = {},
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      'user-agent': 'Hiraku (manga tracker)',
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`MangaUpdates ${res.status}: ${text.slice(0, 140).replace(/\s+/g, ' ')}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

interface MuSearchResponse {
  results?: Array<{ record?: { series_id?: number; title?: string } }>;
}

export const mangaUpdatesTracker: TrackerClient = {
  id: 'mangaupdates',
  name: 'MangaUpdates',
  connectHint: 'Usuário e senha da MangaUpdates (a sessão vale 30 dias).',

  async connect(username, password): Promise<TrackerAccount> {
    const res = await mu<{ context?: { session_token?: string; uid?: number } }>('/account/login', {
      method: 'PUT',
      body: { username, password },
    });
    const token = res.context?.session_token;
    if (!token) throw new Error('MangaUpdates não devolveu session token.');
    return { token, username: String(res.context?.uid ?? username) };
  },

  async search(query): Promise<TrackerSearchResult[]> {
    const res = await mu<MuSearchResponse>('/series/search', {
      method: 'POST',
      body: { page: 1, per_page: 20, search: query },
    });
    const out: TrackerSearchResult[] = [];
    for (const item of res.results ?? []) {
      const record = item.record;
      if (!record?.series_id || !record.title) continue;
      out.push({ remoteId: String(record.series_id), title: record.title });
    }
    return out;
  },

  async update(account, remoteId, input): Promise<void> {
    const seriesId = Number(remoteId);
    if (!Number.isFinite(seriesId)) throw new Error('ID inválido na MangaUpdates.');
    const listId = STATUS_TO_LIST[input.status];

    // Já está numa lista? (GET devolve o item; sem item → 4xx)
    let inList = true;
    try {
      await mu(`/lists/series/${seriesId}`, { token: account.token });
    } catch {
      inList = false;
    }

    if (!inList) {
      await mu('/lists/series', {
        method: 'POST',
        token: account.token,
        body: [{ series: { id: seriesId }, list_id: listId }],
      });
    }

    await mu('/lists/series/update', {
      method: 'POST',
      token: account.token,
      body: [
        {
          series: { id: seriesId },
          list_id: listId,
          status: { chapter: Math.max(0, Math.round(input.progress)) },
        },
      ],
    });
  },
};

/**
 * Kitsu — API edge (JSON:API).
 * Login: POST /api/oauth/token {grant_type:'password', username, password,
 *        client_id} → access_token + refresh_token (expira em 1h; renovamos
 *        com grant_type:'refresh_token').
 * Busca: GET /api/edge/manga?filter[text]=...
 * Envio: GET /api/edge/users/me → GET /api/edge/library-entries (existe?)
 *        → PATCH (atualiza) ou POST (cria) com status+progress.
 */
import type {
  TrackerAccount,
  TrackerClient,
  TrackerSearchResult,
  TrackerStatus,
} from './types';

const OAUTH = 'https://kitsu.io/api/oauth/token';
const BASE = 'https://kitsu.io/api/edge';
/** client_id público do app web do Kitsu (usado por ferramentas de terceiros) */
const CLIENT_ID = '39e8640b6f1a60aaf60f3f3313475e830517badab8048a4e52ff2d10deb2b9b0';

/** status nosso → status do Kitsu */
const STATUS_MAP: Record<TrackerStatus, string> = {
  planned: 'planned',
  reading: 'current',
  completed: 'completed',
  on_hold: 'on_hold',
  dropped: 'dropped',
};

const JSON_API = { accept: 'application/vnd.api+json', 'content-type': 'application/vnd.api+json' };

async function kitsu<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...JSON_API, 'user-agent': 'Hiraku (manga tracker)', ...init.headers },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Kitsu ${res.status}: ${text.slice(0, 140).replace(/\s+/g, ' ')}`);
  }
  return (await res.json()) as T;
}

async function oauth(body: Record<string, string>): Promise<{
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
}> {
  const res = await fetch(OAUTH, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_id: CLIENT_ID, ...body }),
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      res.status === 401
        ? 'Credenciais inválidas no Kitsu.'
        : `Kitsu ${res.status}: ${text.slice(0, 140).replace(/\s+/g, ' ')}`,
    );
  }
  return JSON.parse(text);
}

interface KitsuListResponse<T> {
  data?: T[];
}
interface KitsuManga {
  id: string;
  attributes?: { canonicalTitle?: string; posterImage?: { tiny?: string; small?: string } };
}

/** Renova o access_token quando expirou (guarda no próprio account). */
async function ensureFresh(account: TrackerAccount): Promise<TrackerAccount> {
  if (!account.expiresAt || Date.now() < account.expiresAt - 30_000) return account;
  if (!account.refresh) return account;
  const refreshed = await oauth({ grant_type: 'refresh_token', refresh_token: account.refresh });
  if (!refreshed.access_token) return account;
  return {
    ...account,
    token: refreshed.access_token,
    refresh: refreshed.refresh_token ?? account.refresh,
    expiresAt: refreshed.expires_in ? Date.now() + refreshed.expires_in * 1000 : account.expiresAt,
  };
}

async function getUserId(token: string): Promise<string> {
  const res = await kitsu<KitsuListResponse<{ id: string }>>('/users/me', {
    headers: { authorization: `Bearer ${token}` },
  });
  const id = res.data?.[0]?.id;
  if (!id) throw new Error('Kitsu: não consegui identificar o usuário.');
  return id;
}

export const kitsuTracker: TrackerClient = {
  id: 'kitsu',
  name: 'Kitsu',
  connectHint: 'E-mail (ou @usuário) e senha do Kitsu.',

  async connect(username, password): Promise<TrackerAccount> {
    const res = await oauth({ grant_type: 'password', username, password });
    if (!res.access_token) throw new Error('Kitsu não devolveu access token.');
    return {
      token: res.access_token,
      username,
      refresh: res.refresh_token,
      expiresAt: res.expires_in ? Date.now() + res.expires_in * 1000 : undefined,
    };
  },

  async search(query): Promise<TrackerSearchResult[]> {
    const url = `${BASE}/manga?${new URLSearchParams({
      'filter[text]': query,
      'page[limit]': '20',
    })}`;
    const res = await fetch(url, {
      headers: { ...JSON_API, 'user-agent': 'Hiraku (manga tracker)' },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`Kitsu busca ${res.status}`);
    const json = (await res.json()) as KitsuListResponse<KitsuManga>;
    return (json.data ?? []).map((m) => ({
      remoteId: m.id,
      title: m.attributes?.canonicalTitle ?? '(sem título)',
      coverUrl: m.attributes?.posterImage?.tiny ?? m.attributes?.posterImage?.small,
    }));
  },

  async update(account, remoteId, input): Promise<void> {
    const fresh = await ensureFresh(account);
    const token = fresh.token;
    const userId = await getUserId(token);

    // Entrada existente na biblioteca?
    const list = await kitsu<
      KitsuListResponse<{ id: string; attributes?: { status?: string; progress?: number } }>
    >(
      `/library-entries?${new URLSearchParams({
        'filter[mangaId]': remoteId,
        'filter[userId]': userId,
        'page[limit]': '1',
      })}`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    const entry = list.data?.[0];
    const attributes = {
      status: STATUS_MAP[input.status],
      progress: Math.max(0, Math.round(input.progress)),
    };

    if (entry) {
      await kitsu(`/library-entries/${entry.id}`, {
        method: 'PATCH',
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify({ data: { type: 'library-entries', id: entry.id, attributes } }),
      });
    } else {
      await kitsu('/library-entries', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify({
          data: {
            type: 'library-entries',
            attributes,
            relationships: {
              manga: { data: { type: 'manga', id: remoteId } },
              user: { data: { type: 'users', id: userId } },
            },
          },
        }),
      });
    }
  },
};

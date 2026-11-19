/**
 * Monitoramento de leitura (trackers) — estilo Mihon Trackers.
 * Fase 1: MangaUpdates (login direto) e Kitsu (password grant).
 */

export type TrackerId = 'mangaupdates' | 'kitsu';

export type TrackerStatus = 'planned' | 'reading' | 'completed' | 'on_hold' | 'dropped';

/** Rótulos dos estados (ordem de exibição nos seletores). */
export const TRACKER_STATUS_LABELS: Array<{ value: TrackerStatus; label: string }> = [
  { value: 'planned', label: 'Planejando' },
  { value: 'reading', label: 'Lendo' },
  { value: 'completed', label: 'Concluído' },
  { value: 'on_hold', label: 'Em espera' },
  { value: 'dropped', label: 'Dropado' },
];

/** Conta conectada (token guardado no store). */
export interface TrackerAccount {
  token: string;
  username: string;
  /** epoch ms — sessão com expiração (Kitsu) */
  expiresAt?: number;
  /** refresh token (Kitsu) para renovar a sessão expirada */
  refresh?: string;
}

export interface TrackerSearchResult {
  remoteId: string;
  title: string;
  coverUrl?: string;
}

export interface TrackerUpdateInput {
  status: TrackerStatus;
  /** Capítulo lido */
  progress: number;
}

/** Contrato de um tracker. */
export interface TrackerClient {
  id: TrackerId;
  name: string;
  /** Texto de ajuda para conectar a conta */
  connectHint: string;
  /** Troca credenciais por token */
  connect(username: string, password: string): Promise<TrackerAccount>;
  /** Busca o mangá no serviço para vincular */
  search(query: string): Promise<TrackerSearchResult[]>;
  /** Envia status + progresso (vincula automaticamente se preciso) */
  update(account: TrackerAccount, remoteId: string, input: TrackerUpdateInput): Promise<void>;
}

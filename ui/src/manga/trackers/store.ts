/**
 * Persistência do monitoramento: contas conectadas, quais trackers estão
 * habilitados (padrão: TODOS) e vínculos mangá → id no serviço.
 *
 * Segurança: no app desktop o conteúdo é criptografado com o safeStorage
 * do SO (chaveiro) antes de ir ao localStorage. No web fica em plaintext
 * (limitação do navegador, sem chave segura possível). Migração automática:
 * um store salvo em formato antigo é lido normalmente e regravado seguro.
 */
import type { TrackerAccount, TrackerId } from './types';

const TRACKER_STORE_KEY = 'hiraku-manga-trackers';

export interface TrackerStore {
  /** Padrão: habilitado (ausente = true) */
  disabled?: TrackerId[];
  accounts: Partial<Record<TrackerId, TrackerAccount>>;
  /** `${sourceId}|${mangaId}|${trackerId}` → remoteId */
  links: Record<string, string>;
}

interface EncryptedBlob {
  enc: 1;
  data: string;
}

function isEncryptedBlob(value: unknown): value is EncryptedBlob {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as EncryptedBlob).enc === 1 &&
    typeof (value as EncryptedBlob).data === 'string'
  );
}

function parseStore(raw: string): TrackerStore | null {
  try {
    const parsed = JSON.parse(raw) as TrackerStore;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      disabled: Array.isArray(parsed.disabled) ? parsed.disabled : [],
      accounts: parsed.accounts && typeof parsed.accounts === 'object' ? parsed.accounts : {},
      links: parsed.links && typeof parsed.links === 'object' ? parsed.links : {},
    };
  } catch {
    return null;
  }
}

export function getTrackerStore(): TrackerStore {
  try {
    const raw = localStorage.getItem(TRACKER_STORE_KEY);
    if (!raw) return { accounts: {}, links: {} };
    const parsed: unknown = JSON.parse(raw);
    if (isEncryptedBlob(parsed)) {
      const plain = window.electronAPI?.secureDecrypt?.(parsed.data);
      // sem como descriptografar → vazio (nunca expor credenciais ilegíveis)
      return (plain && parseStore(plain)) || { accounts: {}, links: {} };
    }
    return parseStore(raw) ?? { accounts: {}, links: {} };
  } catch {
    return { accounts: {}, links: {} };
  }
}

function saveTrackerStore(store: TrackerStore): void {
  const raw = JSON.stringify(store);
  const encrypted = window.electronAPI?.secureEncrypt?.(raw);
  try {
    localStorage.setItem(
      TRACKER_STORE_KEY,
      encrypted ? JSON.stringify({ enc: 1, data: encrypted } satisfies EncryptedBlob) : raw,
    );
  } catch {
    // storage indisponível
  }
}

/** Padrão: todos habilitados. */
export function isTrackerEnabled(id: TrackerId): boolean {
  return !(getTrackerStore().disabled ?? []).includes(id);
}

export function setTrackerEnabled(id: TrackerId, enabled: boolean): void {
  const store = getTrackerStore();
  const disabled = new Set(store.disabled ?? []);
  if (enabled) disabled.delete(id);
  else disabled.add(id);
  store.disabled = [...disabled];
  saveTrackerStore(store);
}

export function getTrackerAccount(id: TrackerId): TrackerAccount | undefined {
  return getTrackerStore().accounts[id];
}

export function setTrackerAccount(id: TrackerId, account: TrackerAccount): void {
  const store = getTrackerStore();
  store.accounts[id] = account;
  saveTrackerStore(store);
}

export function removeTrackerAccount(id: TrackerId): void {
  const store = getTrackerStore();
  delete store.accounts[id];
  // ao desconectar, os vínculos desse tracker também saem
  const prefix = `|${id}`;
  for (const key of Object.keys(store.links)) {
    if (key.endsWith(prefix)) delete store.links[key];
  }
  saveTrackerStore(store);
}

function linkKey(sourceId: string, mangaId: string, tracker: TrackerId): string {
  return `${sourceId}|${mangaId}|${tracker}`;
}

export function getTrackerLink(
  sourceId: string,
  mangaId: string,
  tracker: TrackerId,
): string | null {
  return getTrackerStore().links[linkKey(sourceId, mangaId, tracker)] ?? null;
}

export function setTrackerLink(
  sourceId: string,
  mangaId: string,
  tracker: TrackerId,
  remoteId: string,
): void {
  const store = getTrackerStore();
  store.links[linkKey(sourceId, mangaId, tracker)] = remoteId;
  saveTrackerStore(store);
}

export function removeTrackerLink(
  sourceId: string,
  mangaId: string,
  tracker: TrackerId,
): void {
  const store = getTrackerStore();
  delete store.links[linkKey(sourceId, mangaId, tracker)];
  saveTrackerStore(store);
}

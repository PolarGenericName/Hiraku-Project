/**
 * Backup dos dados do app (todas as chaves localStorage com prefixo hiraku-).
 * - Pasta de backup: escolhida pelo usuário (padrão: Documentos/Hiraku/Backups)
 *   via diálogo nativo no Electron; no web usa a File System Access API e,
 *   sem pasta, cai para download do arquivo.
 * - Backup automático: roda sozinho periodicamente (a cada 6h) enquanto o
 *   app está aberto, desde que ativado e com uma pasta conhecida.
 */

import { toast } from 'sonner';

const BACKUP_DIR_KEY = 'hiraku-backup-dir';
const BACKUP_AUTO_KEY = 'hiraku-backup-auto';
const BACKUP_AUTO_LAST_KEY = 'hiraku-backup-auto-last';

const AUTO_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 horas
const AUTO_CHECK_MS = 60 * 60 * 1000; // checagem a cada 1h

interface BackupPayload {
  app: 'hiraku';
  version: 1;
  createdAt: number;
  data: Record<string, string>;
}

/** Handle da pasta escolhida nesta sessão (File System Access API, web). */
let sessionDirHandle: { name: string } | null = null;

function readStr(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStr(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // noop
  }
}

/** Pasta de backup escolhida (caminho no Electron, nome no web). */
export function getBackupDir(): string | null {
  return readStr(BACKUP_DIR_KEY);
}

export function isAutoBackupEnabled(): boolean {
  return readStr(BACKUP_AUTO_KEY) === '1';
}

export function setAutoBackupEnabled(enabled: boolean): void {
  writeStr(BACKUP_AUTO_KEY, enabled ? '1' : '0');
}

/** epoch ms do último backup automático, ou null. */
export function getLastAutoBackup(): number | null {
  const n = Number(readStr(BACKUP_AUTO_LAST_KEY));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function setLastAutoBackup(ts: number): void {
  writeStr(BACKUP_AUTO_LAST_KEY, String(ts));
}

/** Coleta todas as chaves hiraku- do localStorage (a dir da máquina fica de fora). */
function collectData(): Record<string, string> {
  const data: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith('hiraku-') || key === BACKUP_DIR_KEY) continue;
    const value = localStorage.getItem(key);
    if (value !== null) data[key] = value;
  }
  return data;
}

function buildPayload(): string {
  const payload: BackupPayload = {
    app: 'hiraku',
    version: 1,
    createdAt: Date.now(),
    data: collectData(),
  };
  return JSON.stringify(payload, null, 2);
}

function fileTimestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

/** Escolhe a pasta de backup (diálogo nativo no Electron, FS API no web). */
export async function selectBackupFolder(): Promise<string | null> {
  if (window.electronAPI?.backupSelectFolder) {
    const dir = await window.electronAPI.backupSelectFolder();
    if (dir) writeStr(BACKUP_DIR_KEY, dir);
    return dir;
  }
  const picker = (window as { showDirectoryPicker?: (opts?: unknown) => Promise<unknown> })
    .showDirectoryPicker;
  if (typeof picker === 'function') {
    try {
      const handle = (await picker({ mode: 'readwrite' })) as { name: string };
      sessionDirHandle = handle;
      writeStr(BACKUP_DIR_KEY, handle.name);
      return handle.name;
    } catch {
      return null; // usuário cancelou
    }
  }
  return null;
}

/** Pasta de gravação no Electron: a escolhida ou a padrão do Hiraku. */
async function resolveElectronDir(): Promise<string | null> {
  const saved = getBackupDir();
  if (saved) return saved;
  if (window.electronAPI?.backupDefaultDir) {
    const def = await window.electronAPI.backupDefaultDir();
    if (def) {
      writeStr(BACKUP_DIR_KEY, def);
      return def;
    }
  }
  return null;
}

type WriteResult = 'ok' | 'download' | 'error';

async function writeBackupFile(fileName: string, content: string): Promise<WriteResult> {
  // Electron: grava na pasta via IPC
  if (window.electronAPI?.backupWrite) {
    const dir = await resolveElectronDir();
    if (!dir) return 'error';
    const ok = await window.electronAPI.backupWrite(dir, fileName, content);
    return ok ? 'ok' : 'error';
  }
  // Web com pasta escolhida nesta sessão
  if (sessionDirHandle) {
    try {
      const fh = await (
        sessionDirHandle as unknown as {
          getFileHandle: (name: string, opts?: unknown) => Promise<{
            createWritable: () => Promise<{ write: (d: string) => Promise<void>; close: () => Promise<void> }>;
          }>;
        }
      ).getFileHandle(fileName, { create: true });
      const writable = await fh.createWritable();
      await writable.write(content);
      await writable.close();
      return 'ok';
    } catch {
      return 'error';
    }
  }
  // Fallback: download do arquivo
  try {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    return 'download';
  } catch {
    return 'error';
  }
}

/** Cria um backup datado. */
export async function createBackup(): Promise<WriteResult> {
  return writeBackupFile(`hiraku-backup-${fileTimestamp()}.json`, buildPayload());
}

/** Tem onde gravar de verdade (para o automático não cair em download). */
async function hasRealDestination(): Promise<boolean> {
  if (window.electronAPI?.backupWrite) return true;
  return sessionDirHandle !== null;
}

/**
 * Backup automático: roda se ativado, vencido o intervalo e com destino
 * conhecido. Retorna true se criou.
 */
export async function maybeRunAutoBackup(): Promise<boolean> {
  if (!isAutoBackupEnabled()) return false;
  const last = getLastAutoBackup();
  if (last && Date.now() - last < AUTO_INTERVAL_MS) return false;
  if (!(await hasRealDestination())) return false;
  const result = await writeBackupFile('hiraku-backup-auto.json', buildPayload());
  if (result !== 'ok') return false;
  setLastAutoBackup(Date.now());
  toast('Backup automático criado', { duration: 3000 });
  return true;
}

let autoTimer: ReturnType<typeof setInterval> | null = null;

/** Inicia o sistema de backup automático (chamar uma vez, no Layout). */
export function initAutoBackup(): void {
  if (autoTimer !== null) return;
  void maybeRunAutoBackup();
  autoTimer = setInterval(() => void maybeRunAutoBackup(), AUTO_CHECK_MS);
}

/** Valida o JSON de um backup. Retorna null se inválido. */
export function parseBackup(text: string): BackupPayload | null {
  try {
    const payload = JSON.parse(text) as BackupPayload;
    if (payload?.app !== 'hiraku') return null;
    if (typeof payload?.data !== 'object' || payload.data === null) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Aplica um backup: substitui todas as chaves hiraku- pelas do arquivo.
 * A pasta de backup da máquina local é preservada.
 */
export function applyBackup(payload: BackupPayload): void {
  const localDir = getBackupDir();
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('hiraku-')) toRemove.push(key);
  }
  toRemove.forEach((key) => {
    try {
      localStorage.removeItem(key);
    } catch {
      // noop
    }
  });
  for (const [key, value] of Object.entries(payload.data)) {
    if (typeof value !== 'string') continue;
    try {
      localStorage.setItem(key, value);
    } catch {
      // noop
    }
  }
  // A escolha de pasta é específica desta máquina
  writeStr(BACKUP_DIR_KEY, localDir);
}

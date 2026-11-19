interface UpdateInfo {
  version: string;
  releaseDate: string;
  releaseName: string | null;
  releaseNotes: string | null;
}

interface DiscordActivity {
  details?: string;
  state?: string;
  startTimestamp?: number;
  endTimestamp?: number;
  largeImageKey?: string;
  largeImageText?: string;
  smallImageKey?: string;
  smallImageText?: string;
  type?: number;
}

interface ElectronAPI {
  minimize: () => Promise<void>;
  maximize: () => Promise<void>;
  close: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  onStateChanged: (callback: (state: string) => void) => () => void;
  setActivity: (activity: DiscordActivity) => Promise<boolean>;
  clearActivity: () => Promise<boolean>;
  /** Liga/desliga a presença no Discord (Configurações) */
  setDiscordEnabled: (enabled: boolean) => Promise<boolean>;
  updateCheck: () => Promise<void>;
  updateDownload: () => Promise<void>;
  updateInstall: () => Promise<void>;
  updateGetInfo: () => Promise<(UpdateInfo & { downloaded?: boolean }) | null>;
  onUpdateChecking: (callback: () => void) => () => void;
  onUpdateAvailable: (callback: (info: UpdateInfo) => void) => () => void;
  onUpdateNotAvailable: (callback: () => void) => () => void;
  onUpdateError: (callback: (msg: string) => void) => () => void;
  onUpdateDownloadProgress: (callback: (progress: { percent: number; transferred: number; total: number }) => void) => () => void;
  onUpdateDownloaded: (callback: () => void) => () => void;
  /** Pasta padrão dos backups (Documentos/Hiraku/Backups) */
  backupDefaultDir: () => Promise<string | null>;
  /** Abre o seletor de pasta do sistema; null se cancelado */
  backupSelectFolder: () => Promise<string | null>;
  /** Grava um arquivo de backup (utf8) na pasta. false em falha. */
  backupWrite: (dir: string, fileName: string, content: string) => Promise<boolean>;
  /** Criptografa texto com o safeStorage do SO (null se indisponível). */
  secureEncrypt: (text: string) => string | null;
  /** Descriptografa o texto gerado por secureEncrypt (null se falhar). */
  secureDecrypt: (text: string) => string | null;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};

/**
 * Preferências globais do app (valem para animes, mangás e o resto).
 * Hoje: presença no Discord, vídeo/leitor, monitoramento, backup e
 * comportamento do app. Telas de Configurações e "Mais" leem daqui.
 */

const DISCORD_PRESENCE_KEY = 'hiraku-discord-presence';
const APP_MODE_KEY = 'hiraku-mode';
const AUTOPLAY_KEY = 'hiraku-autoplay';
const RESUME_KEY = 'hiraku-resume';
const PLAYBACK_RATE_KEY = 'hiraku-playback-rate';
const HISTORY_ENABLED_KEY = 'hiraku-history-enabled';
const PROGRESS_ENABLED_KEY = 'hiraku-progress-enabled';
const AUTO_UPDATE_KEY = 'hiraku-auto-update';
const REMEMBER_MODE_KEY = 'hiraku-remember-mode';

/** Padrão: ligada. */
export function getDiscordPresence(): boolean {
  try {
    return localStorage.getItem(DISCORD_PRESENCE_KEY) !== '0';
  } catch {
    return true;
  }
}

export function setDiscordPresence(enabled: boolean): void {
  try {
    localStorage.setItem(DISCORD_PRESENCE_KEY, enabled ? '1' : '0');
  } catch {
    // storage indisponível
  }
  // aplica na hora no app desktop (no web é no-op)
  void window.electronAPI?.setDiscordEnabled(enabled);
}

// ── Vídeo (player de episódios) ──────────────────────────────────────────────

/** Autoplay do próximo episódio ao terminar o atual. Padrão: ligado. */
export function isAutoplayEnabled(): boolean {
  try {
    return localStorage.getItem(AUTOPLAY_KEY) !== '0';
  } catch {
    return true;
  }
}

export function setAutoplayEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(AUTOPLAY_KEY, enabled ? '1' : '0');
  } catch {
    // noop
  }
}

/** Retomar o episódio de onde parou. Padrão: ligado. */
export function isResumeEnabled(): boolean {
  try {
    return localStorage.getItem(RESUME_KEY) !== '0';
  } catch {
    return true;
  }
}

export function setResumeEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(RESUME_KEY, enabled ? '1' : '0');
  } catch {
    // noop
  }
}

/** Velocidade de reprodução padrão (ex.: '1', '1.5'). */
export function getPlaybackRate(): number {
  try {
    const n = Number(localStorage.getItem(PLAYBACK_RATE_KEY));
    return Number.isFinite(n) && n > 0 && n <= 4 ? n : 1;
  } catch {
    return 1;
  }
}

export function setPlaybackRate(rate: number): void {
  try {
    localStorage.setItem(PLAYBACK_RATE_KEY, String(rate));
  } catch {
    // noop
  }
}

// ── Monitoramento ────────────────────────────────────────────────────────────

/** Salvar episódios no histórico. Padrão: ligado. */
export function isHistoryEnabled(): boolean {
  try {
    return localStorage.getItem(HISTORY_ENABLED_KEY) !== '0';
  } catch {
    return true;
  }
}

export function setHistoryEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(HISTORY_ENABLED_KEY, enabled ? '1' : '0');
  } catch {
    // noop
  }
}

/** Salvar a posição de parada dos episódios (watch progress). Padrão: ligado. */
export function isProgressTrackingEnabled(): boolean {
  try {
    return localStorage.getItem(PROGRESS_ENABLED_KEY) !== '0';
  } catch {
    return true;
  }
}

export function setProgressTrackingEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(PROGRESS_ENABLED_KEY, enabled ? '1' : '0');
  } catch {
    // noop
  }
}

// ── Comportamento do app ─────────────────────────────────────────────────────

/** Verificar atualizações ao iniciar. Padrão: ligado. */
export function isAutoUpdateCheckEnabled(): boolean {
  try {
    return localStorage.getItem(AUTO_UPDATE_KEY) !== '0';
  } catch {
    return true;
  }
}

export function setAutoUpdateCheckEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(AUTO_UPDATE_KEY, enabled ? '1' : '0');
  } catch {
    // noop
  }
}

/** Lembrar o último modo (Animes/Mangás) ao reabrir. Padrão: ligado. */
export function isRememberModeEnabled(): boolean {
  try {
    return localStorage.getItem(REMEMBER_MODE_KEY) !== '0';
  } catch {
    return true;
  }
}

export function setRememberModeEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(REMEMBER_MODE_KEY, enabled ? '1' : '0');
  } catch {
    // noop
  }
}

/**
 * Redefine todas as preferências para o padrão (não toca em dados:
 * conta, biblioteca, histórico e progresso permanecem).
 */
export function resetAppPreferences(): void {
  const keys = [
    DISCORD_PRESENCE_KEY,
    APP_MODE_KEY,
    AUTOPLAY_KEY,
    RESUME_KEY,
    PLAYBACK_RATE_KEY,
    HISTORY_ENABLED_KEY,
    PROGRESS_ENABLED_KEY,
    AUTO_UPDATE_KEY,
    REMEMBER_MODE_KEY,
  ];
  for (const key of keys) {
    try {
      localStorage.removeItem(key);
    } catch {
      // noop
    }
  }
  // restaura o estado aplicado da presença
  void window.electronAPI?.setDiscordEnabled(true);
}

export type AppMode = 'anime' | 'manga';

/** Último modo visitado (usado pelas rotas globais: /profile, /settings). */
export function getAppMode(): AppMode {
  try {
    if (localStorage.getItem(REMEMBER_MODE_KEY) === '0') return 'anime';
    return localStorage.getItem(APP_MODE_KEY) === 'manga' ? 'manga' : 'anime';
  } catch {
    return 'anime';
  }
}

export function setAppMode(mode: AppMode): void {
  if (!isRememberModeEnabled()) return;
  try {
    localStorage.setItem(APP_MODE_KEY, mode);
  } catch {
    // storage indisponível
  }
}

const ANIME_ROUTES = ['/', '/animes', '/filmes', '/search'];

/**
 * Qual modo o app deve mostrar nesta rota. Rotas de mangá/anime são óbvias;
 * as globais (/profile, /settings) preservam o último modo — assim quem
 * está em mangás e abre Configurações continua em mangás.
 */
export function isMangaLocation(location: string): boolean {
  if (location.startsWith('/manga')) return true;
  if (ANIME_ROUTES.includes(location) || location.startsWith('/anime/')) return false;
  return getAppMode() === 'manga';
}

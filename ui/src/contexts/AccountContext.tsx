import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

const ACCOUNT_KEY = 'hiraku-account';

export interface EpisodeHistoryItem {
  animeId: string;
  animeTitle: string;
  animeCover: string;
  episodeId: string;
  episodeNumber: number;
  season: number;
  watchedAt: number;
}

export interface AccountData {
  name: string;
  avatar: string; // base64 data URL
  history: EpisodeHistoryItem[];
  savedAnimes: string[]; // anilist IDs
  createdAt: number;
}

interface AccountContextType {
  account: AccountData | null;
  isSetup: boolean;
  createAccount: (name: string, avatar: string) => void;
  updateAvatar: (avatar: string) => void;
  updateName: (name: string) => void;
  addToHistory: (item: EpisodeHistoryItem) => void;
  getHistory: () => EpisodeHistoryItem[];
  clearHistory: () => void;
  toggleSavedAnime: (anilistId: string) => void;
  isSaved: (anilistId: string) => boolean;
  getSavedAnimes: () => string[];
}

const AccountContext = createContext<AccountContextType | undefined>(undefined);

function loadAccount(): AccountData | null {
  try {
    const raw = localStorage.getItem(ACCOUNT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.name !== 'string') return null;
    return {
      name: parsed.name,
      avatar: typeof parsed.avatar === 'string' ? parsed.avatar : '',
      history: Array.isArray(parsed.history)
        ? parsed.history.filter((h: any) => h && typeof h.animeId === 'string' && typeof h.episodeId === 'string')
        : [],
      savedAnimes: Array.isArray(parsed.savedAnimes)
        ? parsed.savedAnimes.filter((id: any) => typeof id === 'string')
        : [],
      createdAt: typeof parsed.createdAt === 'number' ? parsed.createdAt : Date.now(),
    };
  } catch {
    return null;
  }
}

function saveAccount(data: AccountData) {
  try {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(data));
  } catch {
    // localStorage full or unavailable — data won't persist
  }
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<AccountData | null>(loadAccount);

  const isSetup = account !== null;

  const createAccount = useCallback((name: string, avatar: string) => {
    const data: AccountData = {
      name,
      avatar,
      history: [],
      savedAnimes: [],
      createdAt: Date.now(),
    };
    saveAccount(data);
    setAccount(data);
  }, []);

  const updateAvatar = useCallback((avatar: string) => {
    setAccount((prev) => {
      if (!prev) return prev;
      const next = { ...prev, avatar };
      saveAccount(next);
      return next;
    });
  }, []);

  const updateName = useCallback((name: string) => {
    setAccount((prev) => {
      if (!prev) return prev;
      const next = { ...prev, name };
      saveAccount(next);
      return next;
    });
  }, []);

  const addToHistory = useCallback((item: EpisodeHistoryItem) => {
    setAccount((prev) => {
      if (!prev) return prev;
      // Remove duplicate (same anime + episode)
      const filtered = prev.history.filter(
        (h) => !(h.animeId === item.animeId && h.episodeId === item.episodeId)
      );
      // Add to beginning (most recent first)
      const history = [item, ...filtered].slice(0, 200); // Max 200 items
      const next = { ...prev, history };
      saveAccount(next);
      return next;
    });
  }, []);

  const getHistory = useCallback(() => {
    return account?.history || [];
  }, [account]);

  const clearHistory = useCallback(() => {
    setAccount((prev) => {
      if (!prev) return prev;
      const next = { ...prev, history: [] };
      saveAccount(next);
      return next;
    });
  }, []);

  const toggleSavedAnime = useCallback((anilistId: string) => {
    setAccount((prev) => {
      if (!prev) return prev;
      const saved = prev.savedAnimes.includes(anilistId)
        ? prev.savedAnimes.filter((id) => id !== anilistId)
        : [...prev.savedAnimes, anilistId];
      const next = { ...prev, savedAnimes: saved };
      saveAccount(next);
      return next;
    });
  }, []);

  const isSaved = useCallback((anilistId: string) => {
    return account?.savedAnimes.includes(anilistId) || false;
  }, [account]);

  const getSavedAnimes = useCallback(() => {
    return account?.savedAnimes || [];
  }, [account]);

  return (
    <AccountContext.Provider
      value={{
        account,
        isSetup,
        createAccount,
        updateAvatar,
        updateName,
        addToHistory,
        getHistory,
        clearHistory,
        toggleSavedAnime,
        isSaved,
        getSavedAnimes,
      }}
    >
      {children}
    </AccountContext.Provider>
  );
}

export function useAccount() {
  const context = useContext(AccountContext);
  if (!context) {
    throw new Error('useAccount must be used within AccountProvider');
  }
  return context;
}

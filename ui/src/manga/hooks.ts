/**
 * Hooks de estado da seção de mangás.
 * Assina o evento de mudança do storage (hiraku-manga-changed) e o
 * evento 'storage' (outras janelas do mesmo origin).
 */

import { useEffect, useRef, useState } from 'react';
import { MANGA_EVENT } from './storage';

export function useMangaStore<T>(read: () => T): T {
  const [value, setValue] = useState<T>(() => read());
  const readRef = useRef(read);
  readRef.current = read;

  useEffect(() => {
    const update = () => setValue(readRef.current());
    window.addEventListener(MANGA_EVENT, update);
    window.addEventListener('storage', update);
    return () => {
      window.removeEventListener(MANGA_EVENT, update);
      window.removeEventListener('storage', update);
    };
  }, []);

  return value;
}

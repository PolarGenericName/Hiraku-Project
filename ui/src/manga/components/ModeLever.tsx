/**
 * Alavanca de modo Animes ⇄ Mangás.
 * Alterna entre a área de animes (/) e a seção de mangás (/manga) com uma
 * "colagem" de imagens atravessando a tela (train in, train out):
 *   - Mangás: páginas de mangá movendo para a direita
 *   - Animes: banners de episódios movendo para a esquerda
 * Cada faixa tem sua própria velocidade e ordem embaralhada, com máscara
 * suave nas bordas (efeito de pintura).
 */

import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'wouter';
import { BookOpen, Play } from 'lucide-react';
import { isMangaLocation, setAppMode } from '@/shared/lib/prefs';

const TRAIN_COUNT = 14;
const STRIP_COUNT = 6;
/** Duração (s) de cada faixa — velocidades próprias, embaralhadas. */
const STRIP_DURATIONS = [7.5, 9.5, 8, 10.5, 7, 8.5];
/**
 * Os banners dos animes são ~6× mais largos que as páginas de mangá
 * (proporção média 4.24 vs 0.70 da altura) — sem escala, o deslize deles
 * fica 6× mais rápido em px/s. Escala as durações para igualar a
 * velocidade visual à do mangá.
 */
const ANIME_SPEED_SCALE = 6;

/** Imagens do trem (public/train/*) — pré-carregadas na montagem. */
const MANGA_TRAIN = Array.from(
  { length: TRAIN_COUNT },
  (_, i) => `/train/manga/${String(i + 1).padStart(2, '0')}.jpg`,
);
const ANIME_TRAIN = Array.from(
  { length: TRAIN_COUNT },
  (_, i) => `/train/anime/${String(i + 1).padStart(2, '0')}.jpg`,
);

/** Embaralhamento determinístico (mesma ordem a cada montagem). */
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const out = [...arr];
  let s = seed;
  const rnd = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function preload(urls: string[]) {
  for (const url of urls) {
    const img = new Image();
    img.src = url;
  }
}

interface TrainState {
  target: 'manga' | 'anime';
}

export default function ModeLever() {
  const [location, navigate] = useLocation();
  // Preserva o modo nas rotas globais (/settings, /profile)
  const isManga = isMangaLocation(location);
  const [train, setTrain] = useState<TrainState | null>(null);

  // Colagem: cada faixa com ordem embaralhada e velocidade própria
  const strips = useMemo(
    () =>
      Array.from({ length: STRIP_COUNT }, (_, i) => ({
        manga: [...seededShuffle(MANGA_TRAIN, i * 7 + 1), ...seededShuffle(MANGA_TRAIN, i * 7 + 1)],
        anime: [...seededShuffle(ANIME_TRAIN, i * 13 + 5), ...seededShuffle(ANIME_TRAIN, i * 13 + 5)],
        duration: STRIP_DURATIONS[i % STRIP_DURATIONS.length],
      })),
    [],
  );

  // Pré-carrega as imagens do trem para a troca ser imediata
  useEffect(() => {
    preload(MANGA_TRAIN);
    preload(ANIME_TRAIN);
  }, []);

  const handleToggle = (_e: MouseEvent<HTMLButtonElement>) => {
    if (train) return;
    const target: TrainState['target'] = isManga ? 'anime' : 'manga';
    setAppMode(target); // grava imediatamente (rotas globais usam disso)
    setTrain({ target });
    // Navega quando a colagem já cobriu boa parte da tela
    window.setTimeout(() => navigate(target === 'manga' ? '/manga' : '/'), 700);
    // Remove a camada quando o trem termina de sair
    window.setTimeout(() => setTrain(null), 2800);
  };

  return (
    <>
      <button
        type="button"
        role="switch"
        aria-checked={isManga}
        aria-label={isManga ? 'Alternar para modo Animes' : 'Alternar para modo Mangás'}
        onClick={handleToggle}
        className="relative h-9 w-[140px] shrink-0 rounded-full border border-white/10 bg-white/10 p-1 cursor-pointer hover:bg-white/15 transition-colors"
      >
        <span
          aria-hidden
          className="absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-full bg-[#7c3aed] shadow-[0_2px_10px_rgba(124,58,237,0.6)] transition-transform duration-300 ease-[cubic-bezier(0.68,-0.55,0.27,1.55)]"
          style={{ transform: isManga ? 'translateX(100%)' : 'translateX(0)' }}
        />
        <span className="relative z-10 grid h-full grid-cols-2 items-center">
          <span
            className={`flex items-center justify-center gap-1 text-[11px] font-semibold transition-colors duration-300 ${
              isManga ? 'text-gray-400' : 'text-white'
            }`}
          >
            <Play size={13} />
            Animes
          </span>
          <span
            className={`flex items-center justify-center gap-1 text-[11px] font-semibold transition-colors duration-300 ${
              isManga ? 'text-white' : 'text-gray-400'
            }`}
          >
            <BookOpen size={13} />
            Mangás
          </span>
        </span>
      </button>

      {train &&
        createPortal(
          <>
            {/* Fundo sólido: esconde a troca de tela sob os cantos transparentes
                da máscara (evita o corte brusco do conteúdo) */}
            <div className="train-backdrop" aria-hidden />
            <div
              className={`train-overlay ${train.target === 'manga' ? 'train-ltr' : 'train-rtl'}`}
              aria-hidden
            >
              {strips.map((strip, i) => (
                <div
                  key={i}
                  className="train-band"
                  style={
                    {
                      '--dur': `${
                        train.target === 'manga'
                          ? strip.duration
                          : strip.duration * ANIME_SPEED_SCALE
                      }s`,
                    } as React.CSSProperties
                  }
                >
                  {(train.target === 'manga' ? strip.manga : strip.anime).map((src, j) => (
                    <img key={`${src}-${j}`} src={src} alt="" className="train-card" draggable={false} />
                  ))}
                </div>
              ))}
            </div>
          </>,
          document.body,
        )}
    </>
  );
}

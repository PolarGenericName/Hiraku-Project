import { useState, useEffect } from 'react';
import { Minus, Square, X, Maximize2 } from 'lucide-react';

declare global {
  interface Window {
    electronAPI?: {
      minimize: () => Promise<void>;
      maximize: () => Promise<void>;
      close: () => Promise<void>;
      isMaximized: () => Promise<boolean>;
      onStateChanged: (callback: (state: string) => void) => void;
      setActivity: (activity: {
        details?: string;
        state?: string;
        startTimestamp?: number;
        largeImageKey?: string;
        largeImageText?: string;
        smallImageKey?: string;
        smallImageText?: string;
        buttons?: { label: string; url: string }[];
      }) => Promise<boolean>;
      clearActivity: () => Promise<boolean>;
    };
  }
}

export default function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);
  const isElectron = !!window.electronAPI;

  useEffect(() => {
    if (!isElectron) return;

    window.electronAPI!.isMaximized().then(setIsMaximized);
    const handler = (state: string) => {
      setIsMaximized(state === 'maximized');
    };
    window.electronAPI!.onStateChanged(handler);
    return () => {
      // Note: preload doesn't expose unsubscribe — listener persists but is cheap
    };
  }, [isElectron]);

  if (!isElectron) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[200] h-8 flex items-center justify-between bg-black/95 backdrop-blur-sm select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* App Title */}
      <div className="flex items-center gap-2 pl-4">
        <img src="/logo.png" alt="" className="w-4 h-4 object-contain" />
        <span className="text-xs text-gray-500 font-medium">Hiraku</span>
      </div>

      {/* Window Controls */}
      <div className="flex items-center h-full" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button
          onClick={() => window.electronAPI!.minimize()}
          className="h-full px-3 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <Minus size={14} />
        </button>
        <button
          onClick={() => window.electronAPI!.maximize()}
          className="h-full px-3 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          {isMaximized ? <Square size={12} /> : <Maximize2 size={13} />}
        </button>
        <button
          onClick={() => window.electronAPI!.close()}
          className="h-full px-3 flex items-center justify-center text-gray-400 hover:text-white hover:bg-red-500/80 transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

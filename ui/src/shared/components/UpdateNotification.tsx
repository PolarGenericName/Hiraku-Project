import { useEffect, useState } from 'react';
import { Download, X, ArrowDownToLine, Check, RefreshCw, AlertTriangle } from 'lucide-react';

const isElectron = typeof window !== 'undefined' && !!window.electronAPI;

type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloaded' | 'error';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${mb.toFixed(1)} MB`;
}

export default function UpdateNotification() {
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [updateInfo, setUpdateInfo] = useState<{ version: string; releaseDate: string; releaseName: string | null; releaseNotes: string | null } | null>(null);
  const [progress, setProgress] = useState(0);
  const [transferred, setTransferred] = useState(0);
  const [total, setTotal] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    if (!isElectron) return;

    const api = window.electronAPI!;

    const dismissedVersion = sessionStorage.getItem('update-dismissed');
    const savedStatus = sessionStorage.getItem('update-status') as UpdateStatus | null;
    const savedInfoRaw = sessionStorage.getItem('update-info');

    let savedInfo: typeof updateInfo = null;
    if (savedInfoRaw) {
      try {
        const parsed = JSON.parse(savedInfoRaw);
        if (parsed && typeof parsed.version === 'string') {
          savedInfo = parsed;
        }
      } catch {}
    }

    if (savedStatus === 'available' && savedInfo && dismissedVersion !== savedInfo.version) {
      setStatus('available');
      setUpdateInfo(savedInfo);
    }

    // Restore the "downloaded" state if the update is ready in this process
    api
      .updateGetInfo()
      .then((info) => {
        if (info && info.downloaded) {
          setStatus('downloaded');
          setUpdateInfo({
            version: info.version,
            releaseDate: info.releaseDate ?? '',
            releaseName: info.releaseName ?? null,
            releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : null,
          });
        }
      })
      .catch(() => {});

    const unsubs = [
      api.onUpdateChecking(() => {
        const current = sessionStorage.getItem('update-status');
        if (current !== 'available' && current !== 'downloaded') setStatus('checking');
      }),
      api.onUpdateAvailable((info) => {
        if (sessionStorage.getItem('update-dismissed') === info.version) {
          setStatus('idle');
          return;
        }
        setStatus('available');
        setUpdateInfo({
          ...info,
          releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : null,
        });
        setIsDownloading(false);
        sessionStorage.setItem('update-status', 'available');
        sessionStorage.setItem('update-info', JSON.stringify(info));
      }),
      api.onUpdateNotAvailable(() => {
        setStatus('idle');
        sessionStorage.setItem('update-status', 'idle');
      }),
      api.onUpdateError(() => {
        setStatus('error');
        setIsDownloading(false);
        sessionStorage.removeItem('update-checked');
      }),
      api.onUpdateDownloadProgress((p) => {
        setProgress(Math.round(p.percent));
        setTransferred(p.transferred);
        setTotal(p.total);
      }),
      api.onUpdateDownloaded(() => {
        sessionStorage.removeItem('update-dismissed');
        sessionStorage.removeItem('update-checked');
        sessionStorage.removeItem('update-status');
        sessionStorage.removeItem('update-info');
        setStatus('downloaded');
        setIsDownloading(false);
      }),
    ];

    if (!sessionStorage.getItem('update-checked')) {
      sessionStorage.setItem('update-checked', '1');
      api.updateCheck().catch(() => {});
    }

    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, []);

  if (!isElectron || status === 'idle') return null;

  if (status === 'error') {
    return (
      <div className="fixed bottom-4 right-4 z-[200] bg-white/10 backdrop-blur-xl border border-white/10 rounded-xl px-4 py-3 flex items-center gap-3 shadow-2xl animate-in slide-in-from-bottom-5">
        <AlertTriangle className="w-5 h-5 text-yellow-400" />
        <span className="text-sm text-gray-300">Falha ao verificar atualizações</span>
        <button
          onClick={() => setStatus('idle')}
          className="text-gray-500 hover:text-white transition-colors p-1"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  const handleDownload = () => {
    setIsDownloading(true);
    setProgress(0);
    setTransferred(0);
    setTotal(0);
    window.electronAPI?.updateDownload().catch(() => setIsDownloading(false));
  };

  const handleDismiss = () => {
    if (updateInfo) {
      sessionStorage.setItem('update-dismissed', updateInfo.version);
    }
    setStatus('idle');
  };

  if (status === 'checking') {
    return (
      <div className="fixed bottom-4 right-4 z-[200] bg-white/10 backdrop-blur-xl border border-white/10 rounded-xl px-4 py-3 flex items-center gap-3 shadow-2xl animate-in slide-in-from-bottom-5">
        <div className="w-5 h-5 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-gray-300">Verificando atualizações...</span>
      </div>
    );
  }

  if (status === 'available' && updateInfo) {
    return (
      <div className="fixed bottom-4 right-4 z-[200] w-96 bg-gray-900/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl animate-in slide-in-from-bottom-5">
        <div className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isDownloading ? 'bg-purple-500/10' : 'bg-purple-500/20'}`}>
                {isDownloading ? (
                  <div className="w-5 h-5 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <ArrowDownToLine className="w-5 h-5 text-purple-400" />
                )}
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">
                  {isDownloading ? 'Baixando atualização...' : 'Atualização disponível'}
                </h3>
                <p className="text-xs text-gray-400">v{updateInfo.version}</p>
              </div>
            </div>
            {!isDownloading && (
              <button
                onClick={handleDismiss}
                className="text-gray-500 hover:text-white transition-colors p-1"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {!isDownloading && updateInfo.releaseNotes && (
            <div className="mb-3 p-2 bg-white/5 rounded-lg max-h-24 overflow-y-auto">
              <p className="text-xs text-gray-300 whitespace-pre-wrap">{updateInfo.releaseNotes.replace(/<[^>]*>/g, '')}</p>
            </div>
          )}

          {isDownloading ? (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-400">
                  {formatBytes(transferred)}{total > 0 ? ` / ${formatBytes(total)}` : ''}
                </span>
                <span className="text-xs text-gray-400">{progress}%</span>
              </div>
              <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-500 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          ) : (
            <button
              onClick={handleDownload}
              className="w-full py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <Download size={16} />
              Baixar atualização
            </button>
          )}
        </div>
      </div>
    );
  }

  if (status === 'downloaded') {
    return (
      <div className="fixed bottom-4 right-4 z-[200] w-96 bg-gray-900/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl animate-in slide-in-from-bottom-5">
        <div className="p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
              <Check className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Atualização baixada</h3>
              <p className="text-xs text-gray-400">
                {updateInfo ? `v${updateInfo.version} pronta para instalar` : 'Pronta para instalar'}
              </p>
            </div>
          </div>
          <button
            onClick={() => window.electronAPI?.updateInstall()}
            className="w-full py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <RefreshCw size={16} />
            Reiniciar agora
          </button>
        </div>
      </div>
    );
  }

  return null;
}

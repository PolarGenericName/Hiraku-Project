/**
 * Configurações — animes, leitor de mangá, fontes, gerais, dados
 * (backup), avançado e sobre. Estrutura em seções como pedido.
 */

import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { Link } from 'wouter';
import {
  BookOpen,
  Check,
  ChevronRight,
  Download,
  FolderOpen,
  Globe,
  HardDrive,
  Info,
  Layers,
  RotateCcw,
  SlidersHorizontal,
  Tv,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  getReaderSettings,
  saveReaderSettings,
  clearMangaHistory,
  clearReadUpdates,
  type ReadingMode,
} from '@/manga/storage';
import {
  getSourceLangPref,
  setSourceLangPref,
  LANG_PREF_OPTIONS,
  resetSourcePrefs,
  type SourceLangPref,
} from '@/manga/sourcePrefs';
import {
  listSources,
  enableSource,
  disableSource,
  isSourceEnabled,
  resetSourceOverrides,
} from '@/manga/sources';
import { useMangaStore } from '@/manga/hooks';
import Toggle from '@/manga/components/Toggle';
import {
  getDiscordPresence,
  setDiscordPresence,
  isAutoplayEnabled,
  setAutoplayEnabled,
  isResumeEnabled,
  setResumeEnabled,
  getPlaybackRate,
  setPlaybackRate,
  isHistoryEnabled,
  setHistoryEnabled,
  isProgressTrackingEnabled,
  setProgressTrackingEnabled,
  isAutoUpdateCheckEnabled,
  setAutoUpdateCheckEnabled,
  isRememberModeEnabled,
  setRememberModeEnabled,
  resetAppPreferences,
} from '@/shared/lib/prefs';
import { useConfirm } from '@/shared/components/ConfirmDialog';
import {
  applyBackup,
  createBackup,
  getBackupDir,
  getLastAutoBackup,
  isAutoBackupEnabled,
  parseBackup,
  selectBackupFolder,
  setAutoBackupEnabled,
} from '@/shared/lib/backup';
import pkg from '../../../package.json';

const MODE_OPTIONS: Array<{ value: ReadingMode; label: string; description: string }> = [
  { value: 'webtoon', label: 'Webtoon', description: 'Rolagem contínua para cima' },
  { value: 'ltr', label: 'Página →', description: 'Uma página por vez, esquerda para direita' },
  { value: 'rtl', label: '← Página', description: 'Uma página por vez, direita para esquerda' },
];

/** Mesmas opções do menu de velocidade do player. */
const RATE_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

type UpdateState = 'idle' | 'checking' | 'ok' | 'available' | 'error';

function DiscordIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.2107.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0567c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0567c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9447 2.4189-2.1568 2.4189z" />
    </svg>
  );
}

/** Linha com label + toggle (padrão das seções). */
function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.03] border border-white/10">
      <span className="text-sm text-gray-300">{label}</span>
      <Toggle checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

function SectionHeader({ icon: Icon, title }: { icon: typeof Tv; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-1">
      <Icon size={18} className="text-[#7c3aed]" />
      <h2 className="text-lg font-semibold text-white">{title}</h2>
    </div>
  );
}

function SubTitle({ children }: { children: ReactNode }) {
  return <h3 className="text-sm font-semibold text-gray-300 mt-5 mb-2">{children}</h3>;
}

function formatWhen(ts: number): string {
  return new Date(ts).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function SettingsGlobal() {
  const [settings, setSettings] = useState(getReaderSettings);
  const [discordPresence, setDiscord] = useState(getDiscordPresence);
  const { confirm, dialog } = useConfirm();

  // Vídeo / monitoramento / comportamento
  const [autoplay, setAutoplay] = useState(isAutoplayEnabled);
  const [resume, setResume] = useState(isResumeEnabled);
  const [rate, setRate] = useState(getPlaybackRate);
  const [history, setHistory] = useState(isHistoryEnabled);
  const [progress, setProgress] = useState(isProgressTrackingEnabled);
  const [autoUpdate, setAutoUpdate] = useState(isAutoUpdateCheckEnabled);
  const [rememberMode, setRememberMode] = useState(isRememberModeEnabled);

  // Backup (movido da tela "Mais")
  const [backupDir, setBackupDir] = useState(getBackupDir);
  const [autoBackup, setAutoBackup] = useState(isAutoBackupEnabled);
  const [lastAutoBackup, setLastAutoBackup] = useState(getLastAutoBackup);
  const fileRef = useRef<HTMLInputElement>(null);

  // Sobre: verificação de atualizações
  const [updateState, setUpdateState] = useState<UpdateState>('idle');
  const [updateVersion, setUpdateVersion] = useState('');

  // Só as fontes de fábrica; as extensões Keiyoushi são gerenciadas na Loja
  const sources = useMangaStore(() => listSources().filter((s) => s.family !== 'keiyoushi'));
  const enabled = useMangaStore(() =>
    Object.fromEntries(listSources().map((s) => [s.id, isSourceEnabled(s.id)]))
  );
  const [langPrefs, setLangPrefs] = useState<Record<string, SourceLangPref>>(() =>
    Object.fromEntries(listSources().map((s) => [s.id, getSourceLangPref(s.id)]))
  );

  // Sem pasta escolhida no Electron: mostra a padrão do Hiraku
  useEffect(() => {
    if (backupDir || !window.electronAPI?.backupDefaultDir) return;
    void window.electronAPI.backupDefaultDir().then((dir) => {
      if (dir) setBackupDir(dir);
    });
  }, [backupDir]);

  // Sobre: acompanha os eventos do updater
  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;
    const subs = [
      api.onUpdateChecking(() => setUpdateState('checking')),
      api.onUpdateNotAvailable(() => setUpdateState('ok')),
      api.onUpdateAvailable((info) => {
        setUpdateState('available');
        setUpdateVersion(info.version);
      }),
      api.onUpdateError(() => setUpdateState('error')),
    ];
    return () => subs.forEach((unsub) => unsub());
  }, []);

  function updateSettings(patch: Partial<typeof settings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveReaderSettings(next);
  }

  function toggleSource(id: string, enable: boolean) {
    if (enable) enableSource(id);
    else disableSource(id);
  }

  function changeLang(id: string, pref: SourceLangPref) {
    setSourceLangPref(id, pref);
    setLangPrefs((prev) => ({ ...prev, [id]: pref }));
  }

  // ── Backup ─────────────────────────────────────────────────────────────────
  async function handleSelectFolder() {
    const dir = await selectBackupFolder();
    if (dir) {
      setBackupDir(dir);
      toast('Pasta de backup atualizada', { duration: 2500 });
    }
  }

  async function handleCreateBackup() {
    const result = await createBackup();
    if (result === 'ok') toast('Backup criado');
    else if (result === 'download') toast('Backup baixado para sua pasta de downloads');
    else toast.error('Falha ao criar o backup');
  }

  async function handleRestoreFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    let payload: ReturnType<typeof parseBackup>;
    try {
      payload = parseBackup(await file.text());
    } catch {
      payload = null;
    }
    if (!payload) {
      toast.error('Arquivo de backup inválido');
      return;
    }
    const ok = await confirm({
      title: 'Restaurar backup?',
      description: `Os dados atuais serão substituídos pelos do backup de ${new Date(
        payload.createdAt
      ).toLocaleString('pt-BR')}. O app vai recarregar.`,
      confirmLabel: 'Restaurar',
      danger: true,
    });
    if (!ok) return;
    applyBackup(payload);
    toast.success('Backup restaurado. Recarregando...');
    setTimeout(() => window.location.reload(), 900);
  }

  function handleToggleAutoBackup(v: boolean) {
    setAutoBackupEnabled(v);
    setAutoBackup(v);
    if (v) setLastAutoBackup(getLastAutoBackup());
    toast(v ? 'Backup automático ativado' : 'Backup automático desativado', { duration: 2500 });
  }

  // ── Sobre ──────────────────────────────────────────────────────────────────
  function handleCheckUpdates() {
    const api = window.electronAPI;
    if (!api) {
      toast('Atualizações estão disponíveis no aplicativo desktop');
      return;
    }
    setUpdateState('checking');
    void api.updateCheck().catch(() => setUpdateState('error'));
  }

  const updateLabel: Record<UpdateState, string> = {
    idle: 'Procurar por atualizações',
    checking: 'Verificando...',
    ok: 'Você está na última versão',
    available: `Atualização disponível: v${updateVersion}`,
    error: 'Falha ao verificar atualizações',
  };

  // ── Avançado ───────────────────────────────────────────────────────────────
  async function handleResetPreferences() {
    const ok = await confirm({
      title: 'Redefinir preferências?',
      description:
        'Leitor, vídeo, presença, fontes e comportamento voltam ao padrão de fábrica. Conta, biblioteca, histórico e progresso não são afetados.',
      confirmLabel: 'Redefinir',
      danger: true,
    });
    if (!ok) return;
    resetAppPreferences();
    saveReaderSettings({ mode: 'webtoon', showProgressBar: true, showPageControls: false });
    resetSourcePrefs();
    resetSourceOverrides();
    toast.success('Preferências redefinidas. Recarregando...');
    setTimeout(() => window.location.reload(), 900);
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold text-white mb-8">Configurações</h1>

      {/* ── Animes ─────────────────────────────────────────────── */}
      <section className="mb-10">
        <SectionHeader icon={Tv} title="Animes" />

        <SubTitle>Leitor</SubTitle>
        <div className="space-y-2">
          <ToggleRow
            label="Autoplay do próximo episódio"
            checked={autoplay}
            onChange={(v) => {
              setAutoplay(v);
              setAutoplayEnabled(v);
            }}
          />
          <ToggleRow
            label="Retomar de onde parou"
            checked={resume}
            onChange={(v) => {
              setResume(v);
              setResumeEnabled(v);
            }}
          />
          <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10">
            <p className="text-sm text-gray-300 mb-2.5">Velocidade padrão</p>
            <div className="flex flex-wrap gap-1.5">
              {RATE_OPTIONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    setRate(r);
                    setPlaybackRate(r);
                  }}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                    rate === r
                      ? 'bg-[#7c3aed] text-white'
                      : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {r === 1 ? 'Normal' : `${r}x`}
                </button>
              ))}
            </div>
          </div>
        </div>

        <SubTitle>Monitoramento</SubTitle>
        <div className="space-y-2">
          <ToggleRow
            label="Salvar episódios no histórico"
            checked={history}
            onChange={(v) => {
              setHistory(v);
              setHistoryEnabled(v);
            }}
          />
          <ToggleRow
            label="Salvar posição dos episódios"
            checked={progress}
            onChange={(v) => {
              setProgress(v);
              setProgressTrackingEnabled(v);
            }}
          />
        </div>
      </section>

      {/* ── Leitor de mangás ────────────────────────────────────── */}
      <section className="mb-10">
        <SectionHeader icon={BookOpen} title="Leitor de mangás" />

        <div className="space-y-2 mt-4">
          {MODE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => updateSettings({ mode: option.value })}
              className={`w-full flex items-center gap-3 p-4 rounded-xl border transition-colors text-left cursor-pointer ${
                settings.mode === option.value
                  ? 'border-[#7c3aed]/60 bg-[#7c3aed]/10'
                  : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                  settings.mode === option.value ? 'border-[#7c3aed]' : 'border-gray-600'
                }`}
              >
                {settings.mode === option.value && (
                  <span className="w-2.5 h-2.5 rounded-full bg-[#7c3aed]" />
                )}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-white">{option.label}</span>
                <span className="block text-xs text-gray-500 mt-0.5">{option.description}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="space-y-2 mt-4">
          <ToggleRow
            label="Mostrar barra de progresso"
            checked={settings.showProgressBar}
            onChange={(v) => updateSettings({ showProgressBar: v })}
          />
          <ToggleRow
            label="Controles de página"
            checked={settings.showPageControls}
            onChange={(v) => updateSettings({ showPageControls: v })}
          />
        </div>
      </section>

      {/* ── Fontes de mangás ────────────────────────────────────── */}
      <section className="mb-10">
        <div className="flex items-center gap-2 mb-1">
          <Layers size={18} className="text-[#7c3aed]" />
          <h2 className="text-lg font-semibold text-white">Fontes de mangás</h2>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Fontes habilitadas aparecem em Navegar e na migração. Onde houver, o idioma
          escolhido filtra os capítulos daquela fonte. Extensões Keiyoushi (PT-BR) são
          gerenciadas na <strong className="text-gray-400 font-medium">Loja de fontes</strong>.
        </p>

        <div className="space-y-2">
          {sources.map((source) => (
            <div
              key={source.id}
              className="flex items-center gap-3 p-4 rounded-xl bg-white/[0.03] border border-white/10"
            >
              <div className="w-9 h-9 rounded-lg bg-[#7c3aed]/15 flex items-center justify-center shrink-0">
                <Globe size={17} className="text-[#7c3aed]" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white">{source.name}</p>
                <p className="text-xs text-gray-500 truncate">
                  {source.baseUrl} · {source.lang}
                </p>

                {source.supportsLangPref && (
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    <span className="text-[11px] text-gray-500 mr-0.5">Capítulos:</span>
                    {LANG_PREF_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => changeLang(source.id, option.value)}
                        title={option.description}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors cursor-pointer ${
                          langPrefs[source.id] === option.value
                            ? 'bg-[#7c3aed] text-white'
                            : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Toggle
                checked={!!enabled[source.id]}
                onChange={(v) => toggleSource(source.id, v)}
                label={`Habilitar ${source.name}`}
              />
            </div>
          ))}
        </div>
      </section>

      {/* ── Geral ───────────────────────────────────────────────── */}
      <section className="mb-10">
        <SectionHeader icon={SlidersHorizontal} title="Geral" />

        <div className="space-y-2 mt-4">
          <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.03] border border-white/10">
            <div className="flex items-center gap-3 min-w-0">
              <DiscordIcon size={17} />
              <div className="min-w-0">
                <p className="text-sm text-gray-300">Presença no Discord</p>
                <p className="text-xs text-gray-500">
                  Mostra no seu perfil o que você está assistindo ou lendo
                </p>
              </div>
            </div>
            <Toggle
              checked={discordPresence}
              onChange={(v) => {
                setDiscord(v);
                setDiscordPresence(v);
              }}
              label="Presença no Discord"
            />
          </div>
          <ToggleRow
            label="Verificar atualizações ao iniciar"
            checked={autoUpdate}
            onChange={(v) => {
              setAutoUpdate(v);
              setAutoUpdateCheckEnabled(v);
            }}
          />
          <ToggleRow
            label="Lembrar último modo (Animes/Mangás)"
            checked={rememberMode}
            onChange={(v) => {
              setRememberMode(v);
              setRememberModeEnabled(v);
            }}
          />
        </div>
      </section>

      {/* ── Dados e armazenamento ───────────────────────────────── */}
      <section className="mb-10">
        <SectionHeader icon={HardDrive} title="Dados e armazenamento" />

        {/* Pasta de backup */}
        <div className="flex items-center gap-3 p-4 rounded-xl bg-white/[0.03] border border-white/10 mt-4 mb-3">
          <FolderOpen size={17} className="text-[#7c3aed] shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-gray-300">Pasta de backup</p>
            <p className="text-xs text-gray-500 truncate">{backupDir ?? 'Padrão'}</p>
          </div>
          <button
            type="button"
            onClick={handleSelectFolder}
            className="shrink-0 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 text-sm transition-colors cursor-pointer"
          >
            Selecionar
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <button
            type="button"
            onClick={handleCreateBackup}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#7c3aed] hover:bg-[#6d28d9] text-white text-sm font-medium transition-colors cursor-pointer"
          >
            <Download size={15} />
            Criar backup
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 text-sm transition-colors cursor-pointer"
          >
            <Upload size={15} />
            Restaurar backup
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleRestoreFile}
          />
        </div>

        <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 mb-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-gray-300">Backup automático</span>
            <Toggle
              checked={autoBackup}
              onChange={handleToggleAutoBackup}
              label="Backup automático"
            />
          </div>
          <p className="text-xs text-gray-500 mt-2">
            {lastAutoBackup
              ? `Último backup automático: ${formatWhen(lastAutoBackup)}`
              : 'Nenhum backup automático ainda'}
          </p>
        </div>

        <div className="space-y-2">
          <button
            type="button"
            onClick={async () => {
              const ok = await confirm({
                title: 'Limpar todo o histórico de leitura?',
                description:
                  'Os capítulos e a posição de leitura salvos serão apagados. Esta ação não pode ser desfeita.',
                confirmLabel: 'Limpar',
                danger: true,
              });
              if (ok) clearMangaHistory();
            }}
            className="w-full flex items-center justify-between p-4 rounded-xl bg-white/[0.03] border border-white/10 hover:bg-white/[0.06] transition-colors text-left cursor-pointer"
          >
            <span className="text-sm text-gray-300">Limpar histórico de leitura</span>
            <X size={16} className="text-gray-500" />
          </button>

          <button
            type="button"
            onClick={async () => {
              const ok = await confirm({
                title: 'Remover as atualizações já lidas?',
                description: 'Só as atualizações marcadas como vistas serão removidas.',
                confirmLabel: 'Remover',
                danger: true,
              });
              if (ok) clearReadUpdates();
            }}
            className="w-full flex items-center justify-between p-4 rounded-xl bg-white/[0.03] border border-white/10 hover:bg-white/[0.06] transition-colors text-left cursor-pointer"
          >
            <span className="text-sm text-gray-300">Limpar atualizações lidas</span>
            <Check size={16} className="text-gray-500" />
          </button>
        </div>
      </section>

      {/* ── Avançado ────────────────────────────────────────────── */}
      <section className="mb-10">
        <SectionHeader icon={RotateCcw} title="Avançado" />

        <div className="space-y-2 mt-4">
          <button
            type="button"
            onClick={handleResetPreferences}
            className="w-full flex items-center justify-between p-4 rounded-xl bg-white/[0.03] border border-white/10 hover:bg-red-500/10 hover:border-red-500/30 transition-colors text-left cursor-pointer"
          >
            <div>
              <p className="text-sm text-gray-300">Redefinir preferências</p>
              <p className="text-xs text-gray-500">
                Volta leitor, vídeo, fontes e presença ao padrão. Dados intactos.
              </p>
            </div>
            <RotateCcw size={16} className="text-gray-500 shrink-0" />
          </button>
        </div>
      </section>

      {/* ── Sobre ───────────────────────────────────────────────── */}
      <section>
        <SectionHeader icon={Info} title="Sobre" />

        <div className="space-y-2 mt-4">
          <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.03] border border-white/10">
            <span className="text-sm text-gray-300">Versão do Hiraku</span>
            <span className="text-sm text-gray-500">v{pkg.version}</span>
          </div>

          <button
            type="button"
            onClick={handleCheckUpdates}
            disabled={updateState === 'checking'}
            className="w-full flex items-center justify-between p-4 rounded-xl bg-white/[0.03] border border-white/10 hover:bg-white/[0.06] transition-colors text-left cursor-pointer disabled:opacity-60 disabled:cursor-wait"
          >
            <span
              className={`text-sm ${
                updateState === 'ok'
                  ? 'text-green-400'
                  : updateState === 'available'
                    ? 'text-[#7c3aed]'
                    : updateState === 'error'
                      ? 'text-red-400'
                      : 'text-gray-300'
              }`}
            >
              {updateLabel[updateState]}
            </span>
            <Download
              size={16}
              className={`shrink-0 ${updateState === 'checking' ? 'animate-pulse' : 'text-gray-500'}`}
            />
          </button>

          <Link
            href="/settings/licenses"
            className="flex items-center justify-between p-4 rounded-xl bg-white/[0.03] border border-white/10 hover:bg-white/[0.06] transition-colors"
          >
            <span className="text-sm text-gray-300">Licenças</span>
            <ChevronRight size={16} className="text-gray-500" />
          </Link>

          <Link
            href="/settings/privacy"
            className="flex items-center justify-between p-4 rounded-xl bg-white/[0.03] border border-white/10 hover:bg-white/[0.06] transition-colors"
          >
            <span className="text-sm text-gray-300">Política de privacidade</span>
            <ChevronRight size={16} className="text-gray-500" />
          </Link>
        </div>
      </section>

      <p className="mt-10 text-xs text-gray-600 text-center">Hiraku</p>

      {dialog}
    </div>
  );
}

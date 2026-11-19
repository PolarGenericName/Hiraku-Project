/**
 * Painel de Monitoramento (trackers) — vincula a conta do serviço, linka
 * o mangá pelo título e envia status + progresso manualmente
 * (estilo Mihon TrackersScreen; fase 1: MangaUpdates + Kitsu).
 */
import { useState } from 'react';
import { Link2, Loader2, Plug, Search, Send, Unlink, X } from 'lucide-react';
import {
  TRACKERS,
  TRACKER_STATUS_LABELS,
  getTracker,
  getTrackerAccount,
  getTrackerLink,
  isTrackerEnabled,
  removeTrackerAccount,
  removeTrackerLink,
  setTrackerAccount,
  setTrackerEnabled,
  setTrackerLink,
  type TrackerId,
  type TrackerSearchResult,
  type TrackerStatus,
} from '../trackers';

interface TrackerPanelProps {
  open: boolean;
  onClose: () => void;
  sourceId: string;
  mangaId: string;
  title: string;
  /** Progresso default do envio (último capítulo lido) */
  lastRead: number;
}

type SentState = { ok: boolean; msg: string };

export default function TrackerPanel({
  open,
  onClose,
  sourceId,
  mangaId,
  title,
  lastRead,
}: TrackerPanelProps) {
  const [, bump] = useState(0);
  const reload = () => bump((v) => v + 1);

  const [connectFor, setConnectFor] = useState<TrackerId | null>(null);
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Record<string, TrackerSearchResult[] | 'loading'>>({});
  const [form, setForm] = useState<Record<string, { status: TrackerStatus; progress: string }>>({});
  const [sent, setSent] = useState<Record<string, SentState>>({});

  if (!open) return null;

  function formFor(id: TrackerId) {
    return (
      form[id] ?? {
        status: (lastRead > 0 ? 'reading' : 'planned') as TrackerStatus,
        progress: String(Math.max(0, Math.round(lastRead))),
      }
    );
  }

  function setFormField(id: TrackerId, patch: Partial<{ status: TrackerStatus; progress: string }>) {
    setForm((prev) => ({ ...prev, [id]: { ...formFor(id), ...patch } }));
  }

  async function handleConnect(id: TrackerId) {
    const tracker = getTracker(id);
    if (!tracker || !loginUser.trim() || !loginPass) return;
    setBusy(`connect:${id}`);
    setError(null);
    try {
      const account = await tracker.connect(loginUser.trim(), loginPass);
      setTrackerAccount(id, account);
      setConnectFor(null);
      setLoginUser('');
      setLoginPass('');
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao conectar.');
    } finally {
      setBusy(null);
    }
  }

  async function handleSearch(id: TrackerId) {
    const tracker = getTracker(id);
    if (!tracker) return;
    setBusy(`search:${id}`);
    setError(null);
    setCandidates((prev) => ({ ...prev, [id]: 'loading' }));
    try {
      const results = await tracker.search(title);
      setCandidates((prev) => ({ ...prev, [id]: results }));
      if (!results.length) setError('Nenhum resultado para este título.');
    } catch (e) {
      setCandidates((prev) => ({ ...prev, [id]: [] }));
      setError(e instanceof Error ? e.message : 'Falha na busca.');
    } finally {
      setBusy(null);
    }
  }

  async function handleSend(id: TrackerId) {
    const tracker = getTracker(id);
    const account = getTrackerAccount(id);
    const remoteId = getTrackerLink(sourceId, mangaId, id);
    if (!tracker || !account || !remoteId) return;
    const current = formFor(id);
    const progress = Number(current.progress.replace(',', '.'));
    setBusy(`send:${id}`);
    setError(null);
    setSent((prev) => ({ ...prev, [id]: { ok: true, msg: 'Enviando...' } }));
    try {
      await tracker.update(account, remoteId, {
        status: current.status,
        progress: Number.isFinite(progress) ? Math.max(0, Math.round(progress)) : 0,
      });
      setSent((prev) => ({ ...prev, [id]: { ok: true, msg: 'Progresso enviado ✓' } }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Falha ao enviar.';
      setSent((prev) => ({ ...prev, [id]: { ok: false, msg: msg } }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center px-4">
      {/* Fundo */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Card */}
      <div className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto reader-scroll rounded-2xl bg-[#0d0d12] border border-white/10 shadow-2xl">
        {/* Cabeçalho */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 py-4 bg-[#0d0d12] border-b border-white/10">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-white">Monitoramento</h2>
            <p className="text-xs text-gray-500 truncate">{title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Fechar"
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {error && (
            <p className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-300">
              {error}
            </p>
          )}

          {TRACKERS.map((tracker) => {
            const id = tracker.id;
            const enabled = isTrackerEnabled(id);
            const account = getTrackerAccount(id);
            const remoteId = getTrackerLink(sourceId, mangaId, id);
            const candidatesFor = candidates[id];
            const current = formFor(id);
            const sentState = sent[id];

            return (
              <div
                key={id}
                className={`rounded-xl border p-4 ${
                  enabled ? 'bg-white/[0.03] border-white/10' : 'bg-white/[0.01] border-white/5 opacity-60'
                }`}
              >
                {/* Linha 1: nome + toggle */}
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">{tracker.name}</p>
                    <p className="text-[11px] text-gray-500 truncate">
                      {account
                        ? `Conectado${account.username ? ` · ${account.username}` : ''}`
                        : enabled
                          ? tracker.connectHint
                          : 'Desabilitado'}
                    </p>
                  </div>
                  <label className="flex items-center gap-2 shrink-0 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) => {
                        setTrackerEnabled(id, e.target.checked);
                        reload();
                      }}
                      className="accent-[#7c3aed] w-4 h-4"
                    />
                  </label>
                </div>

                {enabled && (
                  <div className="mt-3 space-y-2">
                    {/* ── Conexão ── */}
                    {!account && connectFor !== id && (
                      <button
                        type="button"
                        onClick={() => {
                          setConnectFor(id);
                          setError(null);
                        }}
                        className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#7c3aed] hover:bg-[#6d28d9] text-white text-xs font-medium transition-colors cursor-pointer"
                      >
                        <Plug size={14} />
                        Conectar conta
                      </button>
                    )}

                    {!account && connectFor === id && (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={loginUser}
                          onChange={(e) => setLoginUser(e.target.value)}
                          placeholder="Usuário ou e-mail"
                          className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#7c3aed]/60"
                        />
                        <input
                          type="password"
                          value={loginPass}
                          onChange={(e) => setLoginPass(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void handleConnect(id);
                          }}
                          placeholder="Senha"
                          className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#7c3aed]/60"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => void handleConnect(id)}
                            disabled={busy === `connect:${id}` || !loginUser.trim() || !loginPass}
                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#7c3aed] hover:bg-[#6d28d9] disabled:opacity-50 text-white text-xs font-medium transition-colors cursor-pointer"
                          >
                            {busy === `connect:${id}` && <Loader2 size={13} className="animate-spin" />}
                            Entrar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setConnectFor(null);
                              setLoginUser('');
                              setLoginPass('');
                            }}
                            className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 text-xs transition-colors cursor-pointer"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}

                    {account && (
                      <>
                        {/* ── Vínculo do mangá ── */}
                        {!remoteId && !candidatesFor && (
                          <button
                            type="button"
                            onClick={() => void handleSearch(id)}
                            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-200 text-xs font-medium transition-colors cursor-pointer"
                          >
                            <Search size={14} />
                            Vincular este mangá
                          </button>
                        )}

                        {candidatesFor === 'loading' && (
                          <p className="flex items-center gap-2 text-xs text-gray-500">
                            <Loader2 size={13} className="animate-spin" />
                            Buscando "{title}"...
                          </p>
                        )}

                        {Array.isArray(candidatesFor) && !remoteId && (
                          <div className="space-y-1 max-h-44 overflow-y-auto reader-scroll">
                            {candidatesFor.length === 0 && (
                              <p className="text-xs text-gray-500">Nenhum resultado.</p>
                            )}
                            {candidatesFor.map((r) => (
                              <button
                                key={r.remoteId}
                                type="button"
                                onClick={() => {
                                  setTrackerLink(sourceId, mangaId, id, r.remoteId);
                                  setCandidates((prev) => {
                                    const next = { ...prev };
                                    delete next[id];
                                    return next;
                                  });
                                  reload();
                                }}
                                className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-[#7c3aed]/20 text-left transition-colors cursor-pointer"
                              >
                                <span className="text-xs text-gray-200 truncate">{r.title}</span>
                                <Link2 size={13} className="text-gray-500 shrink-0" />
                              </button>
                            ))}
                            <button
                              type="button"
                              onClick={() => {
                                setCandidates((prev) => {
                                  const next = { ...prev };
                                  delete next[id];
                                  return next;
                                });
                              }}
                              className="text-[11px] text-gray-500 hover:text-gray-300"
                            >
                              Cancelar busca
                            </button>
                          </div>
                        )}

                        {remoteId && (
                          <div className="space-y-2">
                            {/* ── Envio: status + progresso ── */}
                            <div className="flex gap-2">
                              <select
                                value={current.status}
                                onChange={(e) =>
                                  setFormField(id, { status: e.target.value as TrackerStatus })
                                }
                                className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white focus:outline-none focus:border-[#7c3aed]/60 cursor-pointer"
                              >
                                {TRACKER_STATUS_LABELS.map((s) => (
                                  <option key={s.value} value={s.value} className="bg-[#111]">
                                    {s.label}
                                  </option>
                                ))}
                              </select>
                              <input
                                type="number"
                                min={0}
                                value={current.progress}
                                onChange={(e) => setFormField(id, { progress: e.target.value })}
                                title="Capítulo"
                                className="w-20 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white tabular-nums focus:outline-none focus:border-[#7c3aed]/60"
                              />
                              <button
                                type="button"
                                onClick={() => void handleSend(id)}
                                disabled={busy === `send:${id}`}
                                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#7c3aed] hover:bg-[#6d28d9] disabled:opacity-50 text-white text-xs font-medium transition-colors cursor-pointer shrink-0"
                              >
                                {busy === `send:${id}` ? (
                                  <Loader2 size={13} className="animate-spin" />
                                ) : (
                                  <Send size={13} />
                                )}
                                Enviar
                              </button>
                            </div>

                            {sentState && (
                              <p
                                className={`text-[11px] ${
                                  sentState.ok ? 'text-green-400' : 'text-red-400'
                                }`}
                              >
                                {sentState.msg}
                              </p>
                            )}

                            {/* ── Desvincular / desconectar ── */}
                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                onClick={() => {
                                  removeTrackerLink(sourceId, mangaId, id);
                                  reload();
                                }}
                                className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-300 transition-colors cursor-pointer"
                              >
                                <Unlink size={12} />
                                Desvincular mangá
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  removeTrackerAccount(id);
                                  reload();
                                }}
                                className="text-[11px] text-gray-500 hover:text-red-400 transition-colors cursor-pointer"
                              >
                                Desconectar conta
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

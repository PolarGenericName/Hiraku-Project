/**
 * Diálogo de confirmação no design do projeto — substitui os
 * window.confirm nativos (caixas fora do tema).
 *
 *   const { confirm, dialog } = useConfirm();
 *   if (await confirm({ title: '...' })) acao();
 *   return <>{dialog}...</>;
 */
import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';

interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Botão de confirmação em vermelho (ações destrutivas) */
  danger?: boolean;
}

interface ConfirmState extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

function ConfirmView({
  state,
  onConfirm,
  onCancel,
}: {
  state: ConfirmState;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center px-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
        onClick={onCancel}
      />
      <div className="relative w-full max-w-sm rounded-2xl bg-[#0d0d12] border border-white/10 shadow-[0_24px_60px_rgba(0,0,0,0.6)] p-5 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-start gap-3">
          {state.danger && <AlertTriangle size={18} className="text-red-400 mt-0.5 shrink-0" />}
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-white">{state.title}</h3>
            {state.description && (
              <p className="text-sm text-gray-400 mt-1.5 leading-relaxed whitespace-pre-line">
                {state.description}
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 text-sm transition-colors cursor-pointer"
          >
            {state.cancelLabel ?? 'Cancelar'}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            autoFocus
            className={`px-4 py-2 rounded-xl text-sm font-medium text-white transition-colors cursor-pointer ${
              state.danger
                ? 'bg-red-600 hover:bg-red-500'
                : 'bg-[#7c3aed] hover:bg-[#6d28d9]'
            }`}
          >
            {state.confirmLabel ?? 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Hook: confirmações Promise-based no tema do app. */
export function useConfirm() {
  const [state, setState] = useState<ConfirmState | null>(null);

  function confirm(options: ConfirmOptions): Promise<boolean> {
    return new Promise((resolve) => {
      setState({ ...options, resolve });
    });
  }

  function finish(value: boolean) {
    state?.resolve(value);
    setState(null);
  }

  const dialog = state ? (
    <ConfirmView state={state} onConfirm={() => finish(true)} onCancel={() => finish(false)} />
  ) : null;

  return { confirm, dialog };
}

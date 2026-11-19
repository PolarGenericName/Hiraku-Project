/**
 * Switch reutilizável das telas de mangás — espelha o SwitchPreference
 * do Mihon (Configurações e Loja de fontes).
 */

interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}

export default function Toggle({ checked, onChange, label }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative w-12 h-7 rounded-full transition-colors cursor-pointer shrink-0 ${
        checked ? 'bg-[#7c3aed]' : 'bg-white/15'
      }`}
    >
      <span
        className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-transform ${
          checked ? 'left-6' : 'left-1'
        }`}
      />
    </button>
  );
}

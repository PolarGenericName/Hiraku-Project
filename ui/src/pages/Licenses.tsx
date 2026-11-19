/**
 * Licenças — dependências do Hiraku e suas licenças.
 * Dados gerados de `pnpm licenses list` (ui/src/data/licenses.ts).
 */

import { ArrowLeft, Scale } from 'lucide-react';
import { Link } from 'wouter';
import pkg from '../../../package.json';
import { RUNTIME_LICENSES, DEV_LICENSES } from '@/data/licenses';

function LicenseGroupList({ groups }: { groups: typeof RUNTIME_LICENSES }) {
  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <div key={group.license} className="p-4 rounded-xl bg-white/[0.03] border border-white/10">
          <p className="text-sm font-semibold text-[#7c3aed] mb-1.5">{group.license}</p>
          <p className="text-xs text-gray-400 leading-relaxed break-words">
            {group.packages.join(' · ')}
          </p>
        </div>
      ))}
    </div>
  );
}

export default function Licenses() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <Link
        href="/settings"
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors mb-5"
      >
        <ArrowLeft size={16} />
        Configurações
      </Link>

      <h1 className="text-2xl font-bold text-white mb-6">Licenças</h1>

      {/* O projeto */}
      <section className="mb-8">
        <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10">
          <div className="flex items-center gap-2 mb-1.5">
            <Scale size={15} className="text-[#7c3aed]" />
            <p className="text-sm font-semibold text-white">Hiraku v{pkg.version}</p>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">
            Licenciado sob <span className="text-gray-300">GNU GPL-3.0</span>. O código-fonte
            está disponível no repositório do projeto.
          </p>
        </div>
      </section>

      {/* Dependências em uso */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-1">Dependências em uso</h2>
        <p className="text-xs text-gray-500 mb-4">
          Bibliotecas incluídas no app distribuído.
        </p>
        <LicenseGroupList groups={RUNTIME_LICENSES} />
      </section>

      {/* Ferramentas de desenvolvimento */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-1">Ferramentas de desenvolvimento</h2>
        <p className="text-xs text-gray-500 mb-4">
          Pacotes usados apenas na construção do app, não distribuídos.
        </p>
        <LicenseGroupList groups={DEV_LICENSES} />
      </section>

      <p className="mt-10 text-xs text-gray-600 text-center">Hiraku</p>
    </div>
  );
}

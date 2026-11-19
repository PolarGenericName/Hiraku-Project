/**
 * Política de privacidade — o que o Hiraku guarda e para onde vai.
 * Texto curto e direto, alinhado com o que o app faz de verdade.
 */

import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { Link } from 'wouter';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="text-base font-semibold text-white mb-2">{title}</h2>
      <div className="text-sm text-gray-400 leading-relaxed space-y-2">{children}</div>
    </section>
  );
}

export default function Privacy() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <Link
        href="/settings"
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors mb-5"
      >
        <ArrowLeft size={16} />
        Configurações
      </Link>

      <div className="flex items-center gap-2 mb-6">
        <ShieldCheck size={22} className="text-[#7c3aed]" />
        <h1 className="text-2xl font-bold text-white">Política de privacidade</h1>
      </div>

      <Section title="Seus dados ficam no seu dispositivo">
        <p>
          Todo o conteúdo do Hiraku (conta, biblioteca, histórico de leitura, progresso de
          animes, categorias, estatísticas e preferências) é armazenado localmente no seu
          dispositivo, no armazenamento do aplicativo. Nada disso é enviado para servidores
          nossos — o projeto não tem servidor de dados.
        </p>
      </Section>

      <Section title="O que é enviado para serviços de terceiros">
        <p>O app se comunica com terceiros apenas para funcionar:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <span className="text-gray-300">Catálogo de animes:</span> consultas ao AniList
            para buscar capas, títulos e informações.
          </li>
          <li>
            <span className="text-gray-300">Fontes de mangá e streaming:</span> requisições
            para os sites das fontes habilitadas (Keiyoushi, MangaDex, provedores de vídeo)
            para carregar capítulos e episódios.
          </li>
          <li>
            <span className="text-gray-300">Discord:</span> quando a presença está ligada, o
            app informa ao seu próprio Discord o que você está assistindo ou lendo. Essa
            conexão é local, entre o app e o Discord instalado.
          </li>
          <li>
            <span className="text-gray-300">Monitoramento (trackers):</span> ao vincular sua
            conta em MangaUpdates ou Kitsu, o progresso de leitura é enviado para o serviço
            que você escolheu. Só acontece se você usar o recurso.
          </li>
        </ul>
      </Section>

      <Section title="Backup">
        <p>
          Os backups são gravados em uma pasta escolhida por você (por padrão,
          Documentos/Hiraku/Backups) e também ficam apenas no seu dispositivo. O backup
          automático roda localmente, sem envio para a nuvem.
        </p>
      </Section>

      <Section title="Sem rastreamento">
        <p>
          O Hiraku não usa analytics, cookies de rastreamento ou pixels de publicidade.
          Não vendemos nem compartilhamos dados — porque, na prática, eles não saem do seu
          dispositivo.
        </p>
      </Section>

      <Section title="Alterações">
        <p>
          Esta política pode mudar em versões futuras do app. A versão vigente é sempre a
          incluída no aplicativo.
        </p>
      </Section>

      <p className="mt-10 text-xs text-gray-600 text-center">Hiraku</p>
    </div>
  );
}

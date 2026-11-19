/**
 * Agrupamento de listas por dia (Atualizações e Histórico),
 * no estilo do Mihon: "Hoje", "Ontem", "dd/mm/aaaa".
 */

export function dayLabel(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);

  if (diffDays <= 0) return 'Hoje';
  if (diffDays === 1) return 'Ontem';
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function timeLabel(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Agrupa por dayLabel preservando ordem decrescente por timestamp */
export function groupByDay<T>(items: T[], getTimestamp: (item: T) => number): Array<{ label: string; items: T[] }> {
  const sorted = [...items].sort((a, b) => getTimestamp(b) - getTimestamp(a));
  const groups: Array<{ label: string; items: T[] }> = [];

  for (const item of sorted) {
    const label = dayLabel(getTimestamp(item));
    const last = groups[groups.length - 1];
    if (last && last.label === label) {
      last.items.push(item);
    } else {
      groups.push({ label, items: [item] });
    }
  }

  return groups;
}

import type { ToolPageFaqEntry } from '../../pages/toolPageConfigs';

interface QuickSetupFaqProps {
  entries: ToolPageFaqEntry[];
}

export function QuickSetupFaq({ entries }: QuickSetupFaqProps) {
  return (
    <div className="space-y-4">
      {entries.map((entry) => (
        <div
          key={entry.question}
          className="rounded-2xl border p-4"
          style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}
        >
          <h3 className="text-base font-semibold">{entry.question}</h3>
          <p className="mt-2 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
            {entry.answer}
          </p>
        </div>
      ))}
    </div>
  );
}

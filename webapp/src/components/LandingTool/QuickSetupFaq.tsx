import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import type { ToolPageFaqEntry } from '../../pages/toolPageConfigs';

interface QuickSetupFaqProps {
  entries: ToolPageFaqEntry[];
}

export function QuickSetupFaq({ entries }: QuickSetupFaqProps) {
  const [openEntryIndexes, setOpenEntryIndexes] = useState<Set<number>>(() => new Set());

  const toggleEntry = (index: number) => {
    setOpenEntryIndexes((current) => {
      const next = new Set(current);

      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }

      return next;
    });
  };

  return (
    <div>
      {entries.map((entry, index) => {
        const isOpen = openEntryIndexes.has(index);
        const answerId = `landing-faq-answer-${index}`;

        return (
          <div
            key={entry.question}
            className={index === 0 ? '' : 'border-t'}
            style={{ borderColor: 'var(--border-secondary)' }}
          >
            <h3>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-4 py-4 text-left text-base font-semibold transition-colors hover:text-[var(--accent-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)]"
                aria-expanded={isOpen}
                aria-controls={answerId}
                onClick={() => toggleEntry(index)}
              >
                <span>{entry.question}</span>
                <ChevronDown
                  className={`h-5 w-5 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
              </button>
            </h3>
            <div
              id={answerId}
              className="grid overflow-hidden transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none"
              style={{
                gridTemplateRows: isOpen ? '1fr' : '0fr',
                opacity: isOpen ? 1 : 0,
              }}
              aria-hidden={!isOpen}
            >
              <div className="min-h-0">
                <p className="pb-4 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
                  {entry.answer}
                  {entry.link ? (
                    <>
                      {' '}
                      <a
                        href={entry.link.href}
                        target="_blank"
                        rel="noreferrer"
                        tabIndex={isOpen ? undefined : -1}
                        className="font-semibold underline underline-offset-4 hover:no-underline"
                      >
                        {entry.link.label}
                      </a>
                    </>
                  ) : null}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

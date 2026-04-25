import { X } from 'lucide-react';
import type { ResultsPairMeetingCell } from '../../services/results/buildResultsModel';
import { getResultsPairMeetingCellTone } from '../../services/results/buildResultsModel';
import { ResultsPairMeetingDetailContent } from './ResultsPairMeetingDetailContent';

interface ResultsPairMeetingDetailModalProps {
  cell: ResultsPairMeetingCell;
  sessionCount: number;
  maxCount: number;
  onClose: () => void;
}

export function ResultsPairMeetingDetailModal({
  cell,
  sessionCount,
  maxCount,
  onClose,
}: ResultsPairMeetingDetailModalProps) {
  const tone = getResultsPairMeetingCellTone(cell, maxCount, sessionCount);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4" role="dialog" aria-modal="true" aria-labelledby="pair-meeting-detail-title">
      <div
        className="w-full max-w-md rounded-xl border p-4 shadow-2xl"
        style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[0.65rem] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-tertiary)' }}>
              Pair detail
            </div>
            <h4 id="pair-meeting-detail-title" className="mt-1 text-lg font-semibold">
              {cell.rowDisplayName} + {cell.columnDisplayName}
            </h4>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
            style={{ color: 'var(--text-tertiary)' }}
            aria-label="Close pair detail"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4">
          <ResultsPairMeetingDetailContent cell={cell} tone={tone} variant="modal" />
        </div>
      </div>
    </div>
  );
}

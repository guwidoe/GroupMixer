import React from 'react';
import { Copy, Download, X } from 'lucide-react';
import { Button } from '../../../../ui';

interface CsvPreviewDialogProps {
  csvText: string;
  rowCount: number;
  onClose: () => void;
}

export function CsvPreviewDialog({ csvText, rowCount, onClose }: CsvPreviewDialogProps) {
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleDownload = () => {
    const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'scenario-grid.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleCopy = async () => {
    if (!navigator.clipboard) {
      return;
    }
    await navigator.clipboard.writeText(csvText);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="w-full max-w-4xl rounded-2xl border p-5 shadow-xl" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>CSV preview</h3>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
              Previewing {rowCount} filtered row{rowCount === 1 ? '' : 's'} using the currently visible columns.
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close CSV preview">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <textarea
          readOnly
          value={csvText}
          className="mt-4 min-h-[22rem] w-full rounded-xl border p-3 font-mono text-xs"
          style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
          aria-label="CSV preview content"
        />
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => void handleCopy()} leadingIcon={<Copy className="h-4 w-4" />}>
            Copy CSV
          </Button>
          <Button variant="secondary" onClick={handleDownload} leadingIcon={<Download className="h-4 w-4" />}>
            Download CSV
          </Button>
          <Button variant="primary" onClick={onClose}>Done</Button>
        </div>
      </div>
    </div>
  );
}

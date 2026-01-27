/**
 * BulkUpdatePeopleForm - Modal for bulk updating people via CSV.
 */

import React from 'react';
import { X } from 'lucide-react';
import { parseCsv, rowsToCsv } from '../helpers';

interface BulkUpdatePeopleFormProps {
  bulkUpdateTextMode: 'text' | 'grid';
  setBulkUpdateTextMode: React.Dispatch<React.SetStateAction<'text' | 'grid'>>;
  bulkUpdateCsvInput: string;
  setBulkUpdateCsvInput: React.Dispatch<React.SetStateAction<string>>;
  bulkUpdateHeaders: string[];
  setBulkUpdateHeaders: React.Dispatch<React.SetStateAction<string[]>>;
  bulkUpdateRows: Record<string, string>[];
  setBulkUpdateRows: React.Dispatch<React.SetStateAction<Record<string, string>[]>>;
  onRefreshFromCurrent: () => void;
  onApply: () => void;
  onClose: () => void;
}

const BulkUpdatePeopleForm: React.FC<BulkUpdatePeopleFormProps> = ({
  bulkUpdateTextMode,
  setBulkUpdateTextMode,
  bulkUpdateCsvInput,
  setBulkUpdateCsvInput,
  bulkUpdateHeaders,
  setBulkUpdateHeaders,
  bulkUpdateRows,
  setBulkUpdateRows,
  onRefreshFromCurrent,
  onApply,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50">
      <div className="rounded-lg p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto modal-content">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Bulk Update People</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
          <p>
            Use this to update existing people by <b>id</b>, add new columns (attributes), or add new people (leave id empty or use a new unique id).
            Leave cells blank to keep current values. Use <code>__DELETE__</code> to remove an attribute from a person.
          </p>
        </div>

        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => {
              if (bulkUpdateTextMode === 'grid') {
                setBulkUpdateCsvInput(rowsToCsv(bulkUpdateHeaders, bulkUpdateRows));
              }
              setBulkUpdateTextMode('text');
            }}
            className={`px-3 py-1 rounded text-sm ${bulkUpdateTextMode === 'text' ? 'font-bold' : ''}`}
            style={{ color: 'var(--text-primary)', backgroundColor: bulkUpdateTextMode === 'text' ? 'var(--bg-tertiary)' : 'transparent' }}
          >
            CSV Text
          </button>
          <button
            onClick={() => {
              if (bulkUpdateTextMode === 'text') {
                const { headers, rows } = parseCsv(bulkUpdateCsvInput);
                setBulkUpdateHeaders(headers);
                setBulkUpdateRows(rows);
              }
              setBulkUpdateTextMode('grid');
            }}
            className={`px-3 py-1 rounded text-sm ${bulkUpdateTextMode === 'grid' ? 'font-bold' : ''}`}
            style={{ color: 'var(--text-primary)', backgroundColor: bulkUpdateTextMode === 'grid' ? 'var(--bg-tertiary)' : 'transparent' }}
          >
            Data Grid
          </button>
          <button
            onClick={onRefreshFromCurrent}
            className="ml-auto btn-secondary px-3 py-1 text-sm"
          >
            Refresh from Current
          </button>
        </div>

        {bulkUpdateTextMode === 'text' ? (
          <textarea
            value={bulkUpdateCsvInput}
            onChange={(e) => setBulkUpdateCsvInput(e.target.value)}
            className="w-full h-64 p-2 border rounded"
            placeholder="Edit CSV here. First row contains headers (e.g., id,name,attribute1,attribute2)"
          ></textarea>
        ) : (
          <div className="overflow-x-auto max-h-64 mb-4">
            {bulkUpdateHeaders.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No data parsed yet.</p>
            ) : (
              <table className="min-w-full divide-y" style={{ borderColor: 'var(--border-secondary)' }}>
                <thead style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                  <tr>
                    {bulkUpdateHeaders.map(h => (
                      <th key={h} className="px-2 py-1 text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-secondary)' }}>
                  {bulkUpdateRows.map((row, rowIdx) => (
                    <tr key={rowIdx}>
                      {bulkUpdateHeaders.map(h => (
                        <td key={h} className="px-2 py-1">
                          <input
                            type="text"
                            value={row[h] || ''}
                            onChange={(e) => {
                              const newRows = [...bulkUpdateRows];
                              newRows[rowIdx][h] = e.target.value;
                              setBulkUpdateRows(newRows);
                            }}
                            className="w-full text-sm border rounded p-1"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        <div className="flex gap-2 mt-4">
          {bulkUpdateTextMode === 'text' && (
            <button
              onClick={() => {
                const { headers, rows } = parseCsv(bulkUpdateCsvInput);
                setBulkUpdateHeaders(headers);
                setBulkUpdateRows(rows);
                setBulkUpdateTextMode('grid');
              }}
              className="btn-secondary"
            >
              Preview Grid
            </button>
          )}
          <button
            onClick={onApply}
            className="btn-primary flex-1 px-4 py-2"
          >
            Apply Changes
          </button>
        </div>
      </div>
    </div>
  );
};

export default BulkUpdatePeopleForm;

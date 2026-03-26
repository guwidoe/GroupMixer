/**
 * BulkAddGroupsForm - Modal for bulk adding groups via CSV.
 */

import React from 'react';
import { X } from 'lucide-react';
import { parseCsv, rowsToCsv } from '../helpers';

interface BulkAddGroupsFormProps {
  groupBulkTextMode: 'text' | 'grid';
  setGroupBulkTextMode: React.Dispatch<React.SetStateAction<'text' | 'grid'>>;
  groupBulkCsvInput: string;
  setGroupBulkCsvInput: React.Dispatch<React.SetStateAction<string>>;
  groupBulkHeaders: string[];
  setGroupBulkHeaders: React.Dispatch<React.SetStateAction<string[]>>;
  groupBulkRows: Record<string, string>[];
  setGroupBulkRows: React.Dispatch<React.SetStateAction<Record<string, string>[]>>;
  onSave: () => void;
  onClose: () => void;
}

const BulkAddGroupsForm: React.FC<BulkAddGroupsFormProps> = ({
  groupBulkTextMode,
  setGroupBulkTextMode,
  groupBulkCsvInput,
  setGroupBulkCsvInput,
  groupBulkHeaders,
  setGroupBulkHeaders,
  groupBulkRows,
  setGroupBulkRows,
  onSave,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50">
      <div className="rounded-lg p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto modal-content">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Bulk Add Groups</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Toggle */}
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => {
              if (groupBulkTextMode === 'grid') {
                setGroupBulkCsvInput(rowsToCsv(groupBulkHeaders, groupBulkRows));
              }
              setGroupBulkTextMode('text');
            }}
            className={`px-3 py-1 rounded text-sm ${groupBulkTextMode === 'text' ? 'font-bold' : ''}`}
            style={{ color: 'var(--text-primary)', backgroundColor: groupBulkTextMode === 'text' ? 'var(--bg-tertiary)' : 'transparent' }}
          >
            CSV Text
          </button>
          <button
            onClick={() => {
              if (groupBulkTextMode === 'text') {
                const { headers, rows } = parseCsv(groupBulkCsvInput);
                setGroupBulkHeaders(headers);
                setGroupBulkRows(rows);
              }
              setGroupBulkTextMode('grid');
            }}
            className={`px-3 py-1 rounded text-sm ${groupBulkTextMode === 'grid' ? 'font-bold' : ''}`}
            style={{ color: 'var(--text-primary)', backgroundColor: groupBulkTextMode === 'grid' ? 'var(--bg-tertiary)' : 'transparent' }}
          >
            Data Grid
          </button>
        </div>

        {groupBulkTextMode === 'text' ? (
          <textarea
            value={groupBulkCsvInput}
            onChange={(e) => setGroupBulkCsvInput(e.target.value)}
            className="w-full h-64 p-2 border rounded"
            placeholder="Paste CSV here. First row should contain column headers (e.g., id, size)"
          ></textarea>
        ) : (
          <div className="overflow-x-auto max-h-64 mb-4">
            {groupBulkHeaders.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No data parsed yet.</p>
            ) : (
              <table className="min-w-full divide-y" style={{ borderColor: 'var(--border-secondary)' }}>
                <thead style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                  <tr>
                    {groupBulkHeaders.map(h => (
                      <th key={h} className="px-2 py-1 text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-secondary)' }}>
                  {groupBulkRows.map((row, rowIdx) => (
                    <tr key={rowIdx}>
                      {groupBulkHeaders.map(h => (
                        <td key={h} className="px-2 py-1">
                          <input
                            type="text"
                            value={row[h] || ''}
                            onChange={(e) => {
                              const newRows = [...groupBulkRows];
                              newRows[rowIdx][h] = e.target.value;
                              setGroupBulkRows(newRows);
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
          {groupBulkTextMode === 'text' && (
            <button
              onClick={() => {
                const { headers, rows } = parseCsv(groupBulkCsvInput);
                setGroupBulkHeaders(headers);
                setGroupBulkRows(rows);
                setGroupBulkTextMode('grid');
              }}
              className="btn-secondary"
            >
              Preview Grid
            </button>
          )}
          <button
            onClick={onSave}
            className="btn-primary flex-1 px-4 py-2"
          >
            Add Groups
          </button>
        </div>
      </div>
    </div>
  );
};

export default BulkAddGroupsForm;

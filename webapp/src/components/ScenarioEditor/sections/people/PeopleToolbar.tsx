import React, { useRef, useState } from 'react';
import { BarChart3, ChevronDown, Edit, Hash, Plus, Table, Upload } from 'lucide-react';
import { useOutsideClick } from '../../../../hooks';

interface PeopleToolbarProps {
  peopleCount: number;
  peopleSearch: string;
  onPeopleSearchChange: (value: string) => void;
  viewMode: 'grid' | 'list';
  onViewModeChange: (mode: 'grid' | 'list') => void;
  onTriggerCsvUpload: () => void;
  onTriggerExcelImport: () => void;
  onOpenBulkAddForm: () => void;
  onOpenBulkUpdateForm: () => void;
  onAddPerson: () => void;
}

export function PeopleToolbar({
  peopleCount,
  peopleSearch,
  onPeopleSearchChange,
  viewMode,
  onViewModeChange,
  onTriggerCsvUpload,
  onTriggerExcelImport,
  onOpenBulkAddForm,
  onOpenBulkUpdateForm,
  onAddPerson,
}: PeopleToolbarProps) {
  const bulkDropdownRef = useRef<HTMLDivElement>(null);
  const [bulkDropdownOpen, setBulkDropdownOpen] = useState(false);

  useOutsideClick({
    refs: [bulkDropdownRef],
    onOutsideClick: () => setBulkDropdownOpen(false),
    enabled: bulkDropdownOpen,
  });

  return (
    <div className="border-b px-6 py-4" style={{ borderColor: 'var(--border-primary)' }}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-0">
        <h3 className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>
          People ({peopleCount})
        </h3>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="w-full sm:w-64">
            <input
              type="text"
              className="input w-full"
              placeholder="Search people by name or ID..."
              value={peopleSearch}
              onChange={(e) => onPeopleSearchChange(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onViewModeChange('grid')}
              className="px-3 py-1 rounded text-sm transition-colors"
              style={{
                backgroundColor: viewMode === 'grid' ? 'var(--bg-tertiary)' : 'transparent',
                color: viewMode === 'grid' ? 'var(--color-accent)' : 'var(--text-secondary)',
                border: viewMode === 'grid' ? '1px solid var(--color-accent)' : '1px solid transparent',
              }}
              onMouseEnter={(e) => {
                if (viewMode !== 'grid') {
                  e.currentTarget.style.color = 'var(--text-primary)';
                }
              }}
              onMouseLeave={(e) => {
                if (viewMode !== 'grid') {
                  e.currentTarget.style.color = 'var(--text-secondary)';
                }
              }}
            >
              <Hash className="w-4 h-4 inline mr-1" />
              Grid
            </button>
            <button
              onClick={() => onViewModeChange('list')}
              className="px-3 py-1 rounded text-sm transition-colors"
              style={{
                backgroundColor: viewMode === 'list' ? 'var(--bg-tertiary)' : 'transparent',
                color: viewMode === 'list' ? 'var(--color-accent)' : 'var(--text-secondary)',
                border: viewMode === 'list' ? '1px solid var(--color-accent)' : '1px solid transparent',
              }}
              onMouseEnter={(e) => {
                if (viewMode !== 'list') {
                  e.currentTarget.style.color = 'var(--text-primary)';
                }
              }}
              onMouseLeave={(e) => {
                if (viewMode !== 'list') {
                  e.currentTarget.style.color = 'var(--text-secondary)';
                }
              }}
            >
              <BarChart3 className="w-4 h-4 inline mr-1" />
              List
            </button>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative" ref={bulkDropdownRef}>
              <button onClick={() => setBulkDropdownOpen(!bulkDropdownOpen)} className="btn-secondary flex items-center gap-2">
                <Upload className="w-4 h-4" />
                Bulk Add
                <ChevronDown className="w-3 h-3" />
              </button>
              {bulkDropdownOpen && (
                <div
                  className="absolute right-0 mt-1 w-56 rounded-md shadow-lg z-10 border overflow-hidden"
                  style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
                >
                  <button
                    onClick={() => {
                      setBulkDropdownOpen(false);
                      onTriggerCsvUpload();
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-left transition-colors border-b last:border-b-0"
                    style={{ borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-secondary)')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <Upload className="w-4 h-4" />
                    Upload CSV
                  </button>
                  <button
                    onClick={() => {
                      setBulkDropdownOpen(false);
                      onTriggerExcelImport();
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-left transition-colors border-b last:border-b-0"
                    style={{ borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-secondary)')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <Upload className="w-4 h-4" />
                    Upload Excel
                  </button>
                  <button
                    onClick={() => {
                      setBulkDropdownOpen(false);
                      onOpenBulkAddForm();
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-left transition-colors"
                    style={{ color: 'var(--text-primary)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-secondary)')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <Table className="w-4 h-4" />
                    Open Bulk Form
                  </button>
                </div>
              )}
            </div>
            <button onClick={onAddPerson} className="btn-primary flex items-center gap-2 px-4 py-2">
              <Plus className="w-4 h-4" />
              Add Person
            </button>
            <button onClick={onOpenBulkUpdateForm} className="btn-secondary flex items-center gap-2 px-4 py-2">
              <Edit className="w-4 h-4" />
              Bulk Update
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

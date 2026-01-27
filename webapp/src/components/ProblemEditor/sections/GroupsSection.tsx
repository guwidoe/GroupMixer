import React, { useRef, useState } from 'react';
import { ChevronDown, Edit, Hash, Plus, Table, Trash2, Upload } from 'lucide-react';
import type { Group, Problem } from '../../../types';
import { useOutsideClick } from '../../../hooks';

interface GroupsSectionProps {
  problem: Problem | null;
  onAddGroup: () => void;
  onEditGroup: (group: Group) => void;
  onDeleteGroup: (groupId: string) => void;
  onOpenBulkAddForm: () => void;
  onTriggerCsvUpload: () => void;
}

export function GroupsSection({
  problem,
  onAddGroup,
  onEditGroup,
  onDeleteGroup,
  onOpenBulkAddForm,
  onTriggerCsvUpload,
}: GroupsSectionProps) {
  const bulkDropdownRef = useRef<HTMLDivElement>(null);
  const [bulkDropdownOpen, setBulkDropdownOpen] = useState(false);

  useOutsideClick({
    refs: [bulkDropdownRef],
    onOutsideClick: () => setBulkDropdownOpen(false),
    enabled: bulkDropdownOpen,
  });

  const renderGroupCard = (group: Group) => (
    <div key={group.id} className="rounded-lg border p-4 hover:shadow-md transition-all" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h4 className="font-medium mb-2" style={{ color: 'var(--text-primary)' }}>{group.id}</h4>
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Capacity: {group.size} people per session</p>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => onEditGroup(group)}
            className="p-1 transition-colors"
            style={{ color: 'var(--text-tertiary)' }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-accent)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-tertiary)'}
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            onClick={() => onDeleteGroup(group.id)}
            className="p-1 transition-colors"
            style={{ color: 'var(--text-tertiary)' }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-error-600)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-tertiary)'}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Groups ({problem?.groups.length || 0})</h3>
        <div className="flex items-center gap-2">
          <div className="relative" ref={bulkDropdownRef}>
            <button
              onClick={() => setBulkDropdownOpen(!bulkDropdownOpen)}
              className="btn-secondary flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              Bulk Add
              <ChevronDown className="w-3 h-3" />
            </button>
            {bulkDropdownOpen && (
              <div className="absolute right-0 mt-1 w-56 rounded-md shadow-lg z-10 border overflow-hidden"
                   style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
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
          <button onClick={onAddGroup} className="btn-primary flex items-center gap-2 px-4 py-2">
            <Plus className="w-4 h-4" />
            Add Group
          </button>
        </div>
      </div>

      {problem?.groups.length ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {problem.groups.map(renderGroupCard)}
        </div>
      ) : (
        <div className="text-center py-12" style={{ color: 'var(--text-secondary)' }}>
          <Hash className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }} />
          <p>No groups added yet</p>
          <p className="text-sm">Add groups where people will be assigned</p>
        </div>
      )}
    </div>
  );
}

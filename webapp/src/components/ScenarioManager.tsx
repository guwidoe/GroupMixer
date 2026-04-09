import React, { useState, useRef } from 'react';
import { useAppStore } from '../store';
import {
  Copy,
  FolderPlus,
  Upload,
  Search,
  Filter,
  X,
  Save,
  ChevronDown,
} from 'lucide-react';
import type { ScenarioSummary } from '../types';
import { createDefaultSolverSettings } from '../services/solverUi';
import { ScenarioList } from './ScenarioManager/ScenarioList';
import { CreateScenarioDialog } from './ScenarioManager/CreateScenarioDialog';
import { DeleteConfirmDialog } from './ScenarioManager/DeleteConfirmDialog';

interface ScenarioManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ScenarioManager({ isOpen, onClose }: ScenarioManagerProps) {
  const {
    savedScenarios,
    currentScenarioId,
    loadSavedScenarios,
    createNewScenario,
    loadScenario,
    deleteScenario,
    duplicateScenario,
    renameScenario,
    toggleTemplate,
    exportScenario,
    importScenario,
    saveScenario,
    scenario: currentScenario,
    setScenario,
  } = useAppStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterTemplate, setFilterTemplate] = useState<'all' | 'templates' | 'scenarios'>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newScenarioName, setNewScenarioName] = useState('');
  const [newScenarioIsTemplate, setNewScenarioIsTemplate] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const newDropdownRef = useRef<HTMLDivElement>(null);
  const [newDropdownOpen, setNewDropdownOpen] = useState(false);
  const [newScenarioMode, setNewScenarioMode] = useState<'duplicate' | 'empty'>('duplicate');
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(currentScenarioId);

  React.useEffect(() => {
    if (isOpen) {
      loadSavedScenarios();
      // Force update of selected scenario ID when modal opens
      setSelectedScenarioId(currentScenarioId);
    }
  }, [isOpen, loadSavedScenarios, currentScenarioId]);

  // Update selected scenario ID when currentScenarioId changes
  React.useEffect(() => {
    setSelectedScenarioId(currentScenarioId);
  }, [currentScenarioId]);

  // Force reload when savedScenarios changes (in case new scenarios were added)
  React.useEffect(() => {
    if (isOpen) {
      // This ensures the component updates when savedScenarios changes
      // This is needed when new scenarios are created while the modal is open
    }
  }, [savedScenarios, isOpen]);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (newDropdownRef.current && !newDropdownRef.current.contains(event.target as Node)) {
        setNewDropdownOpen(false);
      }
    };
    if (newDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [newDropdownOpen]);

  const scenarioSummaries: ScenarioSummary[] = Object.values(savedScenarios).map(p => ({
    id: p.id,
    name: p.name,
    peopleCount: p.scenario?.people?.length || 0,
    groupsCount: p.scenario?.groups?.length || 0,
    sessionsCount: p.scenario?.num_sessions || 0,
    resultsCount: p.results?.length || 0,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    isTemplate: p.isTemplate,
  }));

  const filteredScenarios = scenarioSummaries.filter(scenario => {
    const matchesSearch = scenario.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = 
      filterTemplate === 'all' ||
      (filterTemplate === 'templates' && scenario.isTemplate) ||
      (filterTemplate === 'scenarios' && !scenario.isTemplate);
    
    return matchesSearch && matchesFilter;
  }).sort((a, b) => {
    // Sort templates first, then by updated date
    if (a.isTemplate && !b.isTemplate) return -1;
    if (!a.isTemplate && b.isTemplate) return 1;
    return b.updatedAt - a.updatedAt;
  });

  const handleCreateScenario = () => {
    if (!newScenarioName.trim()) return;

    const minimalScenario = {
      people: [],
      groups: [],
      num_sessions: 1,
      constraints: [],
      settings: {
        ...createDefaultSolverSettings(),
      },
    };

    if (newScenarioMode === 'empty') {
      // set current scenario to empty then save
      setScenario(minimalScenario);
    }

    createNewScenario(newScenarioName, newScenarioIsTemplate);
    setShowCreateDialog(false);
    setNewScenarioName('');
    setNewScenarioIsTemplate(false);
  };

  const handleSaveCurrentScenario = () => {
    if (!currentScenario) return;
    
    const name = currentScenarioId 
      ? savedScenarios[currentScenarioId]?.name || 'Untitled Scenario'
      : 'New Scenario';
    
    saveScenario(name);
  };

  const handleRename = (id: string, currentName: string) => {
    setEditingId(id);
    setEditingName(currentName);
  };

  const handleSaveRename = () => {
    if (editingId && editingName.trim()) {
      renameScenario(editingId, editingName.trim());
    }
    setEditingId(null);
    setEditingName('');
  };

  const handleCancelRename = () => {
    setEditingId(null);
    setEditingName('');
  };

  const handleDuplicate = (id: string, name: string) => {
    const newName = prompt(`Enter name for the duplicate of "${name}":`, `${name} (Copy)`);
    if (newName && newName.trim()) {
      const includeResults = confirm('Include existing results in the duplicate?');
      duplicateScenario(id, newName.trim(), includeResults);
    }
  };

  const handleDelete = (id: string) => {
    setShowDeleteConfirm(id);
  };

  const confirmDelete = () => {
    if (showDeleteConfirm) {
      deleteScenario(showDeleteConfirm);
      setShowDeleteConfirm(null);
    }
  };

  const handleImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      importScenario(file);
      event.target.value = ''; // Reset file input
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-4">
      <div className="rounded-lg shadow-xl w-full max-w-6xl h-5/6 flex flex-col modal-content">
        {/* Header */}
        <div className="relative border-b" style={{ borderColor: 'var(--border-primary)' }}>
          {/* X button absolutely positioned top right on mobile */}
          <button
            onClick={onClose}
            className="sm:hidden absolute top-4 right-4 z-10 btn-secondary p-2"
            aria-label="Close Scenario Manager"
            style={{ lineHeight: 0 }}
          >
            <X className="h-5 w-5" />
          </button>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 sm:p-6 gap-4 sm:gap-0">
            <div className="flex-1 min-w-0">
              <h2 className="text-xl sm:text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Scenario Manager</h2>
              <p className="mt-1 text-sm sm:text-base" style={{ color: 'var(--text-secondary)' }}>Manage your saved scenarios and results</p>
              {/* Mobile button row below title/desc */}
              <div className="flex sm:hidden items-center gap-2 mt-4">
                {currentScenario && (
                  <button
                    onClick={handleSaveCurrentScenario}
                    className="btn-primary flex items-center justify-center gap-1 px-3 py-2 text-xs"
                    aria-label="Save"
                  >
                    <Save className="h-4 w-4" />
                    <span>Save</span>
                  </button>
                )}
                <div className="relative">
                  <button
                    onClick={() => setNewDropdownOpen(!newDropdownOpen)}
                    className="btn-primary flex items-center justify-center gap-1 px-3 py-2 text-xs"
                    aria-label="New"
                  >
                    <FolderPlus className="h-4 w-4" />
                    <span>New</span>
                    <ChevronDown className="w-3 h-3 ml-1" />
                  </button>
                  {newDropdownOpen && (
                    <div className="absolute left-0 mt-1 w-40 rounded-md shadow-lg z-20 border overflow-hidden"
                         style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
                      <button
                        onClick={() => {
                          setNewScenarioMode('empty');
                          setShowCreateDialog(true);
                          setNewDropdownOpen(false);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-xs text-left transition-colors border-b last:border-b-0"
                        style={{ borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
                      >
                        <FolderPlus className="h-4 w-4" />
                        Blank
                      </button>
                      <button
                        onClick={() => {
                          setNewScenarioMode('duplicate');
                          setShowCreateDialog(true);
                          setNewDropdownOpen(false);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-xs text-left transition-colors"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        <Copy className="h-4 w-4" />
                        Duplicate
                      </button>
                    </div>
                  )}
                </div>
                <button
                  onClick={handleImport}
                  className="btn-secondary flex items-center justify-center gap-1 px-3 py-2 text-xs"
                  aria-label="Import"
                >
                  <Upload className="h-4 w-4" />
                  <span>Import</span>
                </button>
              </div>
            </div>
            {/* Desktop button group (unchanged) */}
            <div className="hidden sm:flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-2">
              {currentScenario && (
                <button
                  onClick={handleSaveCurrentScenario}
                  className="btn-primary flex items-center justify-center space-x-2 px-4 py-2 text-sm"
                  aria-label="Save Current Scenario"
                >
                  <Save className="h-4 w-4" />
                  <span>Save Current</span>
                </button>
              )}
              <div className="relative" ref={newDropdownRef}>
                <button
                  onClick={() => setNewDropdownOpen(!newDropdownOpen)}
                  className="btn-primary flex items-center justify-center space-x-2 px-4 py-2 text-sm w-full sm:w-auto"
                  aria-label="New Scenario"
                >
                  <FolderPlus className="h-4 w-4" />
                  <span>New Scenario</span>
                  <ChevronDown className="w-3 h-3" />
                </button>
                {newDropdownOpen && (
                  <div className="absolute right-0 mt-1 w-56 rounded-md shadow-lg z-10 border overflow-hidden"
                       style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
                    <button
                      onClick={() => {
                        setNewScenarioMode('empty');
                        setShowCreateDialog(true);
                        setNewDropdownOpen(false);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-left transition-colors border-b last:border-b-0"
                      style={{ borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-secondary)')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <FolderPlus className="h-4 w-4" />
                      Blank Scenario
                    </button>
                    <button
                      onClick={() => {
                        setNewScenarioMode('duplicate');
                        setShowCreateDialog(true);
                        setNewDropdownOpen(false);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-left transition-colors"
                      style={{ color: 'var(--text-primary)' }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-secondary)')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <Copy className="h-4 w-4" />
                      Duplicate Current
                    </button>
                  </div>
                )}
              </div>
              <button
                onClick={handleImport}
                className="btn-secondary flex items-center justify-center space-x-2 px-4 py-2 text-sm"
                aria-label="Import Scenario"
              >
                <Upload className="h-4 w-4" />
                <span>Import</span>
              </button>
              <button
                onClick={onClose}
                className="btn-secondary p-2"
                aria-label="Close Scenario Manager"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          {/* Divider for mobile */}
          <div className="sm:hidden border-b" style={{ borderColor: 'var(--border-secondary)' }}></div>
        </div>

        {/* Search and Filter */}
        <div className="p-4 sm:p-6 border-b" style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-primary)' }}>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2" style={{ color: 'var(--text-tertiary)' }} />
              <input
                type="text"
                placeholder="Search scenarios..."
                className="input pl-10 w-full text-base py-3"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter style={{ color: 'var(--text-tertiary)' }} className="h-4 w-4" />
              <select
                className="input text-base py-3"
                value={filterTemplate}
                onChange={(e) => setFilterTemplate(e.target.value as 'all' | 'scenarios' | 'templates')}
              >
                <option value="all">All</option>
                <option value="scenarios">Scenarios</option>
                <option value="templates">Templates</option>
              </select>
            </div>
          </div>
        </div>

        {/* Scenario List */}
        <div className="flex-1 overflow-auto p-4 sm:p-6">
          <ScenarioList
            scenarios={filteredScenarios}
            searchTerm={searchTerm}
            selectedScenarioId={selectedScenarioId}
            editingId={editingId}
            editingName={editingName}
            setEditingName={setEditingName}
            onSaveRename={handleSaveRename}
            onCancelRename={handleCancelRename}
            onRenameStart={handleRename}
            onLoadScenario={loadScenario}
            onDuplicate={handleDuplicate}
            onToggleTemplate={toggleTemplate}
            onExport={exportScenario}
            onDelete={handleDelete}
          />
        </div>

        {/* Hidden file input for import */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileImport}
          className="hidden"
        />
      </div>

      <CreateScenarioDialog
        open={showCreateDialog}
        mode={newScenarioMode}
        newScenarioName={newScenarioName}
        setNewScenarioName={setNewScenarioName}
        newScenarioIsTemplate={newScenarioIsTemplate}
        setNewScenarioIsTemplate={setNewScenarioIsTemplate}
        onCreate={handleCreateScenario}
        onCancel={() => {
          setShowCreateDialog(false);
          setNewScenarioName('');
          setNewScenarioIsTemplate(false);
        }}
      />

      <DeleteConfirmDialog
        open={!!showDeleteConfirm}
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteConfirm(null)}
      />
    </div>
  );
} 

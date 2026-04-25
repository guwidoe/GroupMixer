import React, { useState } from 'react';
import { Plus, Tag } from 'lucide-react';
import type { AttributeDefinition } from '../../../types';
import { getAttributeDefinitionName } from '../../../services/scenarioAttributes';
import { Button } from '../../ui';
import { SetupCardSearchToolbar } from '../shared/SetupCardSearchToolbar';
import { SetupCollectionPage } from '../shared/SetupCollectionPage';
import { SetupCardGrid, SetupItemActions, SetupItemCard, SetupTagList } from '../shared/cards';
import { ScenarioDataGrid } from '../shared/grid/ScenarioDataGrid';
import type { SetupCollectionViewMode } from '../shared/useSetupCollectionViewMode';

interface AttributeDefinitionsSectionProps {
  attributeDefinitions: AttributeDefinition[];
  onAddAttribute: () => void;
  onEditAttribute: (definition: AttributeDefinition) => void;
  onRemoveAttribute: (key: string) => void;
  onApplyGridAttributes: (definitions: AttributeDefinition[]) => void;
  createGridAttributeRow: () => AttributeDefinition;
}

function AttributeListRow({
  definition,
  onEditAttribute,
  onRemoveAttribute,
}: {
  definition: AttributeDefinition;
  onEditAttribute: (definition: AttributeDefinition) => void;
  onRemoveAttribute: (key: string) => void;
}) {
  return (
    <SetupItemCard
      title={definition.key}
      onOpen={() => onEditAttribute(definition)}
      openLabel={`Edit ${definition.key}`}
      actions={
        <SetupItemActions
          deleteLabel={`Delete ${definition.key}`}
          onDelete={() => onRemoveAttribute(definition.key)}
          variant="card"
        />
      }
    >
      <SetupTagList
        items={definition.values.map((value) => (
          <span
            key={value}
            className="rounded-full px-2 py-0.5 text-xs font-medium"
            style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
          >
            {value}
          </span>
        ))}
      />
    </SetupItemCard>
  );
}

function renderAttributeContent(
  attributeDefinitions: AttributeDefinition[],
  viewMode: SetupCollectionViewMode,
  gridWorkspaceMode: 'browse' | 'edit' | 'csv',
  setGridWorkspaceMode: React.Dispatch<React.SetStateAction<'browse' | 'edit' | 'csv'>>,
  onEditAttribute: (definition: AttributeDefinition) => void,
  onRemoveAttribute: (key: string) => void,
  onApplyGridAttributes: (definitions: AttributeDefinition[]) => void,
  createGridAttributeRow: () => AttributeDefinition,
) {
  if (viewMode === 'list') {
    return (
      <ScenarioDataGrid
        rows={attributeDefinitions}
        rowKey={(definition) => definition.id}
        onRowOpen={onEditAttribute}
        rowOpenLabel={(definition) => `Edit ${definition.key}`}
        searchPlaceholder="Search attributes and values…"
        workspace={{
          mode: gridWorkspaceMode,
          onModeChange: setGridWorkspaceMode,
          browseModeEnabled: false,
          draft: {
            onApply: onApplyGridAttributes,
            createRow: createGridAttributeRow,
            canDeleteRows: true,
            deleteRowLabel: (definition) => `Delete ${getAttributeDefinitionName(definition) || definition.key || 'attribute'}`,
            csv: {
              ariaLabel: 'Attribute definitions CSV',
              helperText: (
                <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  <strong>Values</strong> uses <code>|</code> in CSV mode.
                </div>
              ),
            },
          },
        }}
        columns={[
          {
            kind: 'primitive' as const,
            id: 'attribute',
            header: 'Attribute',
            primitive: 'string' as const,
            getValue: (definition: AttributeDefinition) => getAttributeDefinitionName(definition),
            setValue: (definition: AttributeDefinition, value) => ({
              ...definition,
              name: value ?? '',
              key: value ?? '',
            }),
            renderValue: (value) => <span className="font-semibold capitalize" style={{ color: 'var(--text-primary)' }}>{value}</span>,
            width: 220,
          },
          {
            kind: 'primitive' as const,
            id: 'values',
            header: 'Values',
            primitive: 'array' as const,
            itemType: 'string' as const,
            getValue: (definition: AttributeDefinition) => definition.values,
            setValue: (definition: AttributeDefinition, value) => ({
              ...definition,
              values: Array.isArray(value) ? value.map((entry) => String(entry)) : [],
            }),
            renderValue: (value) => (
              <div className="flex flex-wrap gap-1.5">
                {(Array.isArray(value) ? value : []).map((entry) => (
                  <span
                    key={String(entry)}
                    className="rounded-full px-2 py-0.5 text-xs font-medium"
                    style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
                  >
                    {String(entry)}
                  </span>
                ))}
              </div>
            ),
            width: 340,
          },
        ]}
      />
    );
  }

  return (
    <SetupCardGrid minColumnWidth="17rem">
      {attributeDefinitions.map((definition) => (
        <AttributeListRow
          key={definition.key}
          definition={definition}
          onEditAttribute={onEditAttribute}
          onRemoveAttribute={onRemoveAttribute}
        />
      ))}
    </SetupCardGrid>
  );
}

export function AttributeDefinitionsSection({
  attributeDefinitions,
  onAddAttribute,
  onEditAttribute,
  onRemoveAttribute,
  onApplyGridAttributes,
  createGridAttributeRow,
}: AttributeDefinitionsSectionProps) {
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<SetupCollectionViewMode>('list');
  const [gridWorkspaceMode, setGridWorkspaceMode] = useState<'browse' | 'edit' | 'csv'>('edit');
  const searchValue = search.trim().toLowerCase();

  const filteredDefinitions = React.useMemo(() => {
    if (viewMode !== 'cards' || !searchValue) {
      return attributeDefinitions;
    }

    return attributeDefinitions.filter((definition) => {
      const haystack = [
        getAttributeDefinitionName(definition).toLowerCase(),
        definition.key.toLowerCase(),
        ...definition.values.map((value) => value.toLowerCase()),
      ];

      return haystack.some((value) => value.includes(searchValue));
    });
  }, [attributeDefinitions, searchValue, viewMode]);

  return (
    <SetupCollectionPage
      sectionKey="attributes"
      title="Attribute Definitions"
      count={attributeDefinitions.length}
      description={
        <p>
          Attributes are key-value pairs that describe people, such as department, track, or seniority. Define
          them here before using them in people records or attribute-balance preferences.
        </p>
      }
      actions={
        <Button variant="primary" leadingIcon={<Plus className="h-4 w-4" />} onClick={onAddAttribute}>
          Add Attribute
        </Button>
      }
      defaultViewMode="list"
      onViewModeChange={(nextMode) => {
        setViewMode(nextMode);
        if (nextMode !== 'list') {
          setGridWorkspaceMode('edit');
        }
      }}
      toolbarLeading={(activeViewMode) =>
        activeViewMode === 'cards' ? (
          <SetupCardSearchToolbar
            label="Search attributes"
            placeholder="Search attributes and values..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onClear={() => setSearch('')}
            status={searchValue ? `Showing ${filteredDefinitions.length} of ${attributeDefinitions.length} attributes` : undefined}
          />
        ) : null
      }
      hasItems={filteredDefinitions.length > 0}
      emptyState={{
        icon: <Tag className="h-10 w-10" style={{ color: 'var(--text-tertiary)' }} />,
        title: searchValue ? 'No attributes match this search' : 'No attributes defined yet',
        message: searchValue
          ? 'Try a broader search or clear it to see every attribute.'
          : 'Create your first attribute to describe people and unlock attribute-based setup flows.',
      }}
      renderContent={(activeViewMode) => renderAttributeContent(filteredDefinitions, activeViewMode, gridWorkspaceMode, setGridWorkspaceMode, onEditAttribute, onRemoveAttribute, onApplyGridAttributes, createGridAttributeRow)}
    />
  );
}

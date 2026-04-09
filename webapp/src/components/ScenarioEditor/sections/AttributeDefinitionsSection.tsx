import React from 'react';
import { Plus, Tag } from 'lucide-react';
import type { AttributeDefinition } from '../../../types';
import { Button } from '../../ui';
import { SetupCollectionPage } from '../shared/SetupCollectionPage';
import { SetupItemActions, SetupItemCard, SetupTagList } from '../shared/cards';
import { ScenarioDataGrid } from '../shared/grid/ScenarioDataGrid';
import type { SetupCollectionViewMode } from '../shared/useSetupCollectionViewMode';

interface AttributeDefinitionsSectionProps {
  attributeDefinitions: AttributeDefinition[];
  onAddAttribute: () => void;
  onEditAttribute: (definition: AttributeDefinition) => void;
  onRemoveAttribute: (key: string) => void;
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
      actions={
        <SetupItemActions
          editLabel={`Edit ${definition.key}`}
          deleteLabel={`Delete ${definition.key}`}
          onEdit={() => onEditAttribute(definition)}
          onDelete={() => onRemoveAttribute(definition.key)}
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
  onEditAttribute: (definition: AttributeDefinition) => void,
  onRemoveAttribute: (key: string) => void,
) {
  if (viewMode === 'list') {
    return (
      <ScenarioDataGrid
        rows={attributeDefinitions}
        rowKey={(definition) => definition.key}
        searchPlaceholder="Search attributes and values…"
        columns={[
          {
            id: 'attribute',
            header: 'Attribute',
            cell: (definition) => <span className="font-semibold capitalize" style={{ color: 'var(--text-primary)' }}>{definition.key}</span>,
            sortValue: (definition) => definition.key,
            searchValue: (definition) => definition.key,
            width: 220,
          },
          {
            id: 'values',
            header: 'Values',
            cell: (definition) => (
              <div className="flex flex-wrap gap-1.5">
                {definition.values.map((value) => (
                  <span
                    key={value}
                    className="rounded-full px-2 py-0.5 text-xs font-medium"
                    style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
                  >
                    {value}
                  </span>
                ))}
              </div>
            ),
            sortValue: (definition) => definition.values.length,
            searchValue: (definition) => definition.values.join(' '),
            width: 340,
          },
          {
            id: 'actions',
            header: 'Actions',
            cell: (definition) => (
              <div className="flex justify-end">
                <SetupItemActions
                  editLabel={`Edit ${definition.key}`}
                  deleteLabel={`Delete ${definition.key}`}
                  onEdit={() => onEditAttribute(definition)}
                  onDelete={() => onRemoveAttribute(definition.key)}
                />
              </div>
            ),
            align: 'right',
            hideable: false,
            width: 180,
          },
        ]}
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {attributeDefinitions.map((definition) => (
        <AttributeListRow
          key={definition.key}
          definition={definition}
          onEditAttribute={onEditAttribute}
          onRemoveAttribute={onRemoveAttribute}
        />
      ))}
    </div>
  );
}

export function AttributeDefinitionsSection({
  attributeDefinitions,
  onAddAttribute,
  onEditAttribute,
  onRemoveAttribute,
}: AttributeDefinitionsSectionProps) {
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
      toolbarLeading={
        <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Switch between a compact list and a broader card layout for reviewing attribute schemas.
        </div>
      }
      hasItems={attributeDefinitions.length > 0}
      emptyState={{
        icon: <Tag className="h-10 w-10" style={{ color: 'var(--text-tertiary)' }} />,
        title: 'No attributes defined yet',
        message: 'Create your first attribute to describe people and unlock attribute-based setup flows.',
      }}
      renderContent={(viewMode) => renderAttributeContent(attributeDefinitions, viewMode, onEditAttribute, onRemoveAttribute)}
    />
  );
}

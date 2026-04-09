import React from 'react';
import { Edit, Plus, Tag, Trash2 } from 'lucide-react';
import type { AttributeDefinition } from '../../../types';
import { Button } from '../../ui';
import { SetupCollectionPage } from '../shared/SetupCollectionPage';
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
    <div
      className="rounded-xl border px-4 py-4"
      style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-semibold capitalize" style={{ color: 'var(--text-primary)' }}>
            {definition.key}
          </h4>
          <div className="mt-2 flex flex-wrap gap-1.5">
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
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label={`Edit ${definition.key}`} onClick={() => onEditAttribute(definition)}>
            <Edit className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" aria-label={`Delete ${definition.key}`} onClick={() => onRemoveAttribute(definition.key)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
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
      <div className="overflow-hidden rounded-2xl border" style={{ borderColor: 'var(--border-primary)' }}>
        <div
          className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] gap-4 border-b px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em]"
          style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-primary)', color: 'var(--text-tertiary)' }}
        >
          <div>Attribute</div>
          <div>Values</div>
          <div className="text-right">Actions</div>
        </div>
        <div className="divide-y" style={{ borderColor: 'var(--border-primary)' }}>
          {attributeDefinitions.map((definition) => (
            <div
              key={definition.key}
              className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] gap-4 px-4 py-3"
              style={{ backgroundColor: 'var(--bg-primary)' }}
            >
              <div className="text-sm font-semibold capitalize" style={{ color: 'var(--text-primary)' }}>
                {definition.key}
              </div>
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
              <div className="flex items-center justify-end gap-1">
                <Button variant="ghost" size="icon" aria-label={`Edit ${definition.key}`} onClick={() => onEditAttribute(definition)}>
                  <Edit className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" aria-label={`Delete ${definition.key}`} onClick={() => onRemoveAttribute(definition.key)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
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

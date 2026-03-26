import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Edit, Plus, Tag, Trash2 } from 'lucide-react';
import type { AttributeDefinition } from '../../../types';

interface AttributeDefinitionsSectionProps {
  attributeDefinitions: AttributeDefinition[];
  onAddAttribute: () => void;
  onEditAttribute: (definition: AttributeDefinition) => void;
  onRemoveAttribute: (key: string) => void;
}

export function AttributeDefinitionsSection({
  attributeDefinitions,
  onAddAttribute,
  onEditAttribute,
  onRemoveAttribute,
}: AttributeDefinitionsSectionProps) {
  const [showAttributesSection, setShowAttributesSection] = useState(false);

  const isEmpty = attributeDefinitions.length === 0;
  const effectiveShowAttributes = showAttributesSection || isEmpty;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => setShowAttributesSection(!showAttributesSection)}
          className="flex min-w-0 items-center gap-2 text-left transition-colors"
          style={{ flex: '1 1 0%' }}
        >
          {effectiveShowAttributes ? (
            <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
          ) : (
            <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
          )}
          <Tag className="w-5 h-5" style={{ color: 'var(--color-accent)' }} />
          <h3
            className="truncate text-base font-medium"
            style={{ color: 'var(--text-primary)', maxWidth: '100%', fontSize: 'clamp(0.9rem, 4vw, 1.1rem)' }}
          >
            Attribute Definitions ({attributeDefinitions.length})
          </h3>
        </button>
        <button onClick={onAddAttribute} className="btn-primary flex items-center gap-2 px-3 py-1.5 text-sm">
          <Plus className="w-3 h-3" />
          Add Attribute
        </button>
      </div>

      {effectiveShowAttributes && (
        <div
          className="rounded-lg border transition-colors"
          style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
        >
          <div className="space-y-3 p-4">
            <div
              className="rounded-md border p-3 text-sm"
              style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-primary)' }}
            >
              <p style={{ color: 'var(--text-secondary)' }}>
                Attributes are key-value pairs that describe people (e.g., gender, department, seniority). Define them
                here before adding people to use them in constraints like attribute balance.
              </p>
            </div>

            {attributeDefinitions.length ? (
              <div className="space-y-2">
                {attributeDefinitions.map((definition) => (
                  <div
                    key={definition.key}
                    className="rounded-lg border p-3 transition-colors"
                    style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="text-sm font-medium capitalize" style={{ color: 'var(--text-primary)' }}>
                          {definition.key}
                        </h4>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {definition.values.map((value) => (
                            <span
                              key={value}
                              style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
                              className="rounded-full px-2 py-0.5 text-xs font-medium"
                            >
                              {value}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => onEditAttribute(definition)}
                          className="p-1 text-gray-400 transition-colors hover:text-blue-600"
                        >
                          <Edit className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => onRemoveAttribute(definition.key)}
                          className="p-1 text-gray-400 transition-colors hover:text-red-600"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-6 text-center" style={{ color: 'var(--text-secondary)' }}>
                <Tag className="mx-auto mb-2 h-8 w-8" style={{ color: 'var(--text-tertiary)' }} />
                <p className="text-sm">No attributes defined yet</p>
                <p className="text-xs">Click "Add Attribute" to get started</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

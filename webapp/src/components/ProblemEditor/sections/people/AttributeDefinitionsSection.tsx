import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Edit, Plus, Tag, Trash2 } from 'lucide-react';
import type { AttributeDefinition } from '../../../../types';

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

  useEffect(() => {
    if (attributeDefinitions.length === 0) {
      setShowAttributesSection(true);
    }
  }, [attributeDefinitions.length]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => setShowAttributesSection(!showAttributesSection)}
          className="flex items-center gap-2 text-left transition-colors min-w-0"
          style={{ flex: '1 1 0%' }}
        >
          {showAttributesSection ? (
            <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
          ) : (
            <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
          )}
          <Tag className="w-5 h-5" style={{ color: 'var(--color-accent)' }} />
          <h3
            className="text-base font-medium truncate"
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

      {showAttributesSection && (
        <div
          className="rounded-lg border transition-colors"
          style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
        >
          <div className="p-4 space-y-3">
            <div
              className="rounded-md p-3 border text-sm"
              style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-primary)' }}
            >
              <p style={{ color: 'var(--text-secondary)' }}>
                Attributes are key-value pairs that describe people (e.g., gender, department, seniority). Define them
                here before adding people to use them in constraints like attribute balance.
              </p>
            </div>

            {attributeDefinitions.length ? (
              <div className="space-y-2">
                {attributeDefinitions.map((def) => (
                  <div
                    key={def.key}
                    className="rounded-lg border p-3 transition-colors"
                    style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-medium capitalize text-sm" style={{ color: 'var(--text-primary)' }}>
                          {def.key}
                        </h4>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {def.values.map((value) => (
                            <span
                              key={value}
                              style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
                              className="px-2 py-0.5 rounded-full text-xs font-medium"
                            >
                              {value}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => onEditAttribute(def)}
                          className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                        >
                          <Edit className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => onRemoveAttribute(def.key)}
                          className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6" style={{ color: 'var(--text-secondary)' }}>
                <Tag className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--text-tertiary)' }} />
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

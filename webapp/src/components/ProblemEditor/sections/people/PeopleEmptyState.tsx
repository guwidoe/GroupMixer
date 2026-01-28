import React from 'react';
import { Users } from 'lucide-react';

interface PeopleEmptyStateProps {
  hasAttributes: boolean;
}

export function PeopleEmptyState({ hasAttributes }: PeopleEmptyStateProps) {
  return (
    <div className="text-center py-12" style={{ color: 'var(--text-secondary)' }}>
      <Users className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }} />
      <p>No people added yet</p>
      <p className="text-sm">
        {hasAttributes
          ? 'Add people to get started with your optimization problem'
          : 'Consider defining attributes first, then add people to get started'}
      </p>
    </div>
  );
}

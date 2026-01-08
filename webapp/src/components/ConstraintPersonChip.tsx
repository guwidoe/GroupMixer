import React from 'react';
import { Users, X as CloseIcon } from 'lucide-react';
import type { Person } from '../types';
import { Tooltip } from './Tooltip';

interface ConstraintPersonChipProps {
  personId: string;
  people: Person[];
  onRemove?: (personId: string) => void;
}

// Renders a person chip inside a constraint card.
// - If the person exists in the current problem, show normal accent styling
// - If missing (person was deleted from problem), show red styling and allow removal
// - Always shows a small "x" to remove the person from the constraint when onRemove is provided
const ConstraintPersonChip: React.FC<ConstraintPersonChipProps> = ({ personId, people, onRemove }) => {
  const person = people.find(p => p.id === personId);
  const hasRemove = typeof onRemove === 'function';
  const displayName = person ? (person.attributes?.name || person.id) : personId;

  const isMissing = !person;

  const baseStyle: React.CSSProperties = isMissing
    ? {
        backgroundColor: 'var(--color-error-50)',
        color: 'var(--color-error-700)',
        borderColor: 'var(--color-error-300)',
      }
    : {
        backgroundColor: 'var(--bg-tertiary)',
        color: 'var(--color-accent)',
        borderColor: 'var(--color-accent)',
      };

  const content = (
    <span
      className={
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border'
      }
      style={baseStyle}
    >
      <Users className="w-3 h-3" />
      <span className="truncate max-w-[180px]" title={displayName}>
        {displayName}
      </span>
      {hasRemove && (
        <button
          type="button"
          aria-label={`Remove ${displayName} from constraint`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove && onRemove(personId);
          }}
          className="ml-1 p-0.5 rounded hover:opacity-80 focus:outline-none"
          style={{
            color: isMissing ? 'var(--color-error-700)' : 'var(--color-accent)',
          }}
        >
          <CloseIcon className="w-3 h-3" />
        </button>
      )}
    </span>
  );

  return person ? (
    <Tooltip content={person.id}>{content}</Tooltip>
  ) : (
    // For missing people, show raw content (tooltip isn't very helpful)
    content
  );
};

export default ConstraintPersonChip;



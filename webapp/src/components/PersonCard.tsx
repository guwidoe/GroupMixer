import React from 'react';
import { Users } from 'lucide-react';
import { Person } from '../types';
import { getPersonDisplayName } from '../utils/personUtils';

interface PersonCardProps {
  person: Person;
  className?: string;
}

const PersonCard: React.FC<PersonCardProps> = ({ person, className }) => {
  const displayName = getPersonDisplayName(person);

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${className ?? ''}`}
      style={{
        backgroundColor: 'var(--bg-tertiary)',
        color: 'var(--color-accent)',
        borderColor: 'var(--color-accent)',
      }}
    >
      <Users className="w-3 h-3" />
      {displayName}
    </span>
  );
};

export default PersonCard; 

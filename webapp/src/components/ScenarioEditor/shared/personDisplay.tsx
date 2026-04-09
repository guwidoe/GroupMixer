import React from 'react';
import type { Person } from '../../../types';
import { Tooltip } from '../../Tooltip';

export function resolvePersonDisplay(people: Person[], personId: string) {
  const person = people.find((candidate) => candidate.id === personId);
  const displayName = person?.attributes?.name || person?.id || personId;
  const stableId = person?.id || personId;

  return {
    person,
    displayName,
    stableId,
    searchText: `${displayName} ${stableId}`.trim(),
    hasDistinctId: stableId !== displayName,
  };
}

export function formatPersonDisplayList(people: Person[], personIds: string[], separator = ', ') {
  return personIds.map((personId) => resolvePersonDisplay(people, personId).displayName).join(separator);
}

export function formatPersonSearchList(people: Person[], personIds: string[]) {
  return personIds.map((personId) => resolvePersonDisplay(people, personId).searchText).join(' ');
}

export function SetupPersonName({
  people,
  personId,
  className,
}: {
  people: Person[];
  personId: string;
  className?: string;
}) {
  const person = resolvePersonDisplay(people, personId);
  const content = (
    <span className={className} title={person.displayName}>
      {person.displayName}
    </span>
  );

  if (!person.hasDistinctId) {
    return content;
  }

  return (
    <Tooltip content={person.stableId}>
      {content}
    </Tooltip>
  );
}

export function SetupPersonListText({
  people,
  personIds,
  separator = ', ',
}: {
  people: Person[];
  personIds: string[];
  separator?: string;
}) {
  return (
    <span>
      {personIds.map((personId, index) => (
        <React.Fragment key={personId}>
          {index > 0 ? separator : null}
          <SetupPersonName people={people} personId={personId} className="font-medium" />
        </React.Fragment>
      ))}
    </span>
  );
}

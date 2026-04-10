import React from 'react';
import { Filter, Link2, UserLock, UserMinus, Users } from 'lucide-react';
import type { HardConstraintFamily, SoftConstraintFamily } from './types';

export const HARD_SECTION_COPY: Record<HardConstraintFamily, { title: string; description: React.ReactNode; icon: React.ReactNode; addLabel: string }> = {
  ImmovablePeople: {
    title: 'Immovable People',
    description: (
      <p>
        Fix selected people to a specific group in selected sessions. Use this for presenters, hosts, or any other
        participants whose placement is predetermined.
      </p>
    ),
    icon: <UserLock className="h-10 w-10" style={{ color: 'var(--text-tertiary)' }} />,
    addLabel: 'Add Immovable People',
  },
  MustStayTogether: {
    title: 'Must Stay Together',
    description: (
      <p>
        Require selected people to stay in the same group. This is a requirement, so breaking the set would make the
        solution invalid.
      </p>
    ),
    icon: <Users className="h-10 w-10" style={{ color: 'var(--text-tertiary)' }} />,
    addLabel: 'Add Clique',
  },
};

export const SOFT_SECTION_COPY: Record<SoftConstraintFamily, { title: string; description: React.ReactNode; icon: React.ReactNode; addLabel: string }> = {
  ShouldNotBeTogether: {
    title: 'Should Not Be Together',
    description: (
      <p>
        Discourage selected people from landing in the same group. Violations remain possible, but they add weighted
        cost to the schedule.
      </p>
    ),
    icon: <UserMinus className="h-10 w-10" style={{ color: 'var(--text-tertiary)' }} />,
    addLabel: 'Add Should Not Be Together',
  },
  ShouldStayTogether: {
    title: 'Should Stay Together',
    description: (
      <p>
        Prefer selected people to remain together without making it mandatory. Use this when feasibility matters more
        than enforcing a hard grouping rule.
      </p>
    ),
    icon: <Link2 className="h-10 w-10" style={{ color: 'var(--text-tertiary)' }} />,
    addLabel: 'Add Should Stay Together',
  },
  AttributeBalance: {
    title: 'Attribute Balance',
    description: (
      <p>
        Guide group composition toward a target attribute distribution. This is useful for balancing roles, tracks, or
        other categorical attributes.
      </p>
    ),
    icon: <Filter className="h-10 w-10" style={{ color: 'var(--text-tertiary)' }} />,
    addLabel: 'Add Attribute Balance',
  },
  PairMeetingCount: {
    title: 'Pair Meeting Count',
    description: (
      <p>
        Target how often important pairs should meet. Use this to capture at-least, at-most, or exact pair-contact
        goals.
      </p>
    ),
    icon: <Users className="h-10 w-10" style={{ color: 'var(--text-tertiary)' }} />,
    addLabel: 'Add Pair Meeting Count',
  },
};

import React from 'react';
import { Filter, Link2, UserLock, UserMinus, Users } from 'lucide-react';
import type { HardConstraintFamily, SoftConstraintFamily } from './types';
import { getConstraintAddLabel, getConstraintDisplayName } from '../../../../utils/constraintDisplay';

export const HARD_SECTION_COPY: Record<HardConstraintFamily, { title: string; description: React.ReactNode; icon: React.ReactNode; addLabel: string }> = {
  ImmovablePeople: {
    title: getConstraintDisplayName('ImmovablePeople'),
    description: (
      <p>
        Fix selected people to a specific group in selected sessions. Use this for presenters, hosts, or any other
        participants whose placement is predetermined.
      </p>
    ),
    icon: <UserLock className="h-10 w-10" style={{ color: 'var(--text-tertiary)' }} />,
    addLabel: getConstraintAddLabel('ImmovablePeople'),
  },
  MustStayTogether: {
    title: getConstraintDisplayName('MustStayTogether'),
    description: (
      <p>
        Require selected people to stay in the same group. This is a requirement, so breaking the set would make the
        solution invalid.
      </p>
    ),
    icon: <Users className="h-10 w-10" style={{ color: 'var(--text-tertiary)' }} />,
    addLabel: getConstraintAddLabel('MustStayTogether'),
  },
  MustStayApart: {
    title: getConstraintDisplayName('MustStayApart'),
    description: (
      <p>
        Require selected people to stay in different groups. This is a requirement, so putting them together would make
        the solution invalid.
      </p>
    ),
    icon: <UserMinus className="h-10 w-10" style={{ color: 'var(--text-tertiary)' }} />,
    addLabel: getConstraintAddLabel('MustStayApart'),
  },
};

export const SOFT_SECTION_COPY: Record<SoftConstraintFamily, { title: string; description: React.ReactNode; icon: React.ReactNode; addLabel: string }> = {
  ShouldNotBeTogether: {
    title: getConstraintDisplayName('ShouldNotBeTogether'),
    description: (
      <p>
        Discourage selected people from landing in the same group. Violations remain possible, but they add weighted
        cost to the schedule.
      </p>
    ),
    icon: <UserMinus className="h-10 w-10" style={{ color: 'var(--text-tertiary)' }} />,
    addLabel: getConstraintAddLabel('ShouldNotBeTogether'),
  },
  ShouldStayTogether: {
    title: getConstraintDisplayName('ShouldStayTogether'),
    description: (
      <p>
        Prefer selected people to remain together without making it mandatory. Use this when feasibility matters more
        than enforcing a hard grouping rule.
      </p>
    ),
    icon: <Link2 className="h-10 w-10" style={{ color: 'var(--text-tertiary)' }} />,
    addLabel: getConstraintAddLabel('ShouldStayTogether'),
  },
  AttributeBalance: {
    title: getConstraintDisplayName('AttributeBalance'),
    description: (
      <p>
        Guide group composition toward a target attribute distribution. This is useful for balancing roles, tracks, or
        other categorical attributes.
      </p>
    ),
    icon: <Filter className="h-10 w-10" style={{ color: 'var(--text-tertiary)' }} />,
    addLabel: getConstraintAddLabel('AttributeBalance'),
  },
  PairMeetingCount: {
    title: getConstraintDisplayName('PairMeetingCount'),
    description: (
      <p>
        Target how often important pairs should meet. Use this to capture at-least, at-most, or exact pair-contact
        goals.
      </p>
    ),
    icon: <Users className="h-10 w-10" style={{ color: 'var(--text-tertiary)' }} />,
    addLabel: getConstraintAddLabel('PairMeetingCount'),
  },
};

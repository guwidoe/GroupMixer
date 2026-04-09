import React from 'react';
import type { Constraint } from '../../../types';
import HardConstraintsPanel from '../../constraints/HardConstraintsPanel';
import SoftConstraintsPanel from '../../constraints/SoftConstraintsPanel';

type HardConstraintFamily = 'ImmovablePeople' | 'MustStayTogether';
type SoftConstraintFamily =
  | 'RepeatEncounter'
  | 'ShouldNotBeTogether'
  | 'ShouldStayTogether'
  | 'AttributeBalance'
  | 'PairMeetingCount';

interface HardConstraintFamilySectionProps {
  family: HardConstraintFamily;
  onAdd: (type: HardConstraintFamily) => void;
  onEdit: (constraint: Constraint, index: number) => void;
  onDelete: (index: number) => void;
}

interface SoftConstraintFamilySectionProps {
  family: SoftConstraintFamily;
  onAdd: (type: SoftConstraintFamily) => void;
  onEdit: (constraint: Constraint, index: number) => void;
  onDelete: (index: number) => void;
}

const HARD_SECTION_COPY: Record<HardConstraintFamily, { title: string; infoContent: React.ReactNode }> = {
  ImmovablePeople: {
    title: 'Immovable People',
    infoContent: (
      <p>
        Keep selected people fixed to a chosen group in the selected sessions. Use this for presenters,
        hosts, or any participant whose placement is predetermined.
      </p>
    ),
  },
  MustStayTogether: {
    title: 'Must Stay Together',
    infoContent: (
      <p>
        Require selected people to stay in the same group. Use this when splitting the set would make the
        schedule invalid.
      </p>
    ),
  },
};

const SOFT_SECTION_COPY: Record<SoftConstraintFamily, { title: string; infoContent: React.ReactNode }> = {
  RepeatEncounter: {
    title: 'Repeat Encounter',
    infoContent: (
      <p>
        Limit how often the same people should meet across sessions. Violations are allowed, but they add
        penalty weight to the score.
      </p>
    ),
  },
  ShouldNotBeTogether: {
    title: 'Should Not Be Together',
    infoContent: (
      <p>
        Discourage selected people from ending up in the same group. Use this for mild separation
        preferences that should not make the scenario infeasible.
      </p>
    ),
  },
  ShouldStayTogether: {
    title: 'Should Stay Together',
    infoContent: (
      <p>
        Prefer selected people to remain together without making it a hard requirement. Use this when the
        preference matters, but feasibility matters more.
      </p>
    ),
  },
  AttributeBalance: {
    title: 'Attribute Balance',
    infoContent: (
      <p>
        Encourage each group to match a target attribute distribution. This is useful for balancing roles,
        levels, or any other categorical attribute.
      </p>
    ),
  },
  PairMeetingCount: {
    title: 'Pair Meeting Count',
    infoContent: (
      <p>
        Target how often important pairs should meet. Use this when certain pairs should meet at least,
        at most, or exactly a given number of times.
      </p>
    ),
  },
};

export function HardConstraintFamilySection({ family, onAdd, onEdit, onDelete }: HardConstraintFamilySectionProps) {
  const copy = HARD_SECTION_COPY[family];

  return (
    <div className="pt-0">
      <HardConstraintsPanel
        onAddConstraint={onAdd}
        onEditConstraint={onEdit}
        onDeleteConstraint={onDelete}
        forcedTab={family}
        showFamilyNav={false}
        title={copy.title}
        infoContent={copy.infoContent}
      />
    </div>
  );
}

export function SoftConstraintFamilySection({ family, onAdd, onEdit, onDelete }: SoftConstraintFamilySectionProps) {
  const copy = SOFT_SECTION_COPY[family];

  return (
    <div className="pt-0">
      <SoftConstraintsPanel
        onAddConstraint={onAdd}
        onEditConstraint={onEdit}
        onDeleteConstraint={onDelete}
        forcedTab={family}
        showFamilyNav={false}
        title={copy.title}
        infoContent={copy.infoContent}
      />
    </div>
  );
}

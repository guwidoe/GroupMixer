import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  SetupItemActions,
  SetupItemCard,
  SetupKeyValueList,
  SetupPeopleNodeList,
  SetupSessionsBadgeList,
  SetupTagList,
  SetupTypeBadge,
  SetupWeightBadge,
} from './cards';

describe('scenario setup card primitives', () => {
  it('renders shared badges, sessions, people, and action affordances', () => {
    render(
      <SetupItemCard
        badges={
          <>
            <SetupTypeBadge label="Repeat encounter" />
            <SetupWeightBadge weight={12} />
          </>
        }
        actions={<SetupItemActions onEdit={vi.fn()} onDelete={vi.fn()} />}
      >
        <SetupKeyValueList items={[{ label: 'Penalty function', value: 'linear' }]} />
        <SetupSessionsBadgeList sessions={[0, 2]} />
        <SetupPeopleNodeList label="People" people={[<span key="a">Alex</span>, <span key="b">Blair</span>]} />
        <SetupTagList items={[<span key="dev">dev</span>, <span key="pm">pm</span>]} />
      </SetupItemCard>,
    );

    expect(screen.getByText(/repeat encounter/i)).toBeInTheDocument();
    expect(screen.getByText(/weight 12/i)).toBeInTheDocument();
    expect(screen.getByText(/penalty function/i)).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Alex')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /edit item/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete item/i })).toBeInTheDocument();
  });
});

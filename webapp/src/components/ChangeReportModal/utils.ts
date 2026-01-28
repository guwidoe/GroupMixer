import type { ComplianceCardData } from '../../services/evaluator';

type ChangeDetail = ComplianceCardData['details'][number];

export interface ChangeItem {
  before?: ComplianceCardData;
  after?: ComplianceCardData;
  key: string;
}

export function formatDelta(v: number, invertGood = false): { text: string; className: string } {
  const sign = v > 0 ? '+' : '';
  const cls = invertGood ? (v <= 0 ? 'text-green-600' : 'text-red-600') : v >= 0 ? 'text-green-600' : 'text-red-600';
  return { text: `${sign}${v.toFixed(2)}`, className: cls };
}

const detailKeyFor = (d: ChangeDetail) => {
  switch (d.kind) {
    case 'RepeatEncounter':
      return `${d.kind}|${[d.pair[0], d.pair[1]].sort().join('|')}`;
    case 'AttributeBalance':
      return `${d.kind}|${d.session}|${d.groupId}|${d.attribute}`;
    case 'Immovable':
      return `${d.kind}|${d.session}|${d.personId}|${d.requiredGroup}|${d.assignedGroup ?? ''}`;
    case 'TogetherSplit':
      return `${d.kind}|${d.session}|${((d.people as Array<{ personId: string }> | undefined) ?? []).map((p) => p.personId).sort().join(',')}`;
    case 'NotTogether':
      return `${d.kind}|${d.session}|${d.groupId}|${(((d.people as string[] | undefined) ?? []).slice().sort().join(','))}`;
    default:
      return `${d.kind}|${JSON.stringify(d)}`;
  }
};

export function buildChangedByType(
  beforeCompliance: ComplianceCardData[],
  afterCompliance: ComplianceCardData[],
): Map<string, ChangeItem[]> {
  const changedByType = new Map<string, ChangeItem[]>();
  const beforeMap = new Map<string, ComplianceCardData>();
  beforeCompliance.forEach((card) => beforeMap.set(`${card.type}#${card.id}`, card));
  const seenKeys = new Set<string>();

  afterCompliance.forEach((card) => {
    const key = `${card.type}#${card.id}`;
    seenKeys.add(key);
    const prev = beforeMap.get(key);
    if (!prev) {
      const arr = changedByType.get(card.type) || [];
      arr.push({ before: prev, after: card, key });
      changedByType.set(card.type, arr);
      return;
    }

    const beforeSet = new Set<string>((prev.details || []).map(detailKeyFor));
    const afterSet = new Set<string>((card.details || []).map(detailKeyFor));
    const countsDiffer = prev.violationsCount !== card.violationsCount;
    let setsDiffer = beforeSet.size !== afterSet.size;
    if (!setsDiffer) {
      for (const beforeKey of beforeSet) {
        if (!afterSet.has(beforeKey)) {
          setsDiffer = true;
          break;
        }
      }
    }
    if (countsDiffer || setsDiffer) {
      const arr = changedByType.get(card.type) || [];
      arr.push({ before: prev, after: card, key });
      changedByType.set(card.type, arr);
    }
  });

  beforeMap.forEach((prev, key) => {
    if (!seenKeys.has(key)) {
      const arr = changedByType.get(prev.type) || [];
      arr.push({ before: prev, after: undefined, key });
      changedByType.set(prev.type, arr);
    }
  });

  return changedByType;
}

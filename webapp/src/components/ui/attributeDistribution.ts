export const DISTRIBUTION_UNALLOCATED_KEY = '__unallocated__' as const;

export interface DistributionBucket {
  key: string;
  label: string;
  kind: 'attribute' | 'unallocated';
}

export type AttributeDistributionValue = Record<string, number>;

export interface AttributeDistributionSummary {
  capacity: number;
  allocatedTotal: number;
  unallocatedCount: number;
  isOverallocated: boolean;
}

function clampToInt(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.round(value));
}

export function getAttributeDistributionBuckets(values: string[]): DistributionBucket[] {
  return [
    ...values.map((value) => ({ key: value, label: value, kind: 'attribute' as const })),
    { key: DISTRIBUTION_UNALLOCATED_KEY, label: 'Not allocated', kind: 'unallocated' as const },
  ];
}

export function normalizeAttributeDistributionValue(
  value: AttributeDistributionValue | undefined,
  buckets: DistributionBucket[],
): AttributeDistributionValue {
  const allowedKeys = new Set(buckets.filter((bucket) => bucket.kind === 'attribute').map((bucket) => bucket.key));
  const normalized: AttributeDistributionValue = {};

  Object.entries(value ?? {}).forEach(([key, raw]) => {
    if (!allowedKeys.has(key)) {
      return;
    }

    const count = clampToInt(raw);
    normalized[key] = count;
  });

  return normalized;
}

export function summarizeAttributeDistribution(
  value: AttributeDistributionValue | undefined,
  buckets: DistributionBucket[],
  capacity: number,
): AttributeDistributionSummary {
  const normalized = normalizeAttributeDistributionValue(value, buckets);
  const allocatedTotal = Object.values(normalized).reduce((sum, count) => sum + count, 0);
  const safeCapacity = clampToInt(capacity);

  return {
    capacity: safeCapacity,
    allocatedTotal,
    unallocatedCount: Math.max(safeCapacity - allocatedTotal, 0),
    isOverallocated: allocatedTotal > safeCapacity,
  };
}

export function getBarBucketCounts(
  buckets: DistributionBucket[],
  value: AttributeDistributionValue | undefined,
  capacity: number,
): number[] {
  const normalized = normalizeAttributeDistributionValue(value, buckets);
  const summary = summarizeAttributeDistribution(normalized, buckets, capacity);

  return buckets.map((bucket) => {
    if (bucket.kind === 'unallocated') {
      return summary.unallocatedCount;
    }

    return normalized[bucket.key] ?? 0;
  });
}

export function getDividerPositions(barBucketCounts: number[]): number[] {
  const positions: number[] = [];
  let running = 0;

  for (let index = 0; index < barBucketCounts.length - 1; index += 1) {
    running += clampToInt(barBucketCounts[index] ?? 0);
    positions.push(running);
  }

  return positions;
}

export function setAttributeBucketCount(
  value: AttributeDistributionValue | undefined,
  buckets: DistributionBucket[],
  key: string,
  nextCount: number,
): AttributeDistributionValue {
  const normalized = normalizeAttributeDistributionValue(value, buckets);
  const bucket = buckets.find((candidate) => candidate.key === key);

  if (!bucket || bucket.kind !== 'attribute') {
    return normalized;
  }

  const rounded = clampToInt(nextCount);
  normalized[key] = rounded;

  return normalized;
}

export function adjustAttributeBucketCount(
  value: AttributeDistributionValue | undefined,
  buckets: DistributionBucket[],
  key: string,
  delta: number,
): AttributeDistributionValue {
  const normalized = normalizeAttributeDistributionValue(value, buckets);
  return setAttributeBucketCount(normalized, buckets, key, (normalized[key] ?? 0) + delta);
}

export function moveDistributionDivider(
  value: AttributeDistributionValue | undefined,
  buckets: DistributionBucket[],
  dividerIndex: number,
  nextPosition: number,
  capacity: number,
): AttributeDistributionValue {
  const summary = summarizeAttributeDistribution(value, buckets, capacity);
  if (summary.isOverallocated) {
    return normalizeAttributeDistributionValue(value, buckets);
  }

  const barBucketCounts = getBarBucketCounts(buckets, value, capacity);
  if (dividerIndex < 0 || dividerIndex >= barBucketCounts.length - 1) {
    return normalizeAttributeDistributionValue(value, buckets);
  }

  const dividerPositions = getDividerPositions(barBucketCounts);
  const previousBound = dividerIndex === 0 ? 0 : dividerPositions[dividerIndex - 1] ?? 0;
  const nextBound = dividerPositions[dividerIndex + 1] ?? summary.capacity;
  const currentPosition = dividerPositions[dividerIndex] ?? 0;
  const boundedPosition = Math.min(nextBound, Math.max(previousBound, clampToInt(nextPosition)));
  const delta = boundedPosition - currentPosition;

  if (delta === 0) {
    return normalizeAttributeDistributionValue(value, buckets);
  }

  const nextCounts = [...barBucketCounts];
  nextCounts[dividerIndex] = clampToInt((nextCounts[dividerIndex] ?? 0) + delta);
  nextCounts[dividerIndex + 1] = clampToInt((nextCounts[dividerIndex + 1] ?? 0) - delta);

  const nextValue: AttributeDistributionValue = {};
  const explicitZeroKeys = new Set(
    Object.entries(normalizeAttributeDistributionValue(value, buckets))
      .filter(([, count]) => count === 0)
      .map(([key]) => key),
  );
  buckets.forEach((bucket, index) => {
    if (bucket.kind !== 'attribute') {
      return;
    }

    const count = clampToInt(nextCounts[index] ?? 0);
    const isAffectedBucket = index === dividerIndex || index === dividerIndex + 1;
    if (count > 0 || explicitZeroKeys.has(bucket.key) || isAffectedBucket) {
      nextValue[bucket.key] = count;
    }
  });

  return nextValue;
}

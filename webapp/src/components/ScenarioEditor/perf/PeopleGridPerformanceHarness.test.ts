import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('PeopleGridPerformanceHarness fixture', () => {
  it('keeps the public Sailing Trip perf fixture aligned with the canonical backend case', () => {
    const backendFixture = JSON.parse(
      readFileSync(resolve(process.cwd(), '../backend/benchmarking/cases/stretch/sailing_trip_demo_real.json'), 'utf-8'),
    );
    const publicFixture = JSON.parse(
      readFileSync(resolve(process.cwd(), 'public/perf/sailing_trip_demo_real.json'), 'utf-8'),
    );

    expect(publicFixture.id).toBe('stretch.sailing-trip-demo-real');
    expect(publicFixture).toEqual(backendFixture);
  });
});

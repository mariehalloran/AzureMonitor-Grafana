import { buildHealthTimeline, summarizeHealthStates } from './healthModelUtils';
import { EntityHealthTransition, HealthModelEntity } from './types';

describe('summarizeHealthStates', () => {
  test('counts documented states and groups missing or future values as unknown', () => {
    const entities: HealthModelEntity[] = [
      createEntity('healthy', 'Healthy'),
      createEntity('degraded', 'Degraded'),
      createEntity('unhealthy', 'Unhealthy'),
      createEntity('unknown', 'Unknown'),
      createEntity('future', 'Maintenance'),
      createEntity('missing'),
    ];

    expect(summarizeHealthStates(entities)).toEqual({
      healthy: 1,
      degraded: 1,
      unhealthy: 1,
      unknown: 3,
    });
  });
});

describe('buildHealthTimeline', () => {
  const startAt = '2026-08-31T00:00:00Z';
  const endAt = '2026-09-01T00:00:00Z';

  test('fills the full range with the current state when there are no transitions', () => {
    expect(buildHealthTimeline([], startAt, endAt, 'Healthy')).toEqual([
      {
        state: 'Healthy',
        startAt: Date.parse(startAt),
        endAt: Date.parse(endAt),
      },
    ]);
  });

  test('creates chronological state intervals from newest-first transitions', () => {
    const transitions: EntityHealthTransition[] = [
      createTransition('2026-08-31T18:00:00Z', 'Unhealthy', 'Healthy'),
      createTransition('2026-08-31T12:00:00Z', 'Degraded', 'Unhealthy'),
      createTransition('2026-08-31T06:00:00Z', 'Healthy', 'Degraded'),
    ];

    expect(buildHealthTimeline(transitions, startAt, endAt, 'Healthy')).toEqual([
      {
        state: 'Healthy',
        startAt: Date.parse(startAt),
        endAt: Date.parse('2026-08-31T06:00:00Z'),
      },
      {
        state: 'Degraded',
        startAt: Date.parse('2026-08-31T06:00:00Z'),
        endAt: Date.parse('2026-08-31T12:00:00Z'),
      },
      {
        state: 'Unhealthy',
        startAt: Date.parse('2026-08-31T12:00:00Z'),
        endAt: Date.parse('2026-08-31T18:00:00Z'),
      },
      {
        state: 'Healthy',
        startAt: Date.parse('2026-08-31T18:00:00Z'),
        endAt: Date.parse(endAt),
      },
    ]);
  });

  test('uses a transition at the range boundary and merges unchanged states', () => {
    const transitions: EntityHealthTransition[] = [
      createTransition(startAt, 'Healthy', 'Degraded'),
      createTransition('2026-08-31T12:00:00Z', 'Degraded', 'Degraded'),
    ];

    expect(buildHealthTimeline(transitions, startAt, endAt, 'Healthy')).toEqual([
      {
        state: 'Degraded',
        startAt: Date.parse(startAt),
        endAt: Date.parse(endAt),
      },
    ]);
  });
});

function createEntity(name: string, healthState?: string): HealthModelEntity {
  return {
    id: `/entities/${name}`,
    name,
    type: 'Microsoft.CloudHealth/healthmodels/entities',
    properties: {
      healthState,
    },
  };
}

function createTransition(occurredAt: string, previousState: string, newState: string): EntityHealthTransition {
  return {
    occurredAt,
    previousState,
    newState,
  };
}

import { describeSignals, formatRelativeTime, getEntityHealthMetrics } from './entityHealthMetrics';
import { HealthModelEntity } from './types';

function entity(properties: HealthModelEntity['properties']): HealthModelEntity {
  return {
    id: '/entities/example',
    name: 'example',
    type: 'Microsoft.CloudHealth/healthmodels/entities',
    properties,
  };
}

describe('getEntityHealthMetrics', () => {
  test('reads Azure Resource Health status, including availability and summary', () => {
    // Shape captured from a live Microsoft.CloudHealth response.
    const metrics = getEntityHealthMetrics(
      entity({
        signalGroups: {
          azureResource: {
            resourceHealth: {
              signalName: 'ResourceHealth-43d995c9',
              status: {
                healthState: 'Healthy',
                reportedAt: '2026-09-01T17:47:53.1899912+00:00',
                availabilityState: 'Available',
                summary: "There aren't any known problems affecting this account.",
              },
            },
          },
        },
      })
    );

    expect(metrics.lastCheckedAt).toBe('2026-09-01T17:47:53.1899912+00:00');
    expect(metrics.availabilityState).toBe('Available');
    expect(metrics.summary).toBe("There aren't any known problems affecting this account.");
    expect(metrics.signals).toHaveLength(1);
    expect(metrics.signals[0].name).toBe('ResourceHealth-43d995c9');
  });

  test('reads Log Analytics signals held in an array', () => {
    const metrics = getEntityHealthMetrics(
      entity({
        signalGroups: {
          azureLogAnalytics: {
            signals: [
              {
                displayName: 'Error rate',
                status: { healthState: 'Healthy', value: 0, reportedAt: '2026-09-01T17:51:03Z' },
              },
              {
                displayName: 'Latency',
                status: { healthState: 'Degraded', value: 42, reportedAt: '2026-09-01T17:51:05Z' },
              },
            ],
          },
        },
      })
    );

    expect(metrics.signals.map((signal) => signal.name)).toEqual(['Latency', 'Error rate']);
    expect(metrics.signals[0].value).toBe(42);
  });

  test('reports the most recent timestamp across signal groups as last checked', () => {
    const metrics = getEntityHealthMetrics(
      entity({
        signalGroups: {
          azureResource: {
            resourceHealth: { status: { healthState: 'Healthy', reportedAt: '2026-09-01T10:00:00Z' } },
          },
          azureLogAnalytics: {
            signals: [{ displayName: 'Newer', status: { healthState: 'Healthy', reportedAt: '2026-09-01T18:00:00Z' } }],
          },
        },
      })
    );

    expect(metrics.lastCheckedAt).toBe('2026-09-01T18:00:00Z');
  });

  test('returns empty metrics for a group that carries only configuration', () => {
    // `dependencies` describes aggregation rules and reports no status of its own.
    const metrics = getEntityHealthMetrics(
      entity({ signalGroups: { dependencies: { aggregationType: 'WorstOf', ignoreUnknown: true } } })
    );

    expect(metrics.signals).toEqual([]);
    expect(metrics.lastCheckedAt).toBeUndefined();
  });

  test('returns empty metrics when the entity has no signal groups', () => {
    const metrics = getEntityHealthMetrics(entity({ displayName: 'Root' }));

    expect(metrics.signals).toEqual([]);
    expect(metrics.lastCheckedAt).toBeUndefined();
    expect(metrics.alertSeverities).toEqual([]);
  });

  test('orders alert severities most severe first', () => {
    const metrics = getEntityHealthMetrics(
      entity({
        alerts: {
          unhealthy: { severity: 'Sev3' },
          degraded: { severity: 'Sev1' },
        },
      })
    );

    expect(metrics.alertSeverities).toEqual(['Sev1', 'Sev3']);
  });

  test('deduplicates repeated alert severities', () => {
    const metrics = getEntityHealthMetrics(
      entity({ alerts: { unhealthy: { severity: 'Sev1' }, degraded: { severity: 'Sev1' } } })
    );

    expect(metrics.alertSeverities).toEqual(['Sev1']);
  });

  test('keeps signals that report a health state without a timestamp', () => {
    const metrics = getEntityHealthMetrics(
      entity({ signalGroups: { custom: { probe: { status: { healthState: 'Unknown' } } } } })
    );

    expect(metrics.signals).toHaveLength(1);
    expect(metrics.signals[0].healthState).toBe('Unknown');
    expect(metrics.lastCheckedAt).toBeUndefined();
  });

  test('sorts timestamped signals ahead of undated ones', () => {
    const metrics = getEntityHealthMetrics(
      entity({
        signalGroups: {
          custom: {
            signals: [
              { displayName: 'Undated', status: { healthState: 'Unknown' } },
              { displayName: 'Dated', status: { healthState: 'Healthy', reportedAt: '2026-09-01T12:00:00Z' } },
            ],
          },
        },
      })
    );

    expect(metrics.signals[0].name).toBe('Dated');
    expect(metrics.lastCheckedAt).toBe('2026-09-01T12:00:00Z');
  });

  test('falls back to a readable label derived from the signal group key', () => {
    const metrics = getEntityHealthMetrics(
      entity({ signalGroups: { azureLogAnalytics: { status: { healthState: 'Healthy' } } } })
    );

    expect(metrics.signals[0].name).toBe('Azure log analytics');
  });
});

describe('describeSignals', () => {
  test('reports how many signals are healthy', () => {
    const metrics = getEntityHealthMetrics(
      entity({
        signalGroups: {
          custom: {
            signals: [
              { displayName: 'A', status: { healthState: 'Healthy', reportedAt: '2026-09-01T12:00:00Z' } },
              { displayName: 'B', status: { healthState: 'Unhealthy', reportedAt: '2026-09-01T12:00:00Z' } },
            ],
          },
        },
      })
    );

    expect(describeSignals(metrics)).toBe('1/2 healthy');
  });

  test('renders a placeholder when an entity reports no signals', () => {
    expect(describeSignals(getEntityHealthMetrics(entity({})))).toBe('--');
  });
});

describe('formatRelativeTime', () => {
  const now = Date.parse('2026-09-01T12:00:00Z');

  test.each([
    ['2026-09-01T11:59:30Z', 'just now'],
    ['2026-09-01T11:56:00Z', '4m ago'],
    ['2026-09-01T09:00:00Z', '3h ago'],
    ['2026-08-30T12:00:00Z', '2d ago'],
  ])('formats %s as %s', (timestamp, expected) => {
    expect(formatRelativeTime(timestamp, now)).toBe(expected);
  });

  test('treats a slightly future timestamp as just now rather than a negative age', () => {
    expect(formatRelativeTime('2026-09-01T12:00:30Z', now)).toBe('just now');
  });

  test('returns a placeholder for an unparseable timestamp', () => {
    expect(formatRelativeTime('not-a-date', now)).toBe('--');
  });
});

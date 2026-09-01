import { DataFrame } from '@grafana/data';
import { HealthModelEntity, HealthModelRelationship } from '../../components/SceneApp/HealthModels/types';
import { buildEntitiesFrame, buildNodeGraphFrames } from './frames';

function values(frame: DataFrame, fieldName: string): unknown[] {
  const field = frame.fields.find((candidate) => candidate.name === fieldName);
  if (!field) {
    throw new Error(`Expected a field named ${fieldName}. Got: ${frame.fields.map((f) => f.name).join(', ')}`);
  }
  return field.values.toArray ? field.values.toArray() : (field.values as unknown as unknown[]);
}

function entity(
  name: string,
  overrides: Partial<NonNullable<HealthModelEntity['properties']>> = {}
): HealthModelEntity {
  return {
    id: `/entities/${name}`,
    name,
    type: 'Microsoft.CloudHealth/healthmodels/entities',
    properties: {
      displayName: name,
      healthState: 'Healthy',
      impact: 'Standard',
      provisioningState: 'Succeeded',
      ...overrides,
    },
  };
}

function relationship(name: string, parent: string, child: string, displayName?: string): HealthModelRelationship {
  return {
    id: `/relationships/${name}`,
    name,
    type: 'Microsoft.CloudHealth/healthmodels/relationships',
    properties: {
      parentEntityName: parent,
      childEntityName: child,
      ...(displayName ? { displayName } : {}),
    },
  };
}

describe('buildEntitiesFrame', () => {
  test('exposes the entity name so relationships can be joined against it', () => {
    // The Grafana core Azure Monitor frame omits this, which makes its output unusable for graphs.
    const frame = buildEntitiesFrame([entity('root'), entity('child')]);

    expect(values(frame, 'name')).toEqual(['root', 'child']);
  });

  test('surfaces last checked from the nested signal status as a time field', () => {
    const frame = buildEntitiesFrame([
      entity('api', {
        signalGroups: {
          azureLogAnalytics: {
            signals: [{ displayName: 'Error rate', status: { healthState: 'Healthy', reportedAt: '2026-09-01T12:00:00Z' } }],
          },
        },
      }),
    ]);

    const field = frame.fields.find((f) => f.name === 'lastCheckedAt');
    expect(field?.type).toBe('time');
    expect(values(frame, 'lastCheckedAt')).toEqual([Date.parse('2026-09-01T12:00:00Z')]);
  });

  test('reports null last checked when an entity has no signals', () => {
    const frame = buildEntitiesFrame([entity('root')]);

    expect(values(frame, 'lastCheckedAt')).toEqual([null]);
  });

  test('counts healthy signals against the total', () => {
    const frame = buildEntitiesFrame([
      entity('api', {
        signalGroups: {
          custom: {
            signals: [
              { displayName: 'A', status: { healthState: 'Healthy', reportedAt: '2026-09-01T12:00:00Z' } },
              { displayName: 'B', status: { healthState: 'Unhealthy', reportedAt: '2026-09-01T12:00:00Z' } },
            ],
          },
        },
      }),
    ]);

    expect(values(frame, 'signalsHealthy')).toEqual([1]);
    expect(values(frame, 'signalsTotal')).toEqual([2]);
  });

  test('includes alert severities and availability', () => {
    const frame = buildEntitiesFrame([
      entity('db', {
        alerts: { unhealthy: { severity: 'Sev1' } },
        signalGroups: {
          azureResource: {
            resourceHealth: { status: { healthState: 'Healthy', availabilityState: 'Available' } },
          },
        },
      }),
    ]);

    expect(values(frame, 'alertSeverities')).toEqual(['Sev1']);
    expect(values(frame, 'availabilityState')).toEqual(['Available']);
  });
});

describe('buildNodeGraphFrames', () => {
  test('emits the fields Node Graph requires', () => {
    const { nodes, edges } = buildNodeGraphFrames([entity('root'), entity('child')], [relationship('r1', 'root', 'child')]);

    expect(nodes.fields.map((f) => f.name)).toEqual(expect.arrayContaining(['id', 'title', 'subtitle', 'mainstat']));
    expect(edges.fields.map((f) => f.name)).toEqual(expect.arrayContaining(['id', 'source', 'target']));
  });

  test('links edges to nodes by entity name', () => {
    const { nodes, edges } = buildNodeGraphFrames([entity('root'), entity('child')], [relationship('r1', 'root', 'child')]);

    expect(values(nodes, 'id')).toEqual(['root', 'child']);
    expect(values(edges, 'source')).toEqual(['root']);
    expect(values(edges, 'target')).toEqual(['child']);
  });

  test('keeps entities distinct when they share a display name', () => {
    // Real models do this, which is why displayName cannot be the node id.
    const { nodes } = buildNodeGraphFrames(
      [entity('foundry', { displayName: 'Shared' }), entity('foundry-example', { displayName: 'Shared' })],
      []
    );

    expect(values(nodes, 'id')).toEqual(['foundry', 'foundry-example']);
    expect(values(nodes, 'title')).toEqual(['Shared', 'Shared']);
  });

  test('drops edges whose endpoints are unknown and counts them', () => {
    const result = buildNodeGraphFrames(
      [entity('root')],
      [relationship('r1', 'root', 'missing'), relationship('r2', 'ghost', 'root')]
    );

    expect(values(result.edges, 'id')).toEqual([]);
    expect(result.danglingRelationships).toBe(2);
  });

  test('colours nodes by health state', () => {
    const { nodes } = buildNodeGraphFrames(
      [entity('a', { healthState: 'Healthy' }), entity('b', { healthState: 'Unhealthy' })],
      []
    );

    const colors = values(nodes, 'color') as string[];
    expect(colors[0]).not.toBe(colors[1]);
  });

  test('marks both frames as node graph data', () => {
    const { nodes, edges } = buildNodeGraphFrames([entity('a')], []);

    expect(nodes.meta?.preferredVisualisationType).toBe('nodeGraph');
    expect(edges.meta?.preferredVisualisationType).toBe('nodeGraph');
  });

  test('summarises signal counts in the node main stat', () => {
    const { nodes } = buildNodeGraphFrames(
      [
        entity('api', {
          signalGroups: {
            custom: {
              signals: [
                { displayName: 'A', status: { healthState: 'Healthy', reportedAt: '2026-09-01T12:00:00Z' } },
                { displayName: 'B', status: { healthState: 'Unhealthy', reportedAt: '2026-09-01T12:00:00Z' } },
              ],
            },
          },
        }),
      ],
      []
    );

    expect(values(nodes, 'mainstat')).toEqual(['1/2 signals']);
  });
});


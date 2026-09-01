import { FieldType, toDataFrame } from '@grafana/data';
import { framesToHealthGraphInput } from './framesToEntities';

function nodesFrame(rows: Array<{ id: string; title?: string; subtitle?: string; icon?: string }>, name = 'nodes') {
  return toDataFrame({
    name,
    fields: [
      { name: 'id', type: FieldType.string, values: rows.map((r) => r.id) },
      { name: 'title', type: FieldType.string, values: rows.map((r) => r.title ?? '') },
      { name: 'subtitle', type: FieldType.string, values: rows.map((r) => r.subtitle ?? '') },
      { name: 'icon', type: FieldType.string, values: rows.map((r) => r.icon ?? '') },
    ],
  });
}

function edgesFrame(rows: Array<{ id?: string; source: string; target: string; mainstat?: string }>, name = 'edges') {
  return toDataFrame({
    name,
    fields: [
      { name: 'id', type: FieldType.string, values: rows.map((r) => r.id ?? '') },
      { name: 'source', type: FieldType.string, values: rows.map((r) => r.source) },
      { name: 'target', type: FieldType.string, values: rows.map((r) => r.target) },
      { name: 'mainstat', type: FieldType.string, values: rows.map((r) => r.mainstat ?? '') },
    ],
  });
}

describe('framesToHealthGraphInput', () => {
  test('rebuilds entities and relationships from node graph frames', () => {
    const { entities, relationships } = framesToHealthGraphInput([
      nodesFrame([
        { id: 'root', title: 'Root entity', subtitle: 'Healthy' },
        { id: 'child', title: 'Child entity', subtitle: 'Degraded' },
      ]),
      edgesFrame([{ id: 'r1', source: 'root', target: 'child', mainstat: 'Root to child' }]),
    ]);

    expect(entities.map((e) => e.name)).toEqual(['root', 'child']);
    expect(entities[1].properties?.healthState).toBe('Degraded');
    expect(relationships[0].properties).toMatchObject({
      parentEntityName: 'root',
      childEntityName: 'child',
      displayName: 'Root to child',
    });
  });

  test('carries the entity icon through so the graph can render it', () => {
    const { entities } = framesToHealthGraphInput([nodesFrame([{ id: 'api', title: 'API', icon: 'AppService' }])]);

    expect((entities[0].properties as { icon?: { iconName?: string } }).icon?.iconName).toBe('AppService');
  });

  test('falls back to the entity id when a title is missing', () => {
    const { entities } = framesToHealthGraphInput([nodesFrame([{ id: 'orphan' }])]);

    expect(entities[0].properties?.displayName).toBe('orphan');
    expect(entities[0].properties?.healthState).toBe('Unknown');
  });

  test('matches frames by their fields when they have been renamed', () => {
    // A transformation can rename a frame while leaving its fields intact.
    const { entities, relationships } = framesToHealthGraphInput([
      nodesFrame([{ id: 'a', title: 'A' }], 'renamed-nodes'),
      edgesFrame([{ source: 'a', target: 'a' }], 'renamed-edges'),
    ]);

    expect(entities).toHaveLength(1);
    expect(relationships).toHaveLength(1);
  });

  test('returns empty input when the frames are not node graph shaped', () => {
    const unrelated = toDataFrame({ name: 'other', fields: [{ name: 'value', type: FieldType.number, values: [1] }] });

    expect(framesToHealthGraphInput([unrelated])).toEqual({ entities: [], relationships: [] });
  });

  test('returns empty input when there are no frames at all', () => {
    expect(framesToHealthGraphInput([])).toEqual({ entities: [], relationships: [] });
  });

  test('tolerates a nodes frame with no matching edges frame', () => {
    const { entities, relationships } = framesToHealthGraphInput([nodesFrame([{ id: 'solo', title: 'Solo' }])]);

    expect(entities).toHaveLength(1);
    expect(relationships).toEqual([]);
  });

  test('synthesises a relationship id when the edges frame omits one', () => {
    const { relationships } = framesToHealthGraphInput([
      nodesFrame([{ id: 'a' }, { id: 'b' }]),
      edgesFrame([{ source: 'a', target: 'b' }]),
    ]);

    expect(relationships[0].name).toBe('a->b');
  });
});

function entitiesFrame(rows: Array<{ name: string; displayName?: string; healthState?: string; icon?: string }>) {
  return toDataFrame({
    name: 'Entities',
    fields: [
      { name: 'name', type: FieldType.string, values: rows.map((r) => r.name) },
      { name: 'displayName', type: FieldType.string, values: rows.map((r) => r.displayName ?? '') },
      { name: 'healthState', type: FieldType.string, values: rows.map((r) => r.healthState ?? '') },
      { name: 'icon', type: FieldType.string, values: rows.map((r) => r.icon ?? '') },
    ],
  });
}

describe('framesToHealthGraphInput with the Entities format', () => {
  test('renders entities when the query returns a table instead of node graph frames', () => {
    const { entities, relationships } = framesToHealthGraphInput([
      entitiesFrame([
        { name: 'root', displayName: 'Root', healthState: 'Healthy' },
        { name: 'api', displayName: 'API', healthState: 'Degraded', icon: 'AppService' },
      ]),
    ]);

    expect(entities.map((e) => e.name)).toEqual(['root', 'api']);
    expect(entities[1].properties?.healthState).toBe('Degraded');
    // The Entities shape carries no parent/child pairs, so the graph has no edges to draw.
    expect(relationships).toEqual([]);
  });

  test('carries the hidden icon field through from the entities table', () => {
    const { entities } = framesToHealthGraphInput([entitiesFrame([{ name: 'api', icon: 'AppService' }])]);

    expect((entities[0].properties as { icon?: { iconName?: string } }).icon?.iconName).toBe('AppService');
  });

  test('prefers node graph frames when both shapes are present', () => {
    const { entities, relationships } = framesToHealthGraphInput([
      entitiesFrame([{ name: 'from-table', displayName: 'From table' }]),
      nodesFrame([{ id: 'from-nodes', title: 'From nodes' }]),
      edgesFrame([{ source: 'from-nodes', target: 'from-nodes' }]),
    ]);

    expect(entities.map((e) => e.name)).toEqual(['from-nodes']);
    expect(relationships).toHaveLength(1);
  });

  test('falls back to the entity name when the table has no display name', () => {
    const { entities } = framesToHealthGraphInput([entitiesFrame([{ name: 'bare' }])]);

    expect(entities[0].properties?.displayName).toBe('bare');
    expect(entities[0].properties?.healthState).toBe('Unknown');
  });
});

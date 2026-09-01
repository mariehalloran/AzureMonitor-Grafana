import { HealthModelEntity, HealthModelRelationship } from './types';
import { buildHealthGraph, DEFAULT_HEALTH_GRAPH_LAYOUT } from './healthGraph';

describe('buildHealthGraph', () => {
  test('nests children below their parent and centres the parent over them', () => {
    const layout = buildHealthGraph(
      [createEntity('root'), createEntity('left'), createEntity('right')],
      [createRelationship('r1', 'root', 'left'), createRelationship('r2', 'root', 'right')]
    );

    const root = findNode(layout, 'root');
    const left = findNode(layout, 'left');
    const right = findNode(layout, 'right');

    expect(root.depth).toBe(0);
    expect(left.depth).toBe(1);
    expect(right.depth).toBe(1);
    expect(left.y).toBeGreaterThan(root.y);

    const rootCentre = root.x + DEFAULT_HEALTH_GRAPH_LAYOUT.nodeWidth / 2;
    const leftCentre = left.x + DEFAULT_HEALTH_GRAPH_LAYOUT.nodeWidth / 2;
    const rightCentre = right.x + DEFAULT_HEALTH_GRAPH_LAYOUT.nodeWidth / 2;
    expect(rootCentre).toBeCloseTo((leftCentre + rightCentre) / 2);
  });

  test('uses the relationship display name as the edge label', () => {
    const layout = buildHealthGraph(
      [createEntity('root'), createEntity('child')],
      [createRelationship('r1', 'root', 'child', 'Root to child')]
    );

    expect(layout.edges).toHaveLength(1);
    expect(layout.edges[0].label).toBe('Root to child');
  });

  test('falls back to the relationship name when no display name is present', () => {
    const layout = buildHealthGraph(
      [createEntity('root'), createEntity('child')],
      [createRelationship('r1', 'root', 'child')]
    );

    expect(layout.edges[0].label).toBe('r1');
  });

  test('treats entities without a parent as roots, including unrelated orphans', () => {
    const layout = buildHealthGraph(
      [createEntity('root'), createEntity('child'), createEntity('orphan')],
      [createRelationship('r1', 'root', 'child')]
    );

    expect(findNode(layout, 'root').depth).toBe(0);
    expect(findNode(layout, 'orphan').depth).toBe(0);
    expect(findNode(layout, 'child').depth).toBe(1);
  });

  test('counts relationships that reference unknown entities without placing them', () => {
    const layout = buildHealthGraph(
      [createEntity('root')],
      [createRelationship('r1', 'root', 'missing'), createRelationship('r2', 'ghost', 'root')]
    );

    expect(layout.danglingRelationships).toBe(2);
    expect(layout.nodes).toHaveLength(1);
    expect(layout.edges).toHaveLength(0);
  });

  test('keeps a single parent when several relationships claim the same child', () => {
    const layout = buildHealthGraph(
      [createEntity('a'), createEntity('b'), createEntity('shared')],
      [createRelationship('r1', 'a', 'shared'), createRelationship('r2', 'b', 'shared')]
    );

    expect(layout.nodes.filter((node) => node.name === 'shared')).toHaveLength(1);
    expect(layout.edges).toHaveLength(1);
    expect(layout.edges[0].parentName).toBe('a');
  });

  test('terminates and places every entity when relationships form a cycle', () => {
    const layout = buildHealthGraph(
      [createEntity('a'), createEntity('b'), createEntity('c')],
      [createRelationship('r1', 'a', 'b'), createRelationship('r2', 'b', 'c'), createRelationship('r3', 'c', 'a')]
    );

    expect(layout.nodes).toHaveLength(3);
    expect(new Set(layout.nodes.map((node) => node.name))).toEqual(new Set(['a', 'b', 'c']));
  });

  test('ignores a relationship that points an entity at itself', () => {
    const layout = buildHealthGraph([createEntity('a')], [createRelationship('r1', 'a', 'a')]);

    expect(layout.nodes).toHaveLength(1);
    expect(layout.edges).toHaveLength(0);
  });

  test('staggers adjacent sibling labels so they do not overlap', () => {
    const layout = buildHealthGraph(
      [createEntity('root'), createEntity('a'), createEntity('b')],
      [createRelationship('r1', 'root', 'a'), createRelationship('r2', 'root', 'b')]
    );

    const [first, second] = layout.edges;
    expect(first.labelY).not.toBe(second.labelY);
  });

  test('staggers labels by rendered position, not by relationship order', () => {
    // Relationship names sort in the opposite order to the entity display names, so an
    // insertion-ordered stagger would place two horizontally adjacent labels at the same height.
    const layout = buildHealthGraph(
      [createEntity('root'), createEntity('a', 'Healthy'), createEntity('b'), createEntity('c')],
      [
        createRelationship('r3', 'root', 'a'),
        createRelationship('r2', 'root', 'b'),
        createRelationship('r1', 'root', 'c'),
      ]
    );

    const orderedByX = layout.edges
      .map((edge) => ({
        x: layout.nodes.find((node) => node.name === edge.childName)!.x,
        labelY: edge.labelY,
      }))
      .sort((left, right) => left.x - right.x);

    for (let index = 1; index < orderedByX.length; index++) {
      expect(orderedByX[index].labelY).not.toBe(orderedByX[index - 1].labelY);
    }
  });

  test('carries entity health state and icon onto the node', () => {
    const layout = buildHealthGraph([createEntity('root', 'Degraded', 'AppService')], []);

    const root = findNode(layout, 'root');
    expect(root.healthState).toBe('Degraded');
    expect(root.iconName).toBe('AppService');
  });

  test('returns an empty layout when there are no entities', () => {
    const layout = buildHealthGraph([], []);

    expect(layout.nodes).toEqual([]);
    expect(layout.edges).toEqual([]);
    expect(layout.width).toBe(0);
    expect(layout.height).toBe(0);
  });
});

function findNode(layout: ReturnType<typeof buildHealthGraph>, name: string) {
  const node = layout.nodes.find((candidate) => candidate.name === name);
  if (!node) {
    throw new Error(`Expected a node named ${name}.`);
  }
  return node;
}

function createEntity(name: string, healthState = 'Healthy', iconName?: string): HealthModelEntity {
  return {
    id: `/entities/${name}`,
    name,
    type: 'Microsoft.CloudHealth/healthmodels/entities',
    properties: {
      displayName: name,
      healthState,
      ...(iconName ? { icon: { iconName } } : {}),
    },
  };
}

function createRelationship(
  name: string,
  parentEntityName: string,
  childEntityName: string,
  displayName?: string
): HealthModelRelationship {
  return {
    id: `/relationships/${name}`,
    name,
    type: 'Microsoft.CloudHealth/healthmodels/relationships',
    properties: {
      parentEntityName,
      childEntityName,
      ...(displayName ? { displayName } : {}),
    },
  };
}

import { DataFrame, Field } from '@grafana/data';
import { HealthModelEntity, HealthModelRelationship } from '../../components/SceneApp/HealthModels/types';

export interface HealthGraphInput {
  entities: HealthModelEntity[];
  relationships: HealthModelRelationship[];
}

/**
 * Rebuilds Health Model entities and relationships from the node graph frames produced by the
 * Azure Health Models data source.
 *
 * A panel only ever receives data frames, so the graph layout — which is shared with the app's
 * Health Models page and works in terms of entities — needs the frames mapped back to that shape.
 * Frames are matched by name (`nodes` / `edges`) with a field-based fallback, because transformations
 * can rename a frame while leaving its fields intact.
 */
export function framesToHealthGraphInput(series: DataFrame[]): HealthGraphInput {
  const nodesFrame = findFrame(series, 'nodes', ['id', 'title']);
  const edgesFrame = findFrame(series, 'edges', ['source', 'target']);

  if (nodesFrame) {
    return {
      entities: toEntities(nodesFrame),
      relationships: edgesFrame ? toRelationships(edgesFrame) : [],
    };
  }

  // Fall back to the Entities format so the panel still renders when the query is set to return a
  // table. That shape carries no relationships, so every entity is drawn as its own root rather
  // than the panel showing nothing at all.
  const entitiesFrame = findFrame(series, 'Entities', ['name', 'displayName', 'healthState']);
  return {
    entities: entitiesFrame ? fromEntitiesFrame(entitiesFrame) : [],
    relationships: [],
  };
}

function findFrame(series: DataFrame[], name: string, requiredFields: string[]): DataFrame | undefined {
  const byName = series.find((frame) => frame.name === name);
  if (byName) {
    return byName;
  }

  return series.find((frame) => requiredFields.every((field) => frame.fields.some((f) => f.name === field)));
}

function toEntities(frame: DataFrame): HealthModelEntity[] {
  const ids = readStrings(frame, 'id');
  const titles = readStrings(frame, 'title');
  const subtitles = readStrings(frame, 'subtitle');
  const icons = readStrings(frame, 'icon');

  return ids.map((id, index) => ({
    id,
    name: id,
    type: 'Microsoft.CloudHealth/healthmodels/entities',
    properties: {
      displayName: titles[index] || id,
      healthState: subtitles[index] || 'Unknown',
      ...(icons[index] ? { icon: { iconName: icons[index] } } : {}),
    },
  }));
}

function toRelationships(frame: DataFrame): HealthModelRelationship[] {  const ids = readStrings(frame, 'id');
  const sources = readStrings(frame, 'source');
  const targets = readStrings(frame, 'target');
  const labels = readStrings(frame, 'mainstat');

  return sources.map((source, index) => ({
    id: ids[index] || `${source}->${targets[index]}`,
    name: ids[index] || `${source}->${targets[index]}`,
    type: 'Microsoft.CloudHealth/healthmodels/relationships',
    properties: {
      parentEntityName: source,
      childEntityName: targets[index],
      ...(labels[index] ? { displayName: labels[index] } : {}),
    },
  }));
}

/** Maps the data source's Entities table back to entity objects, without relationships. */
function fromEntitiesFrame(frame: DataFrame): HealthModelEntity[] {
  const names = readStrings(frame, 'name');
  const displayNames = readStrings(frame, 'displayName');
  const healthStates = readStrings(frame, 'healthState');
  const icons = readStrings(frame, 'icon');

  return names.map((name, index) => ({
    id: name,
    name,
    type: 'Microsoft.CloudHealth/healthmodels/entities',
    properties: {
      displayName: displayNames[index] || name,
      healthState: healthStates[index] || 'Unknown',
      ...(icons[index] ? { icon: { iconName: icons[index] } } : {}),
    },
  }));
}

function readStrings(frame: DataFrame, fieldName: string): string[] {
  const field: Field | undefined = frame.fields.find((candidate) => candidate.name === fieldName);
  if (!field) {
    return [];
  }

  const values = field.values.toArray ? field.values.toArray() : (field.values as unknown as unknown[]);
  return values.map((value) => (typeof value === 'string' ? value : value == null ? '' : String(value)));
}

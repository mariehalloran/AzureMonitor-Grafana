import { DataFrame, FieldType, MappingType, toDataFrame } from '@grafana/data';
import { getEntityHealthMetrics } from '../../components/SceneApp/HealthModels/entityHealthMetrics';
import { HealthModelEntity, HealthModelRelationship } from '../../components/SceneApp/HealthModels/types';

/**
 * Health state colours. These are fixed rather than theme-derived because a data source builds
 * frames outside React and has no access to the Grafana theme.
 */
const HEALTH_STATE_COLORS: Record<string, string> = {
  healthy: '#3FB950',
  degraded: '#D29922',
  unhealthy: '#F85149',
  unknown: '#8B949E',
};

export function getHealthStateColor(healthState: string): string {
  return HEALTH_STATE_COLORS[healthState.toLowerCase()] ?? HEALTH_STATE_COLORS.unknown;
}

const HEALTH_STATE_MAPPINGS = [
  {
    type: MappingType.ValueToText as const,
    options: {
      Healthy: { text: 'Healthy', color: 'green' },
      Degraded: { text: 'Degraded', color: 'orange' },
      Unhealthy: { text: 'Unhealthy', color: 'red' },
      Unknown: { text: 'Unknown', color: 'text' },
    },
  },
];

/**
 * Builds a table of entities including the health telemetry that the entity list itself only
 * carries inside the nested `signalGroups` structure.
 */
export function buildEntitiesFrame(entities: HealthModelEntity[]): DataFrame {
  const metrics = entities.map((entity) => getEntityHealthMetrics(entity));

  return toDataFrame({
    name: 'Entities',
    refId: 'entities',
    meta: { preferredVisualisationType: 'table' },
    fields: [
      {
        name: 'name',
        type: FieldType.string,
        values: entities.map((entity) => entity.name),
        config: { displayName: 'Entity', custom: { hidden: true } },
      },
      {
        // Hidden from tables, but lets the graph panel draw the right entity icon when this
        // frame is the only one available.
        name: 'icon',
        type: FieldType.string,
        values: entities.map((entity) => readIconName(entity) ?? ''),
        config: { custom: { hidden: true } },
      },
      {
        name: 'displayName',
        type: FieldType.string,
        values: entities.map((entity) => entity.properties?.displayName ?? entity.name),
        config: { displayName: 'Entity' },
      },
      {
        name: 'healthState',
        type: FieldType.string,
        values: entities.map((entity) => entity.properties?.healthState ?? 'Unknown'),
        config: { displayName: 'Health state', mappings: HEALTH_STATE_MAPPINGS },
      },
      {
        // A real time field lets Grafana render this with the dashboard's timezone and unit rules.
        name: 'lastCheckedAt',
        type: FieldType.time,
        values: metrics.map((metric) => toTimestamp(metric.lastCheckedAt)),
        config: { displayName: 'Last checked' },
      },
      {
        name: 'signalsHealthy',
        type: FieldType.number,
        values: metrics.map((metric) => metric.signals.filter((s) => s.healthState?.toLowerCase() === 'healthy').length),
        config: { displayName: 'Healthy signals' },
      },
      {
        name: 'signalsTotal',
        type: FieldType.number,
        values: metrics.map((metric) => metric.signals.length),
        config: { displayName: 'Total signals' },
      },
      {
        name: 'availabilityState',
        type: FieldType.string,
        values: metrics.map((metric) => metric.availabilityState ?? null),
        config: { displayName: 'Availability' },
      },
      {
        name: 'alertSeverities',
        type: FieldType.string,
        values: metrics.map((metric) => (metric.alertSeverities.length ? metric.alertSeverities.join(', ') : null)),
        config: { displayName: 'Alerts' },
      },
      {
        name: 'impact',
        type: FieldType.string,
        values: entities.map((entity) => entity.properties?.impact ?? null),
        config: { displayName: 'Impact' },
      },
      {
        name: 'healthObjective',
        type: FieldType.number,
        values: entities.map((entity) => entity.properties?.healthObjective ?? null),
        config: { displayName: 'Health objective', unit: 'percent' },
      },
      {
        name: 'provisioningState',
        type: FieldType.string,
        values: entities.map((entity) => entity.properties?.provisioningState ?? null),
        config: { displayName: 'Provisioning state' },
      },
    ],
  });
}

export interface NodeGraphFrames {
  nodes: DataFrame;
  edges: DataFrame;
  /** Relationships dropped because an endpoint is not part of the entity list. */
  danglingRelationships: number;
}

/**
 * Builds the two frames Grafana's Node Graph panel expects: nodes keyed by `id`, and edges
 * referencing those ids through `source` and `target`.
 *
 * Entities are keyed by `name` rather than `displayName` because relationships reference names,
 * and display names are not unique within a model.
 */
export function buildNodeGraphFrames(
  entities: HealthModelEntity[],
  relationships: HealthModelRelationship[]
): NodeGraphFrames {
  const knownNames = new Set(entities.map((entity) => entity.name));
  const metricsByName = new Map(entities.map((entity) => [entity.name, getEntityHealthMetrics(entity)]));

  const edgeIds: string[] = [];
  const sources: string[] = [];
  const targets: string[] = [];
  const edgeLabels: string[] = [];
  let danglingRelationships = 0;

  for (const relationship of relationships) {
    const source = relationship.properties?.parentEntityName;
    const target = relationship.properties?.childEntityName;

    // Node Graph drops or misrenders edges pointing at unknown ids, so filter them out and
    // report the count instead.
    if (!source || !target || !knownNames.has(source) || !knownNames.has(target)) {
      danglingRelationships++;
      continue;
    }

    edgeIds.push(relationship.name);
    sources.push(source);
    targets.push(target);
    edgeLabels.push(relationship.properties?.displayName ?? relationship.name);
  }

  const nodes = toDataFrame({
    name: 'nodes',
    refId: 'nodes',
    meta: { preferredVisualisationType: 'nodeGraph' },
    fields: [
      { name: 'id', type: FieldType.string, values: entities.map((entity) => entity.name) },
      {
        name: 'title',
        type: FieldType.string,
        values: entities.map((entity) => entity.properties?.displayName ?? entity.name),
      },
      {
        name: 'subtitle',
        type: FieldType.string,
        values: entities.map((entity) => entity.properties?.healthState ?? 'Unknown'),
      },
      {
        name: 'mainstat',
        type: FieldType.string,
        values: entities.map((entity) => {
          const metric = metricsByName.get(entity.name);
          return metric && metric.signals.length > 0
            ? `${metric.signals.filter((s) => s.healthState?.toLowerCase() === 'healthy').length}/${
                metric.signals.length
              } signals`
            : (entity.properties?.healthState ?? 'Unknown');
        }),
      },
      {
        name: 'color',
        type: FieldType.string,
        values: entities.map((entity) => getHealthStateColor(entity.properties?.healthState ?? 'Unknown')),
      },
      {
        // Ignored by Grafana's Node Graph, but lets our own graph panel draw the entity icon.
        name: 'icon',
        type: FieldType.string,
        values: entities.map((entity) => readIconName(entity) ?? ''),
      },
      {
        name: 'detail__impact',
        type: FieldType.string,
        values: entities.map((entity) => entity.properties?.impact ?? '--'),
        config: { displayName: 'Impact' },
      },
      {
        name: 'detail__alerts',
        type: FieldType.string,
        values: entities.map((entity) => metricsByName.get(entity.name)?.alertSeverities.join(', ') || '--'),
        config: { displayName: 'Alerts' },
      },
    ],
  });

  const edges = toDataFrame({
    name: 'edges',
    refId: 'edges',
    meta: { preferredVisualisationType: 'nodeGraph' },
    fields: [
      { name: 'id', type: FieldType.string, values: edgeIds },
      { name: 'source', type: FieldType.string, values: sources },
      { name: 'target', type: FieldType.string, values: targets },
      { name: 'mainstat', type: FieldType.string, values: edgeLabels },
    ],
  });

  return { nodes, edges, danglingRelationships };
}


function toTimestamp(value?: string): number | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function readIconName(entity: HealthModelEntity): string | undefined {
  const icon = (entity.properties as { icon?: { iconName?: string } } | undefined)?.icon;
  return typeof icon?.iconName === 'string' ? icon.iconName : undefined;
}

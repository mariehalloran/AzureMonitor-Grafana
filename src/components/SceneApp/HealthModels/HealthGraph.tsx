import { css } from '@emotion/css';
import { GrafanaTheme2, IconName } from '@grafana/data';
import { Alert, Icon, useStyles2, useTheme2 } from '@grafana/ui';
import React from 'react';
import { getHealthStateColor } from './HealthTimelineBar';
import {
  buildHealthGraph,
  HealthGraphEdge,
  HealthGraphLayoutOptions,
  HealthGraphNode,
} from './healthGraph';
import { HealthModelEntity, HealthModelRelationship } from './types';

const CANVAS_PADDING = 16;
const MAX_CANVAS_HEIGHT = 620;

interface HealthGraphProps {
  entities: HealthModelEntity[];
  relationships: HealthModelRelationship[];
}

/**
 * Draws Health Model entities as a top-down graph, with each entity coloured by its health state
 * and connected to its children through elbow connectors.
 */
export function HealthGraph({ entities, relationships }: HealthGraphProps) {
  const styles = useStyles2(getStyles);
  const theme = useTheme2();
  const layout = React.useMemo(() => buildHealthGraph(entities, relationships), [entities, relationships]);

  if (layout.nodes.length === 0) {
    return null;
  }

  const canvasWidth = layout.width + CANVAS_PADDING * 2;
  const canvasHeight = layout.height + CANVAS_PADDING * 2;
  // Deep models are scaled down so the whole graph stays visible without the page growing
  // unbounded. The canvas is never enlarged, so a small model keeps its designed proportions.
  const scale = Math.min(1, MAX_CANVAS_HEIGHT / canvasHeight);

  return (
    <div className={styles.container}>
      {layout.danglingRelationships > 0 && (
        <Alert title="Some relationships were skipped" severity="info">
          {layout.danglingRelationships} relationship(s) reference an entity that is not part of this Health Model.
        </Alert>
      )}
      <div className={styles.scrollArea}>
        <div
          className={styles.canvas}
          style={{
            width: canvasWidth,
            height: canvasHeight,
            transform: `scale(${scale})`,
          }}
        >
          <svg className={styles.connectors} width={canvasWidth} height={canvasHeight} aria-hidden="true">
            {layout.edges.map((edge) => (
              <path
                key={edge.id}
                d={buildConnectorPath(edge)}
                fill="none"
                stroke={theme.colors.border.medium}
                strokeWidth={1}
              />
            ))}
          </svg>

          {layout.edges
            .filter((edge) => edge.label)
            .map((edge) => (
              <div
                key={`${edge.id}-label`}
                className={styles.edgeLabel}
                style={{
                  left: edge.labelX + CANVAS_PADDING,
                  top: edge.labelY + CANVAS_PADDING,
                }}
                title={edge.label}
              >
                {edge.label}
              </div>
            ))}

          {layout.nodes.map((node) => (
            <EntityCard key={node.name} node={node} layoutOptions={layout.options} />
          ))}
        </div>
      </div>
    </div>
  );
}

function EntityCard({ node, layoutOptions }: { node: HealthGraphNode; layoutOptions: HealthGraphLayoutOptions }) {
  const styles = useStyles2(getStyles);
  const theme = useTheme2();
  const healthState = node.healthState ?? 'Unknown';
  const healthColor = getHealthStateColor(theme, healthState);

  return (
    <div
      className={styles.node}
      style={{
        left: node.x + CANVAS_PADDING,
        top: node.y + CANVAS_PADDING,
        width: layoutOptions.nodeWidth,
        height: layoutOptions.nodeHeight,
        borderColor: healthColor,
      }}
      aria-label={`${node.displayName}, health state ${healthState}`}
      title={`${node.displayName} — ${healthState}`}
    >
      <div className={styles.nodeHeader}>
        <Icon name={getEntityIcon(node.iconName)} size="lg" className={styles.nodeIcon} />
        <span className={styles.nodeTitle}>{node.displayName}</span>
      </div>
      <div className={styles.nodeFooter}>
        <Icon name={getHealthIcon(healthState)} style={{ color: healthColor }} />
        <span className={styles.nodeHealthText}>{healthState}</span>
      </div>
    </div>
  );
}

// Draws the parent-to-child connector as a vertical drop, a horizontal run, and a second drop so
// that sibling edges do not cross one another.
export function buildConnectorPath(edge: HealthGraphEdge): string {
  const parentX = edge.parentX + CANVAS_PADDING;
  const parentY = edge.parentY + CANVAS_PADDING;
  const childX = edge.childX + CANVAS_PADDING;
  const childY = edge.childY + CANVAS_PADDING;
  const elbowY = edge.elbowY + CANVAS_PADDING;

  if (Math.abs(parentX - childX) < 0.5) {
    return `M ${parentX} ${parentY} L ${parentX} ${childY}`;
  }

  return `M ${parentX} ${parentY} L ${parentX} ${elbowY} L ${childX} ${elbowY} L ${childX} ${childY}`;
}

export function getEntityIcon(iconName?: string): IconName {
  switch (iconName?.toLowerCase()) {
    case 'appservice':
      return 'cloud';
    case 'systemcomponent':
      return 'sitemap';
    case 'database':
      return 'database';
    default:
      return 'cube';
  }
}

export function getHealthIcon(healthState: string): IconName {
  switch (healthState.toLowerCase()) {
    case 'healthy':
      return 'check-circle';
    case 'degraded':
      return 'exclamation-triangle';
    case 'unhealthy':
      return 'times-circle';
    default:
      return 'question-circle';
  }
}

function getStyles(theme: GrafanaTheme2) {
  return {
    container: css({
      display: 'flex',
      flexDirection: 'column',
      gap: theme.spacing(1),
    }),
    scrollArea: css({
      overflow: 'auto',
    }),
    canvas: css({
      position: 'relative',
      transformOrigin: 'top left',
    }),
    connectors: css({
      position: 'absolute',
      top: 0,
      left: 0,
      pointerEvents: 'none',
    }),
    node: css({
      position: 'absolute',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      background: theme.colors.background.primary,
      border: `1px solid ${theme.colors.border.medium}`,
      borderRadius: theme.shape.radius.default,
      overflow: 'hidden',
    }),
    nodeHeader: css({
      display: 'flex',
      alignItems: 'center',
      gap: theme.spacing(1),
      padding: theme.spacing(1, 1.5),
      minHeight: 0,
      flex: 1,
    }),
    nodeIcon: css({
      flex: '0 0 auto',
      color: theme.colors.text.secondary,
    }),
    nodeTitle: css({
      display: '-webkit-box',
      WebkitLineClamp: 2,
      WebkitBoxOrient: 'vertical',
      overflow: 'hidden',
      color: theme.colors.text.primary,
      fontSize: theme.typography.bodySmall.fontSize,
      lineHeight: theme.typography.bodySmall.lineHeight,
      wordBreak: 'break-word',
    }),
    nodeFooter: css({
      display: 'flex',
      alignItems: 'center',
      gap: theme.spacing(0.75),
      padding: theme.spacing(0.5, 1.5),
      borderTop: `1px solid ${theme.colors.border.weak}`,
    }),
    nodeHealthText: css({
      color: theme.colors.text.secondary,
      fontSize: theme.typography.bodySmall.fontSize,
    }),
    edgeLabel: css({
      position: 'absolute',
      transform: 'translate(-50%, -50%)',
      maxWidth: 190,
      padding: theme.spacing(0.25, 0.75),
      background: theme.colors.background.secondary,
      border: `1px solid ${theme.colors.border.weak}`,
      borderRadius: theme.shape.radius.default,
      color: theme.colors.text.secondary,
      fontSize: theme.typography.bodySmall.fontSize,
      lineHeight: 1.3,
      textAlign: 'center',
      pointerEvents: 'none',
      overflow: 'hidden',
      display: '-webkit-box',
      WebkitLineClamp: 3,
      WebkitBoxOrient: 'vertical',
    }),
  };
}

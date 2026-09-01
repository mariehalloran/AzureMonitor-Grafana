import { css } from '@emotion/css';
import { GrafanaTheme2, IconName, PanelProps } from '@grafana/data';
import { Alert, Icon, Spinner, useStyles2, useTheme2 } from '@grafana/ui';
import React from 'react';
import { getHealthStateColor } from '../../components/SceneApp/HealthModels/HealthTimelineBar';
import { HealthModelPanelOptions, isHealthModelPanelConfigured } from '../healthModels/types';
import { buildTopology, TopologyEdge, TopologyLayoutOptions, TopologyNode } from '../healthModels/topology';
import { useHealthModelEntities } from '../healthModels/useHealthModelEntities';

export interface HealthModelTopologyPanelOptions extends HealthModelPanelOptions {
  showRelationshipLabels?: boolean;
  fitToPanel?: boolean;
}

const CANVAS_PADDING = 16;

export function HealthModelTopologyPanel({
  options,
  width,
  height,
  renderCounter,
}: PanelProps<HealthModelTopologyPanelOptions>) {
  const styles = useStyles2(getStyles);
  const theme = useTheme2();
  const { loading, entities, relationships, error, configuration } = useHealthModelEntities(
    options.configuration,
    renderCounter,
    true
  );

  const layout = React.useMemo(
    () => buildTopology(entities.items, relationships.items),
    [entities.items, relationships.items]
  );

  if (!isHealthModelPanelConfigured(configuration)) {
    return (
      <PanelMessage height={height}>
        Configure an Azure Monitor datasource, subscription, and Health Model in the panel options.
      </PanelMessage>
    );
  }

  if (loading && entities.pagesLoaded === 0) {
    return (
      <div className={styles.loading} style={{ height }}>
        <Spinner />
        <span>Loading Health Model topology...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container} style={{ height }}>
        <Alert title="Health Model topology could not be loaded" severity="error">
          {error}
        </Alert>
      </div>
    );
  }

  if (layout.nodes.length === 0) {
    return <PanelMessage height={height}>The selected Health Model does not contain any entities.</PanelMessage>;
  }

  const showLabels = options.showRelationshipLabels ?? true;
  const canvasWidth = layout.width + CANVAS_PADDING * 2;
  const canvasHeight = layout.height + CANVAS_PADDING * 2;
  // Scaling down keeps wide models readable without forcing horizontal scrolling. The canvas is
  // never enlarged past its natural size, so a small model keeps its designed proportions.
  const scale =
    options.fitToPanel === false
      ? 1
      : Math.min(1, (width - CANVAS_PADDING) / canvasWidth, (height - CANVAS_PADDING) / canvasHeight);

  return (
    <div className={styles.container} style={{ height }}>
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

          {showLabels &&
            layout.edges
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

function EntityCard({ node, layoutOptions }: { node: TopologyNode; layoutOptions: TopologyLayoutOptions }) {
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

function PanelMessage({ height, children }: { height: number; children: React.ReactNode }) {
  const styles = useStyles2(getStyles);
  return (
    <div className={styles.panelMessage} style={{ height }}>
      {children}
    </div>
  );
}

// Draws the parent-to-child connector as a vertical drop, a horizontal run, and a second drop so
// that sibling edges do not cross one another.
export function buildConnectorPath(edge: TopologyEdge): string {
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
      padding: theme.spacing(1),
      height: '100%',
    }),
    scrollArea: css({
      flex: 1,
      minHeight: 0,
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
      WebkitLineClamp: 2,
      WebkitBoxOrient: 'vertical',
    }),
    loading: css({
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: theme.spacing(1),
      color: theme.colors.text.secondary,
    }),
    panelMessage: css({
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: theme.spacing(2),
      color: theme.colors.text.secondary,
      textAlign: 'center',
    }),
  };
}

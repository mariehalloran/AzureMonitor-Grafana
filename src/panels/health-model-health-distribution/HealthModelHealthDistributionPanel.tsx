import { css } from '@emotion/css';
import { GrafanaTheme2, PanelProps } from '@grafana/data';
import { Alert, Spinner, useStyles2, useTheme2 } from '@grafana/ui';
import React from 'react';
import { getHealthStateColor } from '../../components/SceneApp/HealthModels/HealthTimelineBar';
import { buildHealthDistribution } from '../healthModels/healthDistribution';
import { HealthModelPanelOptions, isHealthModelPanelConfigured } from '../healthModels/types';
import { useHealthModelEntities } from '../healthModels/useHealthModelEntities';

export interface HealthModelHealthDistributionPanelOptions extends HealthModelPanelOptions {
  displayMode?: 'pie' | 'donut';
  showLegend?: boolean;
}

export function HealthModelHealthDistributionPanel({
  options,
  width,
  height,
  renderCounter,
}: PanelProps<HealthModelHealthDistributionPanelOptions>) {
  const styles = useStyles2(getStyles);
  const theme = useTheme2();
  const { loading, entities, error, configuration } = useHealthModelEntities(options.configuration, renderCounter);

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
        <span>Loading entity health states...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container} style={{ height }}>
        <Alert title="Entity health distribution could not be loaded" severity="error">
          {error}
        </Alert>
      </div>
    );
  }

  const distribution = buildHealthDistribution(entities.items);
  if (distribution.total === 0) {
    return <PanelMessage height={height}>The selected Health Model does not contain any entities.</PanelMessage>;
  }

  const populatedSlices = distribution.slices.filter((slice) => slice.count > 0);
  const gradient = `conic-gradient(${populatedSlices
    .map((slice) => `${getHealthStateColor(theme, slice.state)} ${slice.startPercentage}% ${slice.endPercentage}%`)
    .join(', ')})`;
  const chartSize = Math.max(120, Math.min(260, height - 64, options.showLegend === false ? width - 32 : width * 0.55));
  const displayMode = options.displayMode ?? 'pie';
  const showLegend = options.showLegend ?? true;
  const chartLabel = populatedSlices
    .map((slice) => `${slice.state}: ${slice.count} (${formatPercentage(slice.percentage)})`)
    .join(', ');

  return (
    <div className={styles.container} style={{ height }}>
      {entities.truncated && (
        <Alert title="Only part of the entity list was loaded" severity="warning">
          Distribution values describe only the entities returned before the request limit.
        </Alert>
      )}
      <div className={styles.chartLayout}>
        <div
          className={styles.pie}
          role="img"
          aria-label={`Entity health distribution. ${chartLabel}`}
          style={{
            width: chartSize,
            height: chartSize,
            background: gradient,
          }}
        >
          {displayMode === 'donut' && (
            <div className={styles.donutCenter}>
              <strong>{distribution.total}</strong>
              <span>entities</span>
            </div>
          )}
        </div>
        {showLegend && (
          <div className={styles.legend}>
            {distribution.slices.map((slice) => (
              <div className={styles.legendRow} key={slice.state}>
                <span
                  className={styles.legendSwatch}
                  style={{ backgroundColor: getHealthStateColor(theme, slice.state) }}
                />
                <span className={styles.legendState}>{slice.state}</span>
                <strong>{slice.count}</strong>
                <span className={styles.legendPercentage}>{formatPercentage(slice.percentage)}</span>
              </div>
            ))}
            <div className={styles.total}>
              <span>Total</span>
              <strong>{distribution.total}</strong>
            </div>
          </div>
        )}
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

function formatPercentage(percentage: number): string {
  return `${percentage.toFixed(percentage < 10 && percentage > 0 ? 1 : 0)}%`;
}

function getStyles(theme: GrafanaTheme2) {
  return {
    container: css({
      display: 'flex',
      flexDirection: 'column',
      gap: theme.spacing(1),
      overflow: 'auto',
      padding: theme.spacing(2),
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
    chartLayout: css({
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flex: 1,
      flexWrap: 'wrap',
      gap: theme.spacing(3),
      minHeight: 0,
    }),
    pie: css({
      position: 'relative',
      flex: '0 0 auto',
      maxWidth: '100%',
      maxHeight: '100%',
      borderRadius: '50%',
      boxShadow: `inset 0 0 0 1px ${theme.colors.border.weak}`,
    }),
    donutCenter: css({
      position: 'absolute',
      top: '25%',
      right: '25%',
      bottom: '25%',
      left: '25%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: theme.colors.background.primary,
      borderRadius: '50%',
      color: theme.colors.text.secondary,
      '& strong': {
        color: theme.colors.text.primary,
        fontSize: theme.typography.h2.fontSize,
        lineHeight: theme.typography.h2.lineHeight,
      },
    }),
    legend: css({
      display: 'flex',
      flexDirection: 'column',
      gap: theme.spacing(1),
      minWidth: 190,
    }),
    legendRow: css({
      display: 'grid',
      gridTemplateColumns: '14px minmax(75px, 1fr) auto auto',
      alignItems: 'center',
      gap: theme.spacing(1),
    }),
    legendSwatch: css({
      width: 12,
      height: 12,
      borderRadius: theme.shape.radius.default,
    }),
    legendState: css({
      color: theme.colors.text.secondary,
    }),
    legendPercentage: css({
      minWidth: 46,
      color: theme.colors.text.secondary,
      textAlign: 'right',
    }),
    total: css({
      display: 'flex',
      justifyContent: 'space-between',
      paddingTop: theme.spacing(1),
      borderTop: `1px solid ${theme.colors.border.weak}`,
    }),
  };
}

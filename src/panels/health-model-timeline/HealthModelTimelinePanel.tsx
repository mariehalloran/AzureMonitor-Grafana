import { css } from '@emotion/css';
import { GrafanaTheme2, PanelProps } from '@grafana/data';
import { Alert, Button, Icon, Spinner, useStyles2 } from '@grafana/ui';
import React from 'react';
import { getHealthModelsErrorMessage } from '../../components/SceneApp/HealthModels/HealthModelsApi';
import { HealthStateBadge } from '../../components/SceneApp/HealthModels/HealthStateBadge';
import { formatHealthTimestamp, HealthTimelineBar } from '../../components/SceneApp/HealthModels/HealthTimelineBar';
import { EntityHistoryResult, HealthModelEntity } from '../../components/SceneApp/HealthModels/types';
import { framesToHealthGraphInput } from '../shared/framesToEntities';
import { getHealthModelsClient, getHealthModelsQueryContext } from '../shared/queryContext';

const ENTITY_HISTORY_PAGE_SIZE = 1000;

export interface HealthModelTimelinePanelOptions {
  historyHours?: number;
}

interface EntityHistoryState {
  loading: boolean;
  startAt: string;
  endAt: string;
  result?: EntityHistoryResult;
  error?: string;
}

export function HealthModelTimelinePanel({ options, data, height }: PanelProps<HealthModelTimelinePanelOptions>) {
  const styles = useStyles2(getStyles);
  const historyHours = clamp(options.historyHours ?? 24, 1, 720);
  const entities = React.useMemo(() => framesToHealthGraphInput(data.series).entities, [data.series]);
  const context = React.useMemo(() => getHealthModelsQueryContext(data), [data]);
  const [expandedEntityId, setExpandedEntityId] = React.useState<string>();
  const [historyByEntityId, setHistoryByEntityId] = React.useState<Record<string, EntityHistoryState>>({});

  // A new query means the previously loaded history no longer describes what is on screen.
  const contextKey = `${context.datasourceUid ?? ''}|${context.healthModelId ?? ''}|${historyHours}`;
  React.useEffect(() => {
    setExpandedEntityId(undefined);
    setHistoryByEntityId({});
  }, [contextKey]);

  const loadHistory = React.useCallback(
    async (entity: HealthModelEntity, force = false) => {
      const existing = historyByEntityId[entity.id];
      if (!context.healthModelId || (!force && (existing?.loading || existing?.result))) {
        return;
      }

      const endAt = new Date();
      const startAt = new Date(endAt.getTime() - historyHours * 60 * 60 * 1000);
      const window = { startAt: startAt.toISOString(), endAt: endAt.toISOString() };
      setHistoryByEntityId((current) => ({ ...current, [entity.id]: { loading: true, ...window } }));

      try {
        const client = await getHealthModelsClient(context);
        const result = await client.getEntityHistory(context.healthModelId, entity.name, {
          ...window,
          top: ENTITY_HISTORY_PAGE_SIZE,
        });
        setHistoryByEntityId((current) => ({ ...current, [entity.id]: { loading: false, ...window, result } }));
      } catch (historyError) {
        setHistoryByEntityId((current) => ({
          ...current,
          [entity.id]: { loading: false, ...window, error: getHealthModelsErrorMessage(historyError) },
        }));
      }
    },
    [context, historyByEntityId, historyHours]
  );

  const toggleHistory = (entity: HealthModelEntity) => {
    if (expandedEntityId === entity.id) {
      setExpandedEntityId(undefined);
      return;
    }

    setExpandedEntityId(entity.id);
    void loadHistory(entity);
  };

  if (entities.length === 0) {
    return (
      <div className={styles.message} style={{ height }}>
        Query an Azure Health Models data source to render this panel.
      </div>
    );
  }

  return (
    <div className={styles.container} style={{ height }}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Entity</th>
            <th>Health state</th>
          </tr>
        </thead>
        <tbody>
          {entities.map((entity) => {
            const isExpanded = expandedEntityId === entity.id;
            const displayName = entity.properties?.displayName ?? entity.name;
            return (
              <React.Fragment key={entity.id}>
                <tr>
                  <td>
                    <button
                      type="button"
                      className={styles.entityToggle}
                      aria-expanded={isExpanded}
                      aria-label={`${isExpanded ? 'Collapse' : 'Expand'} health history for ${displayName}`}
                      onClick={() => toggleHistory(entity)}
                    >
                      <Icon name={isExpanded ? 'angle-down' : 'angle-right'} />
                      <span>{displayName}</span>
                    </button>
                  </td>
                  <td>
                    <HealthStateBadge healthState={entity.properties?.healthState} />
                  </td>
                </tr>
                {isExpanded && (
                  <tr className={styles.historyRow}>
                    <td colSpan={2}>
                      <EntityHistory
                        entity={entity}
                        historyState={historyByEntityId[entity.id]}
                        historyHours={historyHours}
                        onRetry={() => void loadHistory(entity, true)}
                      />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EntityHistory({
  entity,
  historyState,
  historyHours,
  onRetry,
}: {
  entity: HealthModelEntity;
  historyState?: EntityHistoryState;
  historyHours: number;
  onRetry: () => void;
}) {
  const styles = useStyles2(getStyles);

  if (!historyState || historyState.loading) {
    return (
      <div className={styles.historyLoading}>
        <Spinner />
        <span>Loading the previous {historyHours} hours of health history...</span>
      </div>
    );
  }

  if (historyState.error) {
    return (
      <div className={styles.historyPanel}>
        <Alert title="Health history could not be loaded" severity="error">
          {historyState.error}
        </Alert>
        <Button variant="secondary" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.historyPanel}>
      <div className={styles.historyHeader}>
        <div>
          <strong>Health history</strong>
          <div className={styles.metadata}>
            {formatHealthTimestamp(historyState.startAt)} to {formatHealthTimestamp(historyState.endAt)}
          </div>
        </div>
        <div className={styles.currentHealthState}>
          <span>Current state</span>
          <HealthStateBadge healthState={entity.properties?.healthState} />
        </div>
      </div>
      <HealthTimelineBar
        transitions={historyState.result?.history ?? []}
        startAt={historyState.startAt}
        endAt={historyState.endAt}
        currentState={entity.properties?.healthState}
      />
      {historyState.result?.truncated && (
        <div className={styles.metadata}>
          Only part of the history was loaded for this period.
        </div>
      )}
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getStyles(theme: GrafanaTheme2) {
  return {
    container: css({
      overflow: 'auto',
      padding: theme.spacing(1),
    }),
    message: css({
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: theme.spacing(2),
      color: theme.colors.text.secondary,
      textAlign: 'center',
    }),
    table: css({
      width: '100%',
      borderCollapse: 'collapse',
      'th, td': {
        padding: theme.spacing(1),
        borderBottom: `1px solid ${theme.colors.border.weak}`,
        textAlign: 'left',
        verticalAlign: 'middle',
      },
      th: {
        color: theme.colors.text.secondary,
        fontWeight: theme.typography.fontWeightMedium,
      },
    }),
    entityToggle: css({
      display: 'flex',
      alignItems: 'center',
      gap: theme.spacing(1),
      background: 'none',
      border: 'none',
      padding: 0,
      color: theme.colors.text.primary,
      cursor: 'pointer',
      textAlign: 'left',
    }),
    historyRow: css({
      background: theme.colors.background.secondary,
    }),
    historyPanel: css({
      display: 'flex',
      flexDirection: 'column',
      gap: theme.spacing(1),
      padding: theme.spacing(1),
    }),
    historyLoading: css({
      display: 'flex',
      alignItems: 'center',
      gap: theme.spacing(1),
      padding: theme.spacing(2),
      color: theme.colors.text.secondary,
    }),
    historyHeader: css({
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: theme.spacing(2),
    }),
    currentHealthState: css({
      display: 'flex',
      alignItems: 'center',
      gap: theme.spacing(1),
      color: theme.colors.text.secondary,
    }),
    metadata: css({
      color: theme.colors.text.secondary,
      fontSize: theme.typography.bodySmall.fontSize,
    }),
  };
}

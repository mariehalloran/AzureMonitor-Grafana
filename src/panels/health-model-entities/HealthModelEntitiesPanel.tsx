import { css } from '@emotion/css';
import { GrafanaTheme2, PanelProps } from '@grafana/data';
import { Alert, Button, Icon, Spinner, useStyles2 } from '@grafana/ui';
import React from 'react';
import {
  getHealthModelsErrorMessage,
  HealthModelsClient,
} from '../../components/SceneApp/HealthModels/HealthModelsApi';
import { HealthStateBadge } from '../../components/SceneApp/HealthModels/HealthStateBadge';
import { formatHealthTimestamp, HealthTimelineBar } from '../../components/SceneApp/HealthModels/HealthTimelineBar';
import { EntityHistoryResult, HealthModelEntity } from '../../components/SceneApp/HealthModels/types';
import { isHealthModelPanelConfigured, HealthModelPanelOptions } from '../healthModels/types';
import { useHealthModelEntities } from '../healthModels/useHealthModelEntities';

const ENTITY_HISTORY_PAGE_SIZE = 1000;

export interface HealthModelEntitiesPanelOptions extends HealthModelPanelOptions {
  historyHours?: number;
  maxEntities?: number;
}

interface EntityHistoryState {
  loading: boolean;
  startAt: string;
  endAt: string;
  result?: EntityHistoryResult;
  error?: string;
}

export function HealthModelEntitiesPanel({
  options,
  height,
  renderCounter,
}: PanelProps<HealthModelEntitiesPanelOptions>) {
  const styles = useStyles2(getStyles);
  const { loading, entities, client, error, configuration } = useHealthModelEntities(
    options.configuration,
    renderCounter
  );
  const [expandedEntityId, setExpandedEntityId] = React.useState<string>();
  const [historyByEntityId, setHistoryByEntityId] = React.useState<Record<string, EntityHistoryState>>({});
  const historyRequestIds = React.useRef(new Map<string, number>());
  const nextHistoryRequestId = React.useRef(0);
  const historyGeneration = React.useRef(0);
  const historyHours = clamp(options.historyHours ?? 24, 1, 720);
  const maxEntities = clamp(options.maxEntities ?? 100, 1, 500);
  const contextKey = `${configuration.datasourceUid ?? ''}|${configuration.healthModelId ?? ''}|${historyHours}`;

  React.useEffect(() => {
    const requestIds = historyRequestIds.current;
    historyGeneration.current++;
    requestIds.clear();
    setExpandedEntityId(undefined);
    setHistoryByEntityId({});

    return () => {
      requestIds.clear();
    };
  }, [contextKey]);

  const setHistoryState = React.useCallback((entityId: string, historyState: EntityHistoryState) => {
    setHistoryByEntityId((current) => ({
      ...current,
      [entityId]: historyState,
    }));
  }, []);

  const loadHistory = React.useCallback(
    async (entity: HealthModelEntity, force = false) => {
      const healthModelId = configuration.healthModelId;
      const existingHistory = historyByEntityId[entity.id];
      if (!client || !healthModelId || (!force && (existingHistory?.loading || existingHistory?.result))) {
        return;
      }

      const endAt = new Date();
      const startAt = new Date(endAt.getTime() - historyHours * 60 * 60 * 1000);
      const requestGeneration = historyGeneration.current;
      const requestId = ++nextHistoryRequestId.current;
      historyRequestIds.current.set(entity.id, requestId);
      setHistoryState(entity.id, {
        loading: true,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
      });

      try {
        const result = await client.getEntityHistory(healthModelId, entity.name, {
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          top: ENTITY_HISTORY_PAGE_SIZE,
        });
        if (requestGeneration !== historyGeneration.current || historyRequestIds.current.get(entity.id) !== requestId) {
          return;
        }

        setHistoryState(entity.id, {
          loading: false,
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          result,
        });
      } catch (historyError) {
        if (requestGeneration !== historyGeneration.current || historyRequestIds.current.get(entity.id) !== requestId) {
          return;
        }

        setHistoryState(entity.id, {
          loading: false,
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          error: getHealthModelsErrorMessage(historyError),
        });
      }
    },
    [client, historyByEntityId, historyHours, configuration.healthModelId, setHistoryState]
  );

  const toggleHistory = (entity: HealthModelEntity) => {
    if (expandedEntityId === entity.id) {
      setExpandedEntityId(undefined);
      return;
    }

    setExpandedEntityId(entity.id);
    void loadHistory(entity);
  };

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
        <span>Loading Health Model entities...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container} style={{ height }}>
        <Alert title="Health Model entities could not be loaded" severity="error">
          {error}
        </Alert>
      </div>
    );
  }

  const displayedEntities = [...entities.items]
    .sort((left, right) =>
      (left.properties?.displayName ?? left.name).localeCompare(right.properties?.displayName ?? right.name)
    )
    .slice(0, maxEntities);

  if (displayedEntities.length === 0) {
    return <PanelMessage height={height}>The selected Health Model does not contain any entities.</PanelMessage>;
  }

  return (
    <div className={styles.container} style={{ height }}>
      {entities.truncated && (
        <Alert title="Only part of the entity list was loaded" severity="warning">
          Azure returned more entity pages than the configured request limit.
        </Alert>
      )}
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Health state</th>
              <th>Impact</th>
              <th>Health objective</th>
              <th>Provisioning state</th>
            </tr>
          </thead>
          <tbody>
            {displayedEntities.map((entity) => {
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
                    <td>{entity.properties?.impact ?? '--'}</td>
                    <td>
                      {entity.properties?.healthObjective == null ? '--' : `${entity.properties.healthObjective}%`}
                    </td>
                    <td>{entity.properties?.provisioningState ?? '--'}</td>
                  </tr>
                  {isExpanded && (
                    <tr className={styles.historyRow}>
                      <td colSpan={5}>
                        <EntityHistory
                          entity={entity}
                          historyState={historyByEntityId[entity.id]}
                          historyHours={historyHours}
                          client={client}
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
      {entities.items.length > displayedEntities.length && (
        <div className={styles.metadata}>
          Showing the first {displayedEntities.length} of {entities.items.length} loaded entities.
        </div>
      )}
    </div>
  );
}

function EntityHistory({
  entity,
  historyState,
  historyHours,
  client,
  onRetry,
}: {
  entity: HealthModelEntity;
  historyState?: EntityHistoryState;
  historyHours: number;
  client?: HealthModelsClient;
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
        <Button variant="secondary" onClick={onRetry} disabled={!client}>
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
      {historyState.result?.truncated && (
        <Alert title="Only part of this entity's history was loaded" severity="warning">
          Azure returned more history pages than the configured request limit.
        </Alert>
      )}
      <HealthTimelineBar
        transitions={historyState.result?.history ?? []}
        startAt={historyState.startAt}
        endAt={historyState.endAt}
        currentState={entity.properties?.healthState}
      />
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

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function getStyles(theme: GrafanaTheme2) {
  return {
    container: css({
      display: 'flex',
      flexDirection: 'column',
      gap: theme.spacing(1),
      overflow: 'auto',
      padding: theme.spacing(1),
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
    tableWrapper: css({
      overflow: 'auto',
      border: `1px solid ${theme.colors.border.weak}`,
      borderRadius: theme.shape.radius.default,
    }),
    table: css({
      width: '100%',
      borderCollapse: 'collapse',
      '& > thead > tr > th, & > tbody > tr > td': {
        padding: theme.spacing(1),
        textAlign: 'left',
        borderBottom: `1px solid ${theme.colors.border.weak}`,
        whiteSpace: 'nowrap',
      },
      '& > thead > tr > th': {
        position: 'sticky',
        top: 0,
        zIndex: 1,
        color: theme.colors.text.secondary,
        background: theme.colors.background.secondary,
        fontWeight: theme.typography.fontWeightMedium,
      },
      '& > tbody > tr:last-child > td': {
        borderBottom: 0,
      },
    }),
    entityToggle: css({
      appearance: 'none',
      display: 'inline-flex',
      alignItems: 'center',
      gap: theme.spacing(0.5),
      padding: 0,
      border: 0,
      background: 'transparent',
      color: theme.colors.text.primary,
      cursor: 'pointer',
      font: 'inherit',
      textAlign: 'left',
      '&:hover span': {
        textDecoration: 'underline',
      },
      '&:focus-visible': {
        outline: '2px solid currentColor',
        outlineOffset: 2,
      },
    }),
    historyRow: css({
      '& > td': {
        padding: '0 !important',
        whiteSpace: 'normal !important',
        background: theme.colors.background.secondary,
      },
    }),
    historyPanel: css({
      display: 'flex',
      flexDirection: 'column',
      gap: theme.spacing(1),
      padding: theme.spacing(2),
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
      marginTop: theme.spacing(0.5),
    }),
  };
}

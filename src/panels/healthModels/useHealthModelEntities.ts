import React from 'react';
import {
  createHealthModelsApi,
  getHealthModelsErrorMessage,
  HealthModelsClient,
  parseHealthModelResourceId,
} from '../../components/SceneApp/HealthModels/HealthModelsApi';
import { HealthModelEntity, HealthModelRelationship, PagedResult } from '../../components/SceneApp/HealthModels/types';
import {
  HealthModelPanelConfiguration,
  isHealthModelPanelConfigured,
  resolveHealthModelConfiguration,
} from './types';

interface HealthModelEntitiesState {
  loading: boolean;
  entities: PagedResult<HealthModelEntity>;
  relationships: PagedResult<HealthModelRelationship>;
  client?: HealthModelsClient;
  error?: string;
}

const EMPTY_ENTITIES: PagedResult<HealthModelEntity> = {
  items: [],
  pagesLoaded: 0,
  truncated: false,
};

const EMPTY_RELATIONSHIPS: PagedResult<HealthModelRelationship> = {
  items: [],
  pagesLoaded: 0,
  truncated: false,
};

// These panels call ARM directly instead of going through Grafana's query pipeline, so nothing
// else rate-limits them. This floor keeps a short dashboard refresh interval (or a hand-edited
// `?refresh=` URL) from throttling the Microsoft.CloudHealth API. It sits just under a minute so
// that a 1m interval is not skipped by timer jitter.
export const MIN_REFETCH_INTERVAL_MS = 55_000;

export function useHealthModelEntities(
  configuration: HealthModelPanelConfiguration | undefined,
  refreshKey: number,
  includeRelationships = false
): HealthModelEntitiesState & { configuration: HealthModelPanelConfiguration } {
  const [state, setState] = React.useState<HealthModelEntitiesState>({
    loading: false,
    entities: EMPTY_ENTITIES,
    relationships: EMPTY_RELATIONSHIPS,
  });

  // Re-resolved whenever the panel re-renders, which is how variable changes reach the panel.
  const resolved = React.useMemo(
    () => resolveHealthModelConfiguration(configuration),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [configuration, refreshKey]
  );
  const { datasourceUid, subscriptionId, healthModelId } = resolved;
  // Identifies which health model is being shown. Changing it must fetch immediately, while a
  // repeat of the same target is a refresh and is subject to the interval floor.
  const targetKey = `${datasourceUid ?? ''}|${subscriptionId ?? ''}|${healthModelId ?? ''}|${includeRelationships}`;
  const lastTargetKey = React.useRef<string | undefined>(undefined);
  const lastFetchAt = React.useRef(0);

  React.useEffect(() => {
    let cancelled = false;
    const activeConfiguration = { datasourceUid, subscriptionId, healthModelId };

    if (!isHealthModelPanelConfigured(activeConfiguration)) {
      lastTargetKey.current = undefined;
      setState({
        loading: false,
        entities: EMPTY_ENTITIES,
        relationships: EMPTY_RELATIONSHIPS,
      });
      return;
    }

    // A dashboard variable can supply any string, so an unparseable value must surface as a panel
    // message rather than throwing out of the effect and tripping the panel error boundary.
    let resourceId;
    try {
      resourceId = parseHealthModelResourceId(activeConfiguration.healthModelId);
    } catch (parseError) {
      lastTargetKey.current = undefined;
      setState({
        loading: false,
        entities: EMPTY_ENTITIES,
        relationships: EMPTY_RELATIONSHIPS,
        error: getHealthModelsErrorMessage(parseError),
      });
      return;
    }

    if (resourceId.subscriptionId.toLowerCase() !== activeConfiguration.subscriptionId.toLowerCase()) {
      lastTargetKey.current = undefined;
      setState({
        loading: false,
        entities: EMPTY_ENTITIES,
        relationships: EMPTY_RELATIONSHIPS,
        error: 'The selected Health Model does not belong to the selected subscription.',
      });
      return;
    }

    const isSameTarget = lastTargetKey.current === targetKey;
    if (isSameTarget && Date.now() - lastFetchAt.current < MIN_REFETCH_INTERVAL_MS) {
      return;
    }

    lastTargetKey.current = targetKey;
    lastFetchAt.current = Date.now();

    setState((current) => ({
      loading: true,
      // Keep the previous results visible while refreshing the same model, otherwise every
      // refresh would blank the panel and flash a spinner.
      entities: isSameTarget ? current.entities : EMPTY_ENTITIES,
      relationships: isSameTarget ? current.relationships : EMPTY_RELATIONSHIPS,
      client: isSameTarget ? current.client : undefined,
    }));
    void createHealthModelsApi(activeConfiguration.datasourceUid)
      .then(async (client) => {
        const [entities, relationships] = await Promise.all([
          client.listEntities(activeConfiguration.healthModelId),
          includeRelationships
            ? client.listRelationships(activeConfiguration.healthModelId)
            : Promise.resolve(EMPTY_RELATIONSHIPS),
        ]);

        return { client, entities, relationships };
      })
      .then((result) => {
        if (!cancelled) {
          setState({
            loading: false,
            entities: result.entities,
            relationships: result.relationships,
            client: result.client,
          });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setState({
            loading: false,
            entities: EMPTY_ENTITIES,
            relationships: EMPTY_RELATIONSHIPS,
            error: getHealthModelsErrorMessage(error),
          });
        }
      });

    return () => {
      cancelled = true;
    };
    // refreshKey is included so the dashboard refresh interval (and the manual Refresh button)
    // re-fetches health state, which is the whole point of a live health view. targetKey is derived
    // from the other dependencies, so it needs no entry of its own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasourceUid, healthModelId, includeRelationships, refreshKey, subscriptionId]);

  return { ...state, configuration: resolved };
}

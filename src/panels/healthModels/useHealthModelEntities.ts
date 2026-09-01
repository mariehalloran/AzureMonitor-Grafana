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

  React.useEffect(() => {
    let cancelled = false;
    const activeConfiguration = { datasourceUid, subscriptionId, healthModelId };

    if (!isHealthModelPanelConfigured(activeConfiguration)) {
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
      setState({
        loading: false,
        entities: EMPTY_ENTITIES,
        relationships: EMPTY_RELATIONSHIPS,
        error: getHealthModelsErrorMessage(parseError),
      });
      return;
    }

    if (resourceId.subscriptionId.toLowerCase() !== activeConfiguration.subscriptionId.toLowerCase()) {
      setState({
        loading: false,
        entities: EMPTY_ENTITIES,
        relationships: EMPTY_RELATIONSHIPS,
        error: 'The selected Health Model does not belong to the selected subscription.',
      });
      return;
    }

    setState({
      loading: true,
      entities: EMPTY_ENTITIES,
      relationships: EMPTY_RELATIONSHIPS,
    });
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
  }, [datasourceUid, healthModelId, includeRelationships, subscriptionId]);

  return { ...state, configuration: resolved };
}

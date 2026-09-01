import React from 'react';
import {
  createHealthModelsApi,
  getHealthModelsErrorMessage,
  HealthModelsClient,
  parseHealthModelResourceId,
} from '../../components/SceneApp/HealthModels/HealthModelsApi';
import { HealthModelEntity, PagedResult } from '../../components/SceneApp/HealthModels/types';
import { HealthModelPanelConfiguration, isHealthModelPanelConfigured } from './types';

interface HealthModelEntitiesState {
  loading: boolean;
  entities: PagedResult<HealthModelEntity>;
  client?: HealthModelsClient;
  error?: string;
}

const EMPTY_ENTITIES: PagedResult<HealthModelEntity> = {
  items: [],
  pagesLoaded: 0,
  truncated: false,
};

export function useHealthModelEntities(
  configuration: HealthModelPanelConfiguration | undefined,
  refreshKey: number
): HealthModelEntitiesState {
  const [state, setState] = React.useState<HealthModelEntitiesState>({
    loading: false,
    entities: EMPTY_ENTITIES,
  });
  const datasourceUid = configuration?.datasourceUid;
  const subscriptionId = configuration?.subscriptionId;
  const healthModelId = configuration?.healthModelId;

  React.useEffect(() => {
    let cancelled = false;

    if (!isHealthModelPanelConfigured(configuration)) {
      setState({
        loading: false,
        entities: EMPTY_ENTITIES,
      });
      return;
    }

    const resourceId = parseHealthModelResourceId(configuration.healthModelId);
    if (resourceId.subscriptionId.toLowerCase() !== configuration.subscriptionId.toLowerCase()) {
      setState({
        loading: false,
        entities: EMPTY_ENTITIES,
        error: 'The selected Health Model does not belong to the selected subscription.',
      });
      return;
    }

    setState({
      loading: true,
      entities: EMPTY_ENTITIES,
    });
    void createHealthModelsApi(configuration.datasourceUid)
      .then(async (client) => ({
        client,
        entities: await client.listEntities(configuration.healthModelId),
      }))
      .then((result) => {
        if (!cancelled) {
          setState({
            loading: false,
            entities: result.entities,
            client: result.client,
          });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setState({
            loading: false,
            entities: EMPTY_ENTITIES,
            error: getHealthModelsErrorMessage(error),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [configuration, datasourceUid, healthModelId, refreshKey, subscriptionId]);

  return state;
}

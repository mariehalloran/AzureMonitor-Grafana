import { DataQuery, PanelData } from '@grafana/data';
import { getDataSourceSrv } from '@grafana/runtime';
import { HealthModelsClient } from '../../components/SceneApp/HealthModels/HealthModelsApi';

interface HealthModelsTarget extends DataQuery {
  healthModelId?: string;
}

export interface HealthModelsQueryContext {
  datasourceUid?: string;
  healthModelId?: string;
}

interface HealthModelsDataSourceLike {
  getClient(): Promise<HealthModelsClient>;
}

/**
 * Reads which health model a panel's data came from.
 *
 * Entity history is fetched per entity when a row is expanded, so it cannot travel in the query
 * response. The originating query is recorded on `data.request`, which lets the panel reuse the
 * same data source and model rather than asking the user to configure them a second time.
 */
export function getHealthModelsQueryContext(data: PanelData): HealthModelsQueryContext {
  const target = data.request?.targets?.find((candidate) => (candidate as HealthModelsTarget).healthModelId) as
    | HealthModelsTarget
    | undefined;

  const datasource = target?.datasource ?? data.request?.targets?.[0]?.datasource;

  return {
    datasourceUid: typeof datasource === 'string' ? datasource : datasource?.uid,
    healthModelId: target?.healthModelId,
  };
}

/** Resolves the Health Models client behind the query that produced this panel's data. */
export async function getHealthModelsClient(context: HealthModelsQueryContext): Promise<HealthModelsClient> {
  if (!context.datasourceUid) {
    throw new Error('This panel needs an Azure Health Models query to load health history.');
  }

  const datasource = (await getDataSourceSrv().get({ uid: context.datasourceUid })) as unknown as
    | Partial<HealthModelsDataSourceLike>
    | undefined;

  if (typeof datasource?.getClient !== 'function') {
    throw new Error('Health history is only available for Azure Health Models queries.');
  }

  return datasource.getClient();
}

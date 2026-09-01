import { DataQuery, DataSourceJsonData } from '@grafana/schema';

export type HealthModelsResultFormat = 'entities' | 'nodeGraph';

export interface HealthModelsQuery extends DataQuery {
  subscriptionId?: string;
  healthModelId?: string;
  resultFormat?: HealthModelsResultFormat;
}

export interface HealthModelsDataSourceOptions extends DataSourceJsonData {
  /**
   * UID of the Azure Monitor data source used to reach ARM. Health Models has no credentials of
   * its own; it proxies through an existing Azure Monitor data source so authentication, cloud
   * selection, and RBAC stay in one place.
   */
  azureMonitorDatasourceUid?: string;
}

export const DEFAULT_RESULT_FORMAT: HealthModelsResultFormat = 'nodeGraph';

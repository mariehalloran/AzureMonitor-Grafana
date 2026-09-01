import {
  DataQueryRequest,
  DataQueryResponse,
  DataSourceApi,
  DataSourceInstanceSettings,
  MetricFindValue,
  TestDataSourceResponse,
} from '@grafana/data';
import { getDataSourceSrv, getTemplateSrv } from '@grafana/runtime';
import {
  AZURE_MONITOR_DATASOURCE_TYPE,
  createHealthModelsApi,
  getHealthModelsErrorMessage,
  HealthModelsClient,
} from '../../components/SceneApp/HealthModels/HealthModelsApi';
import { buildEntitiesFrame, buildNodeGraphFrames } from './frames';
import { DEFAULT_RESULT_FORMAT, HealthModelsDataSourceOptions, HealthModelsQuery } from './types';

interface AzureMonitorSubscriptionSource {
  getSubscriptions(): Promise<Array<{ text: string; value: string }>>;
}

export class HealthModelsDataSource extends DataSourceApi<HealthModelsQuery, HealthModelsDataSourceOptions> {
  public readonly azureMonitorDatasourceUid?: string;

  public constructor(instanceSettings: DataSourceInstanceSettings<HealthModelsDataSourceOptions>) {
    super(instanceSettings);
    this.azureMonitorDatasourceUid = instanceSettings.jsonData?.azureMonitorDatasourceUid;
  }

  public override filterQuery(query: HealthModelsQuery): boolean {
    return !query.hide && Boolean(query.healthModelId);
  }

  public applyTemplateVariables(query: HealthModelsQuery): HealthModelsQuery {
    const templateSrv = getTemplateSrv();
    return {
      ...query,
      subscriptionId: query.subscriptionId ? templateSrv.replace(query.subscriptionId) : query.subscriptionId,
      healthModelId: query.healthModelId ? templateSrv.replace(query.healthModelId) : query.healthModelId,
    };
  }

  public async getClient(): Promise<HealthModelsClient> {
    if (!this.azureMonitorDatasourceUid) {
      throw new Error('Select an Azure Monitor data source in this data source’s settings first.');
    }

    return createHealthModelsApi(this.azureMonitorDatasourceUid);
  }

  public async getSubscriptions(): Promise<Array<{ text: string; value: string }>> {
    if (!this.azureMonitorDatasourceUid) {
      throw new Error('Select an Azure Monitor data source in this data source’s settings first.');
    }

    const azureMonitor = (await getDataSourceSrv().get({
      type: AZURE_MONITOR_DATASOURCE_TYPE,
      uid: this.azureMonitorDatasourceUid,
    })) as unknown as Partial<AzureMonitorSubscriptionSource>;

    if (typeof azureMonitor.getSubscriptions !== 'function') {
      throw new Error('The selected Azure Monitor data source cannot list subscriptions.');
    }

    return azureMonitor.getSubscriptions();
  }

  /**
   * Backs dashboard template variables.
   *
   * Supported queries:
   *   subscriptions()            - every subscription the Azure Monitor identity can read
   *   healthModels(<subscription>) - health models in that subscription, valued by resource ID
   */
  public override async metricFindQuery(query: string): Promise<MetricFindValue[]> {
    const interpolated = getTemplateSrv().replace(query ?? '').trim();

    if (/^subscriptions\(\s*\)$/i.test(interpolated)) {
      const subscriptions = await this.getSubscriptions();
      return subscriptions.map((subscription) => ({ text: subscription.text, value: subscription.value }));
    }

    const healthModels = /^healthModels\(\s*([^)]*?)\s*\)$/i.exec(interpolated);
    if (healthModels) {
      const subscriptionId = healthModels[1];
      if (!subscriptionId) {
        return [];
      }

      const client = await this.getClient();
      const result = await client.listHealthModels(subscriptionId);
      return result.items.map((model) => ({ text: model.name, value: model.id }));
    }

    return [];
  }

  public async query(request: DataQueryRequest<HealthModelsQuery>): Promise<DataQueryResponse> {
    const targets = request.targets.map((target) => this.applyTemplateVariables(target)).filter((target) => this.filterQuery(target));

    if (targets.length === 0) {
      return { data: [] };
    }

    const client = await this.getClient();
    const data = [];

    for (const target of targets) {
      const healthModelId = target.healthModelId!;
      const resultFormat = target.resultFormat ?? DEFAULT_RESULT_FORMAT;

      if (resultFormat === 'nodeGraph') {
        // Node Graph needs nodes and edges together, so both are always fetched for this format.
        const [entities, relationships] = await Promise.all([
          client.listEntities(healthModelId),
          client.listRelationships(healthModelId),
        ]);
        const frames = buildNodeGraphFrames(entities.items, relationships.items);
        data.push(withRefId(frames.nodes, target.refId), withRefId(frames.edges, target.refId));
        continue;
      }

      const entities = await client.listEntities(healthModelId);
      data.push(withRefId(buildEntitiesFrame(entities.items), target.refId));
    }

    return { data };
  }

  public async testDatasource(): Promise<TestDataSourceResponse> {
    try {
      await this.getClient();
      return {
        status: 'success',
        message: 'Connected through the selected Azure Monitor data source.',
      };
    } catch (error) {
      return {
        status: 'error',
        message: getHealthModelsErrorMessage(error),
      };
    }
  }
}

/** Grafana matches frames to queries by refId, so every returned frame must carry the target's. */
function withRefId<T extends { refId?: string }>(frame: T, refId: string): T {
  return { ...frame, refId };
}

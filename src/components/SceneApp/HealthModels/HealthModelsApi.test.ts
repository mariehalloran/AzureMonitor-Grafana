import {
  AZURE_MONITOR_DATASOURCE_TYPE,
  AzureMonitorArmDataSource,
  HealthModelsApi,
  getHealthModelsErrorMessage,
  normalizeArmNextLink,
  parseHealthModelResourceId,
} from './HealthModelsApi';
import { HealthModelEntity } from './types';

const MODEL_ID =
  '/subscriptions/11111111-1111-1111-1111-111111111111/resourceGroups/example-rg/providers/Microsoft.CloudHealth/healthmodels/example-model';

function createDatasourceMock() {
  const getResource = jest.fn();
  const datasource: AzureMonitorArmDataSource = {
    type: AZURE_MONITOR_DATASOURCE_TYPE,
    getResource: <T>(path: string, params?: Record<string, unknown>) => getResource(path, params) as Promise<T>,
  };

  return {
    datasource,
    getResource,
  };
}

describe('HealthModelsApi', () => {
  test('lists health models through the Microsoft.CloudHealth API', async () => {
    const { datasource, getResource } = createDatasourceMock();
    getResource.mockResolvedValue({
      value: [createHealthModel()],
    });

    const result = await new HealthModelsApi(datasource).listHealthModels('11111111-1111-1111-1111-111111111111');

    expect(result.items).toEqual([createHealthModel()]);
    expect(getResource).toHaveBeenCalledWith(
      'azuremonitor/subscriptions/11111111-1111-1111-1111-111111111111/providers/Microsoft.CloudHealth/healthmodels',
      {
        'api-version': '2026-09-01-preview',
      }
    );
  });

  test('follows an absolute ARM continuation link', async () => {
    const { datasource, getResource } = createDatasourceMock();
    const firstEntity = createEntity('one');
    const secondEntity = createEntity('two');
    getResource
      .mockResolvedValueOnce({
        value: [firstEntity],
        nextLink: `https://management.azure.com${MODEL_ID}/entities?api-version=2026-09-01-preview&$skiptoken=next`,
      })
      .mockResolvedValueOnce({
        value: [secondEntity],
      });

    const result = await new HealthModelsApi(datasource).listEntities(MODEL_ID);

    expect(result).toEqual({
      items: [firstEntity, secondEntity],
      pagesLoaded: 2,
      truncated: false,
    });
    expect(getResource).toHaveBeenNthCalledWith(
      2,
      `azuremonitor${MODEL_ID}/entities?api-version=2026-09-01-preview&$skiptoken=next`,
      undefined
    );
  });

  test('rejects a continuation link for a different collection', async () => {
    const { datasource, getResource } = createDatasourceMock();
    getResource.mockResolvedValue({
      value: [createEntity('one')],
      nextLink: `https://management.azure.com${MODEL_ID}/relationships?api-version=2026-09-01-preview`,
    });

    await expect(new HealthModelsApi(datasource).listEntities(MODEL_ID)).rejects.toThrow(
      'continuation link for a different resource collection'
    );
  });

  test('marks results as truncated when the page limit is reached', async () => {
    const { datasource, getResource } = createDatasourceMock();
    getResource.mockResolvedValue({
      value: [createEntity('one')],
      nextLink: `https://management.azure.com${MODEL_ID}/entities?api-version=2026-09-01-preview&$skiptoken=next`,
    });

    const result = await new HealthModelsApi(datasource, 1).listEntities(MODEL_ID);

    expect(result).toEqual({
      items: [createEntity('one')],
      pagesLoaded: 1,
      truncated: true,
    });
    expect(getResource).toHaveBeenCalledTimes(1);
  });
});

describe('Health Models ARM helpers', () => {
  test('parses a Health Model ARM resource ID', () => {
    expect(parseHealthModelResourceId(MODEL_ID)).toEqual({
      subscriptionId: '11111111-1111-1111-1111-111111111111',
      resourceGroupName: 'example-rg',
      healthModelName: 'example-model',
    });
  });

  test('rejects a non-Health-Model ARM resource ID', () => {
    expect(() =>
      parseHealthModelResourceId(
        '/subscriptions/11111111-1111-1111-1111-111111111111/resourceGroups/example-rg/providers/Microsoft.Compute/virtualMachines/example'
      )
    ).toThrow('not a valid Microsoft.CloudHealth health model resource ID');
  });

  test('normalizes a relative continuation link', () => {
    expect(
      normalizeArmNextLink(
        `${MODEL_ID}/entities?api-version=2026-09-01-preview&$skiptoken=next`,
        `${MODEL_ID}/entities`
      )
    ).toBe(`azuremonitor${MODEL_ID}/entities?api-version=2026-09-01-preview&$skiptoken=next`);
  });

  test('returns status-specific authorization and throttling messages', () => {
    expect(getHealthModelsErrorMessage({ status: 403 })).toContain('not authorized');
    expect(getHealthModelsErrorMessage({ status: 429 })).toContain('throttled');
  });
});

function createEntity(name: string): HealthModelEntity {
  return {
    id: `${MODEL_ID}/entities/${name}`,
    name,
    type: 'Microsoft.CloudHealth/healthmodels/entities',
    properties: {
      displayName: name,
      healthState: 'Healthy',
    },
  };
}

function createHealthModel() {
  return {
    id: MODEL_ID,
    name: 'example-model',
    type: 'Microsoft.CloudHealth/healthmodels',
  };
}

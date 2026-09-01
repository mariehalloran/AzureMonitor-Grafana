import { DataSourceInstanceSettings } from '@grafana/data';
import { createHealthModelsApi } from '../../components/SceneApp/HealthModels/HealthModelsApi';
import { HealthModelsDataSource } from './datasource';
import { HealthModelsDataSourceOptions } from './types';

jest.mock('../../components/SceneApp/HealthModels/HealthModelsApi', () => ({
  ...jest.requireActual('../../components/SceneApp/HealthModels/HealthModelsApi'),
  createHealthModelsApi: jest.fn(),
}));

const mockGetSubscriptions = jest.fn();
const mockReplace = jest.fn((value: string) => value);

jest.mock('@grafana/runtime', () => ({
  getTemplateSrv: () => ({ replace: (value: string) => mockReplace(value) }),
  getDataSourceSrv: () => ({ get: async () => ({ getSubscriptions: mockGetSubscriptions }) }),
}));

function createDatasource(azureMonitorDatasourceUid?: string) {
  return new HealthModelsDataSource({
    jsonData: { azureMonitorDatasourceUid },
  } as DataSourceInstanceSettings<HealthModelsDataSourceOptions>);
}

describe('HealthModelsDataSource.metricFindQuery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReplace.mockImplementation((value: string) => value);
  });

  it('lists subscriptions from the linked Azure Monitor data source', async () => {
    mockGetSubscriptions.mockResolvedValue([{ text: 'Prod', value: 'sub-1' }]);

    await expect(createDatasource('azmon').metricFindQuery('subscriptions()')).resolves.toEqual([
      { text: 'Prod', value: 'sub-1' },
    ]);
  });

  it('lists health models valued by resource ID', async () => {
    (createHealthModelsApi as jest.Mock).mockReturnValue({
      listHealthModels: jest.fn().mockResolvedValue({ items: [{ name: 'Foundry', id: '/subscriptions/sub-1/foundry' }] }),
    });

    await expect(createDatasource('azmon').metricFindQuery('healthModels(sub-1)')).resolves.toEqual([
      { text: 'Foundry', value: '/subscriptions/sub-1/foundry' },
    ]);
  });

  it('interpolates dashboard variables before matching', async () => {
    mockReplace.mockReturnValue('healthModels(sub-1)');
    const listHealthModels = jest.fn().mockResolvedValue({ items: [] });
    (createHealthModelsApi as jest.Mock).mockReturnValue({ listHealthModels });

    await createDatasource('azmon').metricFindQuery('healthModels($subscription)');

    expect(listHealthModels).toHaveBeenCalledWith('sub-1');
  });

  it('returns nothing when the subscription has not been chosen yet', async () => {
    await expect(createDatasource('azmon').metricFindQuery('healthModels()')).resolves.toEqual([]);
    expect(createHealthModelsApi).not.toHaveBeenCalled();
  });

  it('ignores unrecognised queries', async () => {
    await expect(createDatasource('azmon').metricFindQuery('entities()')).resolves.toEqual([]);
  });

  it('explains what to fix when no Azure Monitor data source is linked', async () => {
    await expect(createDatasource(undefined).metricFindQuery('subscriptions()')).rejects.toThrow(
      /Select an Azure Monitor data source/
    );
  });
});

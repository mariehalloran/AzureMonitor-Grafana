import { act, renderHook, waitFor } from '@testing-library/react';
import { HealthModelEntity, PagedResult } from '../../components/SceneApp/HealthModels/types';
import { MIN_REFETCH_INTERVAL_MS, useHealthModelEntities } from './useHealthModelEntities';

const listEntities = jest.fn();
const listRelationships = jest.fn();

jest.mock('../../components/SceneApp/HealthModels/HealthModelsApi', () => ({
  ...jest.requireActual('../../components/SceneApp/HealthModels/HealthModelsApi'),
  createHealthModelsApi: jest.fn(() => Promise.resolve({ listEntities, listRelationships })),
}));

jest.mock('@grafana/runtime', () => ({
  getTemplateSrv: () => ({ replace: (value: string) => value }),
}));

const SUBSCRIPTION_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_SUBSCRIPTION_ID = '22222222-2222-2222-2222-222222222222';

const configuration = {
  datasourceUid: 'azmon',
  subscriptionId: SUBSCRIPTION_ID,
  healthModelId: `/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/rg/providers/Microsoft.CloudHealth/healthmodels/model`,
};

describe('useHealthModelEntities refresh behaviour', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    listEntities.mockImplementation(() => Promise.resolve(entitiesResult('one')));
    listRelationships.mockImplementation(() => Promise.resolve(emptyResult()));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('re-fetches when the refresh key changes after the minimum interval', async () => {
    const { rerender } = renderHook(({ refreshKey }) => useHealthModelEntities(configuration, refreshKey), {
      initialProps: { refreshKey: 0 },
    });

    await waitFor(() => expect(listEntities).toHaveBeenCalledTimes(1));

    await act(async () => {
      jest.setSystemTime(new Date(Date.now() + MIN_REFETCH_INTERVAL_MS));
      rerender({ refreshKey: 1 });
    });

    await waitFor(() => expect(listEntities).toHaveBeenCalledTimes(2));
  });

  test('ignores a refresh that arrives before the minimum interval', async () => {
    const { rerender } = renderHook(({ refreshKey }) => useHealthModelEntities(configuration, refreshKey), {
      initialProps: { refreshKey: 0 },
    });

    await waitFor(() => expect(listEntities).toHaveBeenCalledTimes(1));

    await act(async () => {
      jest.setSystemTime(new Date(Date.now() + 5000));
      rerender({ refreshKey: 1 });
    });

    expect(listEntities).toHaveBeenCalledTimes(1);
  });

  test('fetches immediately when the selected health model changes, ignoring the interval', async () => {
    const { rerender } = renderHook(({ config }) => useHealthModelEntities(config, 0), {
      initialProps: { config: configuration },
    });

    await waitFor(() => expect(listEntities).toHaveBeenCalledTimes(1));

    const otherConfiguration = {
      datasourceUid: 'azmon',
      subscriptionId: OTHER_SUBSCRIPTION_ID,
      healthModelId: `/subscriptions/${OTHER_SUBSCRIPTION_ID}/resourceGroups/rg/providers/Microsoft.CloudHealth/healthmodels/other`,
    };

    await act(async () => {
      jest.setSystemTime(new Date(Date.now() + 1000));
      rerender({ config: otherConfiguration });
    });

    await waitFor(() => expect(listEntities).toHaveBeenCalledTimes(2));
  });

  test('keeps showing the previous entities while a refresh is in flight', async () => {
    let resolveSecond: ((value: PagedResult<HealthModelEntity>) => void) | undefined;
    const { result, rerender } = renderHook(({ refreshKey }) => useHealthModelEntities(configuration, refreshKey), {
      initialProps: { refreshKey: 0 },
    });

    await waitFor(() => expect(result.current.entities.items).toHaveLength(1));

    listEntities.mockImplementationOnce(
      () =>
        new Promise<PagedResult<HealthModelEntity>>((resolve) => {
          resolveSecond = resolve;
        })
    );

    await act(async () => {
      jest.setSystemTime(new Date(Date.now() + MIN_REFETCH_INTERVAL_MS));
      rerender({ refreshKey: 1 });
    });

    await waitFor(() => expect(result.current.loading).toBe(true));
    expect(result.current.entities.items).toHaveLength(1);

    await act(async () => {
      resolveSecond?.(entitiesResult('one', 'two'));
    });

    await waitFor(() => expect(result.current.entities.items).toHaveLength(2));
  });
});

function entitiesResult(...names: string[]): PagedResult<HealthModelEntity> {
  return {
    items: names.map((name) => ({
      id: `/entities/${name}`,
      name,
      type: 'Microsoft.CloudHealth/healthmodels/entities',
      properties: { displayName: name, healthState: 'Healthy' },
    })),
    pagesLoaded: 1,
    truncated: false,
  };
}

function emptyResult(): PagedResult<never> {
  return { items: [], pagesLoaded: 1, truncated: false };
}

import { HealthModelsClient, HealthModelsClientFactory } from './HealthModelsApi';
import { HealthModel, HealthModelEntity, HealthModelRelationship, PagedResult } from './types';

export const MOCK_HEALTH_MODELS_SUBSCRIPTION_ID = '00000000-0000-0000-0000-000000000001';

interface HealthModelsSandboxSnapshot {
  subscriptionId: string;
  models: HealthModel[];
  entitiesByModel: Record<string, HealthModelEntity[]>;
  relationshipsByModel: Record<string, HealthModelRelationship[]>;
}

class HealthModelsMockApi implements HealthModelsClient {
  public constructor(private readonly snapshot: HealthModelsSandboxSnapshot) {}

  public listHealthModels(_subscriptionId: string): Promise<PagedResult<HealthModel>> {
    return Promise.resolve(page(this.snapshot.models));
  }

  public listEntities(modelId: string): Promise<PagedResult<HealthModelEntity>> {
    return Promise.resolve(page(this.snapshot.entitiesByModel[modelId] ?? []));
  }

  public listRelationships(modelId: string): Promise<PagedResult<HealthModelRelationship>> {
    return Promise.resolve(page(this.snapshot.relationshipsByModel[modelId] ?? []));
  }
}

export const createHealthModelsMockApi: HealthModelsClientFactory = async (_datasourceUid) => {
  const response = await fetch('/public/plugins/azure-monitor-app/health-models-sandbox.json', {
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`The local Health Models snapshot could not be loaded (${response.status}).`);
  }

  const snapshot: unknown = await response.json();
  if (!isHealthModelsSandboxSnapshot(snapshot)) {
    throw new Error('The local Health Models snapshot has an invalid format.');
  }

  return new HealthModelsMockApi(snapshot);
};

export function isHealthModelsMockMode(): boolean {
  return (
    process.env.NODE_ENV === 'development' &&
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('healthModelsMock') === '1'
  );
}

function page<T>(items: T[]): PagedResult<T> {
  return {
    items,
    pagesLoaded: 1,
    truncated: false,
  };
}

function isHealthModelsSandboxSnapshot(value: unknown): value is HealthModelsSandboxSnapshot {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const snapshot = value as Partial<HealthModelsSandboxSnapshot>;
  return (
    typeof snapshot.subscriptionId === 'string' &&
    Array.isArray(snapshot.models) &&
    Boolean(snapshot.entitiesByModel) &&
    typeof snapshot.entitiesByModel === 'object' &&
    Boolean(snapshot.relationshipsByModel) &&
    typeof snapshot.relationshipsByModel === 'object'
  );
}

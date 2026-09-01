import { HealthModelEntity } from '../../components/SceneApp/HealthModels/types';
import { summarizeHealthStates } from '../../components/SceneApp/HealthModels/healthModelUtils';

export interface HealthDistributionSlice {
  state: string;
  count: number;
  percentage: number;
  startPercentage: number;
  endPercentage: number;
}

export interface HealthDistribution {
  total: number;
  slices: HealthDistributionSlice[];
}

export function buildHealthDistribution(entities: HealthModelEntity[]): HealthDistribution {
  const counts = summarizeHealthStates(entities);
  const values = [
    { state: 'Healthy', count: counts.healthy },
    { state: 'Degraded', count: counts.degraded },
    { state: 'Unhealthy', count: counts.unhealthy },
    { state: 'Unknown', count: counts.unknown },
  ];
  const total = values.reduce((sum, value) => sum + value.count, 0);
  let startPercentage = 0;

  return {
    total,
    slices: values.map(({ state, count }) => {
      const percentage = total === 0 ? 0 : (count / total) * 100;
      const slice = {
        state,
        count,
        percentage,
        startPercentage,
        endPercentage: startPercentage + percentage,
      };
      startPercentage = slice.endPercentage;
      return slice;
    }),
  };
}

import { HealthModelEntity } from './types';

export interface HealthStateCounts {
  healthy: number;
  degraded: number;
  unhealthy: number;
  unknown: number;
}

export function summarizeHealthStates(entities: HealthModelEntity[]): HealthStateCounts {
  return entities.reduce<HealthStateCounts>(
    (counts, entity) => {
      switch (entity.properties?.healthState?.toLowerCase()) {
        case 'healthy':
          counts.healthy++;
          break;
        case 'degraded':
          counts.degraded++;
          break;
        case 'unhealthy':
          counts.unhealthy++;
          break;
        default:
          counts.unknown++;
          break;
      }

      return counts;
    },
    {
      healthy: 0,
      degraded: 0,
      unhealthy: 0,
      unknown: 0,
    }
  );
}

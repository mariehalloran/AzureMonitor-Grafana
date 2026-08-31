import { summarizeHealthStates } from './healthModelUtils';
import { HealthModelEntity } from './types';

describe('summarizeHealthStates', () => {
  test('counts documented states and groups missing or future values as unknown', () => {
    const entities: HealthModelEntity[] = [
      createEntity('healthy', 'Healthy'),
      createEntity('degraded', 'Degraded'),
      createEntity('unhealthy', 'Unhealthy'),
      createEntity('unknown', 'Unknown'),
      createEntity('future', 'Maintenance'),
      createEntity('missing'),
    ];

    expect(summarizeHealthStates(entities)).toEqual({
      healthy: 1,
      degraded: 1,
      unhealthy: 1,
      unknown: 3,
    });
  });
});

function createEntity(name: string, healthState?: string): HealthModelEntity {
  return {
    id: `/entities/${name}`,
    name,
    type: 'Microsoft.CloudHealth/healthmodels/entities',
    properties: {
      healthState,
    },
  };
}

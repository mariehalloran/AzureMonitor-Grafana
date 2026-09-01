import { HealthModelEntity } from '../../components/SceneApp/HealthModels/types';
import { buildHealthDistribution } from './healthDistribution';

describe('buildHealthDistribution', () => {
  test('builds ordered pie slices from entity health states', () => {
    const entities = [
      createEntity('one', 'Healthy'),
      createEntity('two', 'Healthy'),
      createEntity('three', 'Degraded'),
      createEntity('four', 'Unhealthy'),
      createEntity('five', 'FutureState'),
    ];

    expect(buildHealthDistribution(entities)).toEqual({
      total: 5,
      slices: [
        {
          state: 'Healthy',
          count: 2,
          percentage: 40,
          startPercentage: 0,
          endPercentage: 40,
        },
        {
          state: 'Degraded',
          count: 1,
          percentage: 20,
          startPercentage: 40,
          endPercentage: 60,
        },
        {
          state: 'Unhealthy',
          count: 1,
          percentage: 20,
          startPercentage: 60,
          endPercentage: 80,
        },
        {
          state: 'Unknown',
          count: 1,
          percentage: 20,
          startPercentage: 80,
          endPercentage: 100,
        },
      ],
    });
  });
});

function createEntity(name: string, healthState: string): HealthModelEntity {
  return {
    id: `/entities/${name}`,
    name,
    type: 'Microsoft.CloudHealth/healthmodels/entities',
    properties: {
      healthState,
    },
  };
}

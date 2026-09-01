import { PanelPlugin } from '@grafana/data';
import { HealthModelConfigurationEditor } from '../healthModels/HealthModelConfigurationEditor';
import { HealthModelPanelConfiguration } from '../healthModels/types';
import { HealthModelEntitiesPanel, HealthModelEntitiesPanelOptions } from './HealthModelEntitiesPanel';

export const plugin = new PanelPlugin<HealthModelEntitiesPanelOptions>(HealthModelEntitiesPanel)
  .setNoPadding()
  .setPanelOptions((builder) => {
    builder
      .addCustomEditor<undefined, HealthModelPanelConfiguration>({
        id: 'healthModelConfiguration',
        path: 'configuration',
        name: 'Health Model',
        description: 'Select the Azure Monitor datasource, subscription, and Health Model.',
        editor: HealthModelConfigurationEditor,
        defaultValue: {},
      })
      .addSliderInput({
        path: 'historyHours',
        name: 'History range',
        description: 'Hours of entity health history loaded when a row is expanded.',
        defaultValue: 24,
        settings: {
          min: 1,
          max: 720,
          step: 1,
        },
      })
      .addSliderInput({
        path: 'maxEntities',
        name: 'Maximum entities',
        description: 'Maximum number of entity rows rendered in the panel.',
        defaultValue: 100,
        settings: {
          min: 10,
          max: 500,
          step: 10,
        },
      });
  });

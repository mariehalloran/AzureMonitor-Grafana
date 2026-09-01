import { PanelPlugin } from '@grafana/data';
import { HealthModelConfigurationEditor } from '../healthModels/HealthModelConfigurationEditor';
import { HealthModelPanelConfiguration } from '../healthModels/types';
import { HealthModelTopologyPanel, HealthModelTopologyPanelOptions } from './HealthModelTopologyPanel';

export const plugin = new PanelPlugin<HealthModelTopologyPanelOptions>(HealthModelTopologyPanel)
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
      .addBooleanSwitch({
        path: 'showRelationshipLabels',
        name: 'Show relationship labels',
        description: 'Display the relationship name on each connector.',
        defaultValue: true,
      })
      .addBooleanSwitch({
        path: 'fitToPanel',
        name: 'Fit to panel',
        description: 'Scale the tree down so the whole model fits. Turn off to scroll at full size.',
        defaultValue: true,
      });
  });

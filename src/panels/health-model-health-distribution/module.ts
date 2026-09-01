import { PanelPlugin } from '@grafana/data';
import { HealthModelConfigurationEditor } from '../healthModels/HealthModelConfigurationEditor';
import { HealthModelPanelConfiguration } from '../healthModels/types';
import {
  HealthModelHealthDistributionPanel,
  HealthModelHealthDistributionPanelOptions,
} from './HealthModelHealthDistributionPanel';

export const plugin = new PanelPlugin<HealthModelHealthDistributionPanelOptions>(HealthModelHealthDistributionPanel)
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
      .addRadio({
        path: 'displayMode',
        name: 'Chart style',
        defaultValue: 'pie',
        settings: {
          options: [
            {
              label: 'Pie',
              value: 'pie',
            },
            {
              label: 'Donut',
              value: 'donut',
            },
          ],
        },
      })
      .addBooleanSwitch({
        path: 'showLegend',
        name: 'Show legend',
        defaultValue: true,
      });
  });

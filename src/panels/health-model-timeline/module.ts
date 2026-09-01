import { PanelPlugin } from '@grafana/data';
import { HealthModelTimelinePanel, HealthModelTimelinePanelOptions } from './HealthModelTimelinePanel';

export const plugin = new PanelPlugin<HealthModelTimelinePanelOptions>(HealthModelTimelinePanel)
  .setNoPadding()
  .setPanelOptions((builder) => {
    builder.addSliderInput({
      path: 'historyHours',
      name: 'History range',
      description: 'Hours of entity health history loaded when a row is expanded.',
      defaultValue: 24,
      settings: { min: 1, max: 720, step: 1 },
    });
  });

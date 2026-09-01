import { PanelPlugin } from '@grafana/data';
import { HealthModelGraphPanel, HealthModelGraphPanelOptions } from './HealthModelGraphPanel';

export const plugin = new PanelPlugin<HealthModelGraphPanelOptions>(HealthModelGraphPanel).setNoPadding();

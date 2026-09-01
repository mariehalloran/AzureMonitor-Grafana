export interface HealthModelPanelConfiguration {
  datasourceUid?: string;
  subscriptionId?: string;
  healthModelId?: string;
}

export interface HealthModelPanelOptions {
  configuration?: HealthModelPanelConfiguration;
}

export function isHealthModelPanelConfigured(
  configuration?: HealthModelPanelConfiguration
): configuration is Required<HealthModelPanelConfiguration> {
  return Boolean(configuration?.datasourceUid && configuration.subscriptionId && configuration.healthModelId);
}

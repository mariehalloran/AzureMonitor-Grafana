import { getTemplateSrv } from '@grafana/runtime';

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

// Panel options may hold dashboard variable references such as "${healthmodel}" so a bundled
// dashboard can drive every panel from a single set of pickers. None of the concrete values
// (datasource UID, subscription GUID, ARM resource ID) legitimately contain "$", so a value that
// still does after interpolation means the variable has no value yet and is treated as unset.
export function resolveHealthModelConfiguration(
  configuration?: HealthModelPanelConfiguration
): HealthModelPanelConfiguration {
  if (!configuration) {
    return {};
  }

  const templateSrv = getTemplateSrv();
  const resolve = (value?: string) => {
    if (!value) {
      return undefined;
    }

    const replaced = templateSrv.replace(value).trim();
    return !replaced || replaced.includes('$') ? undefined : replaced;
  };

  return {
    datasourceUid: resolve(configuration.datasourceUid),
    subscriptionId: resolve(configuration.subscriptionId),
    healthModelId: resolve(configuration.healthModelId),
  };
}

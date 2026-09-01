import { DataSourceApi, StandardEditorProps } from '@grafana/data';
import { getDataSourceSrv } from '@grafana/runtime';
import { Alert, Combobox, ComboboxOption, Field } from '@grafana/ui';
import React from 'react';
import {
  AZURE_MONITOR_DATASOURCE_TYPE,
  createHealthModelsApi,
  getHealthModelsErrorMessage,
  parseHealthModelResourceId,
} from '../../components/SceneApp/HealthModels/HealthModelsApi';
import { HealthModelPanelConfiguration } from './types';

interface AzureMonitorSubscriptionDatasource extends DataSourceApi {
  getSubscriptions(): Promise<Array<{ text: string; value: string }>>;
}

export function HealthModelConfigurationEditor({
  value,
  onChange,
}: StandardEditorProps<HealthModelPanelConfiguration>) {
  const configuration = value ?? {};
  const datasourceOptions = React.useMemo<Array<ComboboxOption<string>>>(
    () =>
      getDataSourceSrv()
        .getList()
        .filter((datasource) => datasource.type === AZURE_MONITOR_DATASOURCE_TYPE)
        .map((datasource) => ({
          label: datasource.name,
          value: datasource.uid,
        })),
    []
  );
  const [subscriptionOptions, setSubscriptionOptions] = React.useState<Array<ComboboxOption<string>>>([]);
  const [modelOptions, setModelOptions] = React.useState<Array<ComboboxOption<string>>>([]);
  const [subscriptionsLoading, setSubscriptionsLoading] = React.useState(false);
  const [modelsLoading, setModelsLoading] = React.useState(false);
  const [subscriptionsError, setSubscriptionsError] = React.useState<string>();
  const [modelsError, setModelsError] = React.useState<string>();

  React.useEffect(() => {
    let cancelled = false;
    setSubscriptionOptions([]);
    setSubscriptionsError(undefined);

    if (!configuration.datasourceUid) {
      return;
    }

    setSubscriptionsLoading(true);
    void getDataSourceSrv()
      .get({
        type: AZURE_MONITOR_DATASOURCE_TYPE,
        uid: configuration.datasourceUid,
      })
      .then(async (datasource) => {
        const subscriptionDatasource = datasource as Partial<AzureMonitorSubscriptionDatasource>;
        if (typeof subscriptionDatasource.getSubscriptions !== 'function') {
          throw new Error('The selected Azure Monitor datasource cannot list subscriptions.');
        }

        return subscriptionDatasource.getSubscriptions();
      })
      .then((subscriptions) => {
        if (cancelled) {
          return;
        }

        setSubscriptionOptions(
          subscriptions.map((subscription) => ({
            label: subscription.text,
            value: subscription.value,
          }))
        );
      })
      .catch((error) => {
        if (!cancelled) {
          setSubscriptionsError(getHealthModelsErrorMessage(error));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSubscriptionsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [configuration.datasourceUid]);

  React.useEffect(() => {
    let cancelled = false;
    setModelOptions([]);
    setModelsError(undefined);

    if (!configuration.datasourceUid || !configuration.subscriptionId) {
      return;
    }

    setModelsLoading(true);
    void createHealthModelsApi(configuration.datasourceUid)
      .then((api) => api.listHealthModels(configuration.subscriptionId!))
      .then((models) => {
        if (cancelled) {
          return;
        }

        setModelOptions(
          models.items.map((model) => {
            const resourceId = parseHealthModelResourceId(model.id);
            return {
              label: `${model.name} / ${resourceId.resourceGroupName}`,
              value: model.id,
            };
          })
        );
      })
      .catch((error) => {
        if (!cancelled) {
          setModelsError(getHealthModelsErrorMessage(error));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setModelsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [configuration.datasourceUid, configuration.subscriptionId]);

  if (datasourceOptions.length === 0) {
    return (
      <Alert title="Azure Monitor datasource required" severity="warning">
        Configure an Azure Monitor datasource before using this panel.
      </Alert>
    );
  }

  return (
    <>
      <Field label="Azure Monitor datasource">
        <Combobox
          options={datasourceOptions}
          value={configuration.datasourceUid}
          onChange={(option) => {
            setSubscriptionOptions([]);
            setModelOptions([]);
            onChange({
              datasourceUid: option.value,
            });
          }}
        />
      </Field>
      <Field label="Subscription" invalid={Boolean(subscriptionsError)} error={subscriptionsError}>
        <Combobox
          options={subscriptionOptions}
          value={configuration.subscriptionId}
          loading={subscriptionsLoading}
          disabled={!configuration.datasourceUid}
          placeholder={configuration.datasourceUid ? 'Select a subscription' : 'Select a datasource first'}
          onChange={(option) => {
            setModelOptions([]);
            onChange({
              datasourceUid: configuration.datasourceUid,
              subscriptionId: option.value,
            });
          }}
        />
      </Field>
      <Field label="Health Model" invalid={Boolean(modelsError)} error={modelsError}>
        <Combobox
          options={modelOptions}
          value={configuration.healthModelId}
          loading={modelsLoading}
          disabled={!configuration.subscriptionId}
          placeholder={configuration.subscriptionId ? 'Select a Health Model' : 'Select a subscription first'}
          onChange={(option) =>
            onChange({
              ...configuration,
              healthModelId: option.value,
            })
          }
        />
      </Field>
    </>
  );
}

import { DataSourceApi, QueryEditorProps } from '@grafana/data';
import { getDataSourceSrv } from '@grafana/runtime';
import { Alert, Combobox, ComboboxOption, Field, RadioButtonGroup, useStyles2 } from '@grafana/ui';
import { css } from '@emotion/css';
import React from 'react';
import {
  AZURE_MONITOR_DATASOURCE_TYPE,
  getHealthModelsErrorMessage,
  parseHealthModelResourceId,
} from '../../components/SceneApp/HealthModels/HealthModelsApi';
import { HealthModelsDataSource } from './datasource';
import { DEFAULT_RESULT_FORMAT, HealthModelsDataSourceOptions, HealthModelsQuery, HealthModelsResultFormat } from './types';

interface AzureMonitorSubscriptionDatasource extends DataSourceApi {
  getSubscriptions(): Promise<Array<{ text: string; value: string }>>;
}

const RESULT_FORMATS: Array<{ label: string; value: HealthModelsResultFormat; description: string }> = [
  {
    label: 'Model graph',
    value: 'nodeGraph',
    description: 'Entities and their relationships, for the Azure Health Model Graph or Node Graph panel.',
  },
  {
    label: 'Entities',
    value: 'entities',
    description: 'One row per entity, with health state, last checked, signals, and alerts.',
  },
];

export function QueryEditor({
  datasource,
  query,
  onChange,
  onRunQuery,
}: QueryEditorProps<HealthModelsDataSource, HealthModelsQuery, HealthModelsDataSourceOptions>) {
  const styles = useStyles2(getStyles);
  const [subscriptions, setSubscriptions] = React.useState<Array<ComboboxOption<string>>>([]);
  const [models, setModels] = React.useState<Array<ComboboxOption<string>>>([]);
  const [subscriptionsLoading, setSubscriptionsLoading] = React.useState(false);
  const [modelsLoading, setModelsLoading] = React.useState(false);
  const [error, setError] = React.useState<string>();
  const azureMonitorUid = datasource.azureMonitorDatasourceUid;

  React.useEffect(() => {
    let cancelled = false;
    if (!azureMonitorUid) {
      return;
    }

    setSubscriptionsLoading(true);
    void getDataSourceSrv()
      .get({ type: AZURE_MONITOR_DATASOURCE_TYPE, uid: azureMonitorUid })
      .then(async (azureMonitor) => {
        const subscriptionSource = azureMonitor as Partial<AzureMonitorSubscriptionDatasource>;
        if (typeof subscriptionSource.getSubscriptions !== 'function') {
          throw new Error('The selected Azure Monitor data source cannot list subscriptions.');
        }
        return subscriptionSource.getSubscriptions();
      })
      .then((result) => {
        if (!cancelled) {
          setSubscriptions(result.map((item) => ({ label: item.text, value: item.value })));
        }
      })
      .catch((loadError) => !cancelled && setError(getHealthModelsErrorMessage(loadError)))
      .finally(() => !cancelled && setSubscriptionsLoading(false));

    return () => {
      cancelled = true;
    };
  }, [azureMonitorUid]);

  React.useEffect(() => {
    let cancelled = false;
    setModels([]);
    if (!query.subscriptionId) {
      return;
    }

    setModelsLoading(true);
    void datasource
      .getClient()
      .then((client) => client.listHealthModels(query.subscriptionId!))
      .then((result) => {
        if (!cancelled) {
          setModels(
            result.items.map((model) => ({
              label: `${model.name} / ${parseHealthModelResourceId(model.id).resourceGroupName}`,
              value: model.id,
            }))
          );
        }
      })
      .catch((loadError) => !cancelled && setError(getHealthModelsErrorMessage(loadError)))
      .finally(() => !cancelled && setModelsLoading(false));

    return () => {
      cancelled = true;
    };
  }, [datasource, query.subscriptionId]);

  if (!azureMonitorUid) {
    return (
      <Alert title="Select an Azure Monitor data source" severity="info">
        Health Models authenticates through an Azure Monitor data source.{' '}
        <a className={styles.settingsLink} href={`/connections/datasources/edit/${datasource.uid}`}>
          Open this data source’s settings
        </a>{' '}
        and choose one, then return to this query.
      </Alert>
    );
  }

  return (
    <>
      {error && (
        <Alert title="Health Models request failed" severity="error">
          {error}
        </Alert>
      )}
      <Field label="Subscription">
        <Combobox
          options={subscriptions}
          value={query.subscriptionId}
          loading={subscriptionsLoading}
          placeholder="Select a subscription"
          onChange={(option) => onChange({ ...query, subscriptionId: option.value, healthModelId: undefined })}
        />
      </Field>
      <Field label="Health Model">
        <Combobox
          options={models}
          value={query.healthModelId}
          loading={modelsLoading}
          disabled={!query.subscriptionId}
          placeholder={query.subscriptionId ? 'Select a Health Model' : 'Select a subscription first'}
          onChange={(option) => {
            onChange({ ...query, healthModelId: option.value });
            onRunQuery();
          }}
        />
      </Field>
      <Field label="Format" description={RESULT_FORMATS.find((f) => f.value === (query.resultFormat ?? DEFAULT_RESULT_FORMAT))?.description}>
        <RadioButtonGroup
          options={RESULT_FORMATS.map(({ label, value }) => ({ label, value }))}
          value={query.resultFormat ?? DEFAULT_RESULT_FORMAT}
          onChange={(value) => {
            onChange({ ...query, resultFormat: value });
            onRunQuery();
          }}
        />
      </Field>
    </>
  );
}

function getStyles() {
  return {
    settingsLink: css({
      textDecoration: 'underline',
    }),
  };
}

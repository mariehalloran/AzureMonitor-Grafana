import { DataSourcePluginOptionsEditorProps } from '@grafana/data';
import { getDataSourceSrv } from '@grafana/runtime';
import { Alert, Combobox, ComboboxOption, Field } from '@grafana/ui';
import React from 'react';
import { AZURE_MONITOR_DATASOURCE_TYPE } from '../../components/SceneApp/HealthModels/HealthModelsApi';
import { HealthModelsDataSourceOptions } from './types';

export function ConfigEditor({
  options,
  onOptionsChange,
}: DataSourcePluginOptionsEditorProps<HealthModelsDataSourceOptions>) {
  const datasourceOptions = React.useMemo<Array<ComboboxOption<string>>>(
    () =>
      getDataSourceSrv()
        .getList()
        .filter((datasource) => datasource.type === AZURE_MONITOR_DATASOURCE_TYPE)
        .map((datasource) => ({ label: datasource.name, value: datasource.uid })),
    []
  );
  const selectedUid = options.jsonData.azureMonitorDatasourceUid;

  // With a single Azure Monitor data source there is no meaningful choice to make, so preselect it
  // and let the query editor work immediately instead of failing on an unset value.
  React.useEffect(() => {
    if (!selectedUid && datasourceOptions.length === 1) {
      onOptionsChange({
        ...options,
        jsonData: { ...options.jsonData, azureMonitorDatasourceUid: datasourceOptions[0].value },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasourceOptions, selectedUid]);

  if (datasourceOptions.length === 0) {
    return (
      <Alert title="Azure Monitor data source required" severity="warning">
        Configure an Azure Monitor data source first. Health Models uses it to authenticate against Azure Resource
        Manager.
      </Alert>
    );
  }

  return (
    <Field
      label="Azure Monitor data source"
      description="Health Models queries Azure Resource Manager through this data source, so it inherits its credentials and cloud."
    >
      <Combobox
        options={datasourceOptions}
        value={selectedUid}
        onChange={(option) =>
          onOptionsChange({
            ...options,
            jsonData: { ...options.jsonData, azureMonitorDatasourceUid: option.value },
          })
        }
      />
    </Field>
  );
}

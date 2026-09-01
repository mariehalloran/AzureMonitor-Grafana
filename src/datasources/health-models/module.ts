import { DataSourcePlugin } from '@grafana/data';
import { ConfigEditor } from './ConfigEditor';
import { QueryEditor } from './QueryEditor';
import { HealthModelsDataSource } from './datasource';
import { HealthModelsDataSourceOptions, HealthModelsQuery } from './types';

export const plugin = new DataSourcePlugin<HealthModelsDataSource, HealthModelsQuery, HealthModelsDataSourceOptions>(
  HealthModelsDataSource
)
  .setConfigEditor(ConfigEditor)
  .setQueryEditor(QueryEditor);

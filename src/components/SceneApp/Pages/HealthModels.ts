import {
  EmbeddedScene,
  SceneAppPage,
  SceneFlexItem,
  SceneFlexLayout,
  SceneVariableSet,
  VariableValueSelectors,
} from '@grafana/scenes';
import { Reporter } from 'reporter/reporter';
import { ReportType } from 'reporter/types';
import { AZMON_DS_VARIABLE, ROUTES } from '../../../constants';
import { HealthModelOverview } from '../HealthModels/HealthModelOverview';
import {
  createHealthModelsMockApi,
  isHealthModelsMockMode,
  MOCK_HEALTH_MODELS_SUBSCRIPTION_ID,
} from '../HealthModels/HealthModelsMockApi';
import { selectFirstAvailableSubscription } from '../HealthModels/subscriptionSelection';
import { getInstanceDatasourcesForType } from '../Queries/queryUtil';
import { getDataSourcesVariableForType, getSubscriptionVariable } from '../Variables/variables';
import { getBehaviorsForVariables, getGenericSceneAppPage, getMissingDatasourceScene } from './sceneUtils';
import { prefixRoute } from 'utils/utils.routing';

export function getHealthModelsScene(pluginReporter: Reporter): SceneAppPage {
  const sceneTitle = 'Health Models';
  const sceneUrl = prefixRoute(ROUTES.HealthModels);
  const reporter = 'Scene.Main.HealthModelsScene';
  if (isHealthModelsMockMode()) {
    return getMockHealthModelsScene(sceneTitle, sceneUrl, reporter, pluginReporter);
  }

  const azureMonitorDatasources = getInstanceDatasourcesForType('grafana-azure-monitor-datasource');

  if (azureMonitorDatasources.length === 0) {
    return getGenericSceneAppPage(sceneTitle, sceneUrl, () =>
      getMissingDatasourceScene('Azure Monitor', reporter, pluginReporter, 'an Azure Monitor datasource')
    );
  }

  const datasourceVariable = getDataSourcesVariableForType(
    'grafana-azure-monitor-datasource',
    AZMON_DS_VARIABLE,
    'Azure Monitor Datasource'
  );
  const subscriptionVariable = getSubscriptionVariable(false, false);
  const variables = [datasourceVariable, subscriptionVariable];
  const overview = new HealthModelOverview();

  const scene = new EmbeddedScene({
    $variables: new SceneVariableSet({
      variables,
    }),
    $behaviors: getBehaviorsForVariables(variables, pluginReporter),
    controls: [new VariableValueSelectors({})],
    body: new SceneFlexLayout({
      direction: 'column',
      children: [
        new SceneFlexItem({
          minHeight: 500,
          body: overview,
        }),
      ],
    }),
  });

  scene.addActivationHandler(() => {
    pluginReporter.reportPageView('grafana_plugin_page_view', {
      reporter,
      type: ReportType.PageView,
    });

    selectFirstAvailableSubscription(subscriptionVariable);
    const subscriptionVariableSubscription = subscriptionVariable.subscribeToState(() => {
      selectFirstAvailableSubscription(subscriptionVariable);
    });

    return () => {
      subscriptionVariableSubscription.unsubscribe();
    };
  });

  return new SceneAppPage({
    title: sceneTitle,
    url: sceneUrl,
    getScene: () => scene,
  });
}

function getMockHealthModelsScene(
  sceneTitle: string,
  sceneUrl: string,
  reporter: string,
  pluginReporter: Reporter
): SceneAppPage {
  const overview = new HealthModelOverview({
    apiFactory: createHealthModelsMockApi,
    fixedContext: {
      datasourceUid: 'health-models-mock',
      subscriptionId: MOCK_HEALTH_MODELS_SUBSCRIPTION_ID,
    },
    mockMode: true,
  });
  const scene = new EmbeddedScene({
    body: new SceneFlexLayout({
      direction: 'column',
      children: [
        new SceneFlexItem({
          minHeight: 500,
          body: overview,
        }),
      ],
    }),
  });

  scene.addActivationHandler(() => {
    pluginReporter.reportPageView('grafana_plugin_page_view', {
      reporter,
      type: ReportType.PageView,
      dataSource: 'mock',
    });
  });

  return new SceneAppPage({
    title: sceneTitle,
    url: sceneUrl,
    getScene: () => scene,
  });
}

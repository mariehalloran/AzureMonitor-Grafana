import { css } from "@emotion/css";
import { GrafanaTheme2, SelectableValue } from "@grafana/data";
import {
  DataSourceVariable,
  QueryVariable,
  SceneComponentProps,
  SceneObjectBase,
  SceneObjectState,
  sceneGraph,
  VariableValue,
} from "@grafana/scenes";
import { Alert, Badge, Button, Select, Spinner, useStyles2 } from "@grafana/ui";
import React from "react";
import { AZMON_DS_VARIABLE, SUBSCRIPTION_VARIABLE } from "../../../constants";
import { createHealthModelsApi, getHealthModelsErrorMessage, parseHealthModelResourceId } from "./HealthModelsApi";
import { summarizeHealthStates } from "./healthModelUtils";
import {
  HealthModel,
  HealthModelEntity,
  HealthModelRelationship,
  HealthModelResourceId,
  PagedResult,
} from "./types";

const MAX_VISIBLE_ENTITIES = 200;

interface HealthModelOverviewState extends SceneObjectState {
  loading: boolean;
  selectionMessage?: string;
  models: PagedResult<HealthModel>;
  selectedModelId?: string;
  resourceId?: HealthModelResourceId;
  model?: HealthModel;
  entities: PagedResult<HealthModelEntity>;
  relationships: PagedResult<HealthModelRelationship>;
  modelsError?: string;
  entitiesError?: string;
  relationshipsError?: string;
  lastUpdated?: number;
}

interface SettledResult<T> {
  value?: T;
  error?: string;
}

export class HealthModelOverview extends SceneObjectBase<HealthModelOverviewState> {
  public static Component = HealthModelOverviewRenderer;

  private datasourceVariable?: DataSourceVariable;
  private subscriptionVariable?: QueryVariable;
  private requestGeneration = 0;
  private currentContextKey?: string;
  private activeDatasourceUid?: string;

  public constructor() {
    super({
      loading: false,
      selectionMessage: "Select a subscription to load its health models.",
      models: emptyPagedResult(),
      entities: emptyPagedResult(),
      relationships: emptyPagedResult(),
    });

    this.addActivationHandler(() => {
      this.datasourceVariable = sceneGraph.lookupVariable(AZMON_DS_VARIABLE, this) as DataSourceVariable;
      this.subscriptionVariable = sceneGraph.lookupVariable(SUBSCRIPTION_VARIABLE, this) as QueryVariable;

      if (!this.datasourceVariable || !this.subscriptionVariable) {
        this.setState({
          selectionMessage: undefined,
          modelsError: "The Health Models page variables could not be initialized.",
        });
        return;
      }

      const datasourceSubscription = this.datasourceVariable.subscribeToState(() => {
        void this.loadFromVariables();
      });
      const subscriptionSubscription = this.subscriptionVariable.subscribeToState(() => {
        void this.loadFromVariables();
      });

      void this.loadFromVariables();

      return () => {
        this.requestGeneration++;
        this.currentContextKey = undefined;
        this.activeDatasourceUid = undefined;
        this.datasourceVariable = undefined;
        this.subscriptionVariable = undefined;
        datasourceSubscription.unsubscribe();
        subscriptionSubscription.unsubscribe();
      };
    });
  }

  public refresh = () => {
    void this.loadFromVariables(true);
  };

  public selectModel = (modelId?: string) => {
    if (!modelId || !this.activeDatasourceUid) {
      return;
    }

    const selectedModel = this.state.models.items.find((healthModel) => healthModel.id === modelId);
    if (!selectedModel || selectedModel.id === this.state.selectedModelId) {
      return;
    }

    const requestGeneration = ++this.requestGeneration;
    this.setState({
      loading: true,
      selectionMessage: undefined,
      selectedModelId: selectedModel.id,
      resourceId: parseHealthModelResourceId(selectedModel.id),
      model: selectedModel,
      entities: emptyPagedResult(),
      relationships: emptyPagedResult(),
      entitiesError: undefined,
      relationshipsError: undefined,
      lastUpdated: undefined,
    });

    void this.loadSelectedModel(this.activeDatasourceUid, selectedModel, requestGeneration);
  };

  private async loadFromVariables(force = false) {
    const datasourceVariable = this.datasourceVariable;
    const subscriptionVariable = this.subscriptionVariable;

    if (!datasourceVariable || !subscriptionVariable) {
      return;
    }

    if (subscriptionVariable.state.loading) {
      this.invalidateContext("Loading subscriptions for the selected datasource.");
      return;
    }

    if (subscriptionVariable.state.error) {
      this.invalidateContext("Unable to load subscriptions for the selected datasource.");
      this.setState({
        modelsError: getHealthModelsErrorMessage(subscriptionVariable.state.error),
      });
      return;
    }

    const datasourceUid = singleVariableValue(datasourceVariable.state.value);
    const subscriptionId = singleVariableValue(subscriptionVariable.state.value);
    if (!datasourceUid) {
      this.invalidateContext("Select an Azure Monitor datasource.");
      return;
    }
    if (!subscriptionId) {
      this.invalidateContext("Select a subscription to load its health models.");
      return;
    }

    const contextKey = `${datasourceUid}|${subscriptionId}`;
    if (!force && this.currentContextKey === contextKey) {
      return;
    }

    const contextChanged = this.currentContextKey !== contextKey;
    const requestGeneration = ++this.requestGeneration;
    this.currentContextKey = contextKey;
    this.activeDatasourceUid = datasourceUid;
    this.setState({
      loading: true,
      selectionMessage: undefined,
      models: contextChanged ? emptyPagedResult() : this.state.models,
      selectedModelId: contextChanged ? undefined : this.state.selectedModelId,
      resourceId: contextChanged ? undefined : this.state.resourceId,
      model: contextChanged ? undefined : this.state.model,
      entities: contextChanged ? emptyPagedResult() : this.state.entities,
      relationships: contextChanged ? emptyPagedResult() : this.state.relationships,
      modelsError: undefined,
      entitiesError: undefined,
      relationshipsError: undefined,
      lastUpdated: contextChanged ? undefined : this.state.lastUpdated,
    });

    try {
      const api = await createHealthModelsApi(datasourceUid);
      const models = await api.listHealthModels(subscriptionId);
      if (requestGeneration !== this.requestGeneration || !this.isActive) {
        return;
      }

      if (models.items.length === 0) {
        this.setState({
          loading: false,
          selectionMessage: "No health models were found in the selected subscription.",
          models,
          selectedModelId: undefined,
          resourceId: undefined,
          model: undefined,
          entities: emptyPagedResult(),
          relationships: emptyPagedResult(),
          lastUpdated: Date.now(),
        });
        return;
      }

      const selectedModel =
        models.items.find((healthModel) => healthModel.id === this.state.selectedModelId) ?? models.items[0];
      this.setState({
        models,
        selectedModelId: selectedModel.id,
        resourceId: parseHealthModelResourceId(selectedModel.id),
        model: selectedModel,
        entities: selectedModel.id === this.state.selectedModelId ? this.state.entities : emptyPagedResult(),
        relationships:
          selectedModel.id === this.state.selectedModelId ? this.state.relationships : emptyPagedResult(),
      });
      await this.loadSelectedModel(datasourceUid, selectedModel, requestGeneration, api);
    } catch (error) {
      if (requestGeneration !== this.requestGeneration || !this.isActive) {
        return;
      }

      this.setState({
        loading: false,
        modelsError: getHealthModelsErrorMessage(error),
      });
    }
  }

  private async loadSelectedModel(
    datasourceUid: string,
    selectedModel: HealthModel,
    requestGeneration: number,
    existingApi?: Awaited<ReturnType<typeof createHealthModelsApi>>,
  ) {
    try {
      const api = existingApi ?? (await createHealthModelsApi(datasourceUid));
      const [entitiesResult, relationshipsResult] = await Promise.all([
        settle(api.listEntities(selectedModel.id)),
        settle(api.listRelationships(selectedModel.id)),
      ]);

      if (requestGeneration !== this.requestGeneration || !this.isActive) {
        return;
      }

      this.setState({
        loading: false,
        entities: entitiesResult.value ?? this.state.entities,
        relationships: relationshipsResult.value ?? this.state.relationships,
        entitiesError: entitiesResult.error,
        relationshipsError: relationshipsResult.error,
        lastUpdated: Date.now(),
      });
    } catch (error) {
      if (requestGeneration !== this.requestGeneration || !this.isActive) {
        return;
      }

      this.setState({
        loading: false,
        entitiesError: getHealthModelsErrorMessage(error),
        relationshipsError: getHealthModelsErrorMessage(error),
      });
    }
  }

  private invalidateContext(message: string) {
    this.requestGeneration++;
    this.currentContextKey = undefined;
    this.activeDatasourceUid = undefined;
    this.setState({
      loading: false,
      selectionMessage: message,
      models: emptyPagedResult(),
      selectedModelId: undefined,
      resourceId: undefined,
      model: undefined,
      entities: emptyPagedResult(),
      relationships: emptyPagedResult(),
      modelsError: undefined,
      entitiesError: undefined,
      relationshipsError: undefined,
      lastUpdated: undefined,
    });
  }
}

async function settle<T>(request: Promise<T>): Promise<SettledResult<T>> {
  try {
    return {
      value: await request,
    };
  } catch (error) {
    return {
      error: getHealthModelsErrorMessage(error),
    };
  }
}

function emptyPagedResult<T>(): PagedResult<T> {
  return {
    items: [],
    pagesLoaded: 0,
    truncated: false,
  };
}

function singleVariableValue(value: VariableValue): string | undefined {
  if (Array.isArray(value)) {
    return value.length === 1 ? String(value[0]) : undefined;
  }

  const stringValue = value === null || value === undefined ? "" : String(value).trim();
  return stringValue || undefined;
}

function HealthModelOverviewRenderer({ model }: SceneComponentProps<HealthModelOverview>) {
  const state = model.useState();
  const styles = useStyles2(getStyles);
  const healthStateCounts = summarizeHealthStates(state.entities.items);
  const displayedEntities = [...state.entities.items]
    .sort((left, right) =>
      (left.properties?.displayName ?? left.name).localeCompare(right.properties?.displayName ?? right.name),
    )
    .slice(0, MAX_VISIBLE_ENTITIES);
  const modelOptions: Array<SelectableValue<string>> = state.models.items.map((healthModel) => {
    const resourceId = parseHealthModelResourceId(healthModel.id);
    return {
      label: `${healthModel.name} / ${resourceId.resourceGroupName}`,
      value: healthModel.id,
    };
  });
  const hasLoadedData =
    state.models.pagesLoaded > 0 || state.entities.pagesLoaded > 0 || state.relationships.pagesLoaded > 0;

  if (state.selectionMessage && state.models.items.length === 0) {
    return (
      <div className={styles.container}>
        <Alert title="Health Models" severity="info">
          {state.selectionMessage}
        </Alert>
        {state.modelsError && (
          <Alert title="Health Models API request failed" severity="error">
            {state.modelsError}
          </Alert>
        )}
      </div>
    );
  }

  if (state.loading && !hasLoadedData) {
    return (
      <div className={styles.loading}>
        <Spinner />
        <span>Loading health models from Microsoft.CloudHealth...</span>
      </div>
    );
  }

  const modelName = state.model?.name ?? state.resourceId?.healthModelName ?? "Health Model";

  return (
    <div className={styles.container}>
      <div className={styles.modelSelector}>
        <label htmlFor="health-model-select">Health Model</label>
        <Select<string>
          inputId="health-model-select"
          aria-label="Health Model"
          options={modelOptions}
          value={state.selectedModelId}
          onChange={(option) => model.selectModel(option.value)}
          noOptionsMessage="No health models found"
          isSearchable
        />
      </div>

      <div className={styles.header}>
        <div>
          <div className={styles.titleRow}>
            <h2 className={styles.title}>{modelName}</h2>
            <Badge text="Preview" color="blue" />
          </div>
          {state.resourceId && (
            <div className={styles.metadata}>
              Subscription: {state.resourceId.subscriptionId} &middot; Resource group:{" "}
              {state.resourceId.resourceGroupName}
              {state.model?.location && <> &middot; Location: {state.model.location}</>}
              {state.model?.properties?.provisioningState && (
                <> &middot; Provisioning: {state.model.properties.provisioningState}</>
              )}
            </div>
          )}
          {state.lastUpdated && (
            <div className={styles.metadata}>Last refreshed: {new Date(state.lastUpdated).toLocaleString()}</div>
          )}
        </div>
        <Button icon="sync" variant="secondary" onClick={model.refresh} disabled={state.loading}>
          Refresh
        </Button>
      </div>

      {state.loading && (
        <div className={styles.refreshing}>
          <Spinner />
          <span>Refreshing...</span>
        </div>
      )}

      {state.modelsError && (
        <Alert title="Health models could not be loaded" severity="warning">
          {state.modelsError}
        </Alert>
      )}
      {state.entitiesError && (
        <Alert title="Entities could not be loaded" severity="warning">
          {state.entitiesError}
        </Alert>
      )}
      {state.relationshipsError && (
        <Alert title="Relationships could not be loaded" severity="warning">
          {state.relationshipsError}
        </Alert>
      )}
      {(state.models.truncated || state.entities.truncated || state.relationships.truncated) && (
        <Alert title="Only part of the Health Models API result was loaded" severity="warning">
          Azure returned more than the configured pagination limit. Counts below describe only the loaded resources.
        </Alert>
      )}

      <div className={styles.summaryGrid}>
        <SummaryCard
          label={state.entities.truncated ? "Loaded entities" : "Entities"}
          value={state.entities.pagesLoaded > 0 ? state.entities.items.length : undefined}
        />
        <SummaryCard label="Healthy" value={state.entities.pagesLoaded > 0 ? healthStateCounts.healthy : undefined} />
        <SummaryCard label="Degraded" value={state.entities.pagesLoaded > 0 ? healthStateCounts.degraded : undefined} />
        <SummaryCard label="Unhealthy" value={state.entities.pagesLoaded > 0 ? healthStateCounts.unhealthy : undefined} />
        <SummaryCard label="Unknown" value={state.entities.pagesLoaded > 0 ? healthStateCounts.unknown : undefined} />
        <SummaryCard
          label={state.relationships.truncated ? "Loaded relationships" : "Relationships"}
          value={state.relationships.pagesLoaded > 0 ? state.relationships.items.length : undefined}
        />
      </div>

      <h3 className={styles.sectionTitle}>Entities</h3>
      {state.entities.pagesLoaded > 0 && state.entities.items.length === 0 ? (
        <div className={styles.empty}>This health model does not contain any entities.</div>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Health state</th>
                <th>Impact</th>
                <th>Health objective</th>
                <th>Provisioning state</th>
              </tr>
            </thead>
            <tbody>
              {displayedEntities.map((entity) => (
                <tr key={entity.id}>
                  <td>{entity.properties?.displayName ?? entity.name}</td>
                  <td>
                    <HealthStateBadge healthState={entity.properties?.healthState} />
                  </td>
                  <td>{entity.properties?.impact ?? "--"}</td>
                  <td>
                    {entity.properties?.healthObjective === undefined
                      ? "--"
                      : `${entity.properties.healthObjective}%`}
                  </td>
                  <td>{entity.properties?.provisioningState ?? "--"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {state.entities.items.length > MAX_VISIBLE_ENTITIES && (
        <div className={styles.metadata}>
          Showing the first {MAX_VISIBLE_ENTITIES} of {state.entities.items.length} loaded entities.
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value?: number }) {
  const styles = useStyles2(getStyles);
  return (
    <div className={styles.summaryCard}>
      <div className={styles.summaryValue}>{value ?? "--"}</div>
      <div className={styles.summaryLabel}>{label}</div>
    </div>
  );
}

function HealthStateBadge({ healthState }: { healthState?: string }) {
  switch (healthState?.toLowerCase()) {
    case "healthy":
      return <Badge text="Healthy" color="green" />;
    case "degraded":
      return <Badge text="Degraded" color="orange" />;
    case "unhealthy":
      return <Badge text="Unhealthy" color="red" />;
    default:
      return <Badge text={healthState ?? "Unknown"} color="darkgrey" />;
  }
}

function getStyles(theme: GrafanaTheme2) {
  return {
    container: css({
      width: "100%",
      height: "100%",
      overflow: "auto",
      padding: theme.spacing(2),
    }),
    loading: css({
      minHeight: 240,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: theme.spacing(1),
    }),
    modelSelector: css({
      maxWidth: 600,
      marginBottom: theme.spacing(2),
      "& label": {
        display: "block",
        marginBottom: theme.spacing(0.5),
        color: theme.colors.text.secondary,
        fontWeight: theme.typography.fontWeightMedium,
      },
    }),
    refreshing: css({
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1),
      color: theme.colors.text.secondary,
      marginBottom: theme.spacing(2),
    }),
    header: css({
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: theme.spacing(2),
      marginBottom: theme.spacing(2),
    }),
    titleRow: css({
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1),
    }),
    title: css({
      margin: 0,
    }),
    metadata: css({
      color: theme.colors.text.secondary,
      marginTop: theme.spacing(0.5),
      overflowWrap: "anywhere",
    }),
    summaryGrid: css({
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
      gap: theme.spacing(1),
      marginBottom: theme.spacing(3),
    }),
    summaryCard: css({
      background: theme.colors.background.secondary,
      border: `1px solid ${theme.colors.border.weak}`,
      borderRadius: theme.shape.radius.default,
      padding: theme.spacing(2),
    }),
    summaryValue: css({
      fontSize: theme.typography.h2.fontSize,
      lineHeight: theme.typography.h2.lineHeight,
      fontWeight: theme.typography.fontWeightMedium,
    }),
    summaryLabel: css({
      color: theme.colors.text.secondary,
      marginTop: theme.spacing(0.5),
    }),
    sectionTitle: css({
      margin: theme.spacing(0, 0, 1),
    }),
    tableWrapper: css({
      overflowX: "auto",
      border: `1px solid ${theme.colors.border.weak}`,
      borderRadius: theme.shape.radius.default,
    }),
    table: css({
      width: "100%",
      borderCollapse: "collapse",
      "& th, & td": {
        padding: theme.spacing(1),
        textAlign: "left",
        borderBottom: `1px solid ${theme.colors.border.weak}`,
      },
      "& th": {
        color: theme.colors.text.secondary,
        background: theme.colors.background.secondary,
        fontWeight: theme.typography.fontWeightMedium,
      },
      "& tbody tr:last-child td": {
        borderBottom: 0,
      },
    }),
    empty: css({
      padding: theme.spacing(3),
      textAlign: "center",
      color: theme.colors.text.secondary,
      border: `1px solid ${theme.colors.border.weak}`,
      borderRadius: theme.shape.radius.default,
    }),
  };
}

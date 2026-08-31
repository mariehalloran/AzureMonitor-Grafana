# Azure Health Models

This directory contains the read-only Azure Health Models preview experience for the Azure Cloud Native Monitoring app.

## What changed

The app now has a **Health Models** tab that:

- Uses the existing Azure Monitor datasource and subscription selectors.
- Lists Health Model resources in the selected subscription.
- Loads the selected model's current entities and relationships.
- Summarizes entity health states and displays basic entity details.
- Follows ARM continuation links with a bounded page limit and identifies partial results.
- Handles model, entity, and relationship failures independently so available data remains visible.

The implementation is split across the following files:

| File                       | Responsibility                                                                                            |
| -------------------------- | --------------------------------------------------------------------------------------------------------- |
| `../Pages/HealthModels.ts` | Registers the Scene tab and its datasource and subscription variables.                                    |
| `HealthModelOverview.tsx`  | Owns the Scene lifecycle, selection state, asynchronous loading, stale-request protection, and rendering. |
| `HealthModelsApi.ts`       | Calls the Health Models ARM API, validates resource paths, and follows bounded continuation links.        |
| `types.ts`                 | Defines the subset of the Health Models contract used by this preview.                                    |
| `healthModelUtils.ts`      | Calculates the displayed health-state summary.                                                            |

## API boundary

All feature data comes from the `Microsoft.CloudHealth` Health Models API using `2026-09-01-preview`:

```text
GET /subscriptions/{subscriptionId}/providers/Microsoft.CloudHealth/healthmodels
GET /subscriptions/{subscriptionId}/resourceGroups/{resourceGroupName}/providers/Microsoft.CloudHealth/healthmodels/{healthModelName}/entities
GET /subscriptions/{subscriptionId}/resourceGroups/{resourceGroupName}/providers/Microsoft.CloudHealth/healthmodels/{healthModelName}/relationships
```

The configured Azure Monitor datasource is used only as an authenticated ARM transport. Its `azuremonitor/` backend resource route attaches the datasource's Azure credentials and forwards the relative request to the configured Resource Manager endpoint. The feature does not obtain Health Models data from Azure Monitor metrics, logs, or Resource Graph.

Keeping that transport detail inside `HealthModelsApi.ts` prevents the rest of the feature from depending on the datasource's internal route shape.

## Why this design

### Reuse configured Azure authentication

The app already requires an Azure Monitor datasource. Reusing its authenticated ARM client avoids introducing a second Azure credential configuration in the app backend and preserves the datasource's configured Azure cloud and identity.

### Call the Health Models API directly

Health Model entities and relationships are proxy resources that are not discoverable through Resource Graph. Calling `Microsoft.CloudHealth` directly also gives the feature one consistent contract for model discovery and model data.

### Remain read-only

The first contribution is an operational monitoring experience, not a model designer. It issues only GET requests and leaves creation, editing, and deletion in Azure. The selected datasource identity should have only the Azure permissions needed to read the target Health Models.

### Load only while the Scene is active

`HealthModelOverview` starts requests from a Scene activation handler. It invalidates requests when the datasource, subscription, model, or active Scene changes so an older response cannot replace newer state.

### Bound large model results

Model, entity, and relationship lists can be paged and large. The API adapter follows only a bounded number of same-collection continuation links. If Azure returns additional pages, the UI labels the result as partial rather than presenting loaded counts as complete totals. Entity rendering is also capped while summary calculations continue across all loaded entities.

## Current MVP limits

- One subscription is selected at a time.
- The page displays current state only; it does not request entity or signal history.
- Relationships are counted but not yet rendered as a dependency graph.
- Model configuration and write operations are intentionally excluded.
- The custom Health Models data-plane audience is not used; this experience calls the ARM control-plane API.

## Local visual sandbox

A development build can render the page from a local snapshot without configuring Azure credentials in Grafana. Place the generated snapshot at `dist/health-models-sandbox.json`, start the local Grafana development environment, then open:

```text
http://localhost:3000/a/azure-monitor-app/clusternavigation/healthmodels?healthModelsMock=1
```

Mock mode is accepted only when Webpack builds the plugin in development mode. `HealthModelsMockApi.ts` loads the ignored snapshot and implements the same `HealthModelsClient` contract as the production ARM adapter. The page therefore exercises the normal Scene lifecycle, model selection, health summaries, and entity rendering without making Azure requests from the browser. The snapshot can contain subscription resource data and must never be committed.

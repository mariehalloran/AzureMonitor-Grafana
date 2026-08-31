# Azure Cloud Native Monitoring ![Static Badge](https://img.shields.io/badge/preview-blue)

## Overview

![Homepage](https://github.com/user-attachments/assets/90148f4c-c3ad-4cb5-9fe3-076de7827ffd)

This Grafana App Plugin provides curated monitoring experiences for Azure Kubernetes Service (AKS) and Azure Health Models. The Health Models preview page calls the `Microsoft.CloudHealth` Health Models API to load models, entities, relationships, and current health states.

**Simplified User Experience**: Users can access fully populated charts and experiences by selecting the cluster of interest. The plugin reduces the number of user inputs required, automatically discovering and populating variables such as Prometheus datasource and Log Analytics workspace.

**Granular Monitoring**: It displays monitoring data at various levels of granularity, from multi-cluster to individual containers, allowing users to drill down into specific areas of interest.

**Curated Azure Monitoring**: The plugin provides a curated Azure monitoring experience within Grafana, making it available in the public Grafana catalog and compatible with various Grafana platforms.

**Enhanced Troubleshooting**: It improves the AKS troubleshooting experience by providing better navigation, a range of supported visualizations, and keeping users in the same context.

**Health Models Preview**: Users can select a Health Model and view its current entity health summary and relationship count in Grafana. The configured Azure Monitor datasource supplies authenticated ARM transport only; model data comes from the Health Models API. The experience is read-only, and model configuration remains in Azure.

## Requirements

AKS monitoring works with Azure Monitor and Prometheus datasources configured with Azure Monitor managed service for Prometheus. Health Models requires only an Azure Monitor datasource with read access to the selected models. Please make sure you have configured in your instance:

- [Azure Monitor Datasource](https://grafana.com/docs/grafana/latest/datasources/azure-monitor/#azure-monitor-data-source)
- [Prometheus Datasource](https://grafana.com/docs/grafana/latest/getting-started/get-started-grafana-prometheus/) with [Azure Monitor managed service](https://learn.microsoft.com/en-us/azure/azure-monitor/essentials/prometheus-metrics-overview)

### Permissions requirements
Regardless of the Azure Authentication method you are using, the following are the minimum required permissions that you Grafana instance needs for the resource you are trying to query data from:

- **Azure Monitor**: Monitoring Reader
- **Azure Managed Prometheus**: Monitoring Data Reader
- **Azure Health Models**: Reader access to the target `Microsoft.CloudHealth/healthmodels` resources

## Getting started
If this plugin has not yet been enabled on your Grafana instance, Click on Install then Enable. This will automatically add an entry point on your Grafana navigation bar under Apps

![Grafana Navigation Bar](https://github.com/user-attachments/assets/eb52dc9a-5323-412f-a388-5909a4c06240)

Simply click on it and start your troubleshooting journey!

If you are self hosting your Grafana instance and would like to see the plugin as a root item in your navidation menu, you need to add the following config in your `grafana.ini` file.

```
[navigation.app_sections]
azure-monitor-app = "root"
```

## Contributing

Please go to our [repo](https://github.com/microsoft/AzureMonitor-Grafana) to learn more about how to contribute

If you would like to report an issue or provide feedback, please open a [github issue](https://github.com/microsoft/AzureMonitor-Grafana/issues)
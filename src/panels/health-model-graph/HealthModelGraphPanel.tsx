import { css } from '@emotion/css';
import { GrafanaTheme2, PanelProps } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import React from 'react';
import { HealthGraph } from '../../components/SceneApp/HealthModels/HealthGraph';
import { framesToHealthGraphInput } from '../shared/framesToEntities';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface HealthModelGraphPanelOptions {}

export function HealthModelGraphPanel({ data, height }: PanelProps<HealthModelGraphPanelOptions>) {
  const styles = useStyles2(getStyles);
  const { entities, relationships } = React.useMemo(
    () => framesToHealthGraphInput(data.series),
    [data.series]
  );

  if (entities.length === 0) {
    return (
      <div className={styles.message} style={{ height }}>
        Query an Azure Health Models data source to render this panel. The Model graph format also draws the
        relationships between entities.
      </div>
    );
  }

  return <HealthGraph entities={entities} relationships={relationships} height={height} />;
}

function getStyles(theme: GrafanaTheme2) {
  return {
    message: css({
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: theme.spacing(2),
      color: theme.colors.text.secondary,
      textAlign: 'center',
    }),
  };
}

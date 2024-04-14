import { Text } from '@fluentui/react-components';
import { useGraphRenderingStats } from '../../../../core/state/dev/devSelectors';

export const GraphCalculations = () => {
  const stats = useGraphRenderingStats();
  return (
    <div>
      <div>
        <Text>Times graph Has Been Calculated: {stats.numberOfTimesGraphCalculated}</Text>
      </div>
      <div>
        <Text>Time spent calculating graph: {Math.round(stats.timeSpentCalculatingGraph)} ms</Text>
      </div>
    </div>
  );
};

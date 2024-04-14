import type { RootState } from '../../store';
import { useSelector } from 'react-redux';

export const useReduxActionCounts = () => {
  return useSelector((state: RootState) => state.dev.reduxActionCounts ?? {});
};

export const useGraphRenderingStats = () => {
  return useSelector((state: RootState) => ({
    numberOfTimesGraphCalculated: state.dev.numberOfTimesGraphCalculated,
    timeSpentCalculatingGraph: state.dev.timeSpentCalculatingGraph,
  }));
}
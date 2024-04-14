export interface DevState {
  reduxActionCounts?: Record<string, number>;
  numberOfTimesGraphCalculated: number;
  timeSpentCalculatingGraph: number;
}

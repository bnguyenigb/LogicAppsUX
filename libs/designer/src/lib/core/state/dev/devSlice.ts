import { resetWorkflowState } from '../global';
import type { DevState } from './devInterfaces';
import { createSlice } from '@reduxjs/toolkit';

const initialState: DevState = {
  reduxActionCounts: {},
  numberOfTimesGraphCalculated: 0,
  timeSpentCalculatingGraph: 0,
};

export const devSlice = createSlice({
  name: 'dev',
  initialState,
  reducers: {
    incrementNumberOfTimesGraphCalculated: (state) => {
      state.numberOfTimesGraphCalculated += 1;
    },
    incrementTimeSpentCalculatingGraph: (state, action) => {
      state.timeSpentCalculatingGraph += action.payload;
    },
  },
  extraReducers: (builder) => {
    // Reset the state on workflow reset
    builder.addCase(resetWorkflowState, () => initialState);
    // Count the number of times each action is dispatched
    builder.addMatcher(
      () => true,
      (state, action) => {
        state.reduxActionCounts = {
          ...state.reduxActionCounts,
          [action.type]: (state.reduxActionCounts?.[action.type] ?? 0) + 1,
        };
      }
    );
  },
});

export const { incrementNumberOfTimesGraphCalculated, incrementTimeSpentCalculatingGraph } = devSlice.actions;

export default devSlice.reducer;

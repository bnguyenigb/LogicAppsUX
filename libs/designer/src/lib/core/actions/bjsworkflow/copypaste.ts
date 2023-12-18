import { setFocusNode, type RootState } from '../..';
import type { NodeData, NodeOperation } from '../../state/operation/operationMetadataSlice';
import { initializeNodes, initializeOperationInfo } from '../../state/operation/operationMetadataSlice';
import type { RelationshipIds } from '../../state/panel/panelInterfaces';
import { pasteNode } from '../../state/workflow/workflowSlice';
import { initializeOperationDetails } from './add';
import { serializeOperation } from './serializer';
import type { LogicAppsV2 } from '@microsoft/utils-logic-apps';
import { createIdCopy, removeIdTag } from '@microsoft/utils-logic-apps';
import { createAsyncThunk } from '@reduxjs/toolkit';
import { batch } from 'react-redux';

type CopyOperationPayload = {
  nodeId: string;
};

export const copyOperation = createAsyncThunk('copyOperation', async (payload: CopyOperationPayload, { getState }) => {
  batch(() => {
    const { nodeId } = payload;
    if (!nodeId) throw new Error('Node does not exist'); // Just an optional catch, should never happen
    const state = getState() as RootState;
    const newNodeId = createIdCopy(nodeId);
    const nodeOperationInfo = state.operations.operationInfo[nodeId];

    const nodeData = getNodeData(state, nodeId, newNodeId);
    window.localStorage.setItem(
      'msla-clipboard',
      JSON.stringify({ nodeId: newNodeId, operationInfo: nodeOperationInfo, nodeData: nodeData })
    );
  });
});

export const copyScopeOperation = createAsyncThunk('copyScopeOperation', async (payload: CopyOperationPayload, { getState }) => {
  batch(async () => {
    const { nodeId: idScopeNode } = payload;
    if (!idScopeNode) throw new Error('Node does not exist'); // Just an optional catch, should never happen

    const scopeNodeId = removeIdTag(idScopeNode);
    const state = getState() as RootState;
    const newNodeId = createIdCopy(scopeNodeId);
    const nodeOperationInfo = state.operations.operationInfo[scopeNodeId];

    const serializedOperation = await serializeOperation(state, scopeNodeId, { skipValidation: true, ignoreNonCriticalErrors: true });

    window.localStorage.setItem(
      'msla-clipboard',
      JSON.stringify({ nodeId: newNodeId, operationInfo: nodeOperationInfo, serializedOperation, isScopeNode: true })
    );
  });
});

interface PasteOperationPayload {
  relationshipIds: RelationshipIds;
  nodeId: string;
  nodeData: NodeData;
  operationInfo: NodeOperation;
}

export const pasteOperation = createAsyncThunk('pasteOperation', async (payload: PasteOperationPayload, { dispatch, getState }) => {
  const { nodeId: actionId, relationshipIds, nodeData, operationInfo } = payload;
  if (!actionId || !relationshipIds || !nodeData) throw new Error('Operation does not exist'); // Just an optional catch, should never happen
  let count = 1;
  let nodeId = actionId;

  while ((getState() as RootState).workflow.nodesMetadata[nodeId]) {
    nodeId = `${actionId}_${count}`;
    count++;
  }
  // update workflow
  dispatch(
    pasteNode({
      nodeId: nodeId,
      relationshipIds: relationshipIds,
      operation: operationInfo,
    })
  );

  dispatch(initializeOperationInfo({ id: nodeId, ...operationInfo }));
  await initializeOperationDetails(nodeId, operationInfo, getState as () => RootState, dispatch);

  // replace new nodeId if there exists a copy of the copied node
  dispatch(initializeNodes([{ ...nodeData, id: nodeId }]));

  dispatch(setFocusNode(nodeId));
});

interface PasteScopeOperationPayload {
  relationshipIds: RelationshipIds;
  nodeId: string;
  serializedOperation: LogicAppsV2.ActionDefinition | null;
  operationInfo: NodeOperation;
}

export const pasteScopeOperation = createAsyncThunk(
  'pasteScopeOperation',
  async (payload: PasteScopeOperationPayload, { dispatch, getState }) => {
    const { nodeId: actionId, relationshipIds, operationInfo, serializedOperation } = payload;
    if (!actionId || !relationshipIds || !serializedOperation) throw new Error('Operation does not exist'); // Just an optional catch, should never happen
    console.log(serializedOperation);

    let count = 1;
    let nodeId = actionId;

    while ((getState() as RootState).workflow.nodesMetadata[nodeId]) {
      nodeId = `${actionId}_${count}`;
      count++;
    }
    // update workflow
    dispatch(
      pasteNode({
        nodeId: nodeId,
        relationshipIds: relationshipIds,
        operation: operationInfo,
      })
    );

    dispatch(initializeOperationInfo({ id: nodeId, ...operationInfo }));
    await initializeOperationDetails(nodeId, operationInfo, getState as () => RootState, dispatch);

    dispatch(setFocusNode(nodeId));
  }
);

const getNodeData = (state: RootState, nodeId: string, newNodeId: string): NodeData => {
  return {
    id: newNodeId,
    nodeInputs: state.operations.inputParameters[nodeId],
    nodeOutputs: state.operations.outputParameters[nodeId],
    nodeDependencies: state.operations.dependencies[nodeId],
    operationMetadata: state.operations.operationMetadata[nodeId],
    settings: state.operations.settings[nodeId],
    staticResult: state.operations.staticResults[nodeId],
    actionMetadata: state.operations.actionMetadata[nodeId],
    repetitionInfo: state.operations.repetitionInfos[nodeId],
  };
};

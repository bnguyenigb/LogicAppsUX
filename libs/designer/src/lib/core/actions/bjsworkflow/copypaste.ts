import { setFocusNode, type RootState } from '../..';
import { initCopiedConnectionMap, type ReferenceKey } from '../../state/connection/connectionSlice';
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
    const connectionReference = state.connections.connectionsMapping[nodeId];
    window.localStorage.setItem(
      'msla-clipboard',
      JSON.stringify({ nodeId: newNodeId, operationInfo: nodeOperationInfo, nodeData, connectionData: connectionReference })
    );
  });
});

export const copyScopeOperation = createAsyncThunk('copyScopeOperation', async (payload: CopyOperationPayload, { getState }) => {
  batch(async () => {
    const { nodeId: idScopeNode } = payload;
    if (!idScopeNode) throw new Error('Node does not exist'); // Just an optional catch, should never happen
    const state = getState() as RootState;
    const idReplacements = state.workflow.idReplacements;
    const scopeNodeId = removeIdTag(idScopeNode);
    const scopeNodeIdReplacement = idReplacements[scopeNodeId] ?? scopeNodeId;

    const newNodeId = createIdCopy(scopeNodeId);
    const nodeOperationInfo = state.operations.operationInfo[scopeNodeId];

    const nodeData = getNodeData(state, scopeNodeId, newNodeId);
    const serializedOperation = await serializeOperation(state, scopeNodeId, { skipValidation: true, ignoreNonCriticalErrors: true });
    const nodeDataMapping: Map<string, NodeData> = new Map();
    console.log(scopeNodeIdReplacement);
    flattenScopeNode(scopeNodeIdReplacement, state, serializedOperation, nodeDataMapping);
    console.log(nodeDataMapping);
    window.localStorage.setItem(
      'msla-clipboard',
      JSON.stringify({ nodeId: newNodeId, operationInfo: nodeOperationInfo, nodeData, serializedOperation, isScopeNode: true })
    );
  });
});

interface PasteOperationPayload {
  relationshipIds: RelationshipIds;
  nodeId: string;
  nodeData: NodeData;
  operationInfo: NodeOperation;
  connectionData?: ReferenceKey;
}

export const pasteOperation = createAsyncThunk('pasteOperation', async (payload: PasteOperationPayload, { dispatch, getState }) => {
  const { nodeId: actionId, relationshipIds, nodeData, operationInfo, connectionData } = payload;
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

  if (connectionData) {
    dispatch(initCopiedConnectionMap({ nodeId, referenceKey: connectionData }));
  }

  dispatch(setFocusNode(nodeId));
});

interface PasteScopeOperationPayload {
  relationshipIds: RelationshipIds;
  nodeId: string;
  nodeData: NodeData;
  serializedOperation: LogicAppsV2.ActionDefinition | null;
  operationInfo: NodeOperation;
}

export const pasteScopeOperation = createAsyncThunk(
  'pasteScopeOperation',
  async (payload: PasteScopeOperationPayload, { dispatch, getState }) => {
    const { nodeId: actionId, relationshipIds, operationInfo, serializedOperation, nodeData } = payload;
    if (!actionId || !relationshipIds || !serializedOperation) throw new Error('Operation does not exist'); // Just an optional catch, should never happen

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

const flattenScopeNode = (
  nodeId: string,
  state: RootState,
  serializedOperation: LogicAppsV2.ActionDefinition | null,
  dataMapping: Map<string, NodeData>
) => {
  if (!serializedOperation) return;
  dataMapping.set(nodeId, getNodeData(state, nodeId, createIdCopy(nodeId)));
  const { type } = serializedOperation;
  let actions: LogicAppsV2.Actions | undefined;

  switch (type) {
    case 'If':
      actions = {
        ...(serializedOperation as LogicAppsV2.IfAction).actions,
        ...(serializedOperation as LogicAppsV2.IfAction).else?.actions,
      };
      iterateThroughActions(actions, state, dataMapping);
      break;
    case 'Switch':
      // eslint-disable-next-line no-case-declarations
      const cases = (serializedOperation as LogicAppsV2.SwitchAction).cases ?? {};
      Object.entries(cases).forEach(([key, value]) => {
        flattenScopeCaseNode(key, state, value, dataMapping);
      });
      actions = {
        ...(serializedOperation as LogicAppsV2.SwitchAction).default?.actions,
      };
      iterateThroughActions(actions, state, dataMapping);
      break;
    case 'Until':
    case 'Foreach':
    case 'Scope':
      actions = (serializedOperation as LogicAppsV2.ScopeAction).actions;
      iterateThroughActions(actions, state, dataMapping);
      break;
    default:
      break;
  }
  return;
};

const flattenScopeCaseNode = (
  nodeId: string,
  state: RootState,
  serializedOperation: LogicAppsV2.SwitchCase | null,
  dataMapping: Map<string, NodeData>
) => {
  if (!serializedOperation) return;
  dataMapping.set(nodeId, getNodeData(state, nodeId, createIdCopy(nodeId)));
  const { actions } = serializedOperation ?? {};
  if (actions) {
    iterateThroughActions(actions, state, dataMapping);
  }
};

const iterateThroughActions = (actions: LogicAppsV2.Actions | undefined, state: RootState, dataMapping: Map<string, NodeData>) => {
  if (actions) {
    Object.entries(actions).forEach(([key, value]) => {
      flattenScopeNode(key, state, value, dataMapping);
    });
  }
};

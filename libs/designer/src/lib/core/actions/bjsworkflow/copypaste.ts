import { setFocusNode, type RootState } from '../..';
import type { WorkflowEdge, WorkflowNode } from '../../parsers/models/workflowNode';
import { initCopiedConnectionMap, type ReferenceKey } from '../../state/connection/connectionSlice';
import type { NodeData, NodeOperation } from '../../state/operation/operationMetadataSlice';
import { initializeNodes, initializeOperationInfo } from '../../state/operation/operationMetadataSlice';
import type { RelationshipIds } from '../../state/panel/panelInterfaces';
import { getWorkflowNodeFromGraphState } from '../../state/workflow/workflowSelectors';
import { pasteNode, pasteScopeNode } from '../../state/workflow/workflowSlice';
import { initializeOperationDetails } from './add';
import { serializeOperation } from './serializer';
import type { LogicAppsV2 } from '@microsoft/utils-logic-apps';
import {
  joinSplitId,
  splitIdTag,
  getSuffix,
  isWorkflowSubgraph,
  removeWorkflowSubgraphSuffix,
  createWorkflowIdCopy,
  createCopy,
  createIdCopy,
  removeIdTag,
  reverseRecord,
} from '@microsoft/utils-logic-apps';
import { createAsyncThunk } from '@reduxjs/toolkit';
import { batch } from 'react-redux';
import type { NodesMetadata, WorkflowState } from '../../state/workflow/workflowInterfaces';
import constants from '../../../common/constants';

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

export interface ScopeCopyInformation {
  nodeData: NodeData;
  operationInfo: NodeOperation;
  connectionData?: ReferenceKey;
}

export const copyScopeOperation = createAsyncThunk('copyScopeOperation', async (payload: CopyOperationPayload, { getState }) => {
  batch(async () => {
    const { nodeId: idScopeNode } = payload;
    if (!idScopeNode) throw new Error('Node does not exist'); // Just an optional catch, should never happen
    const state = getState() as RootState;

    const idReplacements = state.workflow.idReplacements;
    const reversedIdReplacements = reverseRecord(idReplacements);

    const scopeNodeId = removeIdTag(idScopeNode);
    const newNodeId = createIdCopy(scopeNodeId);

    const serializedOperation = await serializeOperation(state, scopeNodeId, {
      skipValidation: true,
      ignoreNonCriticalErrors: true,
    });
    const nodeDataMapping: Map<string, ScopeCopyInformation> = new Map();
    flattenScopeNode(idReplacements[scopeNodeId] ?? scopeNodeId, state, serializedOperation, nodeDataMapping, reversedIdReplacements);
    // converts the map to a string in the form of an array of tuples to store in local storage
    const stringifiedNodeDataMapping = JSON.stringify(Array.from(nodeDataMapping.entries()));

    let workflowGraph = getWorkflowNodeFromGraphState(state.workflow, scopeNodeId);
    const workflowNodesMetadata: NodesMetadata = {};
    const workflowOperations: Record<string, LogicAppsV2.OperationDefinition> = {};

    // convert workflowGraph (and children's) nodes and edges into copies
    if (workflowGraph) {
      workflowGraph = copyWorkflowGraph(state.workflow, workflowGraph, idReplacements, workflowNodesMetadata, workflowOperations);
    }

    window.localStorage.setItem(
      'msla-clipboard',
      JSON.stringify({
        isScopeNode: true,
        nodeId: newNodeId,
        nodeDataMapping: stringifiedNodeDataMapping,
        workflowGraph,
        nodesMetadata: workflowNodesMetadata,
        operations: workflowOperations
      })
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
  nodeDataMapping: Map<string, ScopeCopyInformation>;
  workflowGraph: WorkflowNode | undefined;
  nodesMetadata: NodesMetadata,
  operations: Record<string, LogicAppsV2.OperationDefinition>
}

export const pasteScopeOperation = createAsyncThunk('pasteScopeOperation', async (payload: PasteScopeOperationPayload, { dispatch }) => {
  const { nodeId, relationshipIds, nodeDataMapping, workflowGraph, nodesMetadata, operations } = payload;
  if (!nodeId || !relationshipIds || !nodeDataMapping || !workflowGraph) throw new Error('Operation does not exist'); // Just an optional catch, should never happen

  dispatch(
    pasteScopeNode({
      nodeId,
      relationshipIds,
      nodeMapping: nodeDataMapping,
      workflowGraph: workflowGraph,
      nodesMetadata: nodesMetadata,
      operations: operations
    })
  );
});

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
  dataMapping: Map<string, ScopeCopyInformation>,
  idReplacements: Record<string, string>
) => {
  if (!serializedOperation) return;
  const originalNodeId = idReplacements[nodeId] ?? nodeId;
  const nodeOperationInfo = state.operations.operationInfo[originalNodeId];
  const connectionInfo = state.connections.connectionsMapping[originalNodeId];

  const { type } = serializedOperation;
  let actions: LogicAppsV2.Actions | undefined;

  switch (type.toLowerCase()) {
    case constants.NODE.TYPE.IF:
      actions = {
        ...(serializedOperation as LogicAppsV2.IfAction).actions,
        ...(serializedOperation as LogicAppsV2.IfAction).else?.actions,
      };
      iterateThroughActions(actions, state, dataMapping, idReplacements);
      break;
    case constants.NODE.TYPE.SWITCH:
      // eslint-disable-next-line no-case-declarations
      const cases = (serializedOperation as LogicAppsV2.SwitchAction).cases ?? {};
      Object.entries(cases).forEach(([key, value]) => {
        flattenScopeCaseNode(key, state, value, dataMapping, idReplacements);
      });
      actions = {
        ...(serializedOperation as LogicAppsV2.SwitchAction).default?.actions,
      };
      iterateThroughActions(actions, state, dataMapping, idReplacements);
      break;
    case constants.NODE.TYPE.UNTIL:
    case constants.NODE.TYPE.FOREACH:
    case constants.NODE.TYPE.SCOPE:
      actions = (serializedOperation as LogicAppsV2.ScopeAction).actions;
      iterateThroughActions(actions, state, dataMapping, idReplacements);
      break;
    default:
      break;
  }
  dataMapping.set(createIdCopy(nodeId), {
    nodeData: getNodeData(state, originalNodeId, createIdCopy(nodeId)),
    operationInfo: nodeOperationInfo,
    connectionData: connectionInfo,
  });
};

const flattenScopeCaseNode = (
  nodeId: string,
  state: RootState,
  serializedOperation: LogicAppsV2.SwitchCase | null,
  dataMapping: Map<string, ScopeCopyInformation>,
  idReplacements: Record<string, string>
) => {
  if (!serializedOperation) return;
  const originalNodeId = idReplacements[nodeId] ?? nodeId;
  const nodeOperationInfo = state.operations.operationInfo[nodeId];
  const connectionInfo = state.connections.connectionsMapping[nodeId];
  dataMapping.set(createIdCopy(nodeId), {
    nodeData: getNodeData(state, originalNodeId, createIdCopy(nodeId)),
    operationInfo: nodeOperationInfo,
    connectionData: connectionInfo,
  });

  const { actions } = serializedOperation ?? {};
  if (actions) {
    iterateThroughActions(actions, state, dataMapping, idReplacements);
  }
};

const iterateThroughActions = (
  actions: LogicAppsV2.Actions | undefined,
  state: RootState,
  dataMapping: Map<string, ScopeCopyInformation>,
  idReplacements: Record<string, string>
): string[] => {
  if (actions) {
    Object.entries(actions).forEach(([key, value]) => {
      flattenScopeNode(key, state, value, dataMapping, idReplacements);
    });
    return Object.keys(actions);
  }
  return [];
};

const copyWorkflowGraph = (
  state: WorkflowState,
  workflowNode: WorkflowNode,
  idReplacements: Record<string, string>,
  nodesMetadata: NodesMetadata,
  operations: Record<string, LogicAppsV2.OperationDefinition>
): WorkflowNode => {
  const newWorkflowNode: WorkflowNode = createCopy(workflowNode);
  newWorkflowNode.id = createWorkflowIdCopyWithReplacement(newWorkflowNode.id, idReplacements);

  if (state.nodesMetadata[workflowNode.id]) {
    // eslint-disable-next-line no-param-reassign
    nodesMetadata[newWorkflowNode.id] = {
      ...state.nodesMetadata[workflowNode.id],
      graphId: createWorkflowIdCopyWithReplacement(state.nodesMetadata[workflowNode.id].graphId, idReplacements),
      parentNodeId: createWorkflowIdCopyWithReplacement(state.nodesMetadata[workflowNode.id].graphId, idReplacements),
    }
  }

  if (state.operations[workflowNode.id]) {
    // eslint-disable-next-line no-param-reassign
    operations[newWorkflowNode.id] = state.operations[workflowNode.id];
    // operations[newWorkflowNode.id] = handleGetOperationCopy(workflowNode.id, state.operations[workflowNode.id], idReplacements);
  }

  newWorkflowNode.edges = newWorkflowNode.edges?.map((edge: WorkflowEdge) => {
    const newSource = createWorkflowIdCopyWithReplacement(edge.source, idReplacements);
    const newTarget = createWorkflowIdCopyWithReplacement(edge.target, idReplacements);
    return { ...edge, source: newSource, target: newTarget, id: `${newSource}-${newTarget}` };
  });
  newWorkflowNode.children = newWorkflowNode.children?.map((child: WorkflowNode) => {
    return copyWorkflowGraph(state, child, idReplacements, nodesMetadata, operations);
  });

  return newWorkflowNode;
};

// const handleGetOperationCopy = (
//   nodeId: string,
//   operation: LogicAppsV2.OperationDefinition,
//   idReplacements: Record<string, string>
// ): LogicAppsV2.OperationDefinition => {
//   const newOperation: LogicAppsV2.OperationDefinition = createCopy(operation);
//   if(newOperation.type.toLowerCase() === constants.NODE.TYPE.SWITCH){
    
//   }
//   return operation;

// }

const createWorkflowIdCopyWithReplacement = (id: string, idReplacements: Record<string, string>): string => {
  return createWorkflowIdCopy(getIdReplacement(id, idReplacements))
}

// workflowNodes may come in the id form of Switch-addCase, this is to make sure we get the right id from idReplacements
const getIdReplacement = (id: string, idReplacements: Record<string, string>): string => {
  const splitId = splitIdTag(id);
  const removedIdTag = removeIdTag(id);

  if (isWorkflowSubgraph(removedIdTag)) {
    const removedWorkflowSubgraph = removeWorkflowSubgraphSuffix(removedIdTag);
    splitId[0] = `${idReplacements[removedWorkflowSubgraph] ?? removedWorkflowSubgraph}${getSuffix(removedIdTag)}`;
  } else {
    splitId[0] = idReplacements[removedIdTag] ?? removedIdTag;
  }
  return joinSplitId(splitId);
};

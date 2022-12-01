import type { WorkflowNode } from '../../parsers/models/workflowNode';
import type { SubgraphType } from '@microsoft/utils-logic-apps';

export type SpecTypes = 'BJS' | 'CNCF';

export interface NodesMetadata {
  [nodeId: string]: {
    graphId: string;
    parentNodeId?: string;
    subgraphType?: SubgraphType;
    actionCount?: number;
    isRoot?: boolean;
  };
}
export type Operations = Record<string, LogicAppsV2.OperationDefinition>;

export interface WorkflowState {
  workflowSpec?: SpecTypes;
  graph: WorkflowNode | null;
  operations: Operations;
  focusedCanvasNodeId?: string;
  nodesMetadata: NodesMetadata;
  collapsedGraphIds: Record<string, boolean>;
  edgeIdsBySource: Record<string, string[]>;
  idReplacements: Record<string, string>;
  newlyAddedOperations: Record<string, string>;
}

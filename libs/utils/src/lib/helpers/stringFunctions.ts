export const idDisplayCase = (s: string) => removeIdTag(labelCase(s));
export const labelCase = (label: string) => label?.replace(/_/g, ' ');

export const containsIdTag = (id: string) => id.includes('-#');
export const removeIdTag = (id: string) => id.split('-#')[0];
export const splitIdTag = (id: string) => id.split('-#');
export const joinSplitId = (splitId: string[]) => splitId.join('-#');

export const getIdLeaf = (id?: string) => id?.split('/').at(-1) ?? '';

const normalizeApiId = (id?: string) => id?.replace(/\s+/, '').toLowerCase();
export const areApiIdsEqual = (id1?: string, id2?: string) => normalizeApiId(id1) === normalizeApiId(id2);

export const capitalizeFirstLetter = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const normalizeAutomationId = (s: string) => s.replace(/\W/g, '-');

export const createIdCopy = (id: string) => `${id}-copy`;

// const workflowSubgraphCases = ["actions", "elseActions", "addCase", "defaultCase"];
const suffixes = ['-actions', '-elseActions', '-addCase', '-defaultCase'];
export const isWorkflowSubgraph = (s: string) => suffixes.some((suffix) => s.endsWith(suffix));
export const removeWorkflowSubgraphSuffix = (s: string) => {
  for (const suffix of suffixes) {
    if (s.endsWith(suffix)) {
      return s.slice(0, -suffix.length);
    }
  }
  return s;
};
export const getSuffix = (s: string) => {
  for (const suffix of suffixes) {
    if (s.endsWith(suffix)) {
      return suffix;
    }
  }
  return null;
};

// createIdCopy with tags
export const createWorkflowIdCopy = (id: string) => {
  if (containsIdTag(id)) {
    const splitId = splitIdTag(id);
    const removedIdTag = splitId[0];
    splitId[0] = createIdCopy(removedIdTag);
    return splitId.join('-#');
  } else if (isWorkflowSubgraph(id)) {
    return `${removeWorkflowSubgraphSuffix(id)}-copy${getSuffix(id)}`;
  }
  return createIdCopy(id);
};

export const wrapTokenValue = (s: string) => `@{${s}}`;

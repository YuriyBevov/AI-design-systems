export type TreeSelectNode = {
  id: string;
  label: string;
  description?: string;
  children: TreeSelectNode[];
};

export type TreeNodeSelectionState = {
  checked: boolean;
  indeterminate: boolean;
};

export const collectTreeNodeIds = (node: TreeSelectNode): string[] => [
  node.id,
  ...node.children.flatMap(collectTreeNodeIds),
];

export const flattenTreeNodeIds = (nodes: TreeSelectNode[]): string[] =>
  nodes.flatMap(collectTreeNodeIds);

export const getTreeNodeSelectionState = (
  node: TreeSelectNode,
  selectedIds: ReadonlySet<string>,
): TreeNodeSelectionState => {
  const subtreeIds = collectTreeNodeIds(node);
  const selectedCount = subtreeIds.filter((id) => selectedIds.has(id)).length;
  return {
    checked: selectedCount === subtreeIds.length,
    indeterminate: selectedCount > 0 && selectedCount < subtreeIds.length,
  };
};

const findTreeNode = (nodes: TreeSelectNode[], nodeId: string): TreeSelectNode | undefined => {
  for (const node of nodes) {
    if (node.id === nodeId) return node;
    const child = findTreeNode(node.children, nodeId);
    if (child) return child;
  }
  return undefined;
};

const normalizeBranchSelection = (node: TreeSelectNode, selectedIds: Set<string>): boolean => {
  if (!node.children.length) return selectedIds.has(node.id);

  const childrenSelected = node.children.map((child) =>
    normalizeBranchSelection(child, selectedIds),
  );
  const allChildrenSelected = childrenSelected.every(Boolean);
  if (allChildrenSelected) selectedIds.add(node.id);
  else selectedIds.delete(node.id);
  return allChildrenSelected;
};

export const normalizeTreeSelection = (
  nodes: TreeSelectNode[],
  selectedValues: readonly string[],
): string[] => {
  const knownIds = new Set(flattenTreeNodeIds(nodes));
  const selectedIds = new Set(selectedValues.filter((id) => knownIds.has(id)));
  for (const node of nodes) normalizeBranchSelection(node, selectedIds);
  return flattenTreeNodeIds(nodes).filter((id) => selectedIds.has(id));
};

export const toggleTreeNodeSelection = (
  nodes: TreeSelectNode[],
  selectedValues: readonly string[],
  nodeId: string,
  checked: boolean,
): string[] => {
  const node = findTreeNode(nodes, nodeId);
  if (!node) return normalizeTreeSelection(nodes, selectedValues);

  const selectedIds = new Set(selectedValues);
  for (const id of collectTreeNodeIds(node)) {
    if (checked) selectedIds.add(id);
    else selectedIds.delete(id);
  }
  return normalizeTreeSelection(nodes, [...selectedIds]);
};

export const compressTreeSelection = (
  nodes: TreeSelectNode[],
  selectedValues: readonly string[],
): { prefixIds: string[]; exactIds: string[] } => {
  const selectedIds = new Set(normalizeTreeSelection(nodes, selectedValues));
  const prefixIds: string[] = [];
  const exactIds: string[] = [];

  const visit = (node: TreeSelectNode): void => {
    if (node.children.length && selectedIds.has(node.id)) {
      prefixIds.push(node.id);
      return;
    }
    if (!node.children.length) {
      if (selectedIds.has(node.id)) exactIds.push(node.id);
      return;
    }
    for (const child of node.children) visit(child);
  };

  for (const node of nodes) visit(node);
  return { prefixIds, exactIds };
};

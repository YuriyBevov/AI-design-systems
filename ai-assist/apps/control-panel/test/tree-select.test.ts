import { describe, expect, it } from "vitest";

import type { TreeSelectNode } from "../app/utils/tree-select";
import {
  compressTreeSelection,
  getTreeNodeSelectionState,
  toggleTreeNodeSelection,
} from "../app/utils/tree-select";

const nodes: TreeSelectNode[] = [
  {
    id: "/catalog/",
    label: "Каталог",
    children: [
      {
        id: "/catalog/packages/",
        label: "Пакеты",
        children: [
          { id: "/catalog/packages/white/", label: "Белые", children: [] },
          { id: "/catalog/packages/color/", label: "Цветные", children: [] },
        ],
      },
      { id: "/catalog/boxes/", label: "Коробки", children: [] },
    ],
  },
];

describe("tree selection", () => {
  it("selects and clears every descendant together with its parent", () => {
    const selected = toggleTreeNodeSelection(nodes, [], "/catalog/", true);
    expect(selected).toEqual([
      "/catalog/",
      "/catalog/packages/",
      "/catalog/packages/white/",
      "/catalog/packages/color/",
      "/catalog/boxes/",
    ]);

    expect(toggleTreeNodeSelection(nodes, selected, "/catalog/packages/", false)).toEqual([
      "/catalog/boxes/",
    ]);
  });

  it("marks ancestors as partially selected when one child is selected", () => {
    const selected = toggleTreeNodeSelection(nodes, [], "/catalog/packages/white/", true);
    expect(selected).toEqual(["/catalog/packages/white/"]);
    expect(getTreeNodeSelectionState(nodes[0]!, new Set(selected))).toEqual({
      checked: false,
      indeterminate: true,
    });
  });

  it("checks ancestors after all their descendants are selected", () => {
    let selected = toggleTreeNodeSelection(nodes, [], "/catalog/packages/white/", true);
    selected = toggleTreeNodeSelection(nodes, selected, "/catalog/packages/color/", true);
    expect(selected).toEqual([
      "/catalog/packages/",
      "/catalog/packages/white/",
      "/catalog/packages/color/",
    ]);
  });

  it("compresses complete branches into prefixes and isolated leaves into exact paths", () => {
    const selected = toggleTreeNodeSelection(nodes, [], "/catalog/packages/", true);
    expect(compressTreeSelection(nodes, selected)).toEqual({
      prefixIds: ["/catalog/packages/"],
      exactIds: [],
    });

    expect(compressTreeSelection(nodes, ["/catalog/boxes/"])).toEqual({
      prefixIds: [],
      exactIds: ["/catalog/boxes/"],
    });
  });
});

<script setup lang="ts">
import type { TreeSelectNode } from "~/utils/tree-select";
import { getTreeNodeSelectionState } from "~/utils/tree-select";

const props = withDefaults(
  defineProps<{
    node: TreeSelectNode;
    selectedIds: string[];
    level?: number;
    initiallyExpandedDepth?: number;
    disabled?: boolean;
  }>(),
  {
    level: 0,
    initiallyExpandedDepth: 1,
    disabled: false,
  },
);

const emit = defineEmits<{
  toggle: [nodeId: string, checked: boolean];
}>();

const expanded = ref(props.node.children.length > 0 && props.level < props.initiallyExpandedDepth);
const selectionState = computed(() =>
  getTreeNodeSelectionState(props.node, new Set(props.selectedIds)),
);
const childGroupId = useId();
const disclosureLabel = computed(() =>
  expanded.value
    ? `Свернуть вложенные элементы «${props.node.label}»`
    : `Раскрыть вложенные элементы «${props.node.label}»`,
);
const forwardToggle = (nodeId: string, checked: boolean): void => emit("toggle", nodeId, checked);
</script>

<template>
  <li
    class="tree-select__item"
    role="treeitem"
    :aria-expanded="node.children.length ? expanded : undefined"
  >
    <div class="tree-select__row" :style="{ '--tree-indent': `${level * 24}px` }">
      <BaseDisclosureToggle
        v-if="node.children.length"
        :expanded="expanded"
        :disabled="disabled"
        :label="disclosureLabel"
        :aria-controls="childGroupId"
        @click="expanded = !expanded"
      />
      <span v-else class="tree-select__toggle-placeholder" aria-hidden="true" />
      <div class="tree-select__content">
        <BaseCheckbox
          :model-value="selectionState.checked"
          :indeterminate="selectionState.indeterminate"
          :label="node.label"
          :disabled="disabled"
          @update:model-value="emit('toggle', node.id, Boolean($event))"
        />
        <span v-if="node.description" class="tree-select__description">{{ node.description }}</span>
      </div>
    </div>

    <ul
      v-if="node.children.length && expanded"
      :id="childGroupId"
      class="tree-select__group"
      role="group"
    >
      <BaseTreeSelectNode
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :selected-ids="selectedIds"
        :level="level + 1"
        :initially-expanded-depth="initiallyExpandedDepth"
        :disabled="disabled"
        @toggle="forwardToggle"
      />
    </ul>
  </li>
</template>

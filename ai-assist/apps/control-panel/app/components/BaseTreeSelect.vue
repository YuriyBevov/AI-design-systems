<script setup lang="ts">
import type { TreeSelectNode } from "~/utils/tree-select";
import { normalizeTreeSelection, toggleTreeNodeSelection } from "~/utils/tree-select";

const props = withDefaults(
  defineProps<{
    modelValue: string[];
    nodes: TreeSelectNode[];
    label: string;
    initiallyExpandedDepth?: number;
    disabled?: boolean;
  }>(),
  {
    initiallyExpandedDepth: 1,
    disabled: false,
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: string[]];
}>();

const normalizedSelection = computed(() => normalizeTreeSelection(props.nodes, props.modelValue));

const toggleNode = (nodeId: string, checked: boolean): void => {
  emit(
    "update:modelValue",
    toggleTreeNodeSelection(props.nodes, normalizedSelection.value, nodeId, checked),
  );
};
</script>

<template>
  <ul class="tree-select" role="tree" :aria-label="label">
    <BaseTreeSelectNode
      v-for="node in nodes"
      :key="node.id"
      :node="node"
      :selected-ids="normalizedSelection"
      :initially-expanded-depth="initiallyExpandedDepth"
      :disabled="disabled"
      @toggle="toggleNode"
    />
  </ul>
</template>

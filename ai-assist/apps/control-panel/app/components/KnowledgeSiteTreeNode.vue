<script setup lang="ts">
import type { SiteStructureNode } from "@ai-assist/contracts";

type SelectionState = Record<string, { included: boolean; includeDescendants: boolean }>;

const props = defineProps<{
  node: SiteStructureNode;
  selection: SelectionState;
}>();

const emit = defineEmits<{
  include: [path: string, included: boolean];
  descendants: [path: string, included: boolean];
}>();

const state = computed(() => props.selection[props.node.path]);
const domId = computed(
  () => props.node.path.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "root",
);
const forwardInclude = (path: string, included: boolean): void => emit("include", path, included);
const forwardDescendants = (path: string, included: boolean): void =>
  emit("descendants", path, included);
</script>

<template>
  <li class="site-tree__item">
    <div class="site-tree__node">
      <div class="site-tree__section">
        <strong>{{ node.label }}</strong>
        <span class="data-table__secondary">
          {{ node.path }} · вложенных узлов: {{ node.descendantCount }}
        </span>
      </div>
      <div class="site-tree__option">
        <input
          :id="`crawl-include-${domId}`"
          type="checkbox"
          :checked="state?.included ?? false"
          @change="emit('include', node.path, !state?.included)"
        />
        <label :for="`crawl-include-${domId}`">Включить в парсинг</label>
      </div>
      <div class="site-tree__option">
        <input
          :id="`crawl-descendants-${domId}`"
          type="checkbox"
          :checked="state?.includeDescendants ?? true"
          :disabled="!state?.included"
          @change="emit('descendants', node.path, !state?.includeDescendants)"
        />
        <label :for="`crawl-descendants-${domId}`">Включая вложенные узлы</label>
      </div>
    </div>

    <ul v-if="node.children.length" class="site-tree__list site-tree__list--nested">
      <KnowledgeSiteTreeNode
        v-for="child in node.children"
        :key="child.path"
        :node="child"
        :selection="selection"
        @include="forwardInclude"
        @descendants="forwardDescendants"
      />
    </ul>
  </li>
</template>

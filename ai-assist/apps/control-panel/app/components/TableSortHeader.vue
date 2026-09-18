<script setup lang="ts">
import type { TableSortDirection } from "~/composables/useTableSort";

const props = defineProps<{
  label: string;
  column: string;
  activeColumn: string;
  direction: TableSortDirection;
}>();

defineEmits<{
  sort: [column: string];
}>();

const isActive = computed(() => props.column === props.activeColumn);
const ariaSort = computed(() => (isActive.value ? props.direction : "none"));
</script>

<template>
  <th scope="col" :aria-sort="ariaSort">
    <button
      class="table-sort-button"
      :class="{ 'table-sort-button--active': isActive }"
      type="button"
      :aria-label="`${label}: изменить порядок сортировки`"
      @click="$emit('sort', column)"
    >
      <span>{{ label }}</span>
      <UiIcon
        name="chevron-down"
        class="table-sort-button__icon"
        :class="{ 'table-sort-button__icon--ascending': isActive && direction === 'ascending' }"
      />
    </button>
  </th>
</template>

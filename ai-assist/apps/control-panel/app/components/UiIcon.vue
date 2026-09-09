<script setup lang="ts">
type UiIconName =
  | "arrow-left"
  | "assistant"
  | "audit"
  | "check"
  | "chevron-down"
  | "close"
  | "components"
  | "help"
  | "home"
  | "knowledge"
  | "plus"
  | "projects"
  | "prompt"
  | "provider"
  | "settings";

defineProps<{
  name: UiIconName;
}>();
</script>

<template>
  <svg class="ui-icon" aria-hidden="true" focusable="false">
    <use :href="`/icons.svg#icon-${name}`" />
  </svg>
</template>

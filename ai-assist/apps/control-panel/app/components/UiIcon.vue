<script setup lang="ts">
type UiIconName =
  | "arrow-left"
  | "assistant"
  | "audit"
  | "check"
  | "chevron-down"
  | "close"
  | "components"
  | "copy"
  | "edit"
  | "eye"
  | "help"
  | "home"
  | "knowledge"
  | "logout"
  | "moon"
  | "archive"
  | "pause"
  | "play"
  | "plus"
  | "publish"
  | "projects"
  | "prompt"
  | "provider"
  | "refresh"
  | "restore"
  | "save"
  | "settings"
  | "sun"
  | "stop"
  | "trash"
  | "unpublish"
  | "power"
  | "users";

defineProps<{
  name: UiIconName;
}>();
</script>

<template>
  <svg class="ui-icon" aria-hidden="true" focusable="false">
    <use :href="`/icons.svg#icon-${name}`" />
  </svg>
</template>

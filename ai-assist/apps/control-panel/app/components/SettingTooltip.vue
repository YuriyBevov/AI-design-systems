<script setup lang="ts">
defineProps<{
  tooltipId: string;
  text: string;
}>();
</script>

<template>
  <button
    class="icon-button icon-button--tiny setting-tooltip"
    type="button"
    :aria-describedby="tooltipId"
    aria-label="Показать подсказку"
  >
    <UiIcon name="help" />
    <span :id="tooltipId" class="setting-tooltip__bubble" role="tooltip">{{ text }}</span>
  </button>
</template>

<script setup lang="ts">
defineProps<{
  tooltipId: string;
  text: string;
}>();
</script>

<template>
  <span
    class="setting-tooltip"
    tabindex="0"
    :aria-describedby="tooltipId"
    aria-label="Показать подсказку"
  >
    <span class="setting-tooltip__marker" aria-hidden="true">?</span>
    <span :id="tooltipId" class="setting-tooltip__bubble" role="tooltip">{{ text }}</span>
  </span>
</template>

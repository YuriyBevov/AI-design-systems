<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: "info" | "warning";
  }>(),
  {
    variant: "info",
  },
);
</script>

<template>
  <div class="notice" :class="`notice--${variant}`" role="status" aria-live="polite">
    <slot />
  </div>
</template>

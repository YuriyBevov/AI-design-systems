<script setup lang="ts">
withDefaults(
  defineProps<{
    expanded?: boolean;
    disabled?: boolean;
    label?: string;
  }>(),
  {
    expanded: false,
    disabled: false,
    label: "Раскрыть вложенные элементы",
  },
);

defineEmits<{
  click: [event: MouseEvent];
}>();
</script>

<template>
  <button
    class="icon-button icon-button--compact disclosure-toggle"
    type="button"
    :disabled="disabled"
    :aria-expanded="expanded"
    :aria-label="label"
    :title="label"
    @click="$emit('click', $event)"
  >
    <UiIcon class="disclosure-toggle__icon" name="chevron-down" />
  </button>
</template>

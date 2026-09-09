<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    modelValue: boolean | string[];
    value?: string;
    label: string;
    disabled?: boolean;
    required?: boolean;
  }>(),
  {
    value: undefined,
    disabled: false,
    required: false,
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: boolean | string[]];
}>();

const isChecked = computed(() =>
  Array.isArray(props.modelValue)
    ? Boolean(props.value && props.modelValue.includes(props.value))
    : props.modelValue,
);

const updateValue = (event: Event): void => {
  const checked = (event.target as HTMLInputElement).checked;
  if (!Array.isArray(props.modelValue)) {
    emit("update:modelValue", checked);
    return;
  }

  const values = new Set(props.modelValue);
  if (checked && props.value) values.add(props.value);
  if (!checked && props.value) values.delete(props.value);
  emit("update:modelValue", [...values]);
};
</script>

<template>
  <label class="checkbox">
    <input
      class="checkbox__control"
      type="checkbox"
      :checked="isChecked"
      :disabled="disabled"
      :required="required"
      :value="value"
      @change="updateValue"
    />
    <span class="checkbox__box" aria-hidden="true" />
    <span class="checkbox__label">{{ label }}</span>
  </label>
</template>

<script setup lang="ts" generic="TValue extends string | null">
import {
  SelectContent,
  SelectIcon,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  SelectPortal,
  SelectRoot,
  SelectTrigger,
  SelectViewport,
} from "reka-ui";

type BaseSelectOption<TOptionValue extends string | null> = {
  value: TOptionValue;
  label: string;
  disabled?: boolean;
};

const nullValueKey = "__ai_assist_null_option__";

const props = withDefaults(
  defineProps<{
    modelValue: TValue;
    options: readonly BaseSelectOption<TValue>[];
    placeholder?: string;
    disabled?: boolean;
    label: string;
    id?: string;
    variant?: "default" | "compact";
  }>(),
  {
    placeholder: "Выберите значение",
    disabled: false,
    id: undefined,
    variant: "default",
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: TValue];
}>();

const optionKey = (value: string | null): string => (value === null ? nullValueKey : value);

const selectedKey = computed<string>({
  get: () => optionKey(props.modelValue),
  set: (key) => {
    const option = props.options.find((candidate) => optionKey(candidate.value) === key);
    if (option) emit("update:modelValue", option.value);
  },
});

const selectedLabel = computed(
  () => props.options.find((option) => option.value === props.modelValue)?.label ?? "",
);

const normalizedOptions = computed(() =>
  props.options.map((option) => ({ ...option, key: optionKey(option.value) })),
);
</script>

<template>
  <SelectRoot v-model="selectedKey" :disabled="disabled">
    <SelectTrigger
      :id="id"
      class="base-select form-field__control"
      :class="{ 'base-select--compact': variant === 'compact' }"
      :disabled="disabled"
      :aria-label="label"
    >
      <span
        class="base-select__value"
        :class="{ 'base-select__value--placeholder': !selectedLabel }"
      >
        {{ selectedLabel || placeholder }}
      </span>
      <SelectIcon class="base-select__icon">
        <UiIcon name="chevron-down" />
      </SelectIcon>
    </SelectTrigger>

    <SelectPortal>
      <SelectContent
        class="base-select__content"
        position="popper"
        :body-lock="false"
        :side-offset="4"
        :collision-padding="16"
      >
        <SelectViewport class="base-select__viewport">
          <SelectItem
            v-for="option in normalizedOptions"
            :key="option.key"
            class="base-select__item"
            :value="option.key"
            :disabled="option.disabled"
          >
            <SelectItemText>{{ option.label }}</SelectItemText>
            <SelectItemIndicator class="base-select__indicator">
              <UiIcon class="base-select__check" name="check" />
            </SelectItemIndicator>
          </SelectItem>
        </SelectViewport>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>

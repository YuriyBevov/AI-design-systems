<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    title: string;
    description: string;
    confirmLabel: string;
    pendingLabel?: string;
    pending?: boolean;
    danger?: boolean;
  }>(),
  {
    pendingLabel: "Выполняем…",
    pending: false,
    danger: false,
  },
);

const emit = defineEmits<{
  close: [];
  confirm: [];
}>();

const close = (): void => {
  if (!props.pending) emit("close");
};
</script>

<template>
  <BaseModal :title="title" :description="description" @close="close">
    <div class="confirmation-modal__content">
      <p>{{ description }}</p>
    </div>

    <template #footer>
      <button class="button" type="button" :disabled="pending" @click="close">Отмена</button>
      <button
        class="button"
        :class="danger ? 'button--danger' : 'button--primary'"
        type="button"
        :disabled="pending"
        @click="emit('confirm')"
      >
        {{ pending ? pendingLabel : confirmLabel }}
      </button>
    </template>
  </BaseModal>
</template>

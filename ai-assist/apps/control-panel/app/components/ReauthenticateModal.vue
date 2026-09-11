<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    pending?: boolean;
  }>(),
  { pending: false },
);

const emit = defineEmits<{
  close: [];
  confirm: [password: string];
}>();

const password = ref("");

const close = (): void => {
  if (!props.pending) emit("close");
};
</script>

<template>
  <BaseModal
    title="Подтвердите пароль"
    description="Повторное подтверждение защищает добавление, замену и удаление ключа провайдера"
    @close="close"
  >
    <form id="reauthentication-form" class="modal-form" @submit.prevent="emit('confirm', password)">
      <label class="form-field">
        <span class="form-field__label">Текущий пароль</span>
        <input
          v-model="password"
          class="form-field__control"
          type="password"
          name="password"
          autocomplete="current-password"
          maxlength="128"
          required
          autofocus
          :disabled="pending"
        />
      </label>
      <BaseNote
        :items="[
          'Подтверждение действует 30 минут.',
          'Выходить из панели и вводить email повторно не нужно.',
        ]"
      />
    </form>

    <template #footer>
      <button
        class="button button--primary"
        type="submit"
        form="reauthentication-form"
        :disabled="pending || !password"
      >
        {{ pending ? "Проверяем…" : "Подтвердить" }}
      </button>
      <button class="button" type="button" :disabled="pending" @click="close">Отмена</button>
    </template>
  </BaseModal>
</template>

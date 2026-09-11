<script setup lang="ts">
import type { AdminSessionResponse } from "@ai-assist/contracts";

definePageMeta({ layout: false });

const session = useAdminSessionState();
const credentials = reactive({ email: "", password: "" });
const errorMessage = ref("");
const isSubmitting = ref(false);
useToastMessage(errorMessage);

const submit = async (): Promise<void> => {
  errorMessage.value = "";
  isSubmitting.value = true;

  try {
    session.value = await $fetch<AdminSessionResponse>("/api/v1/auth/login", {
      method: "POST",
      body: credentials,
    });
    await navigateTo("/");
  } catch (error) {
    const fetchError = error as { data?: { statusMessage?: string } };
    errorMessage.value = fetchError.data?.statusMessage ?? "Не удалось войти. Попробуйте ещё раз.";
  } finally {
    isSubmitting.value = false;
  }
};
</script>

<template>
  <main class="auth-page">
    <section class="auth-card" aria-labelledby="login-title">
      <div class="auth-card__intro">
        <span class="brand__mark" aria-hidden="true">AI</span>
        <h1 id="login-title" class="auth-card__title">Вход в AI Assist</h1>
        <p class="auth-card__description">
          Управляйте ассистентом, источниками знаний и настройками проекта.
        </p>
      </div>

      <form class="form-stack" @submit.prevent="submit">
        <label class="form-field">
          <span class="form-field__label">Email</span>
          <input
            v-model.trim="credentials.email"
            class="form-field__control"
            type="email"
            name="email"
            autocomplete="username"
            maxlength="320"
            required
          />
        </label>

        <label class="form-field">
          <span class="form-field__label">Пароль</span>
          <input
            v-model="credentials.password"
            class="form-field__control"
            type="password"
            name="password"
            autocomplete="current-password"
            maxlength="128"
            required
          />
        </label>

        <button class="button button--primary button--wide" type="submit" :disabled="isSubmitting">
          {{ isSubmitting ? "Входим…" : "Войти" }}
        </button>
      </form>
    </section>
  </main>
</template>

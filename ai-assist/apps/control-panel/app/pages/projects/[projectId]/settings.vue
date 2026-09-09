<script setup lang="ts">
import type { ProjectResponse, UpdateProjectRequest } from "@ai-assist/contracts";

import { russianTimezoneOptions } from "~/utils/project-options";

const route = useRoute();
const session = useAdminSessionState();
const projectId = computed(() => String(route.params.projectId));
const requestFetch = useRequestFetch();
const form = reactive({
  name: "",
  timezone: "",
});
const isSaving = ref(false);
const message = ref<{ type: "success" | "error"; text: string } | null>(null);

const { data: project, error } = await useAsyncData(
  () => `project-settings-${projectId.value}`,
  () => requestFetch<ProjectResponse>(`/api/v1/projects/${projectId.value}`),
);

watch(
  project,
  (value) => {
    if (!value) return;
    form.name = value.name;
    form.timezone = value.timezone;
  },
  { immediate: true },
);

const canEdit = computed(
  () => session.value?.user.role === "admin" && project.value?.role === "owner",
);
const roleLabel = computed(() =>
  session.value?.user.role === "admin" ? "Администратор" : "Пользователь",
);

const save = async (): Promise<void> => {
  if (!canEdit.value) return;
  isSaving.value = true;
  message.value = null;

  const update: UpdateProjectRequest = {
    name: form.name,
    timezone: form.timezone,
  };

  try {
    const updated = await $fetch<ProjectResponse>(`/api/v1/projects/${projectId.value}`, {
      method: "PATCH",
      headers: getCsrfHeaders(),
      body: update,
    });
    project.value = updated;

    const sessionProject = session.value?.projects.find((item) => item.id === updated.id);
    if (sessionProject) sessionProject.name = updated.name;
    message.value = { type: "success", text: "Настройки сохранены" };
  } catch {
    message.value = { type: "error", text: "Не удалось сохранить настройки" };
  } finally {
    isSaving.value = false;
  }
};
</script>

<template>
  <main class="page-frame page-frame--narrow">
    <header class="page-header">
      <div>
        <p class="eyebrow">Проект</p>
        <h1 class="page-title page-title--compact">Настройки</h1>
        <p class="page-description">Общие параметры рабочего пространства ассистента.</p>
      </div>
      <span v-if="project" class="role-badge role-badge--large">{{ roleLabel }}</span>
    </header>

    <div v-if="error" class="empty-state" role="alert">Проект не найден или недоступен.</div>

    <form v-else-if="project" class="panel form-stack" @submit.prevent="save">
      <div class="form-grid">
        <label class="form-field form-field--wide">
          <span class="form-field__label">Название проекта</span>
          <input
            v-model.trim="form.name"
            class="form-field__control"
            type="text"
            maxlength="160"
            required
            :disabled="!canEdit"
          />
        </label>

        <div class="form-field">
          <span class="form-field__label">Часовой пояс</span>
          <BaseSelect
            v-model="form.timezone"
            :options="russianTimezoneOptions"
            label="Часовой пояс проекта"
            :disabled="!canEdit"
          />
        </div>
      </div>

      <div class="readonly-summary">
        <div>
          <span>Основной сайт</span>
          <strong>{{ project.primaryOrigin ?? "Не задан" }}</strong>
        </div>
        <div>
          <span>Идентификатор</span>
          <code>{{ project.id }}</code>
        </div>
      </div>

      <p v-if="!canEdit" class="form-message">Только администратор может изменять эти настройки.</p>
      <p v-if="message" class="form-message" :class="`form-message--${message.type}`" role="status">
        {{ message.text }}
      </p>

      <div class="form-actions">
        <button class="button button--primary" type="submit" :disabled="!canEdit || isSaving">
          {{ isSaving ? "Сохраняем…" : "Сохранить изменения" }}
        </button>
      </div>
    </form>
  </main>
</template>

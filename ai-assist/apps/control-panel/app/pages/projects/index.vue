<script setup lang="ts">
import type { AdminSessionResponse, ProjectResponse } from "@ai-assist/contracts";

import { russianTimezoneOptions } from "~/utils/project-options";

const requestFetch = useRequestFetch();
const session = useAdminSessionState();
const form = reactive({
  name: "",
  timezone: "Europe/Moscow",
  templateProjectId: null as string | null,
});
const isCreating = ref(false);
const pendingProjectId = ref<string | null>(null);
const deleteConfirmationId = ref<string | null>(null);
const message = ref<{ type: "success" | "error"; text: string } | null>(null);

const {
  data: projects,
  error,
  refresh,
} = await useAsyncData("projects-management", () =>
  requestFetch<ProjectResponse[]>("/api/v1/projects"),
);

const templateOptions = computed(() => [
  { value: null, label: "Без копирования" },
  ...(projects.value ?? [])
    .filter((project) => project.status === "active" && project.role === "owner")
    .map((project) => ({ value: project.id, label: project.name })),
]);

const statusLabel = (status: ProjectResponse["status"]): string =>
  ({ active: "Активен", suspended: "Приостановлен", archived: "Удалён" })[status];

const refreshSession = async (): Promise<void> => {
  session.value = await $fetch<AdminSessionResponse>("/api/v1/auth/session");
};

const requestErrorMessage = (requestError: unknown, fallback: string): string => {
  const fetchError = requestError as {
    data?: { statusMessage?: string; data?: { code?: string } };
  };
  const code = fetchError.data?.data?.code;
  if (code === "PROJECT_SLUG_GENERATION_FAILED") {
    return "Не удалось создать уникальный идентификатор. Попробуйте ещё раз.";
  }
  if (code === "RECENT_AUTHENTICATION_REQUIRED") {
    return "Для удаления проекта выйдите из панели и войдите заново.";
  }
  return fetchError.data?.statusMessage ?? fallback;
};

const createProject = async (): Promise<void> => {
  if (isCreating.value) return;
  isCreating.value = true;
  message.value = null;
  const body = {
    name: form.name,
    timezone: form.timezone,
    templateProjectId: form.templateProjectId,
  };

  try {
    const created = await $fetch<ProjectResponse>("/api/v1/projects", {
      method: "POST",
      headers: getCsrfHeaders(),
      body,
    });
    await Promise.all([refresh(), refreshSession()]);
    form.name = "";
    form.templateProjectId = null;
    message.value = { type: "success", text: `Проект «${created.name}» создан.` };
  } catch (requestError) {
    message.value = {
      type: "error",
      text: requestErrorMessage(requestError, "Не удалось создать проект."),
    };
  } finally {
    isCreating.value = false;
  }
};

const changeStatus = async (
  project: ProjectResponse,
  status: "active" | "suspended",
): Promise<void> => {
  if (pendingProjectId.value) return;
  pendingProjectId.value = project.id;
  message.value = null;
  try {
    await $fetch(`/api/v1/projects/${project.id}/status`, {
      method: "PATCH",
      headers: getCsrfHeaders(),
      body: { status },
    });
    await Promise.all([refresh(), refreshSession()]);
    message.value = {
      type: "success",
      text: status === "suspended" ? "Проект приостановлен." : "Проект снова активен.",
    };
  } catch (requestError) {
    message.value = {
      type: "error",
      text: requestErrorMessage(requestError, "Не удалось изменить статус проекта."),
    };
  } finally {
    pendingProjectId.value = null;
  }
};

const deleteProject = async (project: ProjectResponse): Promise<void> => {
  if (pendingProjectId.value) return;
  pendingProjectId.value = project.id;
  message.value = null;
  try {
    await $fetch(`/api/v1/projects/${project.id}`, {
      method: "DELETE",
      headers: getCsrfHeaders(),
    });
    deleteConfirmationId.value = null;
    await Promise.all([refresh(), refreshSession()]);
    message.value = { type: "success", text: `Проект «${project.name}» удалён.` };
  } catch (requestError) {
    message.value = {
      type: "error",
      text: requestErrorMessage(requestError, "Не удалось удалить проект."),
    };
  } finally {
    pendingProjectId.value = null;
  }
};
</script>

<template>
  <main class="page-frame">
    <header class="page-header">
      <div>
        <p class="eyebrow">Рабочие пространства</p>
        <h1 class="page-title page-title--compact">Проекты</h1>
        <p class="page-description">
          Каждый проект хранит собственные настройки, историю, знания и runtime ассистента.
        </p>
      </div>
    </header>

    <section class="panel" aria-labelledby="create-project-title">
      <header class="section-header">
        <div>
          <p class="eyebrow">Новый проект</p>
          <h2 id="create-project-title" class="section-title">Создать рабочее пространство</h2>
        </div>
        <p class="section-description">
          Новый проект всегда создаётся без доменов, provider credential и выбранных моделей.
        </p>
      </header>

      <form class="form-stack" @submit.prevent="createProject">
        <div class="form-grid">
          <label class="form-field">
            <span class="form-field__label">Название</span>
            <input
              v-model.trim="form.name"
              class="form-field__control"
              type="text"
              maxlength="160"
              required
            />
          </label>
          <div class="form-field">
            <span class="form-field__label">Часовой пояс</span>
            <BaseSelect
              v-model="form.timezone"
              :options="russianTimezoneOptions"
              label="Часовой пояс проекта"
            />
          </div>
          <div class="form-field">
            <span class="form-field__label">Создать на основе проекта</span>
            <BaseSelect
              v-model="form.templateProjectId"
              :options="templateOptions"
              label="Создать на основе проекта"
            />
          </div>
        </div>

        <div class="copy-policy">
          <p>
            <strong>При копировании:</strong> переносятся draft-настройки ассистента, срок хранения
            диалогов и последние версии prompts.
          </p>
          <p>
            Не переносятся домены, контакты, ключи, provider/model settings, БЗ, публикации, диалоги
            и audit. Один ключ можно затем вручную указать в нескольких проектах.
          </p>
        </div>

        <p
          v-if="message"
          class="form-message"
          :class="`form-message--${message.type}`"
          role="status"
        >
          {{ message.text }}
        </p>

        <div class="form-actions">
          <button class="button button--primary" type="submit" :disabled="isCreating">
            {{ isCreating ? "Создаём…" : "Создать проект" }}
          </button>
        </div>
      </form>
    </section>

    <section class="panel" aria-labelledby="project-list-title">
      <header class="section-header">
        <div>
          <p class="eyebrow">Управление</p>
          <h2 id="project-list-title" class="section-title">Доступные проекты</h2>
        </div>
        <p class="section-description">Приостановленный проект не обслуживает виджет и jobs.</p>
      </header>

      <div v-if="error" class="empty-state" role="alert">Не удалось загрузить проекты.</div>
      <div v-else-if="!projects?.length" class="empty-state">Проектов пока нет.</div>
      <ul v-else class="project-list">
        <li v-for="project in projects" :key="project.id" class="project-card">
          <header class="project-card__header">
            <div>
              <h3 class="project-card__title">{{ project.name }}</h3>
            </div>
            <span class="status-badge" :data-status="project.status">
              {{ statusLabel(project.status) }}
            </span>
          </header>

          <dl class="project-card__meta">
            <div>
              <dt>Роль</dt>
              <dd>{{ project.role }}</dd>
            </div>
            <div>
              <dt>Часовой пояс</dt>
              <dd>{{ project.timezone }}</dd>
            </div>
          </dl>

          <div class="button-group project-card__actions">
            <NuxtLink
              v-if="project.status === 'active'"
              class="button button--compact"
              :to="`/projects/${project.id}/settings`"
            >
              Открыть
            </NuxtLink>
            <button
              v-if="project.role === 'owner' && project.status === 'active'"
              class="button button--compact"
              type="button"
              :disabled="pendingProjectId === project.id"
              @click="changeStatus(project, 'suspended')"
            >
              Приостановить
            </button>
            <button
              v-if="project.role === 'owner' && project.status === 'suspended'"
              class="button button--compact button--primary"
              type="button"
              :disabled="pendingProjectId === project.id"
              @click="changeStatus(project, 'active')"
            >
              Возобновить
            </button>
            <button
              v-if="project.role === 'owner'"
              class="button button--compact button--text button--danger"
              type="button"
              :disabled="pendingProjectId === project.id"
              @click="deleteConfirmationId = project.id"
            >
              Удалить
            </button>
          </div>

          <div v-if="deleteConfirmationId === project.id" class="danger-confirmation">
            <p>Проект исчезнет из панели и runtime, но данные сохранятся для audit и retention.</p>
            <div class="button-group">
              <button
                class="button button--compact button--danger"
                type="button"
                :disabled="pendingProjectId === project.id"
                @click="deleteProject(project)"
              >
                Удалить проект
              </button>
              <button
                class="button button--compact"
                type="button"
                :disabled="pendingProjectId === project.id"
                @click="deleteConfirmationId = null"
              >
                Отмена
              </button>
            </div>
          </div>
        </li>
      </ul>
    </section>
  </main>
</template>

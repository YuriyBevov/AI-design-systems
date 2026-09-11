<script setup lang="ts">
import type {
  KnowledgeIndexStateResponse,
  ProjectResponse,
  UpdateProjectRequest,
} from "@ai-assist/contracts";

import { russianTimezoneOptions } from "~/utils/project-options";

type ReadinessState = {
  status: "idle" | "checking" | "ok" | "degraded";
  checks?: Record<string, "ok" | "error">;
};

const { activeProject: project } = useActiveProject();
const session = useAdminSessionState();
const requestFetch = useRequestFetch();
const readiness = ref<ReadinessState>({ status: "idle" });
const settingsForm = reactive({ name: "", timezone: "" });
const isSavingSettings = ref(false);
const settingsMessage = ref<{ type: "success" | "error"; text: string } | null>(null);
useToastMessage(settingsMessage);

const {
  data: projectDetails,
  error: projectDetailsError,
  refresh: refreshProjectDetails,
} = await useAsyncData("overview-project-details", () =>
  project.value
    ? requestFetch<ProjectResponse>(`/api/v1/projects/${project.value.id}`)
    : Promise.resolve(null),
);
const { data: knowledgeState, refresh: refreshKnowledgeState } = await useAsyncData(
  "overview-knowledge-state",
  () =>
    project.value
      ? requestFetch<KnowledgeIndexStateResponse>(`/api/v1/projects/${project.value.id}/knowledge`)
      : Promise.resolve(null),
);

watch(
  () => project.value?.id,
  () => void Promise.all([refreshProjectDetails(), refreshKnowledgeState()]),
);

watch(
  projectDetails,
  (value) => {
    if (!value) return;
    settingsForm.name = value.name;
    settingsForm.timezone = value.timezone;
  },
  { immediate: true },
);

const roleLabel = computed(() =>
  session.value?.user.role === "admin" ? "Администратор" : "Пользователь",
);
const canEditProject = computed(
  () => session.value?.user.role === "admin" && projectDetails.value?.role === "owner",
);

const saveProjectSettings = async (): Promise<void> => {
  if (!project.value || !canEditProject.value || isSavingSettings.value) return;
  isSavingSettings.value = true;
  settingsMessage.value = null;

  const update: UpdateProjectRequest = {
    name: settingsForm.name,
    timezone: settingsForm.timezone,
  };

  try {
    const updated = await $fetch<ProjectResponse>(`/api/v1/projects/${project.value.id}`, {
      method: "PATCH",
      headers: getCsrfHeaders(),
      body: update,
    });
    projectDetails.value = updated;
    const sessionProject = session.value?.projects.find((item) => item.id === updated.id);
    if (sessionProject) sessionProject.name = updated.name;
    settingsMessage.value = { type: "success", text: "Настройки проекта сохранены" };
  } catch {
    settingsMessage.value = { type: "error", text: "Не удалось сохранить настройки проекта" };
  } finally {
    isSavingSettings.value = false;
  }
};

const documentCountLabel = computed(() => {
  const count = knowledgeState.value?.publishedDocumentCount ?? 0;
  const lastTwo = count % 100;
  const last = count % 10;
  const noun =
    lastTwo >= 11 && lastTwo <= 14
      ? "документов"
      : last === 1
        ? "документ"
        : last >= 2 && last <= 4
          ? "документа"
          : "документов";
  return `${count} ${noun}`;
});

const knowledgeStatusLabel = computed(() => {
  const state = knowledgeState.value;
  if (!state || state.publishedDocumentCount === 0) return "Нет опубликованных материалов";
  if (state.latest?.status === "queued") return "Обновление индекса поставлено в очередь";
  if (state.latest?.status === "building") return "Индекс обновляется";
  if (state.latest?.status === "failed") return "Последнее обновление индекса завершилось ошибкой";
  if (state.stale) return "Индекс требует обновления";
  if (state.active) return "Индекс актуален и готов к поиску";
  return "Индекс ещё не создан";
});

const checkReadiness = async (): Promise<void> => {
  readiness.value = { status: "checking" };

  try {
    const result = await $fetch<{ status: "ok" | "degraded"; checks?: ReadinessState["checks"] }>(
      "/api/health/ready",
    );
    readiness.value = { status: result.status, checks: result.checks };
  } catch (error) {
    const response = error as { data?: { checks?: ReadinessState["checks"] } };
    readiness.value = { status: "degraded", checks: response.data?.checks };
  }
};
</script>

<template>
  <main class="page-frame">
    <header class="page-header page-header--visible-title">
      <div>
        <h1 class="page-title">{{ project?.name ?? "Проект не выбран" }}</h1>
      </div>
      <span class="status-badge" data-status="active">Активен</span>
    </header>

    <div v-if="projectDetailsError" class="empty-state" role="alert">
      Настройки проекта недоступны.
    </div>

    <form
      v-else-if="projectDetails"
      class="panel form-stack"
      aria-labelledby="project-settings-title"
      @submit.prevent="saveProjectSettings"
    >
      <header class="section-header">
        <div>
          <h2 id="project-settings-title" class="section-title">Настройки проекта</h2>
        </div>
      </header>

      <div class="form-grid">
        <label class="form-field form-field--wide">
          <span class="form-field__label">Название проекта</span>
          <input
            v-model.trim="settingsForm.name"
            class="form-field__control"
            type="text"
            maxlength="160"
            required
            :disabled="!canEditProject"
          />
        </label>

        <div class="form-field">
          <span class="form-field__label">Часовой пояс</span>
          <BaseSelect
            v-model="settingsForm.timezone"
            :options="russianTimezoneOptions"
            label="Часовой пояс проекта"
            :disabled="!canEditProject"
          />
        </div>
      </div>

      <div class="readonly-summary">
        <div>
          <span>Основной сайт</span>
          <strong>{{ projectDetails.primaryOrigin ?? "Не задан" }}</strong>
        </div>
        <div>
          <span>Идентификатор</span>
          <code>{{ projectDetails.id }}</code>
        </div>
      </div>

      <p v-if="!canEditProject" class="form-note">
        Только администратор может изменять эти настройки.
      </p>

      <div class="form-actions">
        <button
          class="button button--primary"
          type="submit"
          :disabled="!canEditProject || isSavingSettings"
        >
          {{ isSavingSettings ? "Сохраняем…" : "Сохранить изменения" }}
        </button>
      </div>
    </form>

    <section class="metric-grid" aria-label="Краткий статус">
      <article class="metric-card">
        <span class="metric-card__label">Роль</span>
        <strong class="metric-card__value">{{ roleLabel }}</strong>
        <span class="metric-card__hint">Права в текущем проекте</span>
      </article>
      <article class="metric-card">
        <span class="metric-card__label">База знаний</span>
        <strong class="metric-card__value">{{ documentCountLabel }}</strong>
        <span class="metric-card__hint">{{ knowledgeStatusLabel }}</span>
      </article>
    </section>

    <section class="panel" aria-labelledby="quick-actions-title">
      <header class="section-header">
        <div>
          <h2 id="quick-actions-title" class="section-title">Быстрые действия</h2>
        </div>
        <p class="section-description">Базовые административные функции текущего проекта.</p>
      </header>

      <div v-if="project" class="action-grid">
        <NuxtLink class="action-card" :to="`/projects/${project.id}/audit`">
          <span class="action-card__icon" aria-hidden="true">
            <UiIcon class="ui-icon--large" name="audit" />
          </span>
          <strong>Журнал аудита</strong>
          <span>Проверить входы и изменения критичных настроек.</span>
        </NuxtLink>
        <NuxtLink class="action-card" :to="`/projects/${project.id}/prompts`">
          <span class="action-card__icon" aria-hidden="true">
            <UiIcon class="ui-icon--large" name="prompt" />
          </span>
          <strong>Prompts</strong>
          <span>Создать инструкцию, проверить версии и опубликовать production-конфигурацию.</span>
        </NuxtLink>
        <NuxtLink
          v-if="session?.user.role === 'admin'"
          class="action-card"
          :to="`/projects/${project.id}/provider`"
        >
          <span class="action-card__icon" aria-hidden="true">
            <UiIcon class="ui-icon--large" name="provider" />
          </span>
          <strong>AITUNNEL и модели</strong>
          <span>Безопасно подключить ключ и выбрать chat/embedding модели.</span>
        </NuxtLink>
      </div>
    </section>

    <section class="panel" aria-labelledby="health-title">
      <header class="section-header">
        <div>
          <h2 id="health-title" class="section-title">Состояние сервисов</h2>
        </div>
        <button
          class="button"
          type="button"
          :disabled="readiness.status === 'checking'"
          @click="checkReadiness"
        >
          {{ readiness.status === "checking" ? "Проверяем…" : "Проверить" }}
        </button>
      </header>

      <div class="health-line">
        <span class="health-dot" :data-state="readiness.status" aria-hidden="true" />
        <strong>{{
          readiness.status === "idle" ? "Проверка ещё не запускалась" : readiness.status
        }}</strong>
      </div>
      <ul v-if="readiness.checks" class="check-list" aria-label="Проверки инфраструктуры">
        <li v-for="(status, name) in readiness.checks" :key="name" class="check-list__item">
          <span>{{ name }}</span>
          <span>{{ status }}</span>
        </li>
      </ul>
    </section>
  </main>
</template>

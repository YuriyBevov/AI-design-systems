<script setup lang="ts">
import type { AuditEventResponse, ProjectResponse } from "@ai-assist/contracts";

const route = useRoute();
const projectId = computed(() => String(route.params.projectId));
const requestFetch = useRequestFetch();

const { data, error, refresh, status } = await useAsyncData(
  () => `project-audit-${projectId.value}`,
  async () => {
    const [project, events] = await Promise.all([
      requestFetch<ProjectResponse>(`/api/v1/projects/${projectId.value}`),
      requestFetch<AuditEventResponse[]>(`/api/v1/projects/${projectId.value}/audit`),
    ]);
    return { project, events };
  },
);

const formatDate = (value: string): string =>
  new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value));

const actionLabel = (action: string): string =>
  ({
    "auth.login": "Вход",
    "auth.reauthenticated": "Подтверждение пароля",
    "auth.reauthentication_failed": "Ошибка подтверждения пароля",
    "auth.logout": "Выход",
    "project.updated": "Настройки изменены",
    "assistant.config_revision_created": "Черновик ассистента сохранён",
    "assistant.published": "Настройки ассистента опубликованы",
    "prompt.created": "Prompt создан",
    "prompt.metadata_updated": "Метаданные prompt изменены",
    "prompt.revision_created": "Версия prompt создана",
    "prompt.previewed": "Preview prompt выполнен",
    "prompt.preview_failed": "Preview prompt завершился ошибкой",
    "prompt.published": "Prompt опубликован",
    "prompt.rolled_back": "Выполнен rollback prompt",
    "prompt.archived": "Prompt архивирован",
    "prompt.deleted": "Prompt удалён",
    "knowledge.document_created": "Документ знаний создан",
    "knowledge.version_created": "Версия знаний создана",
    "knowledge.document_published": "Документ знаний опубликован",
    "knowledge.document_unpublished": "Документ знаний снят с публикации",
    "knowledge.document_archived": "Документ знаний архивирован",
    "knowledge.document_deleted": "Черновик знаний удалён",
  })[action] ?? action;
</script>

<template>
  <main class="page-frame">
    <header class="page-header">
      <div>
        <h1 class="page-title page-title--compact">Журнал аудита</h1>
        <p class="page-description">Значимые действия в проекте {{ data?.project.name }}.</p>
      </div>
      <button class="button" type="button" :disabled="status === 'pending'" @click="refresh">
        {{ status === "pending" ? "Обновляем…" : "Обновить" }}
      </button>
    </header>

    <div v-if="error" class="empty-state" role="alert">Журнал недоступен.</div>

    <section v-else class="panel panel--flush" aria-label="События аудита">
      <div v-if="!data?.events.length" class="empty-state">Событий пока нет.</div>
      <div v-else class="table-scroll">
        <table class="data-table" aria-label="События аудита">
          <thead>
            <tr>
              <th>Дата</th>
              <th>Действие</th>
              <th>Пользователь</th>
              <th>Объект</th>
              <th>Request ID</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="event in data.events" :key="event.id">
              <td>
                <time :datetime="event.createdAt">{{ formatDate(event.createdAt) }}</time>
              </td>
              <td>
                <strong>{{ actionLabel(event.action) }}</strong>
              </td>
              <td>{{ event.actorEmail ?? "Система" }}</td>
              <td>{{ event.resourceType }}</td>
              <td>
                <code>{{ event.requestId }}</code>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </main>
</template>

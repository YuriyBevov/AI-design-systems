<script setup lang="ts">
import type { AuditEventResponse, ProjectResponse } from "@ai-assist/contracts";

const route = useRoute();
const projectId = computed(() => String(route.params.projectId));
const requestFetch = useRequestFetch();
type AuditSortColumn = "createdAt" | "action" | "actor" | "resource" | "requestId";
const {
  sortColumn: auditSortColumn,
  sortDirection: auditSortDirection,
  toggleSort: toggleAuditSort,
} = useTableSort<AuditSortColumn>("createdAt", "descending");
const setAuditSort = (column: string): void => toggleAuditSort(column as AuditSortColumn);

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
const sortedEvents = computed(() =>
  sortTableRows(data.value?.events ?? [], auditSortDirection.value, (event) => {
    switch (auditSortColumn.value) {
      case "createdAt":
        return Date.parse(event.createdAt);
      case "action":
        return actionLabel(event.action);
      case "actor":
        return event.actorEmail ?? "Система";
      case "resource":
        return event.resourceType;
      case "requestId":
        return event.requestId;
    }
  }),
);
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

    <section v-else class="panel" aria-label="События аудита">
      <div v-if="!data?.events.length" class="empty-state">Событий пока нет.</div>
      <div v-else class="table-scroll">
        <table class="data-table" aria-label="События аудита">
          <thead>
            <tr>
              <TableSortHeader
                label="Дата"
                column="createdAt"
                :active-column="auditSortColumn"
                :direction="auditSortDirection"
                @sort="setAuditSort"
              />
              <TableSortHeader
                class="data-table__dynamic-column"
                label="Действие"
                column="action"
                :active-column="auditSortColumn"
                :direction="auditSortDirection"
                @sort="setAuditSort"
              />
              <TableSortHeader
                class="data-table__dynamic-column data-table__dynamic-column--compact"
                label="Пользователь"
                column="actor"
                :active-column="auditSortColumn"
                :direction="auditSortDirection"
                @sort="setAuditSort"
              />
              <TableSortHeader
                label="Объект"
                column="resource"
                :active-column="auditSortColumn"
                :direction="auditSortDirection"
                @sort="setAuditSort"
              />
              <TableSortHeader
                class="data-table__dynamic-column data-table__dynamic-column--compact"
                label="Request ID"
                column="requestId"
                :active-column="auditSortColumn"
                :direction="auditSortDirection"
                @sort="setAuditSort"
              />
            </tr>
          </thead>
          <tbody>
            <tr v-for="event in sortedEvents" :key="event.id">
              <td>
                <time :datetime="event.createdAt">{{ formatDate(event.createdAt) }}</time>
              </td>
              <td class="data-table__dynamic-cell">
                <div class="data-table__clamp">
                  <strong>{{ actionLabel(event.action) }}</strong>
                </div>
              </td>
              <td class="data-table__dynamic-cell data-table__dynamic-cell--compact">
                <div class="data-table__nowrap data-table__nowrap--compact">
                  {{ event.actorEmail ?? "Система" }}
                </div>
              </td>
              <td>{{ event.resourceType }}</td>
              <td class="data-table__dynamic-cell data-table__dynamic-cell--compact">
                <div class="data-table__nowrap data-table__nowrap--compact">
                  <code>{{ event.requestId }}</code>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </main>
</template>

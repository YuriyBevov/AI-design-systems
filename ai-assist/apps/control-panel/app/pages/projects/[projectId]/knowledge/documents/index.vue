<script setup lang="ts">
import type {
  KnowledgeDocumentListResponse,
  KnowledgeDocumentStatus,
  KnowledgeDocumentType,
  KnowledgeIndexStateResponse,
  ProjectResponse,
} from "@ai-assist/contracts";

const route = useRoute();
const session = useAdminSessionState();
const requestFetch = useRequestFetch();
const projectId = computed(() => String(route.params.projectId));
const { setKnowledgeIndexState } = useKnowledgeIndexState();
const isRequestingIndex = ref(false);
const message = ref<{ type: "success" | "error"; text: string } | null>(null);
useToastMessage(message);
type DocumentPageSize = "10" | "25" | "50" | "100" | "500" | "all";
const searchQuery = ref("");
const pageSize = ref<DocumentPageSize>("10");
const currentPage = ref(1);
const pageSizeOptions = [
  { value: "10", label: "10" },
  { value: "25", label: "25" },
  { value: "50", label: "50" },
  { value: "100", label: "100" },
  { value: "500", label: "500" },
  { value: "all", label: "Показать все" },
] as const;

const { data, error, refresh } = await useAsyncData(
  () => `project-knowledge-${projectId.value}`,
  async () => {
    const [project, documentList, indexState] = await Promise.all([
      requestFetch<ProjectResponse>(`/api/v1/projects/${projectId.value}`),
      requestFetch<KnowledgeDocumentListResponse>(
        `/api/v1/projects/${projectId.value}/knowledge/documents`,
      ),
      requestFetch<KnowledgeIndexStateResponse>(`/api/v1/projects/${projectId.value}/knowledge`),
    ]);
    return { project, documentList, indexState };
  },
);

let indexPollTimer: ReturnType<typeof setTimeout> | undefined;
watch(
  () => data.value?.indexState.latest?.status,
  (status) => {
    if (!import.meta.client) return;
    if (indexPollTimer) clearTimeout(indexPollTimer);
    if (status === "queued" || status === "building") {
      indexPollTimer = setTimeout(() => void refresh(), 1_500);
    }
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  if (indexPollTimer) clearTimeout(indexPollTimer);
});

const role = computed(
  () =>
    session.value?.projects.find((project) => project.id === projectId.value)?.role ??
    data.value?.project.role,
);
const canEdit = computed(() => role.value === "owner" || role.value === "editor");

watch(
  () => data.value?.indexState,
  (indexState) => {
    if (indexState) setKnowledgeIndexState(projectId.value, indexState);
  },
  { immediate: true },
);

const statusLabel = (status: KnowledgeDocumentStatus): string =>
  ({ draft: "Черновик", published: "Опубликован", archived: "Архив" })[status];

const typeLabel = (type: KnowledgeDocumentType): string =>
  ({ page: "Страница", manual: "Документ", product: "Товар" })[type];

const filteredDocuments = computed(() => {
  const documents = data.value?.documentList.documents ?? [];
  const query = searchQuery.value.trim().toLocaleLowerCase("ru-RU");
  if (!query) return documents;
  return documents.filter((document) =>
    [document.title, typeLabel(document.type), statusLabel(document.status)].some((value) =>
      value.toLocaleLowerCase("ru-RU").includes(query),
    ),
  );
});
const effectivePageSize = computed(() =>
  pageSize.value === "all" ? Math.max(filteredDocuments.value.length, 1) : Number(pageSize.value),
);
const totalPages = computed(() =>
  Math.max(1, Math.ceil(filteredDocuments.value.length / effectivePageSize.value)),
);
const paginatedDocuments = computed(() => {
  const start = (currentPage.value - 1) * effectivePageSize.value;
  return filteredDocuments.value.slice(start, start + effectivePageSize.value);
});
const paginationItems = computed(() => getPaginationItems(currentPage.value, totalPages.value));
const firstVisibleRecord = computed(() =>
  filteredDocuments.value.length ? (currentPage.value - 1) * effectivePageSize.value + 1 : 0,
);
const lastVisibleRecord = computed(() =>
  Math.min(currentPage.value * effectivePageSize.value, filteredDocuments.value.length),
);

watch([searchQuery, pageSize, projectId], () => {
  currentPage.value = 1;
});
watch(totalPages, (pageCount) => {
  if (currentPage.value > pageCount) currentPage.value = pageCount;
});

const goToPage = (page: number): void => {
  currentPage.value = Math.min(Math.max(page, 1), totalPages.value);
};

const notifyUploadUnavailable = (): void => {
  message.value = {
    type: "error",
    text: "Безопасная загрузка файлов пока не подключена.",
  };
};

const formatDate = (value: string): string =>
  new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

const indexStatusLabel = (status: string): string =>
  ({
    queued: "В очереди",
    building: "Строится",
    active: "Активен",
    superseded: "Заменён",
    failed: "Ошибка",
  })[status] ?? status;

const requestReindex = async (): Promise<void> => {
  if (!canEdit.value || isRequestingIndex.value) return;
  isRequestingIndex.value = true;
  message.value = null;
  try {
    await $fetch(`/api/v1/projects/${projectId.value}/knowledge/reindex`, {
      method: "POST",
      headers: getCsrfHeaders(),
    });
    message.value = { type: "success", text: "Переиндексация поставлена в очередь." };
    await refresh();
  } catch (requestError) {
    const fetchError = requestError as { data?: { statusMessage?: string } };
    message.value = {
      type: "error",
      text: fetchError.data?.statusMessage ?? "Не удалось запустить переиндексацию",
    };
    await refresh();
  } finally {
    isRequestingIndex.value = false;
  }
};
</script>

<template>
  <main class="page-frame page-frame--narrow">
    <div class="button-row page-actions" aria-label="Действия базы знаний">
      <NuxtLink class="button" :to="`/projects/${projectId}/knowledge/sources`">
        Парсинг данных
      </NuxtLink>
      <button v-if="canEdit" class="button" type="button" @click="notifyUploadUnavailable">
        Загрузить документ
      </button>
      <NuxtLink
        v-if="canEdit"
        class="button button--primary"
        :to="`/projects/${projectId}/knowledge/documents/new`"
      >
        Создать запись
      </NuxtLink>
    </div>

    <div v-if="error" class="empty-state" role="alert">База знаний недоступна.</div>

    <template v-else-if="data">
      <section class="panel" aria-labelledby="knowledge-index-title">
        <header class="section-header">
          <div>
            <h2 id="knowledge-index-title" class="section-title">Векторный индекс</h2>
          </div>
          <button
            v-if="canEdit"
            class="button"
            type="button"
            :disabled="
              isRequestingIndex ||
              data.indexState.latest?.status === 'queued' ||
              data.indexState.latest?.status === 'building'
            "
            @click="requestReindex"
          >
            {{ isRequestingIndex ? "Запускаем…" : "Переиндексировать" }}
          </button>
        </header>

        <dl class="settings-summary">
          <div>
            <dt>Модель векторизации (Embedding model)</dt>
            <dd>{{ data.indexState.configuredEmbeddingModelId ?? "Не выбрана" }}</dd>
          </div>
          <div>
            <dt>Последний запуск</dt>
            <dd>
              <span
                v-if="data.indexState.latest"
                class="status-badge status-badge--compact"
                :data-status="data.indexState.latest.status"
              >
                {{ indexStatusLabel(data.indexState.latest.status) }}
              </span>
              <span v-else>Ещё не запускался</span>
            </dd>
          </div>
          <div>
            <dt>Опубликовано</dt>
            <dd>
              {{ data.indexState.publishedDocumentCount }} документов ·
              {{ data.indexState.publishedChunkCount }} фрагментов
            </dd>
          </div>
          <div>
            <dt>Состояние</dt>
            <dd>
              {{
                data.indexState.active
                  ? data.indexState.stale
                    ? "Нужна переиндексация"
                    : `Актуален · ${data.indexState.active.embeddingDimension} измерений`
                  : "Активного индекса нет — используется текстовый поиск"
              }}
            </dd>
          </div>
        </dl>
        <p v-if="data.indexState.latest?.errorCode" class="field-note field-note--error">
          Код последней ошибки: {{ data.indexState.latest.errorCode }}. Действующий индекс и
          текстовый поиск продолжили работать.
        </p>
      </section>

      <section class="panel panel--flush" aria-label="Документы базы знаний">
        <div class="table-controls">
          <input
            v-model="searchQuery"
            class="form-field__control table-controls__search"
            type="search"
            placeholder="Быстрый поиск"
            aria-label="Быстрый поиск по записям"
          />
          <div class="table-controls__limit">
            <span>Показывать</span>
            <BaseSelect
              v-model="pageSize"
              :options="pageSizeOptions"
              label="Количество записей на странице"
              variant="compact"
              width="content"
            />
          </div>
        </div>

        <div v-if="!data.documentList.documents.length" class="empty-state">
          База знаний пока пуста. Создайте первую запись.
        </div>
        <div v-else-if="!filteredDocuments.length" class="empty-state">
          По вашему запросу ничего не найдено.
        </div>
        <div v-else class="table-scroll">
          <table class="data-table" aria-label="Документы базы знаний">
            <thead>
              <tr>
                <th scope="col">Название</th>
                <th scope="col">Тип</th>
                <th scope="col">Статус</th>
                <th scope="col">Версии</th>
                <th scope="col">Обновлён</th>
                <th scope="col">Действие</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="document in paginatedDocuments" :key="document.id">
                <td>
                  <strong>{{ document.title }}</strong>
                </td>
                <td>{{ typeLabel(document.type) }}</td>
                <td>
                  <span class="status-badge status-badge--compact" :data-status="document.status">
                    {{ statusLabel(document.status) }}
                  </span>
                </td>
                <td>
                  {{ document.latestVersionNo }}
                  <span v-if="document.activeVersionNo">
                    · active {{ document.activeVersionNo }}
                  </span>
                </td>
                <td>
                  <time :datetime="document.updatedAt">{{ formatDate(document.updatedAt) }}</time>
                </td>
                <td>
                  <NuxtLink
                    class="data-table__link"
                    :to="`/projects/${projectId}/knowledge/documents/${document.id}`"
                  >
                    Открыть
                  </NuxtLink>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-if="filteredDocuments.length" class="pagination">
          <span class="pagination__summary">
            Записи {{ firstVisibleRecord }}–{{ lastVisibleRecord }} из
            {{ filteredDocuments.length }} · Страница {{ currentPage }} из {{ totalPages }}
          </span>
          <nav class="pagination__actions" aria-label="Навигация по страницам записей">
            <button
              class="button button--compact"
              type="button"
              :disabled="currentPage === 1"
              @click="goToPage(currentPage - 1)"
            >
              Предыдущая
            </button>
            <template v-for="(item, index) in paginationItems" :key="`${item}-${index}`">
              <span v-if="item === 'ellipsis'" class="pagination__ellipsis" aria-hidden="true">
                …
              </span>
              <button
                v-else
                class="button button--compact pagination__page"
                :class="{ 'button--primary': item === currentPage }"
                type="button"
                :aria-current="item === currentPage ? 'page' : undefined"
                :aria-label="`Страница ${item}`"
                @click="goToPage(item)"
              >
                {{ item }}
              </button>
            </template>
            <button
              class="button button--compact"
              type="button"
              :disabled="currentPage === totalPages"
              @click="goToPage(currentPage + 1)"
            >
              Следующая
            </button>
          </nav>
        </div>
      </section>
    </template>
  </main>
</template>

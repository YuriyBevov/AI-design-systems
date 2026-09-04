<script setup lang="ts">
import type {
  CreateKnowledgeDocumentRequest,
  KnowledgeDocumentDetailResponse,
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
const isCreating = ref(false);
const isRequestingIndex = ref(false);
const message = ref<{ type: "success" | "error"; text: string } | null>(null);
const createForm = reactive({
  type: "manual" as KnowledgeDocumentType,
  title: "",
  content: "",
  canonicalUrl: "",
  locale: "",
  tags: "",
});

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

watch(
  () => data.value?.project.defaultLocale,
  (locale) => {
    if (locale && !createForm.locale) createForm.locale = locale;
  },
  { immediate: true },
);

const role = computed(
  () =>
    session.value?.projects.find((project) => project.id === projectId.value)?.role ??
    data.value?.project.role,
);
const canEdit = computed(() => role.value === "owner" || role.value === "editor");

const statusLabel = (status: KnowledgeDocumentStatus): string =>
  ({ draft: "Черновик", published: "Опубликован", archived: "Архив" })[status];

const typeLabel = (type: KnowledgeDocumentType): string =>
  ({ page: "Страница", manual: "Документ", product: "Товар" })[type];

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

const create = async (): Promise<void> => {
  if (!canEdit.value || isCreating.value) return;
  isCreating.value = true;
  message.value = null;
  const common = {
    title: createForm.title,
    content: createForm.content,
    canonicalUrl: createForm.canonicalUrl.trim() || null,
    locale: createForm.locale,
    tags: createForm.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
  };
  const body: CreateKnowledgeDocumentRequest =
    createForm.type === "product"
      ? {
          type: "product",
          ...common,
          product: {
            externalId: null,
            sku: null,
            category: null,
            priceDisplay: null,
            priceAmount: null,
            currency: null,
            availability: null,
            minimumOrder: null,
            characteristics: {},
          },
        }
      : { type: "manual", ...common, product: null };
  try {
    const created = await $fetch<KnowledgeDocumentDetailResponse>(
      `/api/v1/projects/${projectId.value}/knowledge/documents`,
      { method: "POST", headers: getCsrfHeaders(), body },
    );
    await navigateTo(`/projects/${projectId.value}/knowledge/documents/${created.document.id}`);
  } catch (requestError) {
    const fetchError = requestError as { data?: { statusMessage?: string } };
    message.value = {
      type: "error",
      text: fetchError.data?.statusMessage ?? "Не удалось создать документ",
    };
    await refresh();
  } finally {
    isCreating.value = false;
  }
};
</script>

<template>
  <main class="page-frame">
    <header class="page-header">
      <div>
        <p class="eyebrow">Проверяемые факты</p>
        <h1 class="page-title page-title--compact">База знаний</h1>
        <p class="page-description">
          Ручные документы и&nbsp;товары. Агент использует только опубликованные версии.
        </p>
      </div>
      <div class="button-row page-actions">
        <NuxtLink class="button button--secondary" :to="`/projects/${projectId}/knowledge/sources`">
          Источники сайта
        </NuxtLink>
      </div>
    </header>

    <p
      v-if="message"
      class="prompt-message"
      :class="`prompt-message--${message.type}`"
      role="status"
    >
      {{ message.text }}
    </p>

    <div v-if="error" class="empty-state" role="alert">База знаний недоступна.</div>

    <template v-else-if="data">
      <section class="panel" aria-labelledby="knowledge-index-title">
        <header class="section-header">
          <div>
            <p class="eyebrow">Гибридный поиск</p>
            <h2 id="knowledge-index-title" class="section-title">Векторный индекс</h2>
          </div>
          <button
            v-if="canEdit"
            class="button button--secondary"
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
            <dt>Embedding-модель</dt>
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

      <section v-if="canEdit" class="panel" aria-labelledby="create-knowledge-title">
        <header class="section-header">
          <div>
            <p class="eyebrow">Новая запись</p>
            <h2 id="create-knowledge-title" class="section-title">Создать черновик</h2>
          </div>
          <p class="section-description">
            Первая версия не&nbsp;попадает в&nbsp;ответы до&nbsp;явной публикации.
          </p>
        </header>

        <form class="form-stack" @submit.prevent="create">
          <div class="form-grid">
            <label class="form-field">
              <span class="form-field__label">Тип</span>
              <select v-model="createForm.type" class="form-field__control">
                <option value="manual">Документ</option>
                <option value="product">Товар</option>
              </select>
            </label>

            <label class="form-field">
              <span class="form-field__label">Локаль</span>
              <input
                v-model.trim="createForm.locale"
                class="form-field__control"
                type="text"
                maxlength="16"
                required
              />
            </label>

            <label class="form-field form-field--wide">
              <span class="form-field__label">Название</span>
              <input
                v-model.trim="createForm.title"
                class="form-field__control"
                type="text"
                maxlength="500"
                required
              />
            </label>

            <label class="form-field form-field--wide">
              <span class="form-field__label">Подтверждённый текст</span>
              <textarea
                v-model="createForm.content"
                class="form-field__control knowledge-editor__textarea"
                maxlength="30000"
                required
              />
            </label>

            <label class="form-field">
              <span class="form-field__label">URL источника</span>
              <input
                v-model.trim="createForm.canonicalUrl"
                class="form-field__control"
                type="url"
                maxlength="2048"
                placeholder="https://example.ru/page"
              />
            </label>

            <label class="form-field">
              <span class="form-field__label">Теги через запятую</span>
              <input
                v-model="createForm.tags"
                class="form-field__control"
                type="text"
                maxlength="1300"
              />
            </label>
          </div>

          <div class="form-actions">
            <button class="button button--primary" type="submit" :disabled="isCreating">
              {{ isCreating ? "Создаём…" : "Создать черновик" }}
            </button>
          </div>
        </form>
      </section>

      <section class="panel panel--flush" aria-labelledby="knowledge-list-title">
        <header class="section-header knowledge-list__header">
          <div>
            <p class="eyebrow">Документы</p>
            <h2 id="knowledge-list-title" class="section-title">Все записи</h2>
          </div>
          <p class="section-description">Публикация каждой записи управляется отдельно.</p>
        </header>

        <div v-if="!data.documentList.documents.length" class="empty-state">
          База знаний пока пуста.
        </div>
        <div v-else class="table-scroll">
          <table class="data-table">
            <caption class="visually-hidden">
              Документы базы знаний
            </caption>
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
              <tr v-for="document in data.documentList.documents" :key="document.id">
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
      </section>
    </template>
  </main>
</template>

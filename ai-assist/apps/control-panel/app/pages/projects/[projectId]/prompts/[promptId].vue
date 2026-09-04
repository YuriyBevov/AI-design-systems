<script setup lang="ts">
import type {
  PromptDetailResponse,
  PromptPreviewResponse,
  PromptRevisionResponse,
  UpdatePromptRequest,
} from "@ai-assist/contracts";

const route = useRoute();
const session = useAdminSessionState();
const requestFetch = useRequestFetch();
const projectId = computed(() => String(route.params.projectId));
const promptId = computed(() => String(route.params.promptId));
const metadataForm = reactive({ name: "", description: "" });
const draftContent = ref("");
const selectedRevisionId = ref("");
const isSavingMetadata = ref(false);
const isSavingRevision = ref(false);
const isPublishing = ref(false);
const isPreviewing = ref(false);
const isArchiving = ref(false);
const isDeleting = ref(false);
const archiveConfirmationVisible = ref(false);
const deleteConfirmationVisible = ref(false);
const message = ref<{ type: "success" | "error"; text: string } | null>(null);
const previewQuestion = ref("");
const previewResult = ref<PromptPreviewResponse | null>(null);

const {
  data: detail,
  error,
  refresh,
} = await useAsyncData(
  () => `prompt-${projectId.value}-${promptId.value}`,
  () =>
    requestFetch<PromptDetailResponse>(
      `/api/v1/projects/${projectId.value}/prompts/${promptId.value}`,
    ),
);

watch(
  detail,
  (value, previous) => {
    if (!value) return;
    metadataForm.name = value.prompt.name;
    metadataForm.description = value.prompt.description ?? "";
    const latest = value.revisions[0];
    if (!previous || draftContent.value === previous.revisions[0]?.content) {
      draftContent.value = latest?.content ?? "";
    }
    if (!value.revisions.some((revision) => revision.id === selectedRevisionId.value)) {
      selectedRevisionId.value = latest?.id ?? "";
    }
  },
  { immediate: true },
);

const role = computed(
  () => session.value?.projects.find((project) => project.id === projectId.value)?.role,
);
const canEdit = computed(() => role.value === "owner" || role.value === "editor");
const isArchived = computed(() => detail.value?.prompt.status === "archived");
const selectedRevision = computed<PromptRevisionResponse | undefined>(() =>
  detail.value?.revisions.find((revision) => revision.id === selectedRevisionId.value),
);
const latestRevision = computed(() => detail.value?.revisions[0]);
const editorChanged = computed(() =>
  Boolean(latestRevision.value && draftContent.value !== latestRevision.value.content),
);

watch(selectedRevisionId, () => {
  previewResult.value = null;
});

const formatDate = (value: string): string =>
  new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

const setDetail = (value: PromptDetailResponse): void => {
  detail.value = value;
};

const setRequestError = async (requestError: unknown, fallback: string): Promise<void> => {
  const fetchError = requestError as {
    data?: {
      statusMessage?: string;
      data?: { code?: string; unknownVariables?: string[] };
    };
  };
  const problem = fetchError.data?.data;
  const messages: Record<string, string> = {
    PROMPT_VERSION_CONFLICT: "Prompt был изменён в другой вкладке. Данные обновлены.",
    PROMPT_REVISION_UNCHANGED: "Текст не изменился — новая версия не создана.",
    PROMPT_TEMPLATE_INVALID: problem?.unknownVariables?.length
      ? `Prompt содержит неизвестные переменные: ${problem.unknownVariables.join(", ")}.`
      : "Проверьте синтаксис шаблонных переменных prompt.",
    PROMPT_CHAT_MODEL_REQUIRED: "Перед preview или публикацией выберите chat-модель.",
    PROVIDER_CREDENTIAL_REQUIRED: "Для preview сначала сохраните ключ AITUNNEL.",
    PROVIDER_CREDENTIAL_NOT_READY: "Ключ AITUNNEL не готов к использованию. Проверьте его снова.",
    PROVIDER_CREDENTIAL_INVALID: "AITUNNEL отклонил сохранённый ключ.",
    PROVIDER_MODEL_UNAVAILABLE: "Выбранная chat-модель недоступна для этого ключа.",
    PROVIDER_BUDGET_EXCEEDED: "Бюджет ключа AITUNNEL исчерпан.",
    PROVIDER_RATE_LIMITED: "AITUNNEL временно ограничил частоту запросов. Повторите позже.",
    PROVIDER_TIMEOUT: "AITUNNEL не успел ответить за установленное время.",
    PROVIDER_BAD_RESPONSE: "AITUNNEL вернул некорректный ответ.",
    PROVIDER_UNAVAILABLE: "AITUNNEL временно недоступен.",
    CREDENTIAL_ENCRYPTION_KEY_INVALID:
      "Сервер не может расшифровать ключ AITUNNEL. Проверьте master key.",
    CREDENTIAL_KEY_VERSION_UNAVAILABLE: "Версия master key для AITUNNEL недоступна на сервере.",
    PROMPT_PREVIEW_RATE_LIMITED: "Лимит preview-запросов исчерпан. Повторите через минуту.",
    PROMPT_PREVIEW_CANCELLED: "Preview был отменён.",
    PROMPT_ACTIVE_PUBLICATION:
      "Активный production prompt нельзя архивировать. Сначала опубликуйте другой prompt.",
    PROMPT_DELETE_REQUIRES_ARCHIVE:
      "Prompt уже использовался в публикации и не может быть удалён. Используйте архив.",
    RECENT_AUTHENTICATION_REQUIRED: "Выйдите и войдите заново перед физическим удалением.",
  };
  const code = problem?.code;
  message.value = {
    type: "error",
    text: (code && messages[code]) || fetchError.data?.statusMessage || fallback,
  };
  if (code === "PROMPT_VERSION_CONFLICT") await refresh();
};

const runPreview = async (): Promise<void> => {
  if (
    !selectedRevision.value ||
    !canEdit.value ||
    isArchived.value ||
    !previewQuestion.value.trim()
  ) {
    return;
  }
  isPreviewing.value = true;
  previewResult.value = null;
  message.value = null;
  try {
    previewResult.value = await $fetch<PromptPreviewResponse>(
      `/api/v1/projects/${projectId.value}/prompts/${promptId.value}/preview`,
      {
        method: "POST",
        headers: getCsrfHeaders(),
        body: {
          revisionId: selectedRevision.value.id,
          question: previewQuestion.value,
        },
      },
    );
  } catch (requestError) {
    await setRequestError(requestError, "Не удалось выполнить preview");
  } finally {
    isPreviewing.value = false;
  }
};

const saveMetadata = async (): Promise<void> => {
  if (!detail.value || !canEdit.value || isArchived.value) return;
  isSavingMetadata.value = true;
  message.value = null;
  const update: UpdatePromptRequest = {
    expectedVersion: detail.value.prompt.version,
    name: metadataForm.name,
    description: metadataForm.description || null,
  };
  try {
    setDetail(
      await $fetch<PromptDetailResponse>(
        `/api/v1/projects/${projectId.value}/prompts/${promptId.value}`,
        { method: "PATCH", headers: getCsrfHeaders(), body: update },
      ),
    );
    message.value = { type: "success", text: "Метаданные prompt сохранены" };
  } catch (requestError) {
    await setRequestError(requestError, "Не удалось сохранить метаданные");
  } finally {
    isSavingMetadata.value = false;
  }
};

const saveRevision = async (): Promise<void> => {
  if (!detail.value || !canEdit.value || isArchived.value) return;
  isSavingRevision.value = true;
  message.value = null;
  try {
    const updated = await $fetch<PromptDetailResponse>(
      `/api/v1/projects/${projectId.value}/prompts/${promptId.value}/revisions`,
      {
        method: "POST",
        headers: getCsrfHeaders(),
        body: {
          expectedVersion: detail.value.prompt.version,
          content: draftContent.value,
        },
      },
    );
    setDetail(updated);
    selectedRevisionId.value = updated.revisions[0]?.id ?? "";
    draftContent.value = updated.revisions[0]?.content ?? "";
    message.value = { type: "success", text: "Новая версия prompt создана" };
  } catch (requestError) {
    await setRequestError(requestError, "Не удалось создать версию");
  } finally {
    isSavingRevision.value = false;
  }
};

const publish = async (): Promise<void> => {
  if (!detail.value || !selectedRevision.value || !canEdit.value || isArchived.value) return;
  isPublishing.value = true;
  message.value = null;
  try {
    const updated = await $fetch<PromptDetailResponse>(
      `/api/v1/projects/${projectId.value}/prompts/${promptId.value}/publish`,
      {
        method: "POST",
        headers: getCsrfHeaders(),
        body: {
          expectedVersion: detail.value.prompt.version,
          revisionId: selectedRevision.value.id,
        },
      },
    );
    setDetail(updated);
    message.value = {
      type: "success",
      text: `Версия ${selectedRevision.value?.revisionNo ?? ""} опубликована`,
    };
  } catch (requestError) {
    await setRequestError(requestError, "Не удалось опубликовать prompt");
  } finally {
    isPublishing.value = false;
  }
};

const archive = async (): Promise<void> => {
  if (!detail.value || !canEdit.value) return;
  isArchiving.value = true;
  message.value = null;
  try {
    setDetail(
      await $fetch<PromptDetailResponse>(
        `/api/v1/projects/${projectId.value}/prompts/${promptId.value}/archive`,
        {
          method: "POST",
          headers: getCsrfHeaders(),
          body: { expectedVersion: detail.value.prompt.version },
        },
      ),
    );
    message.value = { type: "success", text: "Prompt перемещён в архив" };
  } catch (requestError) {
    await setRequestError(requestError, "Не удалось архивировать prompt");
  } finally {
    archiveConfirmationVisible.value = false;
    isArchiving.value = false;
  }
};

const deletePrompt = async (): Promise<void> => {
  if (!detail.value || !canEdit.value) return;
  isDeleting.value = true;
  message.value = null;
  try {
    await $fetch(`/api/v1/projects/${projectId.value}/prompts/${promptId.value}`, {
      method: "DELETE",
      headers: getCsrfHeaders(),
      query: { expectedVersion: detail.value.prompt.version },
    });
    await navigateTo(`/projects/${projectId.value}/prompts`);
  } catch (requestError) {
    await setRequestError(requestError, "Не удалось удалить prompt");
  } finally {
    deleteConfirmationVisible.value = false;
    isDeleting.value = false;
  }
};
</script>

<template>
  <main class="page-frame">
    <header class="page-header">
      <div>
        <p class="eyebrow">Prompt editor</p>
        <h1 class="page-title page-title--compact">{{ detail?.prompt.name ?? "Prompt" }}</h1>
        <p class="page-description">
          Каждое сохранение текста создаёт неизменяемую версию. Production меняется только явной
          публикацией.
        </p>
      </div>
      <NuxtLink class="button button--secondary" :to="`/projects/${projectId}/prompts`">
        К списку
      </NuxtLink>
    </header>

    <p
      v-if="message"
      class="prompt-message"
      :class="`prompt-message--${message.type}`"
      role="status"
    >
      {{ message.text }}
    </p>

    <div v-if="error" class="empty-state" role="alert">Prompt не найден или недоступен.</div>

    <template v-else-if="detail">
      <section class="panel" aria-labelledby="prompt-metadata-title">
        <header class="section-header">
          <div>
            <p class="eyebrow">Настройки</p>
            <h2 id="prompt-metadata-title" class="section-title">Метаданные</h2>
          </div>
          <span class="status-badge" :data-status="detail.prompt.status">
            {{ detail.prompt.status }}
          </span>
        </header>

        <form class="form-stack" @submit.prevent="saveMetadata">
          <div class="form-grid">
            <label class="form-field">
              <span class="form-field__label">Название</span>
              <input
                v-model.trim="metadataForm.name"
                class="form-field__control"
                type="text"
                maxlength="160"
                required
                :disabled="!canEdit || isArchived"
              />
            </label>
            <label class="form-field">
              <span class="form-field__label">Описание</span>
              <input
                v-model.trim="metadataForm.description"
                class="form-field__control"
                type="text"
                maxlength="2000"
                :disabled="!canEdit || isArchived"
              />
            </label>
          </div>
          <div v-if="canEdit && !isArchived" class="form-actions">
            <button class="button button--secondary" type="submit" :disabled="isSavingMetadata">
              {{ isSavingMetadata ? "Сохраняем…" : "Сохранить метаданные" }}
            </button>
          </div>
        </form>
      </section>

      <section class="prompt-layout" aria-label="Редактор и версии prompt">
        <article class="panel prompt-editor">
          <header class="section-header">
            <div>
              <p class="eyebrow">Черновик</p>
              <h2 class="section-title">Новая версия</h2>
            </div>
            <span class="prompt-editor__counter">{{ draftContent.length }} / 50000</span>
          </header>

          <label class="form-field">
            <span class="form-field__label">Текст system prompt</span>
            <textarea
              v-model="draftContent"
              class="form-field__control prompt-editor__textarea"
              maxlength="50000"
              required
              :disabled="!canEdit || isArchived"
            />
          </label>

          <div v-if="canEdit && !isArchived" class="form-actions">
            <button
              class="button button--secondary"
              type="button"
              :disabled="isSavingRevision || !editorChanged || !draftContent.trim()"
              @click="saveRevision"
            >
              {{ isSavingRevision ? "Сохраняем…" : "Создать версию" }}
            </button>
          </div>
        </article>

        <aside class="panel prompt-revisions" aria-labelledby="prompt-revisions-title">
          <header class="section-header">
            <div>
              <p class="eyebrow">История</p>
              <h2 id="prompt-revisions-title" class="section-title">Версии</h2>
            </div>
          </header>

          <ol class="prompt-revision-list">
            <li v-for="revision in detail.revisions" :key="revision.id">
              <button
                class="prompt-revision"
                type="button"
                :aria-pressed="selectedRevisionId === revision.id"
                @click="selectedRevisionId = revision.id"
              >
                <span class="prompt-revision__header">
                  <strong>Версия {{ revision.revisionNo }}</strong>
                  <span v-if="detail.prompt.publishedRevisionNo === revision.revisionNo">
                    production
                  </span>
                </span>
                <span class="prompt-revision__meta">
                  {{ formatDate(revision.createdAt) }} · {{ revision.createdByEmail ?? "Система" }}
                </span>
              </button>
            </li>
          </ol>
        </aside>
      </section>

      <section v-if="selectedRevision" class="panel" aria-labelledby="selected-revision-title">
        <header class="section-header">
          <div>
            <p class="eyebrow">Проверка</p>
            <h2 id="selected-revision-title" class="section-title">
              Версия {{ selectedRevision.revisionNo }}
            </h2>
          </div>
          <span
            class="status-badge"
            :data-status="selectedRevision.validation.isPublishable ? 'valid' : 'invalid'"
          >
            {{ selectedRevision.validation.isPublishable ? "Готова к публикации" : "Есть ошибки" }}
          </span>
        </header>

        <div class="prompt-validation">
          <div>
            <span>Переменные</span>
            <strong>
              {{ selectedRevision.validation.variables.join(", ") || "Не используются" }}
            </strong>
          </div>
          <div>
            <span>Неизвестные переменные</span>
            <strong>
              {{ selectedRevision.validation.unknownVariables.join(", ") || "Нет" }}
            </strong>
          </div>
          <div>
            <span>Синтаксис шаблона</span>
            <strong>{{
              selectedRevision.validation.malformedTemplate ? "Ошибка" : "Корректен"
            }}</strong>
          </div>
        </div>

        <pre class="prompt-preview">{{ selectedRevision.content }}</pre>

        <div v-if="canEdit && !isArchived" class="form-actions">
          <button
            class="button button--primary"
            type="button"
            :disabled="isPublishing || !selectedRevision.validation.isPublishable"
            @click="publish"
          >
            {{
              isPublishing
                ? "Публикуем…"
                : detail.prompt.publishedRevisionNo &&
                    selectedRevision.revisionNo < detail.prompt.publishedRevisionNo
                  ? `Откатить на версию ${selectedRevision.revisionNo}`
                  : `Опубликовать версию ${selectedRevision.revisionNo}`
            }}
          </button>
        </div>
      </section>

      <section
        v-if="selectedRevision && canEdit && !isArchived"
        class="panel prompt-playground"
        aria-labelledby="prompt-playground-title"
      >
        <header class="section-header">
          <div>
            <p class="eyebrow">AITUNNEL</p>
            <h2 id="prompt-playground-title" class="section-title">Preview ответа</h2>
          </div>
          <span class="status-badge" data-status="draft">
            Версия {{ selectedRevision.revisionNo }}
          </span>
        </header>

        <form class="form-stack" @submit.prevent="runPreview">
          <label class="form-field">
            <span class="form-field__label">Тестовый вопрос</span>
            <textarea
              v-model="previewQuestion"
              class="form-field__control prompt-playground__question"
              maxlength="4000"
              required
              :disabled="isPreviewing"
            />
            <span class="form-field__hint">
              Используется выбранная сохранённая версия. Несохранённый текст редактора в&nbsp;запрос
              не&nbsp;попадёт. Запрос расходует бюджет AITUNNEL.
            </span>
          </label>
          <div class="form-actions">
            <button
              class="button button--primary"
              type="submit"
              :disabled="
                isPreviewing ||
                !previewQuestion.trim() ||
                !selectedRevision.validation.isPublishable
              "
            >
              {{ isPreviewing ? "Получаем ответ…" : "Запустить preview" }}
            </button>
          </div>
        </form>

        <article
          v-if="previewResult"
          class="prompt-playground__result"
          aria-labelledby="prompt-playground-answer-title"
          aria-live="polite"
        >
          <h3 id="prompt-playground-answer-title" class="prompt-playground__title">
            Ответ ассистента
          </h3>
          <p class="prompt-playground__answer">{{ previewResult.answer }}</p>

          <dl class="prompt-playground__diagnostics">
            <div>
              <dt>Модель</dt>
              <dd>{{ previewResult.model.resolvedId ?? previewResult.model.requestedId }}</dd>
            </div>
            <div>
              <dt>Версии</dt>
              <dd>
                prompt {{ previewResult.promptRevisionNo }}, config
                {{ previewResult.configRevisionNo }}
              </dd>
            </div>
            <div>
              <dt>Задержка</dt>
              <dd>{{ previewResult.latencyMs }} мс</dd>
            </div>
            <div>
              <dt>Токены</dt>
              <dd>
                вход {{ previewResult.usage.inputTokens ?? "нет данных" }}, выход
                {{ previewResult.usage.outputTokens ?? "нет данных" }}
              </dd>
            </div>
            <div>
              <dt>Поиск по БЗ</dt>
              <dd>
                {{ previewResult.retrieval.mode === "hybrid" ? "Гибридный" : "Текстовый" }}
                <span v-if="previewResult.retrieval.warningCode">
                  · {{ previewResult.retrieval.warningCode }}
                </span>
              </dd>
            </div>
          </dl>

          <section
            v-if="previewResult.retrieval.sources.length"
            class="retrieval-result"
            aria-labelledby="retrieval-result-title"
          >
            <h4 id="retrieval-result-title" class="retrieval-result__title">Найденные источники</h4>
            <ol class="retrieval-result__list">
              <li
                v-for="source in previewResult.retrieval.sources"
                :key="source.chunkId"
                class="retrieval-result__item"
              >
                <div class="retrieval-result__header">
                  <strong>{{ source.title }}</strong>
                  <span>{{ Math.round(source.score * 100) }}%</span>
                </div>
                <p class="retrieval-result__excerpt">{{ source.excerpt }}</p>
                <a
                  v-if="source.canonicalUrl"
                  class="data-table__link"
                  :href="source.canonicalUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Открыть источник
                </a>
              </li>
            </ol>
          </section>
          <p v-else class="form-field__hint">
            Среди опубликованных документов этой локали подходящие источники не&nbsp;найдены.
          </p>
        </article>
      </section>

      <section v-if="canEdit" class="panel prompt-danger" aria-labelledby="prompt-danger-title">
        <header class="section-header">
          <div>
            <p class="eyebrow">Жизненный цикл</p>
            <h2 id="prompt-danger-title" class="section-title">Архив и удаление</h2>
          </div>
        </header>

        <div class="button-group">
          <button
            v-if="!isArchived"
            class="button button--secondary"
            type="button"
            @click="archiveConfirmationVisible = true"
          >
            Архивировать
          </button>
          <button
            class="button button--danger"
            type="button"
            @click="deleteConfirmationVisible = true"
          >
            Удалить физически
          </button>
        </div>

        <div v-if="archiveConfirmationVisible" class="danger-confirmation">
          <p>Архивный prompt нельзя редактировать или публиковать.</p>
          <div class="button-group">
            <button
              class="button button--secondary"
              type="button"
              @click="archiveConfirmationVisible = false"
            >
              Отмена
            </button>
            <button
              class="button button--danger"
              type="button"
              :disabled="isArchiving"
              @click="archive"
            >
              {{ isArchiving ? "Архивируем…" : "Подтвердить архивацию" }}
            </button>
          </div>
        </div>

        <div v-if="deleteConfirmationVisible" class="danger-confirmation">
          <p>Удалить можно только prompt, который никогда не публиковался. Операция необратима.</p>
          <div class="button-group">
            <button
              class="button button--secondary"
              type="button"
              @click="deleteConfirmationVisible = false"
            >
              Отмена
            </button>
            <button
              class="button button--danger"
              type="button"
              :disabled="isDeleting"
              @click="deletePrompt"
            >
              {{ isDeleting ? "Удаляем…" : "Удалить prompt" }}
            </button>
          </div>
        </div>
      </section>
    </template>
  </main>
</template>

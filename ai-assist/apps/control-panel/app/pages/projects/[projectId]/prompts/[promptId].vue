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
const isApplying = ref(false);
const isPreviewing = ref(false);
const isArchiving = ref(false);
const isDeleting = ref(false);
const isDeletingRevision = ref(false);
const archiveConfirmationVisible = ref(false);
const deleteConfirmationVisible = ref(false);
const revisionPendingDelete = ref<PromptRevisionResponse | null>(null);
const message = ref<{ type: "success" | "error"; text: string } | null>(null);
useToastMessage(message);
const previewQuestion = ref("");
const previewSubmittedQuestion = ref("");
const previewResult = ref<PromptPreviewResponse | null>(null);
const previewError = ref("");
const previewModalVisible = ref(false);

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
  (value) => {
    if (!value) return;
    metadataForm.name = value.prompt.name;
    metadataForm.description = value.prompt.description ?? "";
    const latest = value.revisions[0];
    if (!value.revisions.some((revision) => revision.id === selectedRevisionId.value)) {
      selectedRevisionId.value = latest?.id ?? "";
      draftContent.value = latest?.content ?? "";
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
const editorDiffersFromSelected = computed(() =>
  promptContentDiffers(draftContent.value, selectedRevision.value?.content),
);
const editorDiffersFromLatest = computed(() =>
  promptContentDiffers(draftContent.value, latestRevision.value?.content),
);
const selectedRevisionIsCurrent = computed(
  () => selectedRevision.value?.revisionNo === detail.value?.prompt.publishedRevisionNo,
);

watch(selectedRevisionId, () => {
  const revision = detail.value?.revisions.find(
    (candidate) => candidate.id === selectedRevisionId.value,
  );
  if (revision) draftContent.value = revision.content;
  previewResult.value = null;
});

onMounted(() => {
  if (route.query.notice !== "apply-failed") return;
  message.value = {
    type: "error",
    text: "Роль сохранена как черновик, но применить её не удалось. Проверьте настройки и повторите попытку.",
  };
  void navigateTo(route.path, { replace: true });
});

const formatDate = (value: string): string =>
  new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

const setDetail = (value: PromptDetailResponse): void => {
  detail.value = value;
};

const setRequestError = async (requestError: unknown, fallback: string): Promise<string> => {
  const fetchError = requestError as {
    data?: {
      statusMessage?: string;
      data?: { code?: string; unknownVariables?: string[] };
    };
  };
  const problem = fetchError.data?.data;
  const messages: Record<string, string> = {
    PROMPT_VERSION_CONFLICT: "Роль была изменена в другой вкладке. Данные обновлены.",
    PROMPT_REVISION_UNCHANGED: "Текст не изменился — новая версия не создана.",
    PROMPT_TEMPLATE_INVALID: problem?.unknownVariables?.length
      ? `Инструкция содержит неизвестные переменные: ${problem.unknownVariables.join(", ")}.`
      : "Проверьте синтаксис переменных в инструкции.",
    PROMPT_CHAT_MODEL_REQUIRED: "Перед проверкой или применением выберите chat-модель.",
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
    CREDENTIAL_DECRYPTION_FAILED:
      "Сохранённый ключ AITUNNEL не удалось расшифровать текущим master key.",
    PROMPT_PREVIEW_RATE_LIMITED: "Лимит preview-запросов исчерпан. Повторите через минуту.",
    PROMPT_PREVIEW_CANCELLED: "Preview был отменён.",
    PROMPT_ACTIVE_PUBLICATION: "Текущую роль нельзя архивировать. Сначала примените другую роль.",
    PROMPT_REVISION_CURRENT: "Текущую версию нельзя удалить. Сначала примените другую.",
    PROMPT_REVISION_LAST: "Единственную версию нельзя удалить отдельно. Удалите всю роль.",
  };
  const code = problem?.code;
  const text = (code && messages[code]) || fetchError.data?.statusMessage || fallback;
  message.value = {
    type: "error",
    text,
  };
  if (code === "PROMPT_VERSION_CONFLICT") await refresh();
  return text;
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
  const question = previewQuestion.value.trim();
  isPreviewing.value = true;
  previewResult.value = null;
  previewError.value = "";
  previewSubmittedQuestion.value = question;
  previewModalVisible.value = true;
  message.value = null;
  try {
    previewResult.value = await $fetch<PromptPreviewResponse>(
      `/api/v1/projects/${projectId.value}/prompts/${promptId.value}/preview`,
      {
        method: "POST",
        headers: getCsrfHeaders(),
        body: {
          revisionId: selectedRevision.value.id,
          question,
        },
      },
    );
  } catch (requestError) {
    previewError.value = await setRequestError(requestError, "Не удалось выполнить preview");
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
    message.value = { type: "success", text: "Название и описание обновлены" };
  } catch (requestError) {
    await setRequestError(requestError, "Не удалось обновить название и описание");
  } finally {
    isSavingMetadata.value = false;
  }
};

const saveRevision = async (): Promise<void> => {
  if (!detail.value || !canEdit.value || isArchived.value || !editorDiffersFromLatest.value) {
    return;
  }
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
    message.value = { type: "success", text: "Черновик сохранён" };
  } catch (requestError) {
    await setRequestError(requestError, "Не удалось сохранить черновик");
  } finally {
    isSavingRevision.value = false;
  }
};

const apply = async (): Promise<void> => {
  if (!detail.value || !selectedRevision.value || !canEdit.value || isArchived.value) return;
  if (!editorDiffersFromSelected.value && selectedRevisionIsCurrent.value) return;
  isApplying.value = true;
  message.value = null;
  try {
    let workingDetail = detail.value;
    let revision = workingDetail.revisions.find(
      (candidate) => candidate.content === draftContent.value,
    );
    if (!revision) {
      workingDetail = await $fetch<PromptDetailResponse>(
        `/api/v1/projects/${projectId.value}/prompts/${promptId.value}/revisions`,
        {
          method: "POST",
          headers: getCsrfHeaders(),
          body: {
            expectedVersion: workingDetail.prompt.version,
            content: draftContent.value,
          },
        },
      );
      setDetail(workingDetail);
      revision = workingDetail.revisions[0];
      selectedRevisionId.value = revision?.id ?? "";
    }
    if (!revision) throw new Error("Role revision is unavailable");

    const updated = await $fetch<PromptDetailResponse>(
      `/api/v1/projects/${projectId.value}/prompts/${promptId.value}/publish`,
      {
        method: "POST",
        headers: getCsrfHeaders(),
        body: {
          expectedVersion: workingDetail.prompt.version,
          revisionId: revision.id,
        },
      },
    );
    setDetail(updated);
    selectedRevisionId.value = revision.id;
    message.value = { type: "success", text: "Изменения применены" };
  } catch (requestError) {
    await setRequestError(requestError, "Не удалось применить изменения");
  } finally {
    isApplying.value = false;
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
    await navigateTo(`/projects/${projectId.value}/prompts`);
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

const deleteRevision = async (): Promise<void> => {
  if (!detail.value || !revisionPendingDelete.value || !canEdit.value || isDeletingRevision.value) {
    return;
  }
  isDeletingRevision.value = true;
  message.value = null;
  try {
    const deletedRevision = revisionPendingDelete.value;
    setDetail(
      await $fetch<PromptDetailResponse>(
        `/api/v1/projects/${projectId.value}/prompts/${promptId.value}/revisions/${deletedRevision.id}`,
        {
          method: "DELETE",
          headers: getCsrfHeaders(),
          query: { expectedVersion: detail.value.prompt.version },
        },
      ),
    );
    revisionPendingDelete.value = null;
    message.value = { type: "success", text: "Версия удалена" };
  } catch (requestError) {
    await setRequestError(requestError, "Не удалось удалить версию");
  } finally {
    isDeletingRevision.value = false;
  }
};
</script>

<template>
  <main class="page-frame">
    <div v-if="error" class="empty-state" role="alert">Роль не найдена или недоступна.</div>

    <template v-else-if="detail">
      <section class="prompt-layout" aria-label="Редактор и версии роли агента">
        <article class="panel prompt-editor" aria-label="Основные данные роли агента">
          <form class="form-stack" @submit.prevent="saveMetadata">
            <div class="form-grid" :class="{ 'form-grid--with-action': canEdit && !isArchived }">
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
              <button
                v-if="canEdit && !isArchived"
                class="icon-button"
                type="submit"
                :aria-label="
                  isSavingMetadata
                    ? 'Обновляем название и описание'
                    : 'Обновить название и описание'
                "
                :title="isSavingMetadata ? 'Обновляем…' : 'Обновить название и описание'"
                :disabled="isSavingMetadata"
              >
                <UiIcon name="save" />
              </button>
            </div>
          </form>

          <form class="form-stack" @submit.prevent="apply">
            <label class="form-field">
              <span class="form-field__label form-field__label-row">
                <span>Роль и поведение агента</span>
                <span class="prompt-editor__counter">{{ draftContent.length }} / 50000</span>
              </span>
              <textarea
                v-model="draftContent"
                class="form-field__control prompt-editor__textarea"
                maxlength="50000"
                required
                :disabled="!canEdit || isArchived"
              />
            </label>

            <div v-if="canEdit && !isArchived" class="form-actions">
              <div class="button-group">
                <button
                  class="button"
                  type="button"
                  :disabled="
                    isSavingRevision ||
                    isApplying ||
                    !editorDiffersFromLatest ||
                    !draftContent.trim()
                  "
                  @click="saveRevision"
                >
                  {{ isSavingRevision ? "Сохраняем…" : "Сохранить как черновик" }}
                </button>
                <button
                  class="button button--primary"
                  type="submit"
                  :disabled="
                    isApplying ||
                    isSavingRevision ||
                    !draftContent.trim() ||
                    (selectedRevisionIsCurrent && !editorDiffersFromSelected)
                  "
                >
                  {{ isApplying ? "Применяем…" : "Применить" }}
                </button>
              </div>
            </div>
          </form>
        </article>

        <aside class="prompt-sidebar" aria-label="Версии и тестирование роли агента">
          <section class="panel prompt-revisions" aria-label="Версии роли агента">
            <ol class="prompt-revision-list">
              <li
                v-for="revision in detail.revisions"
                :key="revision.id"
                class="prompt-revision"
                :class="{ 'prompt-revision--selected': selectedRevisionId === revision.id }"
              >
                <button
                  class="button button--list-option"
                  type="button"
                  :aria-pressed="selectedRevisionId === revision.id"
                  :aria-label="`Выбрать версию от ${formatDate(revision.createdAt)}`"
                  :disabled="isSavingRevision || isApplying"
                  @click="selectedRevisionId = revision.id"
                >
                  <span class="prompt-revision__date">
                    {{ formatDate(revision.createdAt) }}
                  </span>
                  <span class="prompt-revision__creator">
                    {{ revision.createdByEmail ?? "Система" }}
                  </span>
                </button>
                <span
                  class="status-badge status-badge--compact"
                  :data-status="
                    getPromptRevisionMarker(
                      revision.revisionNo,
                      detail.prompt.publishedRevisionNo,
                    ) === 'Текущий'
                      ? 'published'
                      : 'draft'
                  "
                >
                  {{
                    getPromptRevisionMarker(revision.revisionNo, detail.prompt.publishedRevisionNo)
                  }}
                </span>
                <button
                  class="icon-button icon-button--compact icon-button--ghost icon-button--danger"
                  type="button"
                  :aria-label="`Удалить версию ${revision.revisionNo}`"
                  :title="
                    revision.revisionNo === detail.prompt.publishedRevisionNo
                      ? 'Текущую версию нельзя удалить'
                      : detail.revisions.length === 1
                        ? 'Единственную версию можно удалить только вместе с ролью'
                        : 'Удалить версию'
                  "
                  :disabled="
                    isSavingRevision ||
                    isApplying ||
                    revision.revisionNo === detail.prompt.publishedRevisionNo ||
                    detail.revisions.length === 1
                  "
                  @click="revisionPendingDelete = revision"
                >
                  <UiIcon name="trash" />
                </button>
              </li>
            </ol>
          </section>

          <section
            v-if="selectedRevision && canEdit && !isArchived"
            class="panel prompt-playground"
            aria-label="Предпросмотр ответа агента"
          >
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
                <BaseNote
                  :items="[
                    'Используется выбранная сохранённая версия.',
                    'Несохранённый текст редактора в запрос не попадёт.',
                    'Запрос расходует бюджет провайдера.',
                  ]"
                />
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
          </section>

          <section
            v-if="canEdit"
            class="panel prompt-danger"
            aria-label="Архивация и удаление роли"
          >
            <div class="button-group">
              <button
                v-if="!isArchived"
                class="button"
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
                Удалить
              </button>
            </div>
          </section>
        </aside>
      </section>

      <BaseModal
        v-if="previewModalVisible"
        title="Тестовый ответ"
        description="Результат тестового запроса к выбранной версии роли агента"
        size="wide"
        @close="previewModalVisible = false"
      >
        <div class="prompt-preview-modal">
          <section aria-label="Отправленный запрос">
            <span class="form-field__label">Запрос</span>
            <p class="prompt-preview-modal__question">{{ previewSubmittedQuestion }}</p>
          </section>

          <div
            v-if="isPreviewing"
            class="prompt-preview-modal__pending"
            role="status"
            aria-live="polite"
          >
            <span class="loading-indicator" aria-hidden="true" />
            <span>Ожидаем ответ ИИ…</span>
          </div>

          <p v-else-if="previewError" class="prompt-preview-modal__error" role="alert">
            {{ previewError }}
          </p>

          <article
            v-else-if="previewResult"
            class="prompt-playground__result"
            aria-label="Ответ ассистента"
            aria-live="polite"
          >
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
              aria-label="Найденные источники"
            >
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
        </div>

        <template #footer>
          <button class="button" type="button" @click="previewModalVisible = false">Закрыть</button>
        </template>
      </BaseModal>

      <ConfirmModal
        v-if="revisionPendingDelete"
        :title="`Удалить версию ${revisionPendingDelete.revisionNo}?`"
        description="Версия и связанная с ней история применений будут удалены безвозвратно."
        confirm-label="Удалить версию"
        pending-label="Удаляем…"
        :pending="isDeletingRevision"
        danger
        @close="revisionPendingDelete = null"
        @confirm="deleteRevision"
      />

      <ConfirmModal
        v-if="archiveConfirmationVisible"
        title="Архивировать роль?"
        description="Архивную роль нельзя редактировать или применять."
        confirm-label="Архивировать"
        pending-label="Архивируем…"
        :pending="isArchiving"
        danger
        @close="archiveConfirmationVisible = false"
        @confirm="archive"
      />

      <ConfirmModal
        v-if="deleteConfirmationVisible"
        title="Удалить роль?"
        description="Роль, все её версии и история применений будут удалены безвозвратно. Если роль текущая, ассистент остановится до применения другой роли."
        confirm-label="Удалить роль"
        pending-label="Удаляем…"
        :pending="isDeleting"
        danger
        @close="deleteConfirmationVisible = false"
        @confirm="deletePrompt"
      />
    </template>
  </main>
</template>

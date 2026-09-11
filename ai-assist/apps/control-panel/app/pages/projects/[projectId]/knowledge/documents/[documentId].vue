<script setup lang="ts">
import type {
  CreateKnowledgeDocumentVersionRequest,
  KnowledgeDocumentDetailResponse,
  KnowledgeDocumentVersionResponse,
  KnowledgeProductInput,
} from "@ai-assist/contracts";

const route = useRoute();
const session = useAdminSessionState();
const requestFetch = useRequestFetch();
const projectId = computed(() => String(route.params.projectId));
const documentId = computed(() => String(route.params.documentId));
const selectedVersionId = ref("");
const isSaving = ref(false);
const isPublishing = ref(false);
const isUnpublishing = ref(false);
const isArchiving = ref(false);
const isDeleting = ref(false);
const unpublishConfirmationVisible = ref(false);
const archiveConfirmationVisible = ref(false);
const deleteConfirmationVisible = ref(false);
const message = ref<{ type: "success" | "error"; text: string } | null>(null);
useToastMessage(message);
const form = reactive({
  title: "",
  content: "",
  canonicalUrl: "",
  tags: "",
  externalId: "",
  sku: "",
  category: "",
  priceDisplay: "",
  priceAmount: "",
  currency: "",
  availability: "",
  minimumOrder: "",
  characteristics: "",
});

const {
  data: detail,
  error,
  refresh,
} = await useAsyncData(
  () => `knowledge-document-${projectId.value}-${documentId.value}`,
  () =>
    requestFetch<KnowledgeDocumentDetailResponse>(
      `/api/v1/projects/${projectId.value}/knowledge/documents/${documentId.value}`,
    ),
);

const role = computed(
  () => session.value?.projects.find((project) => project.id === projectId.value)?.role,
);
const canEdit = computed(() => role.value === "owner" || role.value === "editor");
const isArchived = computed(() => detail.value?.document.status === "archived");
const selectedVersion = computed<KnowledgeDocumentVersionResponse | undefined>(() =>
  detail.value?.versions.find((version) => version.id === selectedVersionId.value),
);
const versionOptions = computed(
  () =>
    detail.value?.versions.map((version) => ({
      value: version.id,
      label: `Версия ${version.versionNo} · ${formatDate(version.createdAt)}`,
    })) ?? [],
);

const productCharacteristicsText = (product: KnowledgeProductInput | null): string =>
  Object.entries(product?.characteristics ?? {})
    .map(([name, value]) => `${name}: ${value}`)
    .join("\n");

const applyLatestToForm = (version: KnowledgeDocumentVersionResponse): void => {
  form.title = version.title;
  form.content = version.content;
  form.canonicalUrl = version.canonicalUrl ?? "";
  form.tags = version.tags.join(", ");
  form.externalId = version.product?.externalId ?? "";
  form.sku = version.product?.sku ?? "";
  form.category = version.product?.category ?? "";
  form.priceDisplay = version.product?.priceDisplay ?? "";
  form.priceAmount = version.product?.priceAmount?.toString() ?? "";
  form.currency = version.product?.currency ?? "";
  form.availability = version.product?.availability ?? "";
  form.minimumOrder = version.product?.minimumOrder?.toString() ?? "";
  form.characteristics = productCharacteristicsText(version.product);
};

watch(
  detail,
  (value) => {
    const latest = value?.versions[0];
    if (!latest) return;
    applyLatestToForm(latest);
    if (!value.versions.some((version) => version.id === selectedVersionId.value)) {
      selectedVersionId.value = latest.id;
    }
  },
  { immediate: true },
);

const formatDate = (value: string): string =>
  new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

const setRequestError = async (requestError: unknown, fallback: string): Promise<void> => {
  const fetchError = requestError as {
    data?: { statusMessage?: string; data?: { code?: string } };
  };
  const code = fetchError.data?.data?.code;
  const messages: Record<string, string> = {
    KNOWLEDGE_VERSION_CONFLICT: "Документ был изменён в другой вкладке. Данные обновлены.",
    KNOWLEDGE_REVISION_UNCHANGED: "Содержимое не изменилось — новая версия не создана.",
    KNOWLEDGE_TYPE_IMMUTABLE: "Тип существующего документа изменить нельзя.",
    KNOWLEDGE_VERSION_ALREADY_ACTIVE: "Эта версия уже опубликована.",
    KNOWLEDGE_DOCUMENT_NOT_PUBLISHED: "Документ уже снят с публикации.",
    KNOWLEDGE_DOCUMENT_ACTIVE: "Сначала снимите опубликованный документ с публикации.",
    KNOWLEDGE_DELETE_REQUIRES_ARCHIVE:
      "Документ уже публиковался и не может быть удалён. Используйте архив.",
    KNOWLEDGE_DELETE_DRAFT_ONLY: "Физически удалить можно только неиспользованный черновик.",
    RECENT_AUTHENTICATION_REQUIRED: "Выйдите и войдите заново перед физическим удалением.",
  };
  message.value = {
    type: "error",
    text: (code && messages[code]) || fetchError.data?.statusMessage || fallback,
  };
  if (code === "KNOWLEDGE_VERSION_CONFLICT") await refresh();
};

const nullableText = (value: string): string | null => value.trim() || null;

const nullableNumber = (value: string, fieldName: string): number | null => {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${fieldName}: укажите неотрицательное число`);
  }
  return parsed;
};

const parseCharacteristics = (): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const rawLine of form.characteristics.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator <= 0 || !line.slice(separator + 1).trim()) {
      throw new Error("Характеристики: каждая строка должна иметь формат «Название: значение»");
    }
    result[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return result;
};

const buildVersionBody = (): CreateKnowledgeDocumentVersionRequest => {
  if (!detail.value) throw new Error("Документ недоступен");
  const common = {
    expectedVersion: detail.value.document.version,
    title: form.title,
    content: form.content,
    canonicalUrl: nullableText(form.canonicalUrl),
    locale: "ru",
    tags: form.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
  };
  if (detail.value.document.type === "manual") {
    return { type: "manual", ...common, product: null };
  }
  return {
    type: "product",
    ...common,
    product: {
      externalId: nullableText(form.externalId),
      sku: nullableText(form.sku),
      category: nullableText(form.category),
      priceDisplay: nullableText(form.priceDisplay),
      priceAmount: nullableNumber(form.priceAmount, "Цена"),
      currency: nullableText(form.currency)?.toUpperCase() ?? null,
      availability: nullableText(form.availability),
      minimumOrder: nullableNumber(form.minimumOrder, "Минимальный заказ"),
      characteristics: parseCharacteristics(),
    },
  };
};

const saveVersion = async (): Promise<void> => {
  if (!canEdit.value || isArchived.value || isSaving.value) return;
  message.value = null;
  isSaving.value = true;
  try {
    const body = buildVersionBody();
    detail.value = await $fetch<KnowledgeDocumentDetailResponse>(
      `/api/v1/projects/${projectId.value}/knowledge/documents/${documentId.value}/versions`,
      { method: "POST", headers: getCsrfHeaders(), body },
    );
    selectedVersionId.value = detail.value.versions[0]?.id ?? "";
    message.value = { type: "success", text: "Новая версия сохранена." };
  } catch (requestError) {
    if (
      requestError instanceof Error &&
      !(
        typeof requestError === "object" &&
        requestError !== null &&
        Reflect.has(requestError, "data")
      )
    ) {
      message.value = { type: "error", text: requestError.message };
    } else {
      await setRequestError(requestError, "Не удалось сохранить версию");
    }
  } finally {
    isSaving.value = false;
  }
};

const publish = async (): Promise<void> => {
  if (!detail.value || !selectedVersion.value || !canEdit.value || isPublishing.value) return;
  message.value = null;
  isPublishing.value = true;
  try {
    detail.value = await $fetch<KnowledgeDocumentDetailResponse>(
      `/api/v1/projects/${projectId.value}/knowledge/documents/${documentId.value}/publish`,
      {
        method: "POST",
        headers: getCsrfHeaders(),
        body: {
          expectedVersion: detail.value.document.version,
          versionId: selectedVersion.value.id,
        },
      },
    );
    message.value = { type: "success", text: "Версия опубликована и доступна preview." };
  } catch (requestError) {
    await setRequestError(requestError, "Не удалось опубликовать версию");
  } finally {
    isPublishing.value = false;
  }
};

const unpublish = async (): Promise<void> => {
  if (!detail.value || !canEdit.value || isUnpublishing.value) return;
  isUnpublishing.value = true;
  message.value = null;
  try {
    detail.value = await $fetch<KnowledgeDocumentDetailResponse>(
      `/api/v1/projects/${projectId.value}/knowledge/documents/${documentId.value}/unpublish`,
      {
        method: "POST",
        headers: getCsrfHeaders(),
        body: { expectedVersion: detail.value.document.version },
      },
    );
    unpublishConfirmationVisible.value = false;
    message.value = { type: "success", text: "Документ снят с публикации." };
  } catch (requestError) {
    await setRequestError(requestError, "Не удалось снять документ с публикации");
  } finally {
    isUnpublishing.value = false;
  }
};

const archive = async (): Promise<void> => {
  if (!detail.value || !canEdit.value || isArchiving.value) return;
  isArchiving.value = true;
  message.value = null;
  try {
    detail.value = await $fetch<KnowledgeDocumentDetailResponse>(
      `/api/v1/projects/${projectId.value}/knowledge/documents/${documentId.value}/archive`,
      {
        method: "POST",
        headers: getCsrfHeaders(),
        body: { expectedVersion: detail.value.document.version },
      },
    );
    archiveConfirmationVisible.value = false;
    message.value = { type: "success", text: "Документ перемещён в архив." };
  } catch (requestError) {
    await setRequestError(requestError, "Не удалось архивировать документ");
  } finally {
    isArchiving.value = false;
  }
};

const remove = async (): Promise<void> => {
  if (!detail.value || !canEdit.value || isDeleting.value) return;
  isDeleting.value = true;
  message.value = null;
  try {
    await $fetch(`/api/v1/projects/${projectId.value}/knowledge/documents/${documentId.value}`, {
      method: "DELETE",
      headers: getCsrfHeaders(),
      query: { expectedVersion: detail.value.document.version },
    });
    await navigateTo(`/projects/${projectId.value}/knowledge/documents`);
  } catch (requestError) {
    await setRequestError(requestError, "Не удалось удалить документ");
    deleteConfirmationVisible.value = false;
  } finally {
    isDeleting.value = false;
  }
};
</script>

<template>
  <main class="page-frame">
    <NuxtLink class="back-link" :to="`/projects/${projectId}/knowledge/documents`">
      <UiIcon name="arrow-left" />
      <span>База знаний</span>
    </NuxtLink>

    <div v-if="error" class="empty-state" role="alert">Документ недоступен.</div>

    <template v-else-if="detail">
      <section v-if="canEdit && !isArchived" class="panel" aria-labelledby="knowledge-edit-title">
        <header class="section-header">
          <div>
            <h2 id="knowledge-edit-title" class="section-title">Новая версия</h2>
          </div>
          <p class="section-description">Активная версия останется прежней до публикации.</p>
        </header>

        <form class="form-stack" novalidate @submit.prevent="saveVersion">
          <div class="form-grid">
            <label class="form-field form-field--wide">
              <span class="form-field__label">Название</span>
              <input
                v-model.trim="form.title"
                class="form-field__control"
                type="text"
                maxlength="500"
                required
              />
            </label>

            <label class="form-field form-field--wide">
              <span class="form-field__label">Подтверждённый текст</span>
              <textarea
                v-model="form.content"
                class="form-field__control knowledge-editor__textarea"
                maxlength="30000"
                required
              />
            </label>

            <template v-if="detail.document.type === 'product'">
              <label class="form-field">
                <span class="form-field__label">Артикул</span>
                <input v-model.trim="form.sku" class="form-field__control" maxlength="255" />
              </label>
              <label class="form-field">
                <span class="form-field__label">Внешний ID</span>
                <input v-model.trim="form.externalId" class="form-field__control" maxlength="255" />
              </label>
              <label class="form-field form-field--wide">
                <span class="form-field__label">Категория</span>
                <input v-model.trim="form.category" class="form-field__control" maxlength="500" />
              </label>
              <label class="form-field">
                <span class="form-field__label">Цена как на сайте</span>
                <input
                  v-model.trim="form.priceDisplay"
                  class="form-field__control"
                  maxlength="255"
                />
              </label>
              <label class="form-field">
                <span class="form-field__label">Числовая цена</span>
                <input
                  v-model="form.priceAmount"
                  class="form-field__control"
                  type="number"
                  min="0"
                  step="0.01"
                />
              </label>
              <label class="form-field">
                <span class="form-field__label">Валюта</span>
                <input
                  v-model.trim="form.currency"
                  class="form-field__control"
                  maxlength="3"
                  placeholder="RUB"
                />
              </label>
              <label class="form-field">
                <span class="form-field__label">Наличие</span>
                <input
                  v-model.trim="form.availability"
                  class="form-field__control"
                  maxlength="255"
                />
              </label>
              <label class="form-field">
                <span class="form-field__label">Минимальный заказ</span>
                <input
                  v-model="form.minimumOrder"
                  class="form-field__control"
                  type="number"
                  min="0"
                  step="0.001"
                />
              </label>
              <label class="form-field form-field--wide">
                <span class="form-field__label">Характеристики</span>
                <textarea
                  v-model="form.characteristics"
                  class="form-field__control knowledge-editor__characteristics"
                  placeholder="Материал: трёхслойный картон"
                />
                <span class="form-field__hint">Одна характеристика в&nbsp;строке.</span>
              </label>
            </template>

            <label class="form-field">
              <span class="form-field__label">URL источника</span>
              <input
                v-model.trim="form.canonicalUrl"
                class="form-field__control"
                type="url"
                maxlength="2048"
              />
            </label>
            <label class="form-field form-field--wide">
              <span class="form-field__label">Теги через запятую</span>
              <input v-model="form.tags" class="form-field__control" maxlength="1300" />
            </label>
          </div>
          <div class="form-actions">
            <button class="button button--primary" type="submit" :disabled="isSaving">
              {{ isSaving ? "Сохраняем…" : "Создать версию" }}
            </button>
          </div>
        </form>
      </section>

      <section class="panel" aria-labelledby="knowledge-versions-title">
        <header class="section-header">
          <div>
            <h2 id="knowledge-versions-title" class="section-title">Версии документа</h2>
          </div>
          <p class="section-description">
            Active: {{ detail.document.activeVersionNo ?? "нет" }} · всего
            {{ detail.versions.length }}
          </p>
        </header>

        <div class="form-field">
          <span class="form-field__label">Версия для просмотра</span>
          <BaseSelect
            v-model="selectedVersionId"
            :options="versionOptions"
            label="Версия для просмотра"
          />
        </div>

        <article v-if="selectedVersion" class="knowledge-preview">
          <header class="knowledge-preview__header">
            <div>
              <h3 class="knowledge-preview__title">{{ selectedVersion.title }}</h3>
              <p class="knowledge-preview__meta">{{ selectedVersion.chunkCount }} chunks</p>
            </div>
            <span
              v-if="selectedVersion.id === detail.document.activeVersionId"
              class="status-badge status-badge--compact"
              data-status="published"
            >
              Active
            </span>
          </header>
          <pre class="knowledge-preview__content">{{ selectedVersion.content }}</pre>
          <dl v-if="selectedVersion.product" class="knowledge-preview__facts">
            <div v-if="selectedVersion.product.sku">
              <dt>Артикул</dt>
              <dd>{{ selectedVersion.product.sku }}</dd>
            </div>
            <div v-if="selectedVersion.product.priceDisplay">
              <dt>Цена</dt>
              <dd>{{ selectedVersion.product.priceDisplay }}</dd>
            </div>
            <div v-if="selectedVersion.product.availability">
              <dt>Наличие</dt>
              <dd>{{ selectedVersion.product.availability }}</dd>
            </div>
          </dl>
          <div v-if="canEdit && !isArchived" class="form-actions">
            <button
              class="button button--primary"
              type="button"
              :disabled="isPublishing || selectedVersion.id === detail.document.activeVersionId"
              @click="publish"
            >
              {{ isPublishing ? "Публикуем…" : `Опубликовать версию ${selectedVersion.versionNo}` }}
            </button>
          </div>
        </article>
      </section>

      <section v-if="canEdit" class="panel prompt-danger" aria-labelledby="knowledge-danger-title">
        <header class="section-header">
          <div>
            <h2 id="knowledge-danger-title" class="section-title">Публикация и архив</h2>
          </div>
        </header>

        <div class="button-group">
          <button
            v-if="detail.document.status === 'published'"
            class="button"
            type="button"
            @click="unpublishConfirmationVisible = true"
          >
            Снять с публикации
          </button>
          <button
            v-if="detail.document.status === 'draft'"
            class="button"
            type="button"
            @click="archiveConfirmationVisible = true"
          >
            Архивировать
          </button>
          <button
            v-if="detail.document.status === 'draft'"
            class="button button--danger"
            type="button"
            @click="deleteConfirmationVisible = true"
          >
            Удалить черновик
          </button>
        </div>
      </section>

      <ConfirmModal
        v-if="unpublishConfirmationVisible"
        title="Снять документ с публикации?"
        description="Документ сразу перестанет попадать в retrieval и preview."
        confirm-label="Снять с публикации"
        pending-label="Снимаем…"
        :pending="isUnpublishing"
        danger
        @close="unpublishConfirmationVisible = false"
        @confirm="unpublish"
      />

      <ConfirmModal
        v-if="archiveConfirmationVisible"
        title="Архивировать документ?"
        description="Архивный документ нельзя редактировать. История версий сохранится."
        confirm-label="Архивировать"
        pending-label="Архивируем…"
        :pending="isArchiving"
        danger
        @close="archiveConfirmationVisible = false"
        @confirm="archive"
      />

      <ConfirmModal
        v-if="deleteConfirmationVisible"
        title="Удалить документ?"
        description="Удалить можно только документ, который никогда не публиковался."
        confirm-label="Удалить"
        pending-label="Удаляем…"
        :pending="isDeleting"
        danger
        @close="deleteConfirmationVisible = false"
        @confirm="remove"
      />
    </template>
  </main>
</template>

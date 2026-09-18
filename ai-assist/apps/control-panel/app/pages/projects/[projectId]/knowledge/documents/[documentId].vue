<script setup lang="ts">
import type {
  CreateKnowledgeDocumentVersionRequest,
  DeleteKnowledgeDocumentResponse,
  KnowledgeDocumentDetailResponse,
  KnowledgeDocumentType,
  ReauthenticateResponse,
} from "@ai-assist/contracts";

const route = useRoute();
const session = useAdminSessionState();
const requestFetch = useRequestFetch();
const projectId = computed(() => String(route.params.projectId));
const documentId = computed(() => String(route.params.documentId));
const isPublishing = ref(false);
const isUnpublishing = ref(false);
const unpublishConfirmationVisible = ref(false);
const deleteConfirmationVisible = ref(false);
const reauthenticationVisible = ref(false);
const isDeleting = ref(false);
const isReauthenticating = ref(false);
const message = ref<{ type: "success" | "error"; text: string } | null>(null);
useToastMessage(message);
const form = reactive({
  title: "",
  type: "info" as "info" | "product" | "service",
  content: "",
  canonicalUrl: "",
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
const latestVersion = computed(() => detail.value?.versions[0]);
const typeOptions = [
  { value: "info", label: "Инфо" },
  { value: "product", label: "Товар" },
  { value: "service", label: "Услуга" },
] as const;
watch(
  latestVersion,
  (version) => {
    if (!version) return;
    form.title = version.title;
    const type = detail.value?.document.type;
    form.type = type === "product" || type === "service" ? type : "info";
    form.content = version.content;
    form.canonicalUrl = version.canonicalUrl ?? "";
  },
  { immediate: true },
);

const isChanged = computed(() => {
  const version = latestVersion.value;
  if (!version) return false;
  return (
    form.title.trim() !== version.title ||
    form.type !==
      (detail.value?.document.type === "product" || detail.value?.document.type === "service"
        ? detail.value.document.type
        : "info") ||
    form.content !== version.content ||
    form.canonicalUrl.trim() !== (version.canonicalUrl ?? "")
  );
});

const emptyProduct = {
  externalId: null,
  sku: null,
  category: null,
  priceDisplay: null,
  priceAmount: null,
  currency: null,
  availability: null,
  minimumOrder: null,
  characteristics: {},
} as const;

const versionBody = (
  currentType: KnowledgeDocumentType,
  expectedVersion: number,
): CreateKnowledgeDocumentVersionRequest => {
  const common = {
    expectedVersion,
    title: form.title,
    content: form.content,
    canonicalUrl: form.canonicalUrl.trim() || null,
    locale: "ru",
    tags: latestVersion.value?.tags ?? [],
  };
  if (form.type === "product") return { type: "product", ...common, product: emptyProduct };
  if (form.type === "service") return { type: "service", ...common, product: null };
  if (currentType === "page" || currentType === "manual") {
    return { type: currentType, ...common, product: null };
  }
  return { type: "manual", ...common, product: null };
};

const setRequestError = async (requestError: unknown, fallback: string): Promise<void> => {
  const fetchError = requestError as {
    data?: { statusMessage?: string; data?: { code?: string } };
  };
  message.value = { type: "error", text: fetchError.data?.statusMessage ?? fallback };
  if (fetchError.data?.data?.code === "KNOWLEDGE_VERSION_CONFLICT") await refresh();
};

const publish = async (): Promise<void> => {
  if (!detail.value || !latestVersion.value || !canEdit.value || isPublishing.value) return;
  isPublishing.value = true;
  message.value = null;
  try {
    let current = detail.value;
    let targetVersionId = latestVersion.value.id;
    if (isChanged.value) {
      current = await $fetch<KnowledgeDocumentDetailResponse>(
        `/api/v1/projects/${projectId.value}/knowledge/documents/${documentId.value}/versions`,
        {
          method: "POST",
          headers: getCsrfHeaders(),
          body: versionBody(current.document.type, current.document.version),
        },
      );
      targetVersionId = current.versions[0]!.id;
    }
    detail.value = await $fetch<KnowledgeDocumentDetailResponse>(
      `/api/v1/projects/${projectId.value}/knowledge/documents/${documentId.value}/publish`,
      {
        method: "POST",
        headers: getCsrfHeaders(),
        body: { expectedVersion: current.document.version, versionId: targetVersionId },
      },
    );
    message.value = { type: "success", text: "Запись опубликована." };
  } catch (requestError) {
    await setRequestError(requestError, "Не удалось опубликовать запись");
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
    message.value = { type: "success", text: "Запись снята с публикации." };
  } catch (requestError) {
    await setRequestError(requestError, "Не удалось снять запись с публикации");
  } finally {
    isUnpublishing.value = false;
  }
};

const getErrorCode = (requestError: unknown): string | undefined => {
  const fetchError = requestError as { data?: { code?: string; data?: { code?: string } } };
  return fetchError.data?.data?.code ?? fetchError.data?.code;
};

const deleteDocument = async (): Promise<void> => {
  if (!detail.value || !canEdit.value || isDeleting.value) return;
  isDeleting.value = true;
  message.value = null;
  try {
    await $fetch<DeleteKnowledgeDocumentResponse>(
      `/api/v1/projects/${projectId.value}/knowledge/documents/${documentId.value}`,
      {
        method: "DELETE",
        headers: getCsrfHeaders(),
        query: { expectedVersion: detail.value.document.version },
      },
    );
    await navigateTo(`/projects/${projectId.value}/knowledge/documents`);
  } catch (requestError) {
    if (getErrorCode(requestError) === "RECENT_AUTHENTICATION_REQUIRED") {
      reauthenticationVisible.value = true;
      return;
    }
    await setRequestError(requestError, "Не удалось удалить запись");
  } finally {
    isDeleting.value = false;
  }
};

const reauthenticate = async (password: string): Promise<void> => {
  if (isReauthenticating.value) return;
  isReauthenticating.value = true;
  try {
    await $fetch<ReauthenticateResponse>("/api/v1/auth/reauthenticate", {
      method: "POST",
      headers: getCsrfHeaders(),
      body: { password },
    });
    reauthenticationVisible.value = false;
    await deleteDocument();
  } catch (requestError) {
    await setRequestError(requestError, "Не удалось подтвердить пароль");
  } finally {
    isReauthenticating.value = false;
  }
};

const closeDocument = async (): Promise<void> => {
  await navigateTo(`/projects/${projectId.value}/knowledge/documents`);
};
</script>

<template>
  <main class="page-frame">
    <template v-if="error">
      <NuxtLink class="back-link" :to="`/projects/${projectId}/knowledge/documents`">
        <UiIcon name="arrow-left" />
        <span>База знаний</span>
      </NuxtLink>
      <div class="empty-state" role="alert">Запись недоступна.</div>
    </template>

    <BaseModal v-else-if="detail" title="Запись базы знаний" size="full" @close="closeDocument">
      <template #header-actions>
        <span class="status-badge status-badge--compact" :data-status="detail.document.status">
          {{ detail.document.status === "published" ? "Опубликована" : "Не опубликована" }}
        </span>
      </template>

      <form class="knowledge-editor" novalidate @submit.prevent="publish">
        <div class="knowledge-editor__toolbar">
          <label class="form-field">
            <span class="form-field__label">Название</span>
            <input
              v-model.trim="form.title"
              class="form-field__control"
              type="text"
              maxlength="500"
              required
              :disabled="!canEdit"
            />
          </label>

          <div class="form-field">
            <span class="form-field__label">Тип записи</span>
            <BaseSelect
              v-model="form.type"
              :options="typeOptions"
              label="Тип записи"
              width="content"
              :disabled="!canEdit"
            />
          </div>

          <label class="form-field">
            <span class="form-field__label">URL источника</span>
            <input
              v-model.trim="form.canonicalUrl"
              class="form-field__control"
              type="url"
              maxlength="2048"
              :disabled="!canEdit"
            />
          </label>

          <div v-if="canEdit" class="knowledge-editor__actions">
            <button
              class="icon-button icon-button--compact icon-button--ghost"
              type="submit"
              :aria-label="
                isPublishing
                  ? 'Публикуем запись'
                  : isChanged
                    ? 'Опубликовать изменения'
                    : 'Опубликовать запись'
              "
              :title="isChanged ? 'Опубликовать изменения' : 'Опубликовать'"
              :disabled="isPublishing || (detail.document.status === 'published' && !isChanged)"
            >
              <UiIcon name="publish" />
            </button>
            <button
              v-if="detail.document.status === 'published'"
              class="icon-button icon-button--compact icon-button--ghost"
              type="button"
              aria-label="Снять запись с публикации"
              title="Снять с публикации"
              @click="unpublishConfirmationVisible = true"
            >
              <UiIcon name="unpublish" />
            </button>
            <button
              class="icon-button icon-button--compact icon-button--ghost icon-button--danger"
              type="button"
              aria-label="Удалить запись"
              title="Удалить"
              :disabled="isDeleting"
              @click="deleteConfirmationVisible = true"
            >
              <UiIcon name="trash" />
            </button>
          </div>
        </div>

        <label class="form-field knowledge-editor__content">
          <span class="form-field__label">Описание в формате Markdown</span>
          <textarea
            v-model="form.content"
            class="form-field__control knowledge-editor__textarea"
            maxlength="30000"
            required
            :disabled="!canEdit"
          />
        </label>
      </form>
    </BaseModal>

    <ConfirmModal
      v-if="unpublishConfirmationVisible"
      title="Снять запись с публикации?"
      description="Запись сразу перестанет использоваться в ответах ассистента."
      confirm-label="Снять с публикации"
      pending-label="Снимаем…"
      :pending="isUnpublishing"
      danger
      @close="unpublishConfirmationVisible = false"
      @confirm="unpublish"
    />
    <ConfirmModal
      v-if="deleteConfirmationVisible && !reauthenticationVisible"
      title="Удалить запись базы знаний?"
      description="Запись, все её версии, публикации и индексные фрагменты будут удалены без возможности восстановления."
      confirm-label="Удалить запись"
      pending-label="Удаляем…"
      :pending="isDeleting"
      danger
      @close="deleteConfirmationVisible = false"
      @confirm="deleteDocument"
    />
    <ReauthenticateModal
      v-if="reauthenticationVisible"
      description="Для удаления записи базы знаний подтвердите текущий пароль."
      :pending="isReauthenticating"
      @close="reauthenticationVisible = false"
      @confirm="reauthenticate"
    />
  </main>
</template>

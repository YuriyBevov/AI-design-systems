<script setup lang="ts">
import type {
  CreateKnowledgeDocumentRequest,
  KnowledgeDocumentDetailResponse,
  ProjectResponse,
} from "@ai-assist/contracts";

type EditableKnowledgeType = "manual" | "product" | "service";

const route = useRoute();
const session = useAdminSessionState();
const requestFetch = useRequestFetch();
const projectId = computed(() => String(route.params.projectId));
const isPublishing = ref(false);
const message = ref<{ type: "success" | "error"; text: string } | null>(null);
useToastMessage(message);
const form = reactive({
  type: "manual" as EditableKnowledgeType,
  title: "",
  content: "",
  canonicalUrl: "",
});
const documentTypeOptions = [
  { value: "manual", label: "Инфо" },
  { value: "product", label: "Товар" },
  { value: "service", label: "Услуга" },
] as const;

const { data: project, error } = await useAsyncData(
  () => `knowledge-document-create-${projectId.value}`,
  () => requestFetch<ProjectResponse>(`/api/v1/projects/${projectId.value}`),
);

const role = computed(
  () =>
    session.value?.projects.find((membership) => membership.id === projectId.value)?.role ??
    project.value?.role,
);
const canEdit = computed(() => role.value === "owner" || role.value === "editor");

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

const publish = async (): Promise<void> => {
  if (!canEdit.value || isPublishing.value) return;
  isPublishing.value = true;
  message.value = null;
  const common = {
    title: form.title,
    content: form.content,
    canonicalUrl: form.canonicalUrl.trim() || null,
    locale: "ru",
    tags: [],
  };
  const body: CreateKnowledgeDocumentRequest =
    form.type === "product"
      ? { type: "product", ...common, product: emptyProduct }
      : { type: form.type, ...common, product: null };
  try {
    const created = await $fetch<KnowledgeDocumentDetailResponse>(
      `/api/v1/projects/${projectId.value}/knowledge/documents`,
      { method: "POST", headers: getCsrfHeaders(), body },
    );
    const versionId = created.versions[0]?.id;
    if (!versionId) throw new Error("Созданная запись не содержит версии");
    await $fetch(
      `/api/v1/projects/${projectId.value}/knowledge/documents/${created.document.id}/publish`,
      {
        method: "POST",
        headers: getCsrfHeaders(),
        body: { expectedVersion: created.document.version, versionId },
      },
    );
    await navigateTo(`/projects/${projectId.value}/knowledge/documents/${created.document.id}`);
  } catch (requestError) {
    const fetchError = requestError as { data?: { statusMessage?: string } };
    message.value = {
      type: "error",
      text: fetchError.data?.statusMessage ?? "Не удалось опубликовать запись",
    };
  } finally {
    isPublishing.value = false;
  }
};
</script>

<template>
  <main class="page-frame page-frame--narrow">
    <NuxtLink class="back-link" :to="`/projects/${projectId}/knowledge/documents`">
      <UiIcon name="arrow-left" />
      <span>База знаний</span>
    </NuxtLink>

    <div v-if="error" class="empty-state" role="alert">Проект недоступен.</div>
    <div v-else-if="!canEdit" class="empty-state" role="alert">
      Недостаточно прав для создания записи.
    </div>

    <section v-else class="panel" aria-labelledby="create-knowledge-title">
      <header class="section-header">
        <div>
          <h2 id="create-knowledge-title" class="section-title">Создание записи</h2>
        </div>
      </header>

      <form class="form-stack" novalidate @submit.prevent="publish">
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

          <div class="form-field">
            <span class="form-field__label">Тип записи</span>
            <BaseSelect v-model="form.type" :options="documentTypeOptions" label="Тип записи" />
          </div>

          <label class="form-field form-field--wide">
            <span class="form-field__label">Описание в формате Markdown</span>
            <textarea
              v-model="form.content"
              class="form-field__control knowledge-editor__textarea"
              maxlength="30000"
              required
            />
          </label>

          <label class="form-field form-field--wide">
            <span class="form-field__label">URL источника</span>
            <input
              v-model.trim="form.canonicalUrl"
              class="form-field__control"
              type="url"
              maxlength="2048"
              placeholder="https://example.ru/page"
            />
          </label>
        </div>

        <div class="form-actions">
          <button class="button button--primary" type="submit" :disabled="isPublishing">
            {{ isPublishing ? "Публикуем…" : "Опубликовать" }}
          </button>
        </div>
      </form>
    </section>
  </main>
</template>

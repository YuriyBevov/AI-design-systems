<script setup lang="ts">
import type {
  CreateKnowledgeDocumentRequest,
  KnowledgeDocumentDetailResponse,
  KnowledgeDocumentType,
  ProjectResponse,
} from "@ai-assist/contracts";

const route = useRoute();
const session = useAdminSessionState();
const requestFetch = useRequestFetch();
const projectId = computed(() => String(route.params.projectId));
const isCreating = ref(false);
const message = ref<{ type: "success" | "error"; text: string } | null>(null);
useToastMessage(message);
const form = reactive({
  type: "manual" as KnowledgeDocumentType,
  title: "",
  content: "",
  canonicalUrl: "",
  tags: "",
});
const documentTypeOptions = [
  { value: "manual", label: "Документ" },
  { value: "product", label: "Товар" },
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

const create = async (): Promise<void> => {
  if (!canEdit.value || isCreating.value) return;
  isCreating.value = true;
  message.value = null;
  const common = {
    title: form.title,
    content: form.content,
    canonicalUrl: form.canonicalUrl.trim() || null,
    locale: "ru",
    tags: form.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
  };
  const body: CreateKnowledgeDocumentRequest =
    form.type === "product"
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
      text: fetchError.data?.statusMessage ?? "Не удалось создать запись",
    };
  } finally {
    isCreating.value = false;
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
        <p class="section-description">
          Новая запись будет сохранена как черновик и&nbsp;не&nbsp;попадёт в&nbsp;ответы до
          публикации.
        </p>
      </header>

      <form class="form-stack" @submit.prevent="create">
        <div class="form-grid">
          <div class="form-field">
            <span class="form-field__label">Тип</span>
            <BaseSelect v-model="form.type" :options="documentTypeOptions" label="Тип записи" />
          </div>

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

          <label class="form-field">
            <span class="form-field__label">URL источника</span>
            <input
              v-model.trim="form.canonicalUrl"
              class="form-field__control"
              type="url"
              maxlength="2048"
              placeholder="https://example.ru/page"
            />
          </label>

          <label class="form-field">
            <span class="form-field__label">Теги через запятую</span>
            <input v-model="form.tags" class="form-field__control" type="text" maxlength="1300" />
          </label>
        </div>

        <div class="form-actions">
          <button class="button button--primary" type="submit" :disabled="isCreating">
            {{ isCreating ? "Создаём…" : "Создать запись" }}
          </button>
        </div>
      </form>
    </section>
  </main>
</template>

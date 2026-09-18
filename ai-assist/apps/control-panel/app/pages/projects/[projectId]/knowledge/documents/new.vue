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
const normalizationErrorMessages: Record<string, string> = {
  KNOWLEDGE_AI_MODEL_REQUIRED: "Сначала выберите диалоговую модель во вкладке «Подключение».",
  PROVIDER_CREDENTIAL_REQUIRED: "Сначала добавьте ключ провайдера во вкладке «Подключение».",
  PROVIDER_CREDENTIAL_NOT_READY: "Сначала проверьте ключ провайдера во вкладке «Подключение».",
  PROVIDER_BUDGET_EXCEEDED: "Бюджет провайдера исчерпан.",
  PROVIDER_RATE_LIMITED: "Провайдер ограничил частоту запросов. Повторите немного позже.",
  PROVIDER_TIMEOUT: "ИИ не успел обработать запись. Повторите попытку.",
  PROVIDER_UNAVAILABLE: "Провайдер временно недоступен. Повторите попытку позже.",
  PROVIDER_BAD_RESPONSE: "Провайдер вернул некорректный ответ. Повторите попытку.",
  KNOWLEDGE_AI_RESPONSE_INVALID: "ИИ вернул пустой или некорректный текст. Повторите попытку.",
  KNOWLEDGE_AI_OUTPUT_TRUNCATED: "ИИ не закончил обработку текста. Увеличьте лимит токенов.",
  KNOWLEDGE_AI_RESPONSE_TOO_LARGE: "Обработанный текст превышает допустимый размер записи.",
  KNOWLEDGE_AI_CANCELLED: "Обработка записи была отменена.",
};

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
    const fetchError = requestError as {
      data?: { statusMessage?: string; code?: string; data?: { code?: string } };
    };
    const code = fetchError.data?.data?.code ?? fetchError.data?.code;
    message.value = {
      type: "error",
      text:
        (code && normalizationErrorMessages[code]) ||
        fetchError.data?.statusMessage ||
        "Не удалось обработать и опубликовать запись",
    };
  } finally {
    isPublishing.value = false;
  }
};

const closeCreate = async (): Promise<void> => {
  await navigateTo(`/projects/${projectId.value}/knowledge/documents`);
};
</script>

<template>
  <main class="page-frame">
    <template v-if="error || !canEdit">
      <NuxtLink class="back-link" :to="`/projects/${projectId}/knowledge/documents`">
        <UiIcon name="arrow-left" />
        <span>База знаний</span>
      </NuxtLink>
      <div class="empty-state" role="alert">
        {{ error ? "Проект недоступен." : "Недостаточно прав для создания записи." }}
      </div>
    </template>

    <BaseModal v-else title="Новая запись базы знаний" size="full" @close="closeCreate">
      <form class="knowledge-editor" novalidate :aria-busy="isPublishing" @submit.prevent="publish">
        <div class="knowledge-editor__toolbar">
          <label class="form-field">
            <span class="form-field__label">Название</span>
            <input
              v-model.trim="form.title"
              class="form-field__control"
              type="text"
              maxlength="500"
              required
              :disabled="isPublishing"
            />
          </label>

          <div class="form-field">
            <span class="form-field__label">Тип записи</span>
            <BaseSelect
              v-model="form.type"
              :options="documentTypeOptions"
              label="Тип записи"
              width="content"
              :disabled="isPublishing"
            />
          </div>

          <label class="form-field">
            <span class="form-field__label">URL источника</span>
            <input
              v-model.trim="form.canonicalUrl"
              class="form-field__control"
              type="url"
              maxlength="2048"
              placeholder="https://example.ru/page"
              :disabled="isPublishing"
            />
          </label>

          <div class="knowledge-editor__actions">
            <button
              class="icon-button icon-button--ghost"
              type="submit"
              :aria-label="
                isPublishing ? 'ИИ обрабатывает запись' : 'Обработать и опубликовать запись'
              "
              :title="isPublishing ? 'ИИ обрабатывает…' : 'Обработать и опубликовать'"
              :disabled="isPublishing"
            >
              <UiIcon name="publish" />
            </button>
          </div>
        </div>

        <div v-if="isPublishing" class="task-progress" role="status" aria-live="polite">
          <div class="task-progress__header">
            <strong>ИИ обрабатывает запись</strong>
            <span>После обработки запись будет опубликована</span>
          </div>
          <progress aria-label="ИИ обрабатывает запись">Обработка записи</progress>
        </div>

        <label class="form-field knowledge-editor__content">
          <span class="form-field__label">Исходный текст</span>
          <textarea
            v-model="form.content"
            class="form-field__control knowledge-editor__textarea"
            maxlength="30000"
            placeholder="Введите или вставьте любые сведения. ИИ сохранит факты и оформит их в Markdown."
            required
            :disabled="isPublishing"
          />
          <span class="form-field__hint">
            Текст может быть несвязным или уже оформленным. Перед публикацией ИИ структурирует его,
            не добавляя новых фактов.
          </span>
        </label>
      </form>
    </BaseModal>
  </main>
</template>

<script setup lang="ts">
import type {
  CreatePromptRequest,
  ProjectResponse,
  PromptDetailResponse,
  PromptListResponse,
  PromptStatus,
} from "@ai-assist/contracts";

const route = useRoute();
const session = useAdminSessionState();
const requestFetch = useRequestFetch();
const projectId = computed(() => String(route.params.projectId));
const isCreating = ref(false);
const isCreateModalOpen = ref(false);
const message = ref<{ type: "success" | "error"; text: string } | null>(null);
useToastMessage(message);
const createForm = reactive<CreatePromptRequest>({
  type: "system",
  name: "",
  description: null,
  content: "",
});
const promptTypeOptions = [{ value: "system", label: "System prompt" }] as const;

const { data, error, refresh } = await useAsyncData(
  () => `project-prompts-${projectId.value}`,
  async () => {
    const [project, promptList] = await Promise.all([
      requestFetch<ProjectResponse>(`/api/v1/projects/${projectId.value}`),
      requestFetch<PromptListResponse>(`/api/v1/projects/${projectId.value}/prompts`),
    ]);
    return { project, promptList };
  },
);

const role = computed(
  () =>
    session.value?.projects.find((project) => project.id === projectId.value)?.role ??
    data.value?.project.role,
);
const canEdit = computed(() => role.value === "owner" || role.value === "editor");

const statusLabel = (status: PromptStatus): string =>
  ({ draft: "Черновик", published: "Опубликован", archived: "Архив" })[status];

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
  message.value = {
    type: "error",
    text:
      code === "PROMPT_VERSION_CONFLICT"
        ? "Prompt был изменён в другой вкладке. Данные обновлены."
        : (fetchError.data?.statusMessage ?? fallback),
  };
  if (code === "PROMPT_VERSION_CONFLICT") await refresh();
};

const create = async (): Promise<void> => {
  if (!canEdit.value || isCreating.value) return;
  isCreating.value = true;
  message.value = null;
  try {
    const created = await $fetch<PromptDetailResponse>(
      `/api/v1/projects/${projectId.value}/prompts`,
      {
        method: "POST",
        headers: getCsrfHeaders(),
        body: createForm,
      },
    );
    await navigateTo(`/projects/${projectId.value}/prompts/${created.prompt.id}`);
  } catch (requestError) {
    await setRequestError(requestError, "Не удалось создать prompt");
  } finally {
    isCreating.value = false;
  }
};

const closeCreateModal = (): void => {
  if (isCreating.value) return;
  isCreateModalOpen.value = false;
};
</script>

<template>
  <main class="page-frame">
    <div v-if="error" class="empty-state" role="alert">Раздел «Роль и поведение» недоступен.</div>

    <template v-else-if="data">
      <section class="panel panel--flush" aria-label="Роли и инструкции">
        <div v-if="!data.promptList.prompts.length" class="empty-state">
          Роли и инструкции пока не созданы.
        </div>
        <div v-else class="table-scroll">
          <table class="data-table" aria-label="Роли и инструкции проекта">
            <thead>
              <tr>
                <th scope="col">Название</th>
                <th scope="col">Статус</th>
                <th scope="col">Версии</th>
                <th scope="col">Обновлён</th>
                <th scope="col">Действие</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="prompt in data.promptList.prompts" :key="prompt.id">
                <td>
                  <strong>{{ prompt.name }}</strong>
                  <span v-if="prompt.description" class="data-table__secondary">
                    {{ prompt.description }}
                  </span>
                </td>
                <td>
                  <span class="status-badge status-badge--compact" :data-status="prompt.status">
                    {{ statusLabel(prompt.status) }}
                  </span>
                </td>
                <td>
                  {{ prompt.latestRevisionNo }}
                  <span v-if="prompt.publishedRevisionNo">
                    · production {{ prompt.publishedRevisionNo }}
                  </span>
                </td>
                <td>
                  <time :datetime="prompt.updatedAt">{{ formatDate(prompt.updatedAt) }}</time>
                </td>
                <td>
                  <NuxtLink
                    class="data-table__link"
                    :to="`/projects/${projectId}/prompts/${prompt.id}`"
                  >
                    Открыть
                  </NuxtLink>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <div v-if="canEdit" class="form-actions">
        <button class="button button--primary" type="button" @click="isCreateModalOpen = true">
          Создать
        </button>
      </div>
    </template>

    <BaseModal
      v-if="isCreateModalOpen"
      title="Создать роль и поведение"
      size="wide"
      @close="closeCreateModal"
    >
      <form id="create-prompt-form" class="modal-form" @submit.prevent="create">
        <div class="form-grid">
          <label class="form-field">
            <span class="form-field__label">Название</span>
            <input
              v-model.trim="createForm.name"
              class="form-field__control"
              type="text"
              maxlength="160"
              required
            />
          </label>

          <div class="form-field">
            <span class="form-field__label">Тип</span>
            <BaseSelect
              v-model="createForm.type"
              :options="promptTypeOptions"
              label="Тип инструкции"
              disabled
            />
          </div>

          <label class="form-field form-field--wide">
            <span class="form-field__label">Описание</span>
            <input
              v-model.trim="createForm.description"
              class="form-field__control"
              type="text"
              maxlength="2000"
            />
          </label>

          <label class="form-field form-field--wide">
            <span class="form-field__label">Текст первой версии</span>
            <textarea
              v-model="createForm.content"
              class="form-field__control prompt-editor__textarea prompt-editor__textarea--initial"
              maxlength="50000"
              required
            />
            <span class="form-field__hint">
              Каталог товаров хранится в базе знаний, а не внутри системной инструкции.
            </span>
          </label>
        </div>
      </form>

      <template #footer>
        <button
          class="button button--primary"
          type="submit"
          form="create-prompt-form"
          :disabled="isCreating"
        >
          {{ isCreating ? "Создаём…" : "Создать" }}
        </button>
        <button class="button" type="button" :disabled="isCreating" @click="closeCreateModal">
          Отмена
        </button>
      </template>
    </BaseModal>
  </main>
</template>

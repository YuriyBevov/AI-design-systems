<script setup lang="ts">
import type {
  CreatePromptRequest,
  ProjectResponse,
  PromptDetailResponse,
  PromptListResponse,
} from "@ai-assist/contracts";

import { getProjectPromptId } from "~/utils/project-prompt";

const route = useRoute();
const session = useAdminSessionState();
const requestFetch = useRequestFetch();
const projectId = computed(() => String(route.params.projectId));
const form = reactive({ name: "", description: "", content: "" });
const activeAction = ref<"apply" | "draft" | null>(null);
const message = ref<{ type: "success" | "error"; text: string } | null>(null);
useToastMessage(message);

const { data, error } = await useAsyncData(
  () => `prompt-create-${projectId.value}`,
  async () => {
    const [project, promptList] = await Promise.all([
      requestFetch<ProjectResponse>(`/api/v1/projects/${projectId.value}`),
      requestFetch<PromptListResponse>(`/api/v1/projects/${projectId.value}/prompts`),
    ]);
    return { project, promptList };
  },
);

const existingPromptId = computed(() =>
  data.value ? getProjectPromptId(data.value.promptList) : null,
);

if (existingPromptId.value) {
  await navigateTo(`/projects/${projectId.value}/prompts/${existingPromptId.value}`, {
    replace: true,
  });
}

const role = computed(
  () =>
    session.value?.projects.find((membership) => membership.id === projectId.value)?.role ??
    data.value?.project.role,
);
const canEdit = computed(() => role.value === "owner" || role.value === "editor");

const getRequestProblem = (requestError: unknown) => {
  const fetchError = requestError as {
    data?: { statusMessage?: string };
  };
  return { statusMessage: fetchError.data?.statusMessage };
};

const create = async (action: "apply" | "draft"): Promise<void> => {
  if (!canEdit.value || activeAction.value) return;
  activeAction.value = action;
  message.value = null;
  let created: PromptDetailResponse | null = null;
  try {
    const body: CreatePromptRequest = {
      type: "system",
      name: form.name,
      description: form.description || null,
      content: form.content,
    };
    created = await $fetch<PromptDetailResponse>(`/api/v1/projects/${projectId.value}/prompts`, {
      method: "POST",
      headers: getCsrfHeaders(),
      body,
    });

    if (action === "apply") {
      const revision = created.revisions[0];
      if (!revision) throw new Error("Created role has no revision");
      created = await $fetch<PromptDetailResponse>(
        `/api/v1/projects/${projectId.value}/prompts/${created.prompt.id}/publish`,
        {
          method: "POST",
          headers: getCsrfHeaders(),
          body: {
            expectedVersion: created.prompt.version,
            revisionId: revision.id,
          },
        },
      );
    }

    await navigateTo(`/projects/${projectId.value}/prompts/${created.prompt.id}`);
  } catch (requestError) {
    const problem = getRequestProblem(requestError);
    if (created) {
      await navigateTo({
        path: `/projects/${projectId.value}/prompts/${created.prompt.id}`,
        query: { notice: "apply-failed" },
      });
      return;
    }
    message.value = {
      type: "error",
      text: problem.statusMessage ?? "Не удалось создать роль",
    };
  } finally {
    activeAction.value = null;
  }
};
</script>

<template>
  <main class="page-frame page-frame--narrow">
    <div v-if="error" class="empty-state" role="alert">Проект недоступен.</div>
    <div v-else-if="!canEdit" class="empty-state" role="alert">
      Недостаточно прав для создания роли.
    </div>

    <section v-else class="panel" aria-label="Создание роли агента">
      <form class="form-stack" novalidate @submit.prevent="create('apply')">
        <div class="form-grid">
          <label class="form-field">
            <span class="form-field__label">Название</span>
            <input
              v-model.trim="form.name"
              class="form-field__control"
              type="text"
              maxlength="160"
              required
            />
          </label>

          <label class="form-field">
            <span class="form-field__label">Описание</span>
            <input
              v-model.trim="form.description"
              class="form-field__control"
              type="text"
              maxlength="2000"
            />
          </label>
        </div>

        <label class="form-field">
          <span class="form-field__label">Роль и поведение агента</span>
          <textarea
            v-model="form.content"
            class="form-field__control prompt-editor__textarea"
            maxlength="50000"
            required
          />
        </label>

        <div class="form-actions">
          <div class="button-group">
            <button
              class="button"
              type="button"
              :disabled="Boolean(activeAction) || !form.name.trim() || !form.content.trim()"
              @click="create('draft')"
            >
              {{ activeAction === "draft" ? "Сохраняем…" : "Сохранить как черновик" }}
            </button>
            <button
              class="button button--primary"
              type="submit"
              :disabled="Boolean(activeAction) || !form.name.trim() || !form.content.trim()"
            >
              {{ activeAction === "apply" ? "Применяем…" : "Применить" }}
            </button>
          </div>
        </div>
      </form>
    </section>
  </main>
</template>

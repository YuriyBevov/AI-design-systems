<script setup lang="ts">
import type { AdminSessionResponse, ProjectResponse, UserResponse } from "@ai-assist/contracts";

import { validateProjectRequiredFields } from "~/utils/project-form-validation";
import { russianTimezoneOptions } from "~/utils/project-options";

const requestFetch = useRequestFetch();
const session = useAdminSessionState();
const isAdmin = computed(() => session.value?.user.role === "admin");
const { selectProject } = useActiveProject();
const form = reactive({
  name: "",
  timezone: "Europe/Moscow",
  templateProjectId: null as string | null,
  userIds: [] as string[],
});
const formErrors = reactive({ name: "", timezone: "" });
const isCreating = ref(false);
const pendingProjectId = ref<string | null>(null);
const deleteConfirmationId = ref<string | null>(null);
const message = ref<{ type: "success" | "error"; text: string } | null>(null);
useToastMessage(message);

const {
  data: projects,
  error,
  refresh,
} = await useAsyncData("projects-management", () =>
  requestFetch<ProjectResponse[]>("/api/v1/projects"),
);
const { data: users } = await useAsyncData("project-user-options", () =>
  isAdmin.value ? requestFetch<UserResponse[]>("/api/v1/users") : Promise.resolve([]),
);
const assignableUsers = computed(() =>
  (users.value ?? []).filter((user) => user.role === "user" && user.status === "active"),
);

const templateOptions = computed(() => [
  { value: null, label: "Без копирования" },
  ...(projects.value ?? [])
    .filter((project) => project.status === "active" && project.role === "owner")
    .map((project) => ({ value: project.id, label: project.name })),
]);

watch(
  () => form.name,
  () => {
    formErrors.name = "";
  },
);
watch(
  () => form.timezone,
  () => {
    formErrors.timezone = "";
  },
);

const statusLabel = (status: ProjectResponse["status"]): string =>
  ({ active: "Активен", suspended: "Приостановлен", archived: "Удалён" })[status];

const refreshSession = async (): Promise<void> => {
  session.value = await $fetch<AdminSessionResponse>("/api/v1/auth/session");
};

const requestErrorMessage = (requestError: unknown, fallback: string): string => {
  const fetchError = requestError as {
    data?: { statusMessage?: string; data?: { code?: string } };
  };
  const code = fetchError.data?.data?.code;
  if (code === "PROJECT_SLUG_GENERATION_FAILED") {
    return "Не удалось создать уникальный идентификатор. Попробуйте ещё раз.";
  }
  if (code === "RECENT_AUTHENTICATION_REQUIRED") {
    return "Для удаления проекта выйдите из панели и войдите заново.";
  }
  return fetchError.data?.statusMessage ?? fallback;
};

const createProject = async (): Promise<void> => {
  if (isCreating.value) return;
  Object.assign(formErrors, validateProjectRequiredFields(form));
  const firstError = formErrors.name || formErrors.timezone;
  if (firstError) {
    message.value = { type: "error", text: firstError };
    return;
  }

  isCreating.value = true;
  message.value = null;
  const body = {
    name: form.name,
    timezone: form.timezone,
    templateProjectId: form.templateProjectId,
    userIds: form.userIds,
  };

  try {
    const created = await $fetch<ProjectResponse>("/api/v1/projects", {
      method: "POST",
      headers: getCsrfHeaders(),
      body,
    });
    await Promise.all([refresh(), refreshSession()]);
    await selectProject(created.id);
    form.name = "";
    form.templateProjectId = null;
    form.userIds = [];
    message.value = { type: "success", text: `Проект «${created.name}» создан.` };
  } catch (requestError) {
    message.value = {
      type: "error",
      text: requestErrorMessage(requestError, "Не удалось создать проект."),
    };
  } finally {
    isCreating.value = false;
  }
};

const changeStatus = async (
  project: ProjectResponse,
  status: "active" | "suspended",
): Promise<void> => {
  if (pendingProjectId.value) return;
  pendingProjectId.value = project.id;
  message.value = null;
  try {
    await $fetch(`/api/v1/projects/${project.id}/status`, {
      method: "PATCH",
      headers: getCsrfHeaders(),
      body: { status },
    });
    await Promise.all([refresh(), refreshSession()]);
    message.value = {
      type: "success",
      text: status === "suspended" ? "Проект приостановлен." : "Проект снова активен.",
    };
  } catch (requestError) {
    message.value = {
      type: "error",
      text: requestErrorMessage(requestError, "Не удалось изменить статус проекта."),
    };
  } finally {
    pendingProjectId.value = null;
  }
};

const deleteProject = async (project: ProjectResponse): Promise<void> => {
  if (pendingProjectId.value) return;
  pendingProjectId.value = project.id;
  message.value = null;
  try {
    await $fetch(`/api/v1/projects/${project.id}`, {
      method: "DELETE",
      headers: getCsrfHeaders(),
    });
    deleteConfirmationId.value = null;
    await Promise.all([refresh(), refreshSession()]);
    message.value = { type: "success", text: `Проект «${project.name}» удалён.` };
  } catch (requestError) {
    message.value = {
      type: "error",
      text: requestErrorMessage(requestError, "Не удалось удалить проект."),
    };
  } finally {
    pendingProjectId.value = null;
  }
};
</script>

<template>
  <main class="page-frame">
    <header class="page-header">
      <div>
        <h1 class="page-title page-title--compact">Управление проектами</h1>
        <p class="page-description">
          Каждый проект хранит собственные настройки, историю, знания и данные ассистента.
        </p>
      </div>
    </header>

    <section v-if="isAdmin" class="panel" aria-labelledby="create-project-title">
      <header class="section-header">
        <h2 id="create-project-title" class="section-title">Добавить проект</h2>
      </header>

      <form class="form-stack" novalidate @submit.prevent="createProject">
        <div class="form-grid form-grid--three-column-compact">
          <label class="form-field">
            <span class="form-field__label">Название</span>
            <input
              v-model.trim="form.name"
              class="form-field__control"
              type="text"
              maxlength="160"
              required
              :aria-invalid="Boolean(formErrors.name) || undefined"
              :aria-describedby="formErrors.name ? 'project-name-error' : undefined"
            />
            <span v-if="formErrors.name" id="project-name-error" class="form-field__error">
              {{ formErrors.name }}
            </span>
          </label>
          <div class="form-field">
            <span class="form-field__label">Часовой пояс</span>
            <BaseSelect
              v-model="form.timezone"
              :options="russianTimezoneOptions"
              label="Часовой пояс проекта"
              width="content"
              :invalid="Boolean(formErrors.timezone)"
              :described-by="formErrors.timezone ? 'project-timezone-error' : undefined"
            />
            <span v-if="formErrors.timezone" id="project-timezone-error" class="form-field__error">
              {{ formErrors.timezone }}
            </span>
          </div>
          <div class="form-field">
            <span class="form-field__label">Создать на основе проекта</span>
            <BaseSelect
              v-model="form.templateProjectId"
              :options="templateOptions"
              label="Создать на основе проекта"
              width="content"
            />
          </div>
        </div>

        <fieldset class="choice-group">
          <legend class="form-field__label">Пользователи проекта</legend>
          <p v-if="!assignableUsers.length" class="form-field__hint">
            Активных пользователей пока нет. Их можно создать в разделе «Пользователи».
          </p>
          <div v-else class="choice-list">
            <BaseCheckbox
              v-for="user in assignableUsers"
              :key="user.id"
              v-model="form.userIds"
              :value="user.id"
              :label="`${user.name} — ${user.email}`"
            />
          </div>
        </fieldset>

        <div class="copy-policy">
          <p>При копировании не переносятся домены, контакты, настройки провайдера и модели.</p>
        </div>

        <div class="form-actions">
          <button class="button button--primary" type="submit" :disabled="isCreating">
            {{ isCreating ? "Создаём…" : "Создать" }}
          </button>
        </div>
      </form>
    </section>

    <section class="panel" aria-labelledby="project-list-title">
      <header class="section-header">
        <div>
          <h2 id="project-list-title" class="section-title">Доступные проекты</h2>
        </div>
        <p class="section-description">
          Приостановленный проект не обслуживает виджет и фоновые задачи.
        </p>
      </header>

      <div v-if="error" class="empty-state" role="alert">Не удалось загрузить проекты.</div>
      <div v-else-if="!projects?.length" class="empty-state">Проектов пока нет.</div>
      <ul v-else class="project-list">
        <li v-for="project in projects" :key="project.id" class="project-card">
          <header class="project-card__header">
            <div>
              <h3 class="project-card__title">{{ project.name }}</h3>
            </div>
            <span class="status-badge" :data-status="project.status">
              {{ statusLabel(project.status) }}
            </span>
          </header>

          <dl class="project-card__meta">
            <div>
              <dt>Доступ</dt>
              <dd>{{ isAdmin ? "Администратор" : "Пользователь" }}</dd>
            </div>
            <div>
              <dt>Часовой пояс</dt>
              <dd>{{ project.timezone }}</dd>
            </div>
          </dl>

          <div class="button-group project-card__actions">
            <NuxtLink
              v-if="project.status === 'active'"
              class="button button--compact"
              to="/"
              @click="selectProject(project.id)"
            >
              Открыть
            </NuxtLink>
            <button
              v-if="isAdmin && project.status === 'active'"
              class="button button--compact"
              type="button"
              :disabled="pendingProjectId === project.id"
              @click="changeStatus(project, 'suspended')"
            >
              Приостановить
            </button>
            <button
              v-if="isAdmin && project.status === 'suspended'"
              class="button button--compact button--primary"
              type="button"
              :disabled="pendingProjectId === project.id"
              @click="changeStatus(project, 'active')"
            >
              Возобновить
            </button>
            <button
              v-if="isAdmin"
              class="button button--compact button--text button--danger"
              type="button"
              :disabled="pendingProjectId === project.id"
              @click="deleteConfirmationId = project.id"
            >
              Удалить
            </button>
          </div>

          <ConfirmModal
            v-if="deleteConfirmationId === project.id"
            :title="`Удалить проект «${project.name}»?`"
            description="Проект исчезнет из панели и перестанет работать, но данные сохранятся в журнале аудита на установленный срок."
            confirm-label="Удалить проект"
            pending-label="Удаляем…"
            :pending="pendingProjectId === project.id"
            danger
            @close="deleteConfirmationId = null"
            @confirm="deleteProject(project)"
          />
        </li>
      </ul>
    </section>
  </main>
</template>

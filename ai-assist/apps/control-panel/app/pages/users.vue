<script setup lang="ts">
import type {
  AccountRole,
  AdminSessionResponse,
  ProjectResponse,
  UserResponse,
} from "@ai-assist/contracts";

const requestFetch = useRequestFetch();
const session = useAdminSessionState();
const roleOptions = [
  { value: "user", label: "Пользователь" },
  { value: "admin", label: "Администратор" },
] as const;
const form = reactive({
  id: null as string | null,
  name: "",
  email: "",
  password: "",
  role: "user" as AccountRole,
  projectIds: [] as string[],
});
const isSaving = ref(false);
const pendingUserId = ref<string | null>(null);
const message = ref<{ type: "success" | "error"; text: string } | null>(null);

const [{ data: users, error: usersError, refresh: refreshUsers }, { data: projects }] =
  await Promise.all([
    useAsyncData("users-management", () => requestFetch<UserResponse[]>("/api/v1/users")),
    useAsyncData("users-project-options", () =>
      requestFetch<ProjectResponse[]>("/api/v1/projects"),
    ),
  ]);

const isEditing = computed(() => Boolean(form.id));
const projectOptions = computed(() =>
  (projects.value ?? []).filter((project) => project.status !== "archived"),
);
const projectNames = computed(
  () => new Map(projectOptions.value.map((project) => [project.id, project.name])),
);

watch(
  () => form.role,
  (role) => {
    if (role === "admin") form.projectIds = projectOptions.value.map((project) => project.id);
  },
);

const roleLabel = (role: AccountRole): string =>
  role === "admin" ? "Администратор" : "Пользователь";
const statusLabel = (status: UserResponse["status"]): string =>
  ({ invited: "Приглашён", active: "Активен", disabled: "Отключён" })[status];
const userProjectNames = (user: UserResponse): string => {
  if (user.role === "admin") return "Все проекты";
  return (
    user.projectIds
      .map((projectId) => projectNames.value.get(projectId))
      .filter(Boolean)
      .join(", ") || "Нет проектов"
  );
};

const resetForm = (): void => {
  Object.assign(form, {
    id: null,
    name: "",
    email: "",
    password: "",
    role: "user",
    projectIds: [],
  });
};

const startEditing = (user: UserResponse): void => {
  Object.assign(form, {
    id: user.id,
    name: user.name,
    email: user.email,
    password: "",
    role: user.role,
    projectIds: [...user.projectIds],
  });
  message.value = null;
};

const requestErrorMessage = (requestError: unknown): string => {
  const fetchError = requestError as {
    data?: { statusMessage?: string; data?: { code?: string } };
  };
  if (fetchError.data?.data?.code === "LAST_ACTIVE_ADMIN") {
    return "Нельзя отключить или изменить роль последнего администратора.";
  }
  return fetchError.data?.statusMessage ?? "Не удалось сохранить пользователя.";
};

const saveUser = async (): Promise<void> => {
  if (isSaving.value) return;
  isSaving.value = true;
  message.value = null;
  const body = {
    name: form.name,
    email: form.email,
    role: form.role,
    projectIds: form.role === "admin" ? [] : form.projectIds,
    ...(form.password ? { password: form.password } : {}),
  };
  const editedUserId = form.id;

  try {
    if (form.id) {
      await $fetch(`/api/v1/users/${form.id}`, {
        method: "PATCH",
        headers: getCsrfHeaders(),
        body,
      });
    } else {
      await $fetch("/api/v1/users", {
        method: "POST",
        headers: getCsrfHeaders(),
        body,
      });
    }
    const successText = form.id ? "Пользователь обновлён." : "Пользователь создан.";
    await refreshUsers();
    if (editedUserId === session.value?.user.id) {
      session.value = await $fetch<AdminSessionResponse>("/api/v1/auth/session");
      if (session.value?.user.role !== "admin") {
        await navigateTo("/");
        return;
      }
    }
    resetForm();
    message.value = { type: "success", text: successText };
  } catch (requestError) {
    message.value = { type: "error", text: requestErrorMessage(requestError) };
  } finally {
    isSaving.value = false;
  }
};

const changeStatus = async (user: UserResponse): Promise<void> => {
  if (pendingUserId.value) return;
  pendingUserId.value = user.id;
  message.value = null;
  try {
    await $fetch(`/api/v1/users/${user.id}`, {
      method: "PATCH",
      headers: getCsrfHeaders(),
      body: { status: user.status === "active" ? "disabled" : "active" },
    });
    await refreshUsers();
    if (user.id === session.value?.user.id && user.status === "active") {
      session.value = null;
      await navigateTo("/login");
      return;
    }
    message.value = {
      type: "success",
      text: user.status === "active" ? "Пользователь отключён." : "Пользователь активирован.",
    };
  } catch (requestError) {
    message.value = { type: "error", text: requestErrorMessage(requestError) };
  } finally {
    pendingUserId.value = null;
  }
};
</script>

<template>
  <main class="page-frame">
    <header class="page-header">
      <div>
        <p class="eyebrow">Доступ</p>
        <h1 class="page-title page-title--compact">Пользователи</h1>
        <p class="page-description">
          Администраторы работают со всеми проектами. Пользователи видят только назначенные им
          проекты без технического раздела «Компоненты».
        </p>
      </div>
    </header>

    <section class="panel" aria-labelledby="user-form-title">
      <header class="section-header">
        <div>
          <p class="eyebrow">{{ isEditing ? "Редактирование" : "Новый пользователь" }}</p>
          <h2 id="user-form-title" class="section-title">
            {{ isEditing ? "Изменить пользователя" : "Создать пользователя" }}
          </h2>
        </div>
        <button v-if="isEditing" class="button button--compact" type="button" @click="resetForm">
          Отмена
        </button>
      </header>

      <form class="form-stack" @submit.prevent="saveUser">
        <div class="form-grid">
          <label class="form-field">
            <span class="form-field__label">Имя</span>
            <input
              v-model.trim="form.name"
              class="form-field__control"
              type="text"
              maxlength="160"
              required
            />
          </label>
          <label class="form-field">
            <span class="form-field__label">Email</span>
            <input
              v-model.trim="form.email"
              class="form-field__control"
              type="email"
              maxlength="320"
              autocomplete="off"
              required
            />
          </label>
          <label class="form-field">
            <span class="form-field__label">
              {{ isEditing ? "Новый пароль" : "Временный пароль" }}
            </span>
            <input
              v-model="form.password"
              class="form-field__control"
              type="password"
              minlength="12"
              maxlength="128"
              autocomplete="new-password"
              :required="!isEditing"
            />
            <span v-if="isEditing" class="form-field__hint">
              Оставьте пустым, чтобы сохранить текущий пароль.
            </span>
          </label>
          <div class="form-field">
            <span class="form-field__label">Роль</span>
            <BaseSelect v-model="form.role" :options="roleOptions" label="Роль пользователя" />
          </div>
        </div>

        <fieldset class="choice-group">
          <legend class="form-field__label">Доступ к проектам</legend>
          <p v-if="form.role === 'admin'" class="form-field__hint">
            Администратор автоматически получает полный доступ ко всем проектам.
          </p>
          <p v-else-if="!projectOptions.length" class="form-field__hint">Проектов пока нет.</p>
          <div v-else class="choice-list">
            <BaseCheckbox
              v-for="project in projectOptions"
              :key="project.id"
              v-model="form.projectIds"
              :value="project.id"
              :label="project.name"
            />
          </div>
        </fieldset>

        <p
          v-if="message"
          class="form-message"
          :class="`form-message--${message.type}`"
          role="status"
        >
          {{ message.text }}
        </p>

        <div class="form-actions">
          <button class="button button--primary" type="submit" :disabled="isSaving">
            {{ isSaving ? "Сохраняем…" : isEditing ? "Сохранить" : "Создать пользователя" }}
          </button>
        </div>
      </form>
    </section>

    <section class="panel panel--flush" aria-labelledby="user-list-title">
      <header class="prompt-list__header section-header">
        <div>
          <p class="eyebrow">Команда</p>
          <h2 id="user-list-title" class="section-title">Все пользователи</h2>
        </div>
      </header>

      <div v-if="usersError" class="empty-state" role="alert">
        Не удалось загрузить пользователей.
      </div>
      <div v-else-if="!users?.length" class="empty-state">Пользователей пока нет.</div>
      <div v-else class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th scope="col">Пользователь</th>
              <th scope="col">Роль</th>
              <th scope="col">Проекты</th>
              <th scope="col">Статус</th>
              <th scope="col">Действия</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="user in users" :key="user.id">
              <td>
                <strong>{{ user.name }}</strong>
                <span class="data-table__secondary">{{ user.email }}</span>
              </td>
              <td>{{ roleLabel(user.role) }}</td>
              <td class="data-table__wrap">{{ userProjectNames(user) }}</td>
              <td>
                <span class="status-badge status-badge--compact" :data-status="user.status">
                  {{ statusLabel(user.status) }}
                </span>
              </td>
              <td>
                <div class="button-group">
                  <button
                    class="button button--compact"
                    type="button"
                    :disabled="pendingUserId === user.id"
                    @click="startEditing(user)"
                  >
                    Изменить
                  </button>
                  <button
                    class="button button--compact"
                    :class="user.status === 'active' ? 'button--danger' : 'button--primary'"
                    type="button"
                    :disabled="pendingUserId === user.id"
                    @click="changeStatus(user)"
                  >
                    {{ user.status === "active" ? "Отключить" : "Активировать" }}
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </main>
</template>

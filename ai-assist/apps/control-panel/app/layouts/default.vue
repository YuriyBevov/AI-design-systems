<script setup lang="ts">
import type { KnowledgeIndexStateResponse } from "@ai-assist/contracts";

const session = useAdminSessionState();
const { activeProject } = useActiveProject();
const {
  states: knowledgeIndexStates,
  pendingReindex,
  setKnowledgeIndexState,
} = useKnowledgeIndexState();
const requestFetch = useRequestFetch();
const isLoggingOut = ref(false);
const route = useRoute();
const isAssistantSettingsRoute = computed(() => isAssistantSettingsPath(route.path));
const activeProjectId = computed(() => activeProject.value?.id ?? null);

const { data: fetchedKnowledgeIndexState, refresh: refreshTopbarKnowledgeIndexState } =
  await useAsyncData(
    () => `topbar-knowledge-index-${activeProjectId.value ?? "none"}`,
    () =>
      activeProjectId.value
        ? requestFetch<KnowledgeIndexStateResponse>(
            `/api/v1/projects/${activeProjectId.value}/knowledge`,
          )
        : Promise.resolve(null),
  );

watch(
  [activeProjectId, fetchedKnowledgeIndexState],
  ([projectId, state]) => {
    if (projectId && state) setKnowledgeIndexState(projectId, state);
  },
  { immediate: true },
);

const activeKnowledgeIndexState = computed(() =>
  activeProjectId.value ? knowledgeIndexStates.value[activeProjectId.value] : undefined,
);
const showKnowledgeReindexNotice = computed(() => {
  const projectId = activeProjectId.value;
  return Boolean(
    projectId &&
    (pendingReindex.value[projectId] ||
      requiresKnowledgeModelReindex(activeKnowledgeIndexState.value)),
  );
});

let topbarIndexPollTimer: ReturnType<typeof setTimeout> | undefined;
const pollTopbarKnowledgeIndex = async (): Promise<void> => {
  await refreshTopbarKnowledgeIndexState();
  const status = fetchedKnowledgeIndexState.value?.latest?.status;
  if (status === "queued" || status === "building") {
    topbarIndexPollTimer = setTimeout(() => void pollTopbarKnowledgeIndex(), 1_500);
  }
};

watch(
  [activeProjectId, () => activeKnowledgeIndexState.value?.latest?.status],
  ([projectId, status]) => {
    if (!import.meta.client) return;
    if (topbarIndexPollTimer) clearTimeout(topbarIndexPollTimer);
    if (projectId && (status === "queued" || status === "building")) {
      topbarIndexPollTimer = setTimeout(() => void pollTopbarKnowledgeIndex(), 1_500);
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  if (topbarIndexPollTimer) clearTimeout(topbarIndexPollTimer);
});

const pageTitle = computed(() => {
  if (route.path === "/") return "Обзор проекта";
  if (route.path === "/projects") return "Управление проектами";
  if (route.path === "/users") return "Управление пользователями";
  if (isAssistantSettingsRoute.value) return "Настройки ассистента";
  if (route.path.endsWith("/components")) return "Компоненты";
  if (route.path.endsWith("/audit")) return "Журнал аудита";
  return "AI Assist";
});
const isAdmin = computed(() => session.value?.user.role === "admin");
const userInitial = computed(() => session.value?.user.name.slice(0, 1).toUpperCase() ?? "A");
const roleLabel = computed(() => (isAdmin.value ? "Администратор" : "Пользователь"));

const logout = async (): Promise<void> => {
  isLoggingOut.value = true;

  try {
    await $fetch("/api/v1/auth/logout", {
      method: "POST",
      headers: getCsrfHeaders(),
    });
  } finally {
    session.value = null;
    isLoggingOut.value = false;
    await navigateTo("/login");
  }
};
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="sidebar__top">
        <NuxtLink class="brand" to="/" aria-label="AI Assist — главная">
          <span class="brand__mark" aria-hidden="true">AI</span>
          <span class="brand__copy">
            <strong class="brand__name">AI Assist</strong>
            <small class="brand__caption">Control panel</small>
          </span>
        </NuxtLink>
      </div>

      <div class="sidebar__content">
        <div class="sidebar__project">
          <ProjectSwitcher />
        </div>

        <nav class="sidebar__nav" aria-label="Основная навигация">
          <ul class="sidebar__list">
            <li>
              <NuxtLink
                class="sidebar__link"
                to="/"
                active-class="sidebar__link--ancestor"
                exact-active-class="sidebar__link--active"
              >
                <UiIcon class="ui-icon--medium" name="home" />
                <span>Обзор проекта</span>
              </NuxtLink>
            </li>
            <li>
              <NuxtLink
                class="sidebar__link"
                to="/projects"
                active-class="sidebar__link--ancestor"
                exact-active-class="sidebar__link--active"
              >
                <UiIcon class="ui-icon--medium" name="projects" />
                <span>Управление проектами</span>
              </NuxtLink>
            </li>
            <li v-if="isAdmin">
              <NuxtLink
                class="sidebar__link"
                to="/users"
                exact-active-class="sidebar__link--active"
              >
                <UiIcon class="ui-icon--medium" name="users" />
                <span>Управление пользователями</span>
              </NuxtLink>
            </li>
            <template v-if="activeProject">
              <li>
                <NuxtLink
                  class="sidebar__link"
                  :class="{ 'sidebar__link--active': isAssistantSettingsRoute }"
                  :to="`/projects/${activeProject.id}/assistant`"
                >
                  <UiIcon class="ui-icon--medium" name="assistant" />
                  <span>Настройки ассистента</span>
                </NuxtLink>
              </li>
              <li v-if="isAdmin">
                <NuxtLink class="sidebar__link" :to="`/projects/${activeProject.id}/components`">
                  <UiIcon class="ui-icon--medium" name="components" />
                  <span>Компоненты</span>
                </NuxtLink>
              </li>
              <li>
                <NuxtLink class="sidebar__link" :to="`/projects/${activeProject.id}/audit`">
                  <UiIcon class="ui-icon--medium" name="audit" />
                  <span>Журнал аудита</span>
                </NuxtLink>
              </li>
            </template>
          </ul>
        </nav>
      </div>

      <div class="sidebar__footer">
        <div class="user-menu" :title="session?.user.email">
          <span class="user-menu__avatar" aria-hidden="true">{{ userInitial }}</span>
          <span class="user-menu__copy">
            <strong class="user-menu__email">{{ session?.user.name }}</strong>
            <small class="user-menu__role">{{ roleLabel }}</small>
          </span>
        </div>
        <ThemeToggle />
        <button
          class="icon-button icon-button--compact icon-button--ghost"
          type="button"
          :disabled="isLoggingOut"
          aria-label="Выйти"
          title="Выйти"
          @click="logout"
        >
          <UiIcon name="logout" />
        </button>
      </div>
    </aside>

    <div class="app-shell__main">
      <header class="topbar">
        <p class="topbar__title" aria-hidden="true">{{ pageTitle }}</p>
        <BaseNotice v-if="showKnowledgeReindexNotice" class="topbar__notice" variant="warning">
          Для выбранной модели векторизации требуется переиндексация базы знаний.
        </BaseNotice>
      </header>
      <div class="app-shell__content">
        <div class="app-shell__workspace">
          <AssistantSettingsTabs v-if="isAssistantSettingsRoute" />
          <slot />
        </div>
      </div>
    </div>
  </div>
</template>

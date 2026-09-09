<script setup lang="ts">
const session = useAdminSessionState();
const { activeProject } = useActiveProject();
const isLoggingOut = ref(false);
const route = useRoute();

const pageTitle = computed(() => {
  if (route.path === "/") return "Обзор";
  if (route.path === "/projects") return "Проекты";
  if (route.path === "/users") return "Пользователи";
  if (route.path.includes("/knowledge/documents/")) return "Документ";
  if (route.path.endsWith("/knowledge/documents")) return "Документы";
  if (route.path.endsWith("/knowledge/sources")) return "Источники";
  if (route.path.includes("/prompts/")) return "Prompt";
  if (route.path.endsWith("/prompts")) return "Prompts";
  if (route.path.endsWith("/assistant")) return "Ассистент";
  if (route.path.endsWith("/components")) return "Компоненты";
  if (route.path.endsWith("/provider")) return "Провайдер и модели";
  if (route.path.endsWith("/audit")) return "Журнал аудита";
  if (route.path.endsWith("/settings")) return "Настройки проекта";
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
                <span>Обзор</span>
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
                <span>Проекты</span>
              </NuxtLink>
            </li>
            <li v-if="isAdmin">
              <NuxtLink
                class="sidebar__link"
                to="/users"
                exact-active-class="sidebar__link--active"
              >
                <UiIcon class="ui-icon--medium" name="users" />
                <span>Пользователи</span>
              </NuxtLink>
            </li>
            <template v-if="activeProject">
              <li>
                <NuxtLink class="sidebar__link" :to="`/projects/${activeProject.id}/settings`">
                  <UiIcon class="ui-icon--medium" name="settings" />
                  <span>Настройки</span>
                </NuxtLink>
              </li>
              <li>
                <NuxtLink class="sidebar__link" :to="`/projects/${activeProject.id}/assistant`">
                  <UiIcon class="ui-icon--medium" name="assistant" />
                  <span>Ассистент</span>
                </NuxtLink>
              </li>
              <li>
                <NuxtLink class="sidebar__link" :to="`/projects/${activeProject.id}/prompts`">
                  <UiIcon class="ui-icon--medium" name="prompt" />
                  <span>Prompts</span>
                </NuxtLink>
              </li>
              <li>
                <NuxtLink
                  class="sidebar__link"
                  :class="{
                    'sidebar__link--active': route.path.includes(
                      `/projects/${activeProject.id}/knowledge/`,
                    ),
                  }"
                  :to="`/projects/${activeProject.id}/knowledge/documents`"
                  active-class="sidebar__link--ancestor"
                >
                  <UiIcon class="ui-icon--medium" name="knowledge" />
                  <span>База знаний</span>
                </NuxtLink>
              </li>
              <li v-if="isAdmin">
                <NuxtLink class="sidebar__link" :to="`/projects/${activeProject.id}/components`">
                  <UiIcon class="ui-icon--medium" name="components" />
                  <span>Компоненты</span>
                </NuxtLink>
              </li>
              <li v-if="isAdmin">
                <NuxtLink class="sidebar__link" :to="`/projects/${activeProject.id}/provider`">
                  <UiIcon class="ui-icon--medium" name="provider" />
                  <span>Провайдер и модели</span>
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
        <p v-if="activeProject" class="topbar__project">{{ activeProject.name }}</p>
      </header>
      <div class="app-shell__content">
        <div class="app-shell__workspace">
          <slot />
        </div>
      </div>
    </div>
  </div>
</template>

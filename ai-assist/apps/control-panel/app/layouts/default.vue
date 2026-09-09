<script setup lang="ts">
const session = useAdminSessionState();
const isLoggingOut = ref(false);
const route = useRoute();

const activeProject = computed(() => {
  const routeProjectId = typeof route.params.projectId === "string" ? route.params.projectId : null;
  return (
    session.value?.projects.find((project) => project.id === routeProjectId) ??
    session.value?.projects[0]
  );
});

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
  <div class="admin-shell">
    <aside class="admin-sidebar">
      <div>
        <NuxtLink class="brand" to="/" aria-label="AI Assist — главная">
          <span class="brand__mark" aria-hidden="true">AI</span>
          <span>
            <strong class="brand__name">AI Assist</strong>
            <small class="brand__caption">Control panel</small>
          </span>
        </NuxtLink>

        <div v-if="activeProject" class="project-switcher">
          <span class="project-switcher__label">Проект</span>
          <strong>{{ activeProject.name }}</strong>
          <span class="role-badge">{{ activeProject.role }}</span>
        </div>

        <nav v-if="activeProject" class="admin-nav" aria-label="Основная навигация">
          <NuxtLink class="admin-nav__link" to="/">
            <UiIcon class="ui-icon--medium" name="home" />
            Обзор
          </NuxtLink>
          <NuxtLink class="admin-nav__link" :to="`/projects/${activeProject.id}/settings`">
            <UiIcon class="ui-icon--medium" name="settings" />
            Настройки
          </NuxtLink>
          <NuxtLink class="admin-nav__link" :to="`/projects/${activeProject.id}/assistant`">
            <UiIcon class="ui-icon--medium" name="assistant" />
            Ассистент
          </NuxtLink>
          <NuxtLink class="admin-nav__link" :to="`/projects/${activeProject.id}/prompts`">
            <UiIcon class="ui-icon--medium" name="prompt" />
            Prompts
          </NuxtLink>
          <NuxtLink
            class="admin-nav__link"
            :to="`/projects/${activeProject.id}/knowledge/documents`"
          >
            <UiIcon class="ui-icon--medium" name="knowledge" />
            База знаний
          </NuxtLink>
          <NuxtLink class="admin-nav__link" :to="`/projects/${activeProject.id}/components`">
            <UiIcon class="ui-icon--medium" name="components" />
            Компоненты
          </NuxtLink>
          <NuxtLink
            v-if="activeProject.role === 'owner'"
            class="admin-nav__link"
            :to="`/projects/${activeProject.id}/provider`"
          >
            <UiIcon class="ui-icon--medium" name="provider" />
            Провайдер и модели
          </NuxtLink>
          <NuxtLink class="admin-nav__link" :to="`/projects/${activeProject.id}/audit`">
            <UiIcon class="ui-icon--medium" name="audit" />
            Журнал аудита
          </NuxtLink>
        </nav>
      </div>

      <div class="account-panel">
        <span class="account-panel__label">Вы вошли как</span>
        <strong class="account-panel__email">{{ session?.user.email }}</strong>
        <button class="button button--text" type="button" :disabled="isLoggingOut" @click="logout">
          {{ isLoggingOut ? "Выходим…" : "Выйти" }}
        </button>
      </div>
    </aside>

    <div class="admin-content">
      <slot />
    </div>
  </div>
</template>

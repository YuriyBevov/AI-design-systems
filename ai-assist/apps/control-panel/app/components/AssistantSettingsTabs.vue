<script setup lang="ts">
import type { RouteLocationRaw } from "vue-router";

import {
  getAssistantSettingsTab,
  type AssistantSettingsTab,
} from "~/utils/assistant-settings-navigation";

type SettingsTab = {
  id: AssistantSettingsTab;
  label: string;
  to: RouteLocationRaw;
  adminOnly?: boolean;
};

const route = useRoute();
const session = useAdminSessionState();
const projectId = computed(() => String(route.params.projectId));
const isAdmin = computed(() => session.value?.user.role === "admin");
const activeTab = computed(() => getAssistantSettingsTab(route.path, route.query.tab));
const tabs = computed<SettingsTab[]>(() => {
  const projectBase = `/projects/${projectId.value}`;
  const allTabs: SettingsTab[] = [
    {
      id: "interface",
      label: "Интерфейс",
      to: { path: `${projectBase}/assistant`, query: { tab: "interface" } },
    },
    {
      id: "security",
      label: "Безопасность и ограничения",
      to: { path: `${projectBase}/assistant`, query: { tab: "security" } },
    },
    {
      id: "prompts",
      label: "Роль и поведение",
      to: `${projectBase}/prompts`,
    },
    {
      id: "knowledge",
      label: "База знаний",
      to: `${projectBase}/knowledge/documents`,
    },
    {
      id: "integration",
      label: "Подключение",
      to: `${projectBase}/provider`,
      adminOnly: true,
    },
  ];
  return allTabs.filter((tab) => !tab.adminOnly || isAdmin.value);
});
</script>

<template>
  <nav class="tab-bar" aria-label="Разделы настроек ассистента">
    <NuxtLink
      v-for="tab in tabs"
      :key="tab.id"
      class="tab-bar__item"
      :class="{ 'tab-bar__item--active': activeTab === tab.id }"
      :to="tab.to"
      :aria-current="activeTab === tab.id ? 'page' : undefined"
    >
      {{ tab.label }}
    </NuxtLink>
  </nav>
</template>

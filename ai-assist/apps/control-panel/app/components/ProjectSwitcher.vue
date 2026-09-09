<script setup lang="ts">
const session = useAdminSessionState();
const { activeProject, selectProject } = useActiveProject();

const options = computed(() =>
  (session.value?.projects ?? []).map((project) => ({
    value: project.id,
    label: project.name,
  })),
);
const selectedProjectId = computed({
  get: () => activeProject.value?.id ?? "",
  set: (projectId: string) => void selectProject(projectId),
});
</script>

<template>
  <div v-if="activeProject" class="project-switcher">
    <BaseSelect
      v-model="selectedProjectId"
      :options="options"
      label="Текущий проект"
      variant="compact"
    />
  </div>
</template>

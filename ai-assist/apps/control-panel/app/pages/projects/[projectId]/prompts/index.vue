<script setup lang="ts">
import type { PromptListResponse } from "@ai-assist/contracts";

import { getProjectPromptId } from "~/utils/project-prompt";

const route = useRoute();
const requestFetch = useRequestFetch();
const projectId = computed(() => String(route.params.projectId));

const promptList = await requestFetch<PromptListResponse>(
  `/api/v1/projects/${projectId.value}/prompts`,
);
const promptId = getProjectPromptId(promptList);

await navigateTo(
  promptId
    ? `/projects/${projectId.value}/prompts/${promptId}`
    : `/projects/${projectId.value}/prompts/new`,
  { replace: true },
);
</script>

<template>
  <main class="page-frame" aria-busy="true" />
</template>

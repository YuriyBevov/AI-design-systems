<script setup lang="ts">
import { defaultKnowledgeNormalizationPrompt } from "@ai-assist/contracts";
import type {
  ClearKnowledgeDataResponse,
  CrawlChangeType,
  CrawlPageResponse,
  CrawlRunDetailResponse,
  CrawlRunHistoryResponse,
  CrawlRunResponse,
  CrawlRunStatus,
  DeleteKnowledgeCrawlResponse,
  DeleteUrlKnowledgeSourceResponse,
  DiscoverSiteStructureResponse,
  ProjectResponse,
  PublishCrawlRunResponse,
  RequestKnowledgeCrawlResponse,
  ReauthenticateResponse,
  SiteStructureNode,
  UrlKnowledgeSourceListResponse,
  UrlKnowledgeSourceResponse,
} from "@ai-assist/contracts";
import type { TreeSelectNode } from "~/utils/tree-select";
import {
  compressTreeSelection,
  flattenTreeNodeIds,
  normalizeTreeSelection,
} from "~/utils/tree-select";

const route = useRoute();
const requestFetch = useRequestFetch();
const session = useAdminSessionState();
const projectId = computed(() => String(route.params.projectId));
const isSaving = ref(false);
const isDiscovering = ref(false);
const runningSourceId = ref<string | null>(null);
const isPublishing = ref(false);
const isReprocessing = ref(false);
const isChangingPause = ref(false);
const isStoppingRun = ref(false);
const isDeletingRun = ref(false);
const isManagingData = ref(false);
type DestructiveAction =
  | { kind: "clear_history" }
  | { kind: "clear_sources" }
  | { kind: "delete_source"; source: UrlKnowledgeSourceResponse };
const destructiveAction = ref<DestructiveAction | null>(null);
const reauthenticationVisible = ref(false);
const isReauthenticating = ref(false);
const crawlRunConfirmation = ref<"stop" | "delete" | null>(null);
const isRetryingPageId = ref<string | null>(null);
const isRetryingFailedPages = ref(false);
const selectedRun = ref<CrawlRunDetailResponse | null>(null);
const promptRunId = ref<string | null>(null);
const normalizationPromptDraft = ref(defaultKnowledgeNormalizationPrompt);
const selectedPageIds = ref<string[]>([]);
const selectAllRunPages = ref(false);
const selectionRunId = ref<string | null>(null);
const crawlPage = ref(1);
const crawlPageSize = 50;
type SourceSortColumn = "name" | "limits" | "latestRun";
type CrawlHistorySortColumn = "source" | "createdAt" | "status" | "result";
type CrawlPageSortColumn = "page" | "type" | "change" | "confidence" | "review";
const {
  sortColumn: sourceSortColumn,
  sortDirection: sourceSortDirection,
  toggleSort: toggleSourceSort,
} = useTableSort<SourceSortColumn>("name");
const {
  sortColumn: crawlHistorySortColumn,
  sortDirection: crawlHistorySortDirection,
  toggleSort: toggleCrawlHistorySort,
} = useTableSort<CrawlHistorySortColumn>("createdAt", "descending");
const {
  sortColumn: crawlPageSortColumn,
  sortDirection: crawlPageSortDirection,
  toggleSort: toggleCrawlPageSort,
} = useTableSort<CrawlPageSortColumn>("page");
const setSourceSort = (column: string): void => toggleSourceSort(column as SourceSortColumn);
const setCrawlHistorySort = (column: string): void =>
  toggleCrawlHistorySort(column as CrawlHistorySortColumn);
const setCrawlPageSort = (column: string): void =>
  toggleCrawlPageSort(column as CrawlPageSortColumn);
const showNormalizationPromptEditor = false;
const structure = ref<DiscoverSiteStructureResponse | null>(null);
const structureStartUrl = ref<string | null>(null);
const selectedStructurePaths = ref<string[]>([]);
const message = ref<{ type: "success" | "error"; text: string } | null>(null);
useToastMessage(message);
const form = reactive({
  startUrl: "",
  maxDepth: 5,
  normalizationPrompt: defaultKnowledgeNormalizationPrompt,
});

const { data, error, refresh } = await useAsyncData(
  () => `project-knowledge-sources-${projectId.value}`,
  async () => {
    const [project, sourceList, crawlHistory] = await Promise.all([
      requestFetch<ProjectResponse>(`/api/v1/projects/${projectId.value}`),
      requestFetch<UrlKnowledgeSourceListResponse>(
        `/api/v1/projects/${projectId.value}/knowledge/sources`,
      ),
      requestFetch<CrawlRunHistoryResponse>(
        `/api/v1/projects/${projectId.value}/knowledge/crawl-runs`,
      ),
    ]);
    return { project, sourceList, crawlHistory };
  },
);

const role = computed(
  () =>
    session.value?.projects.find((project) => project.id === projectId.value)?.role ??
    data.value?.project.role,
);
const canEdit = computed(() => role.value === "owner" || role.value === "editor");
const isOwner = computed(() => role.value === "owner");
const destructiveConfirmation = computed(() => {
  const action = destructiveAction.value;
  if (action?.kind === "delete_source") {
    return {
      title: "Удалить источник сайта?",
      description: `Источник «${action.source.name}», его настройки и история парсинга будут удалены. Созданные записи базы знаний сохранятся.`,
      label: "Удалить источник",
    };
  }
  if (action?.kind === "clear_sources") {
    return {
      title: "Очистить настроенные источники?",
      description:
        "Все источники сайта, их настройки и история парсинга будут удалены. Созданные записи базы знаний сохранятся.",
      label: "Очистить источники",
    };
  }
  return {
    title: "Очистить историю парсинга?",
    description:
      "Все завершённые, ошибочные и остановленные запуски вместе с постраничными результатами будут удалены. Записи базы знаний сохранятся.",
    label: "Очистить историю",
  };
});
const selectedRunSource = computed(() =>
  data.value?.sourceList.sources.find((source) => source.id === selectedRun.value?.run.sourceId),
);
const canReprocessSelectedRun = computed(
  () =>
    Boolean(selectedRun.value?.pages.some((page) => page.hasRawContent)) &&
    Boolean(selectedRun.value && !["queued", "running"].includes(selectedRun.value.run.status)),
);

watch(
  () => data.value?.project.primaryOrigin,
  (origin) => {
    if (origin && !form.startUrl) form.startUrl = origin.endsWith("/") ? origin : `${origin}/`;
  },
  { immediate: true },
);

const runStatusLabel = (
  status: CrawlRunStatus,
  paused = false,
  finishedAt: string | null = null,
): string =>
  status === "cancelled"
    ? finishedAt
      ? "Остановлен"
      : "Останавливается"
    : paused
      ? "Приостановлен"
      : {
          queued: "В очереди",
          running: "Выполняется",
          succeeded: "Завершён",
          partial: "Завершён с ошибками",
          failed: "Ошибка",
          cancelled: "Остановлен",
        }[status];

const changeLabel = (change: CrawlChangeType | null): string =>
  change ? { new: "Новый", changed: "Изменён", unchanged: "Без изменений" }[change] : "—";

const sortedSources = computed(() =>
  sortTableRows(data.value?.sourceList.sources ?? [], sourceSortDirection.value, (source) => {
    switch (sourceSortColumn.value) {
      case "name":
        return `${source.name} ${source.settings.startUrl}`;
      case "limits":
        return source.settings.maxPages;
      case "latestRun":
        return source.latestRun ? Date.parse(source.latestRun.createdAt) : null;
    }
  }),
);
const sortedCrawlHistory = computed(() =>
  sortTableRows(data.value?.crawlHistory.runs ?? [], crawlHistorySortDirection.value, (run) => {
    switch (crawlHistorySortColumn.value) {
      case "source":
        return run.sourceName;
      case "createdAt":
        return Date.parse(run.createdAt);
      case "status":
        return runStatusLabel(run.status, run.paused, run.finishedAt);
      case "result":
        return run.succeededCount;
    }
  }),
);
const sortedCrawlPages = computed(() =>
  sortTableRows(selectedRun.value?.pages ?? [], crawlPageSortDirection.value, (page) => {
    switch (crawlPageSortColumn.value) {
      case "page":
        return page.title ?? page.normalizedUrl;
      case "type":
        return page.documentType ?? "";
      case "change":
        return changeLabel(page.changeType);
      case "confidence":
        return page.confidence;
      case "review":
        return `${page.reviewStatus} ${page.errorCode ?? ""}`;
    }
  }),
);

const formatDate = (value: string): string =>
  new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );

const flattenNodes = (nodes: SiteStructureNode[]): SiteStructureNode[] =>
  nodes.flatMap((node) => [node, ...flattenNodes(node.children)]);
const structureNodes = computed(() => flattenNodes(structure.value?.nodes ?? []));
const mapStructureNode = (node: SiteStructureNode): TreeSelectNode => ({
  id: node.path,
  label: node.label,
  description: `${node.path} • вложенных узлов: ${node.descendantCount}`,
  children: node.children.map(mapStructureNode),
});
const structureTree = computed(() => (structure.value?.nodes ?? []).map(mapStructureNode));
const normalizedStructurePaths = computed(() =>
  normalizeTreeSelection(structureTree.value, selectedStructurePaths.value),
);
const selectedCrawlScopes = computed(() =>
  compressTreeSelection(structureTree.value, normalizedStructurePaths.value),
);
const structureMethodLabel = computed(() => {
  if (!structure.value) return "";
  return {
    sitemap: "sitemap.xml",
    navigation: "навигация сайта",
    mixed: "sitemap.xml и навигация сайта",
  }[structure.value.method];
});

const discoverStructure = async (): Promise<void> => {
  if (!canEdit.value || isDiscovering.value || !form.startUrl) return;
  isDiscovering.value = true;
  message.value = null;
  structure.value = null;
  selectedStructurePaths.value = [];
  try {
    const result = await $fetch<DiscoverSiteStructureResponse>(
      `/api/v1/projects/${projectId.value}/knowledge/sources/discover`,
      {
        method: "POST",
        headers: getCsrfHeaders(),
        body: { startUrl: form.startUrl, maxDepth: Number(form.maxDepth) },
      },
    );
    structure.value = result;
    structureStartUrl.value = form.startUrl;
    message.value = structureNodes.value.length
      ? { type: "success", text: `Найдено узлов структуры: ${structureNodes.value.length}.` }
      : { type: "error", text: "Структура сайта не найдена." };
  } catch (requestError) {
    const fetchError = requestError as { data?: { statusMessage?: string } };
    message.value = {
      type: "error",
      text: fetchError.data?.statusMessage ?? "Не удалось получить структуру сайта",
    };
  } finally {
    isDiscovering.value = false;
  }
};

const setAllSections = (included: boolean): void => {
  selectedStructurePaths.value = included ? flattenTreeNodeIds(structureTree.value) : [];
};

watch(
  () => form.startUrl,
  (value) => {
    if (structureStartUrl.value && value !== structureStartUrl.value) {
      structure.value = null;
      structureStartUrl.value = null;
      selectedStructurePaths.value = [];
    }
  },
);

const isSelectablePage = (page: CrawlPageResponse): boolean =>
  page.status === "succeeded" &&
  page.reviewStatus === "pending" &&
  (page.changeType === "new" || page.changeType === "changed") &&
  Boolean(page.documentId && page.documentVersionId);

const selectablePages = computed(() => (selectedRun.value?.pages ?? []).filter(isSelectablePage));
const allPagesSelected = computed(
  () =>
    selectAllRunPages.value ||
    (selectablePages.value.length > 0 &&
      selectablePages.value.every((page) => selectedPageIds.value.includes(page.id))),
);
const somePagesSelected = computed(
  () =>
    !allPagesSelected.value &&
    selectablePages.value.some((page) => selectedPageIds.value.includes(page.id)),
);

const setPageSelected = (pageId: string, selected: boolean): void => {
  selectAllRunPages.value = false;
  selectedPageIds.value = selected
    ? [...new Set([...selectedPageIds.value, pageId])].slice(0, 100)
    : selectedPageIds.value.filter((id) => id !== pageId);
};

const setAllPagesSelected = (selected: boolean): void => {
  selectAllRunPages.value = false;
  const currentPageIds = selectablePages.value.map((page) => page.id);
  selectedPageIds.value = selected
    ? [...new Set([...selectedPageIds.value, ...currentPageIds])].slice(0, 100)
    : selectedPageIds.value.filter((id) => !currentPageIds.includes(id));
};

const reviewablePageCount = computed(() =>
  Math.max(
    0,
    (selectedRun.value?.run.newCount ?? 0) +
      (selectedRun.value?.run.changedCount ?? 0) -
      (selectedRun.value?.run.approvedCount ?? 0),
  ),
);
const selectedPublicationCount = computed(() =>
  selectAllRunPages.value ? reviewablePageCount.value : selectedPageIds.value.length,
);

const setAllRunPagesSelected = (selected: boolean): void => {
  selectAllRunPages.value = selected;
  selectedPageIds.value = [];
};

const loadRun = async (runId: string, requestedPage?: number): Promise<void> => {
  const previousStatus = selectedRun.value?.run.id === runId ? selectedRun.value.run.status : null;
  const page = selectionRunId.value === runId ? (requestedPage ?? crawlPage.value) : 1;
  const detail = await requestFetch<CrawlRunDetailResponse>(
    `/api/v1/projects/${projectId.value}/knowledge/crawl-runs/${runId}?page=${page}&pageSize=${crawlPageSize}`,
  );
  selectedRun.value = detail;
  if (promptRunId.value !== runId) {
    promptRunId.value = runId;
    normalizationPromptDraft.value = detail.run.normalizationPrompt;
  }
  crawlPage.value = detail.pagination.page;
  const eligibleIds = detail.pages.filter(isSelectablePage).map((page) => page.id);
  const justFinished =
    (previousStatus === "queued" || previousStatus === "running") &&
    (detail.run.status === "succeeded" || detail.run.status === "partial");
  if (selectionRunId.value !== runId || justFinished) {
    selectedPageIds.value = eligibleIds;
    selectAllRunPages.value = false;
    selectionRunId.value = runId;
  }
};

const changeCrawlPage = async (page: number): Promise<void> => {
  if (!selectedRun.value || page < 1 || page > selectedRun.value.pagination.totalPages) return;
  await loadRun(selectedRun.value.run.id, page);
};

const latestRunId = computed(
  () =>
    data.value?.sourceList.sources.find(
      (source) => source.latestRun && ["queued", "running"].includes(source.latestRun.status),
    )?.latestRun?.id ??
    data.value?.sourceList.sources[0]?.latestRun?.id ??
    null,
);

watch(
  latestRunId,
  (runId) => {
    if (runId && !selectedRun.value) void loadRun(runId);
  },
  { immediate: true },
);

let pollTimer: ReturnType<typeof setTimeout> | undefined;
const schedulePoll = (): void => {
  if (!import.meta.client) return;
  if (pollTimer) clearTimeout(pollTimer);
  const status = selectedRun.value?.run.status;
  const runId = selectedRun.value?.run.id;
  const stopping = status === "cancelled" && !selectedRun.value?.run.finishedAt;
  if ((status === "queued" || status === "running" || stopping) && runId) {
    pollTimer = setTimeout(async () => {
      await Promise.all([loadRun(runId), refresh()]);
      schedulePoll();
    }, 1_500);
  }
};
watch(() => selectedRun.value?.run.status, schedulePoll, { immediate: true });
onBeforeUnmount(() => {
  if (pollTimer) clearTimeout(pollTimer);
});

const saveSource = async (): Promise<void> => {
  if (!canEdit.value || isSaving.value) return;
  if (!structure.value || !normalizedStructurePaths.value.length) {
    message.value = {
      type: "error",
      text: "Сначала получите структуру сайта и выберите хотя бы один раздел.",
    };
    return;
  }
  const promptLength = form.normalizationPrompt.trim().length;
  if (promptLength < 100 || promptLength > 10_000) {
    message.value = {
      type: "error",
      text: "Промпт должен содержать от 100 до 10 000 символов.",
    };
    return;
  }
  isSaving.value = true;
  message.value = null;
  try {
    const source = await $fetch<UrlKnowledgeSourceResponse>(
      `/api/v1/projects/${projectId.value}/knowledge/sources`,
      {
        method: "POST",
        headers: getCsrfHeaders(),
        body: {
          name: new URL(form.startUrl).hostname,
          settings: {
            startUrl: form.startUrl,
            crawlMode: "full",
            includePathPrefixes: selectedCrawlScopes.value.prefixIds,
            includeExactPaths: selectedCrawlScopes.value.exactIds,
            excludePathPrefixes: ["/bitrix/", "/basket/", "/search/", "/auth/", "/personal/"],
            maxPages: 5_000,
            maxDepth: Number(form.maxDepth),
            requestDelayMs: 500,
            normalizationPrompt: form.normalizationPrompt,
          },
        },
      },
    );
    message.value = { type: "success", text: "Источник сохранён и прошёл проверку URL." };
    await refresh();
    await startCrawl(source);
  } catch (requestError) {
    const fetchError = requestError as { data?: { statusMessage?: string } };
    message.value = {
      type: "error",
      text: fetchError.data?.statusMessage ?? "Не удалось сохранить источник",
    };
  } finally {
    isSaving.value = false;
  }
};

const reprocessRun = async (): Promise<void> => {
  if (
    !canEdit.value ||
    !selectedRun.value ||
    !selectedRunSource.value ||
    !canReprocessSelectedRun.value ||
    isReprocessing.value
  )
    return;
  const promptLength = normalizationPromptDraft.value.trim().length;
  if (promptLength < 100 || promptLength > 10_000) {
    message.value = {
      type: "error",
      text: "Промпт должен содержать от 100 до 10 000 символов.",
    };
    return;
  }
  isReprocessing.value = true;
  message.value = null;
  try {
    const result = await $fetch<RequestKnowledgeCrawlResponse>(
      `/api/v1/projects/${projectId.value}/knowledge/crawl-runs/${selectedRun.value.run.id}/reprocess`,
      {
        method: "POST",
        headers: getCsrfHeaders(),
        body: {
          expectedSourceVersion: selectedRunSource.value.version,
          normalizationPrompt: normalizationPromptDraft.value,
        },
      },
    );
    message.value = {
      type: "success",
      text: "Повторная ИИ-обработка сохранённого сырого текста запущена.",
    };
    await refresh();
    await loadRun(result.run.id);
  } catch (requestError) {
    const fetchError = requestError as { data?: { statusMessage?: string } };
    message.value = {
      type: "error",
      text: fetchError.data?.statusMessage ?? "Не удалось запустить повторную ИИ-обработку",
    };
  } finally {
    isReprocessing.value = false;
  }
};

const startCrawl = async (source: UrlKnowledgeSourceResponse): Promise<void> => {
  if (!canEdit.value || runningSourceId.value) return;
  runningSourceId.value = source.id;
  message.value = null;
  try {
    const result = await $fetch<RequestKnowledgeCrawlResponse>(
      `/api/v1/projects/${projectId.value}/knowledge/sources/${source.id}/crawl`,
      { method: "POST", headers: getCsrfHeaders() },
    );
    message.value = { type: "success", text: "Обход сайта поставлен в очередь." };
    await loadRun(result.run.id);
    await refresh();
  } catch (requestError) {
    const fetchError = requestError as { data?: { statusMessage?: string } };
    message.value = {
      type: "error",
      text: fetchError.data?.statusMessage ?? "Не удалось запустить обход",
    };
  } finally {
    runningSourceId.value = null;
  }
};

const setCrawlPaused = async (paused: boolean): Promise<void> => {
  if (!canEdit.value || !selectedRun.value || isChangingPause.value) return;
  isChangingPause.value = true;
  message.value = null;
  try {
    await $fetch(
      `/api/v1/projects/${projectId.value}/knowledge/crawl-runs/${selectedRun.value.run.id}`,
      {
        method: "PATCH",
        headers: getCsrfHeaders(),
        body: { paused },
      },
    );
    message.value = {
      type: "success",
      text: paused ? "Парсинг будет приостановлен после текущей страницы." : "Парсинг продолжен.",
    };
    await Promise.all([loadRun(selectedRun.value.run.id), refresh()]);
  } catch (requestError) {
    const fetchError = requestError as { data?: { statusMessage?: string } };
    message.value = {
      type: "error",
      text: fetchError.data?.statusMessage ?? "Не удалось изменить состояние парсинга",
    };
  } finally {
    isChangingPause.value = false;
  }
};

const stopCrawl = async (): Promise<void> => {
  if (
    !canEdit.value ||
    !selectedRun.value ||
    selectedRun.value.run.status !== "running" ||
    !selectedRun.value.run.paused ||
    isStoppingRun.value
  )
    return;
  isStoppingRun.value = true;
  message.value = null;
  try {
    const run = await $fetch<CrawlRunResponse>(
      `/api/v1/projects/${projectId.value}/knowledge/crawl-runs/${selectedRun.value.run.id}/stop`,
      { method: "POST", headers: getCsrfHeaders() },
    );
    crawlRunConfirmation.value = null;
    message.value = {
      type: "success",
      text: "Остановка запрошена. После завершения worker запуск можно будет удалить.",
    };
    await Promise.all([loadRun(run.id), refresh()]);
  } catch (requestError) {
    const fetchError = requestError as { data?: { statusMessage?: string } };
    message.value = {
      type: "error",
      text: fetchError.data?.statusMessage ?? "Не удалось остановить парсинг",
    };
  } finally {
    isStoppingRun.value = false;
  }
};

const deleteCrawl = async (): Promise<void> => {
  if (
    !canEdit.value ||
    !selectedRun.value ||
    ["queued", "running"].includes(selectedRun.value.run.status) ||
    isDeletingRun.value
  )
    return;
  const runId = selectedRun.value.run.id;
  isDeletingRun.value = true;
  message.value = null;
  try {
    await $fetch<DeleteKnowledgeCrawlResponse>(
      `/api/v1/projects/${projectId.value}/knowledge/crawl-runs/${runId}`,
      { method: "DELETE", headers: getCsrfHeaders() },
    );
    crawlRunConfirmation.value = null;
    selectedRun.value = null;
    promptRunId.value = null;
    selectionRunId.value = null;
    selectedPageIds.value = [];
    selectAllRunPages.value = false;
    message.value = { type: "success", text: "Запуск и его результаты удалены." };
    await refresh();
    if (latestRunId.value) await loadRun(latestRunId.value);
  } catch (requestError) {
    const fetchError = requestError as { data?: { statusMessage?: string } };
    message.value = {
      type: "error",
      text: fetchError.data?.statusMessage ?? "Не удалось удалить парсинг",
    };
  } finally {
    isDeletingRun.value = false;
  }
};

const getErrorCode = (requestError: unknown): string | undefined => {
  const fetchError = requestError as { data?: { code?: string; data?: { code?: string } } };
  return fetchError.data?.data?.code ?? fetchError.data?.code;
};

const executeDestructiveAction = async (): Promise<void> => {
  const action = destructiveAction.value;
  if (!isOwner.value || !action || isManagingData.value) return;
  isManagingData.value = true;
  message.value = null;
  try {
    if (action.kind === "delete_source") {
      const result = await $fetch<DeleteUrlKnowledgeSourceResponse>(
        `/api/v1/projects/${projectId.value}/knowledge/sources/${action.source.id}`,
        {
          method: "DELETE",
          headers: getCsrfHeaders(),
          query: { expectedVersion: action.source.version },
        },
      );
      if (selectedRun.value?.run.sourceId === action.source.id) selectedRun.value = null;
      message.value = {
        type: "success",
        text: `Источник удалён. Сохранено записей БЗ: ${result.preservedDocuments}.`,
      };
    } else {
      const result = await $fetch<ClearKnowledgeDataResponse>(
        `/api/v1/projects/${projectId.value}/knowledge/data`,
        {
          method: "DELETE",
          headers: getCsrfHeaders(),
          body: { scope: action.kind === "clear_sources" ? "sources" : "crawl_history" },
        },
      );
      selectedRun.value = null;
      message.value =
        action.kind === "clear_sources"
          ? {
              type: "success",
              text: `Удалено источников: ${result.deletedSources}; сохранено записей БЗ: ${result.preservedDocuments}.`,
            }
          : {
              type: "success",
              text: `История очищена. Удалено запусков: ${result.deletedCrawlRuns}.`,
            };
    }
    destructiveAction.value = null;
    await refresh();
  } catch (requestError) {
    if (getErrorCode(requestError) === "RECENT_AUTHENTICATION_REQUIRED") {
      reauthenticationVisible.value = true;
      return;
    }
    const fetchError = requestError as { data?: { statusMessage?: string } };
    message.value = {
      type: "error",
      text: fetchError.data?.statusMessage ?? "Не удалось удалить данные источника",
    };
  } finally {
    isManagingData.value = false;
  }
};

const reauthenticate = async (password: string): Promise<void> => {
  if (isReauthenticating.value) return;
  isReauthenticating.value = true;
  try {
    await $fetch<ReauthenticateResponse>("/api/v1/auth/reauthenticate", {
      method: "POST",
      headers: getCsrfHeaders(),
      body: { password },
    });
    reauthenticationVisible.value = false;
    await executeDestructiveAction();
  } catch (requestError) {
    const fetchError = requestError as { data?: { statusMessage?: string } };
    message.value = {
      type: "error",
      text: fetchError.data?.statusMessage ?? "Не удалось подтвердить пароль",
    };
  } finally {
    isReauthenticating.value = false;
  }
};

const requestRunDelete = async (runId: string): Promise<void> => {
  await loadRun(runId);
  crawlRunConfirmation.value = "delete";
};

const retryCrawlPage = async (page: CrawlPageResponse): Promise<void> => {
  if (!canEdit.value || !selectedRun.value || isRetryingPageId.value) return;
  isRetryingPageId.value = page.id;
  message.value = null;
  try {
    const result = await $fetch<RequestKnowledgeCrawlResponse>(
      `/api/v1/projects/${projectId.value}/knowledge/crawl-runs/${selectedRun.value.run.id}/pages/${page.id}/retry`,
      { method: "POST", headers: getCsrfHeaders() },
    );
    message.value = { type: "success", text: "Точечный парсинг страницы поставлен в очередь." };
    await refresh();
    await loadRun(result.run.id);
  } catch (requestError) {
    const fetchError = requestError as { data?: { statusMessage?: string } };
    message.value = {
      type: "error",
      text: fetchError.data?.statusMessage ?? "Не удалось повторно обработать страницу",
    };
  } finally {
    isRetryingPageId.value = null;
  }
};

const retryFailedCrawlPages = async (): Promise<void> => {
  if (
    !canEdit.value ||
    !selectedRun.value ||
    !selectedRun.value.run.failedCount ||
    ["queued", "running"].includes(selectedRun.value.run.status) ||
    isRetryingFailedPages.value
  )
    return;
  isRetryingFailedPages.value = true;
  message.value = null;
  try {
    const result = await $fetch<RequestKnowledgeCrawlResponse>(
      `/api/v1/projects/${projectId.value}/knowledge/crawl-runs/${selectedRun.value.run.id}/retry-failed`,
      { method: "POST", headers: getCsrfHeaders() },
    );
    message.value = {
      type: "success",
      text: "Страницы с ошибками поставлены в отдельную очередь парсинга.",
    };
    await refresh();
    await loadRun(result.run.id);
  } catch (requestError) {
    const fetchError = requestError as { data?: { statusMessage?: string } };
    message.value = {
      type: "error",
      text: fetchError.data?.statusMessage ?? "Не удалось повторить страницы с ошибками",
    };
  } finally {
    isRetryingFailedPages.value = false;
  }
};

const toggleSource = async (source: UrlKnowledgeSourceResponse): Promise<void> => {
  if (!canEdit.value) return;
  message.value = null;
  try {
    await $fetch(`/api/v1/projects/${projectId.value}/knowledge/sources/${source.id}`, {
      method: "PATCH",
      headers: getCsrfHeaders(),
      body: {
        expectedVersion: source.version,
        name: source.name,
        status: source.status === "active" ? "archived" : "active",
        settings: source.settings,
      },
    });
    await refresh();
  } catch (requestError) {
    const fetchError = requestError as { data?: { statusMessage?: string } };
    message.value = {
      type: "error",
      text: fetchError.data?.statusMessage ?? "Не удалось изменить источник",
    };
  }
};

const publishRun = async (): Promise<void> => {
  if (!canEdit.value || !selectedRun.value || isPublishing.value || !selectedPublicationCount.value)
    return;
  isPublishing.value = true;
  message.value = null;
  try {
    const result = await $fetch<PublishCrawlRunResponse>(
      `/api/v1/projects/${projectId.value}/knowledge/crawl-runs/${selectedRun.value.run.id}/publish`,
      {
        method: "POST",
        headers: getCsrfHeaders(),
        body: selectAllRunPages.value
          ? { selection: "all" }
          : { selection: "selected", pageIds: selectedPageIds.value },
      },
    );
    message.value = {
      type: "success",
      text: result.indexJobId
        ? `Опубликовано записей: ${result.publishedCount}. Индексация запущена.`
        : `Опубликовано записей: ${result.publishedCount}. Индексацию можно запустить в базе знаний.`,
    };
    selectAllRunPages.value = false;
    selectedPageIds.value = [];
    await Promise.all([loadRun(result.runId), refresh()]);
  } catch (requestError) {
    const fetchError = requestError as { data?: { statusMessage?: string } };
    message.value = {
      type: "error",
      text: fetchError.data?.statusMessage ?? "Не удалось опубликовать результаты",
    };
  } finally {
    isPublishing.value = false;
  }
};
</script>

<template>
  <main class="page-frame">
    <nav class="button-row page-actions" aria-label="Навигация базы знаний">
      <NuxtLink class="button" :to="`/projects/${projectId}/knowledge/documents`">
        База знаний
      </NuxtLink>
    </nav>

    <div v-if="error" class="empty-state" role="alert">Источники недоступны.</div>

    <template v-else-if="data">
      <section v-if="canEdit" class="panel" aria-labelledby="source-create-title">
        <header class="section-header">
          <div>
            <h2 id="source-create-title" class="section-title">Настроить парсинг сайта</h2>
          </div>
          <p class="section-description">После сохранения автоматически запустится первый обход.</p>
        </header>

        <form class="form-stack source-form" novalidate @submit.prevent="saveSource">
          <fieldset class="crawl-settings">
            <legend class="crawl-settings__legend">Настройки обхода</legend>
            <p class="crawl-settings__description">
              Сначала crawler получает сырой текст выбранных страниц. Затем ИИ удаляет шум,
              определяет тип записи и формирует Markdown для базы знаний.
            </p>
            <div class="form-grid">
              <div class="form-field">
                <div class="form-field__label-row">
                  <label class="form-field__label" for="crawl-start-url">URL сайта</label>
                  <SettingTooltip
                    tooltip-id="crawl-start-url-help"
                    text="Публичный адрес сайта. Он задаёт разрешённый домен; переходы на другие домены и внутренние IP блокируются."
                  />
                </div>
                <input
                  id="crawl-start-url"
                  v-model.trim="form.startUrl"
                  class="form-field__control"
                  type="url"
                  maxlength="2048"
                  placeholder="https://gofroprodpak.ru/"
                  required
                />
              </div>
              <div class="form-field">
                <div class="form-field__label-row">
                  <label class="form-field__label" for="crawl-depth">Глубина структуры</label>
                  <SettingTooltip
                    tooltip-id="crawl-depth-help"
                    text="Сколько уровней URL показать в дереве и обходить по внутренним ссылкам. От 1 до 8."
                  />
                </div>
                <input
                  id="crawl-depth"
                  v-model.number="form.maxDepth"
                  class="form-field__control"
                  type="number"
                  min="1"
                  max="8"
                  required
                />
              </div>
              <div
                v-if="showNormalizationPromptEditor"
                class="form-field form-field--wide prompt-editor crawl-normalization-prompt"
              >
                <div class="form-field__label-row">
                  <label class="form-field__label" for="crawl-normalization-prompt">
                    Промпт ИИ после технического парсинга
                  </label>
                  <SettingTooltip
                    tooltip-id="crawl-normalization-prompt-help"
                    text="Инструкции определяют полноту и очистку записи. Системный запрет выполнять инструкции сайта и придумывать факты изменить нельзя."
                  />
                </div>
                <textarea
                  id="crawl-normalization-prompt"
                  v-model="form.normalizationPrompt"
                  class="form-field__control prompt-editor__textarea"
                  rows="12"
                  minlength="100"
                  maxlength="10000"
                  required
                />
              </div>
              <section class="site-structure" aria-labelledby="site-structure-title">
                <header class="site-structure__header">
                  <div>
                    <div class="form-field__label-row">
                      <h3 id="site-structure-title" class="site-structure__title">
                        Структура сайта
                      </h3>
                      <SettingTooltip
                        tooltip-id="crawl-structure-help"
                        text="Вложенное дерево собирается до заданной глубины из sitemap.xml и навигационных меню главной страницы."
                      />
                    </div>
                    <p class="site-structure__description">
                      Сначала найдём sitemap и меню главной страницы, затем построим вложенное
                      дерево до указанной глубины.
                    </p>
                  </div>
                  <button
                    class="button button--compact"
                    type="button"
                    :disabled="isDiscovering || !form.startUrl"
                    @click="discoverStructure"
                  >
                    {{ isDiscovering ? "Анализируем…" : "Показать структуру" }}
                  </button>
                </header>

                <div v-if="structure" class="site-tree">
                  <div class="site-tree__root">
                    <div>
                      <strong>{{ structure.origin }}</strong>
                      <span class="data-table__secondary"
                        >Источник структуры: {{ structureMethodLabel }}</span
                      >
                    </div>
                    <div v-if="structureNodes.length" class="button-row">
                      <button
                        class="button button--text"
                        type="button"
                        @click="setAllSections(true)"
                      >
                        Выбрать все
                      </button>
                      <button
                        class="button button--text"
                        type="button"
                        @click="setAllSections(false)"
                      >
                        Снять выбор
                      </button>
                    </div>
                  </div>
                  <BaseTreeSelect
                    v-if="structureNodes.length"
                    v-model="selectedStructurePaths"
                    :nodes="structureTree"
                    label="Разделы сайта для парсинга"
                    :initially-expanded-depth="0"
                  />
                  <div v-else class="empty-state">Структура сайта не найдена.</div>
                  <p v-if="structureNodes.length" class="site-tree__summary">
                    Выбрано узлов: {{ normalizedStructurePaths.length }} из
                    {{ structureNodes.length }}.
                  </p>
                </div>
              </section>
            </div>
          </fieldset>
          <div class="form-actions">
            <button
              class="button button--primary"
              type="submit"
              :disabled="isSaving || !structure || !normalizedStructurePaths.length"
            >
              {{ isSaving ? "Проверяем…" : "Сохранить и запустить" }}
            </button>
          </div>
        </form>
      </section>

      <section class="panel" aria-labelledby="configured-sources-title">
        <header class="section-header">
          <div>
            <h2 id="configured-sources-title" class="section-title">Настроенные источники сайта</h2>
          </div>
          <button
            v-if="isOwner"
            class="icon-button icon-button--danger"
            type="button"
            aria-label="Очистить источники"
            title="Очистить источники"
            :disabled="isManagingData || !data.sourceList.sources.length"
            @click="destructiveAction = { kind: 'clear_sources' }"
          >
            <UiIcon name="trash" />
          </button>
        </header>
        <div v-if="!data.sourceList.sources.length" class="empty-state">
          Источники пока не добавлены.
        </div>
        <div v-else class="table-scroll">
          <table class="data-table" aria-label="Настроенные источники сайта">
            <thead>
              <tr>
                <TableSortHeader
                  class="data-table__dynamic-column"
                  label="Источник"
                  column="name"
                  :active-column="sourceSortColumn"
                  :direction="sourceSortDirection"
                  @sort="setSourceSort"
                />
                <TableSortHeader
                  class="data-table__dynamic-column"
                  label="Ограничения"
                  column="limits"
                  :active-column="sourceSortColumn"
                  :direction="sourceSortDirection"
                  @sort="setSourceSort"
                />
                <TableSortHeader
                  label="Последний запуск"
                  column="latestRun"
                  :active-column="sourceSortColumn"
                  :direction="sourceSortDirection"
                  @sort="setSourceSort"
                />
                <th class="data-table__actions-column" scope="col">Действия</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="source in sortedSources" :key="source.id">
                <td class="data-table__dynamic-cell">
                  <div class="data-table__clamp">
                    <strong>{{ source.name }}</strong>
                    <span class="data-table__secondary data-table__nowrap">
                      {{ source.settings.startUrl }}
                    </span>
                  </div>
                </td>
                <td class="data-table__dynamic-cell">
                  <div class="data-table__clamp">
                    {{ source.settings.crawlMode === "full" ? "Полный" : "Быстрый" }} режим ·
                    {{
                      source.settings.includePathPrefixes.length +
                      source.settings.includeExactPaths.length
                    }}
                    разделов · {{ source.settings.maxPages }} стр. · глубина
                    {{ source.settings.maxDepth }} · {{ source.settings.requestDelayMs }} мс
                  </div>
                </td>
                <td>
                  <button
                    v-if="source.latestRun"
                    class="button button--text"
                    type="button"
                    @click="loadRun(source.latestRun.id)"
                  >
                    {{
                      runStatusLabel(
                        source.latestRun.status,
                        source.latestRun.paused,
                        source.latestRun.finishedAt,
                      )
                    }}
                    ·
                    {{ formatDate(source.latestRun.createdAt) }}
                  </button>
                  <span v-else>Не запускался</span>
                </td>
                <td>
                  <div class="table-actions">
                    <button
                      v-if="canEdit && source.status === 'active'"
                      class="icon-button icon-button--compact icon-button--ghost"
                      type="button"
                      :aria-label="
                        runningSourceId === source.id ? 'Запускаем парсинг' : 'Запустить парсинг'
                      "
                      :title="runningSourceId === source.id ? 'Запускаем…' : 'Запустить'"
                      :disabled="Boolean(runningSourceId) || source.latestRun?.status === 'running'"
                      @click="startCrawl(source)"
                    >
                      <UiIcon name="play" />
                    </button>
                    <button
                      v-if="canEdit"
                      class="icon-button icon-button--compact icon-button--ghost"
                      type="button"
                      :aria-label="
                        source.status === 'active'
                          ? 'Переместить источник в архив'
                          : 'Вернуть источник из архива'
                      "
                      :title="
                        ['queued', 'running'].includes(source.latestRun?.status ?? '')
                          ? 'Дождитесь завершения парсинга'
                          : source.status === 'active'
                            ? 'В архив'
                            : 'Вернуть'
                      "
                      :disabled="['queued', 'running'].includes(source.latestRun?.status ?? '')"
                      @click="toggleSource(source)"
                    >
                      <UiIcon :name="source.status === 'active' ? 'archive' : 'restore'" />
                    </button>
                    <button
                      v-if="isOwner"
                      class="icon-button icon-button--compact icon-button--ghost icon-button--danger"
                      type="button"
                      aria-label="Удалить источник"
                      title="Удалить"
                      :disabled="
                        isManagingData ||
                        ['queued', 'running'].includes(source.latestRun?.status ?? '')
                      "
                      @click="destructiveAction = { kind: 'delete_source', source }"
                    >
                      <UiIcon name="trash" />
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="panel" aria-labelledby="crawl-history-title">
        <header class="section-header">
          <div>
            <h2 id="crawl-history-title" class="section-title">История парсинга</h2>
          </div>
          <button
            v-if="isOwner"
            class="icon-button icon-button--danger"
            type="button"
            aria-label="Очистить историю"
            title="Очистить историю"
            :disabled="isManagingData || !data.crawlHistory.runs.length"
            @click="destructiveAction = { kind: 'clear_history' }"
          >
            <UiIcon name="trash" />
          </button>
        </header>
        <div v-if="!data.crawlHistory.runs.length" class="empty-state">
          Запусков парсинга пока нет.
        </div>
        <div v-else class="table-scroll">
          <table class="data-table" aria-label="История запусков парсинга">
            <thead>
              <tr>
                <TableSortHeader
                  class="data-table__dynamic-column"
                  label="Источник"
                  column="source"
                  :active-column="crawlHistorySortColumn"
                  :direction="crawlHistorySortDirection"
                  @sort="setCrawlHistorySort"
                />
                <TableSortHeader
                  label="Запущен"
                  column="createdAt"
                  :active-column="crawlHistorySortColumn"
                  :direction="crawlHistorySortDirection"
                  @sort="setCrawlHistorySort"
                />
                <TableSortHeader
                  label="Статус"
                  column="status"
                  :active-column="crawlHistorySortColumn"
                  :direction="crawlHistorySortDirection"
                  @sort="setCrawlHistorySort"
                />
                <TableSortHeader
                  label="Результат"
                  column="result"
                  :active-column="crawlHistorySortColumn"
                  :direction="crawlHistorySortDirection"
                  @sort="setCrawlHistorySort"
                />
                <th class="data-table__actions-column" scope="col">Действия</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="run in sortedCrawlHistory" :key="run.id">
                <td class="data-table__dynamic-cell">
                  <div class="data-table__clamp">{{ run.sourceName }}</div>
                </td>
                <td>{{ formatDate(run.createdAt) }}</td>
                <td>{{ runStatusLabel(run.status, run.paused, run.finishedAt) }}</td>
                <td>{{ run.succeededCount }} успешно · {{ run.failedCount }} ошибок</td>
                <td>
                  <div class="table-actions">
                    <button
                      class="icon-button icon-button--compact icon-button--ghost"
                      type="button"
                      aria-label="Открыть результат парсинга"
                      title="Открыть"
                      @click="loadRun(run.id)"
                    >
                      <UiIcon name="eye" />
                    </button>
                    <button
                      v-if="canEdit && !['queued', 'running'].includes(run.status)"
                      class="icon-button icon-button--compact icon-button--ghost icon-button--danger"
                      type="button"
                      aria-label="Удалить запуск парсинга"
                      title="Удалить"
                      @click="requestRunDelete(run.id)"
                    >
                      <UiIcon name="trash" />
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-if="selectedRun" class="panel" aria-labelledby="crawl-result-title">
        <header class="section-header">
          <div>
            <h2 id="crawl-result-title" class="section-title">
              {{
                runStatusLabel(
                  selectedRun.run.status,
                  selectedRun.run.paused,
                  selectedRun.run.finishedAt,
                )
              }}
            </h2>
          </div>
          <div v-if="canEdit" class="button-row">
            <button
              v-if="selectedRun.run.status === 'running'"
              class="icon-button"
              type="button"
              :aria-label="
                isChangingPause
                  ? 'Сохраняем состояние парсинга'
                  : selectedRun.run.paused
                    ? 'Продолжить парсинг'
                    : 'Приостановить парсинг'
              "
              :title="
                isChangingPause
                  ? 'Сохраняем…'
                  : selectedRun.run.paused
                    ? 'Продолжить'
                    : 'Приостановить'
              "
              :disabled="isChangingPause"
              @click="setCrawlPaused(!selectedRun.run.paused)"
            >
              <UiIcon :name="selectedRun.run.paused ? 'play' : 'pause'" />
            </button>
            <button
              v-if="selectedRun.run.status === 'running' && selectedRun.run.paused"
              class="icon-button icon-button--danger"
              type="button"
              aria-label="Остановить парсинг"
              title="Остановить"
              :disabled="isStoppingRun || isChangingPause"
              @click="crawlRunConfirmation = 'stop'"
            >
              <UiIcon name="stop" />
            </button>
            <button
              v-if="
                !['queued', 'running'].includes(selectedRun.run.status) &&
                selectedRun.run.failedCount > 0
              "
              class="icon-button"
              type="button"
              :aria-label="
                isRetryingFailedPages
                  ? 'Запускаем повторный парсинг страниц с ошибками'
                  : `Повторить страницы с ошибками: ${selectedRun.run.failedCount}`
              "
              :title="
                isRetryingFailedPages
                  ? 'Запускаем…'
                  : `Повторить ошибки (${selectedRun.run.failedCount})`
              "
              :disabled="isRetryingFailedPages"
              @click="retryFailedCrawlPages"
            >
              <UiIcon name="refresh" />
            </button>
            <button
              v-if="!['queued', 'running'].includes(selectedRun.run.status)"
              class="icon-button icon-button--danger"
              type="button"
              aria-label="Удалить запуск парсинга"
              title="Удалить"
              :disabled="isDeletingRun"
              @click="crawlRunConfirmation = 'delete'"
            >
              <UiIcon name="trash" />
            </button>
            <button
              v-if="
                ['succeeded', 'partial'].includes(selectedRun.run.status) && reviewablePageCount > 0
              "
              class="icon-button"
              type="button"
              :aria-label="`Опубликовать выбранные записи: ${selectedPublicationCount}`"
              :title="`Опубликовать выбранные (${selectedPublicationCount})`"
              :disabled="isPublishing || !selectedPublicationCount"
              @click="publishRun"
            >
              <UiIcon name="publish" />
            </button>
          </div>
        </header>

        <section
          v-if="showNormalizationPromptEditor"
          class="crawl-prompt-editor prompt-editor"
          aria-labelledby="crawl-prompt-editor-title"
        >
          <div class="form-field__label-row">
            <h3 id="crawl-prompt-editor-title" class="form-field__label">Промпт ИИ-обработки</h3>
            <SettingTooltip
              tooltip-id="crawl-reprocess-prompt-help"
              text="Измените инструкции и повторно обработайте сохранённый сырой текст страниц без нового технического обхода сайта."
            />
          </div>
          <textarea
            v-model="normalizationPromptDraft"
            class="form-field__control prompt-editor__textarea"
            rows="12"
            minlength="100"
            maxlength="10000"
            :disabled="!canEdit || isReprocessing"
            aria-label="Промпт повторной ИИ-обработки"
          />
          <div v-if="canEdit" class="form-actions">
            <button
              class="button button--primary"
              type="button"
              :disabled="!canReprocessSelectedRun || isReprocessing"
              @click="reprocessRun"
            >
              {{ isReprocessing ? "Запускаем…" : "Применить и обработать заново" }}
            </button>
          </div>
          <p v-if="!canReprocessSelectedRun" class="form-note">
            Повторная обработка станет доступна для запусков, выполненных после обновления парсера.
          </p>
        </section>

        <div
          v-if="selectedRun.run.status === 'queued' || selectedRun.run.status === 'running'"
          class="task-progress"
        >
          <div class="task-progress__header">
            <strong>{{
              selectedRun.run.paused ? "Парсинг приостановлен" : "Идёт обход сайта"
            }}</strong>
            <span>
              {{ selectedRun.run.processedCount }} из
              {{ selectedRun.run.discoveredCount || "уточняется" }}
            </span>
          </div>
          <progress
            :value="selectedRun.run.processedCount"
            :max="Math.max(selectedRun.run.discoveredCount, 1)"
          >
            {{ selectedRun.run.processedCount }} страниц
          </progress>
        </div>

        <dl class="crawl-summary">
          <div>
            <dt>Обработано</dt>
            <dd>{{ selectedRun.run.processedCount }}</dd>
          </div>
          <div>
            <dt>Новых</dt>
            <dd>{{ selectedRun.run.newCount }}</dd>
          </div>
          <div>
            <dt>Изменённых</dt>
            <dd>{{ selectedRun.run.changedCount }}</dd>
          </div>
          <div>
            <dt>Без изменений</dt>
            <dd>{{ selectedRun.run.unchangedCount }}</dd>
          </div>
          <div>
            <dt>Ошибок</dt>
            <dd>{{ selectedRun.run.failedCount }}</dd>
          </div>
          <div>
            <dt>Подтверждено</dt>
            <dd>{{ selectedRun.run.approvedCount }}</dd>
          </div>
        </dl>
        <p v-if="selectedRun.run.errorCode" class="field-note field-note--error">
          Код ошибки: {{ selectedRun.run.errorCode }}
        </p>
        <p
          v-if="
            ['succeeded', 'partial'].includes(selectedRun.run.status) &&
            selectedRun.run.discoveredCount > selectedRun.run.processedCount
          "
          class="crawl-limit-notice"
        >
          Достигнут защитный лимит: обработано {{ selectedRun.run.processedCount }} из
          {{ selectedRun.run.discoveredCount }} найденных адресов. Для полного результата создайте
          источник с большим лимитом.
        </p>

        <div v-if="reviewablePageCount" class="crawl-bulk-actions">
          <div class="crawl-bulk-actions__controls">
            <label v-if="selectablePages.length" class="crawl-bulk-actions__select-all">
              <input
                type="checkbox"
                :checked="allPagesSelected"
                :indeterminate="somePagesSelected"
                @change="setAllPagesSelected(!allPagesSelected)"
              />
              <span>Все доступные на этой странице</span>
            </label>
            <button
              class="button button--text"
              type="button"
              @click="setAllRunPagesSelected(!selectAllRunPages)"
            >
              {{
                selectAllRunPages
                  ? "Снять общий выбор"
                  : `Выбрать все записи запуска (${reviewablePageCount})`
              }}
            </button>
          </div>
          <span>Выбрано к публикации: {{ selectedPublicationCount }}</span>
        </div>

        <div v-if="!selectedRun.pages.length" class="empty-state">
          Страницы появятся по мере обхода.
        </div>
        <div v-else class="table-scroll">
          <table class="data-table crawl-result__table" aria-label="Записи выбранного обхода">
            <thead>
              <tr>
                <th scope="col" class="crawl-result__selection-column">Выбор</th>
                <TableSortHeader
                  class="data-table__dynamic-column"
                  label="Страница"
                  column="page"
                  :active-column="crawlPageSortColumn"
                  :direction="crawlPageSortDirection"
                  @sort="setCrawlPageSort"
                />
                <TableSortHeader
                  label="Тип"
                  column="type"
                  :active-column="crawlPageSortColumn"
                  :direction="crawlPageSortDirection"
                  @sort="setCrawlPageSort"
                />
                <TableSortHeader
                  label="Изменение"
                  column="change"
                  :active-column="crawlPageSortColumn"
                  :direction="crawlPageSortDirection"
                  @sort="setCrawlPageSort"
                />
                <TableSortHeader
                  label="Точность"
                  column="confidence"
                  :active-column="crawlPageSortColumn"
                  :direction="crawlPageSortDirection"
                  @sort="setCrawlPageSort"
                />
                <TableSortHeader
                  class="data-table__dynamic-column"
                  label="Проверка"
                  column="review"
                  :active-column="crawlPageSortColumn"
                  :direction="crawlPageSortDirection"
                  @sort="setCrawlPageSort"
                />
                <th class="data-table__actions-column" scope="col">Действия</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="page in sortedCrawlPages" :key="page.id">
                <td class="crawl-result__selection-cell">
                  <input
                    type="checkbox"
                    :checked="selectAllRunPages || selectedPageIds.includes(page.id)"
                    :disabled="selectAllRunPages || !isSelectablePage(page)"
                    :aria-label="`Выбрать ${page.title ?? page.normalizedUrl}`"
                    @change="setPageSelected(page.id, !selectedPageIds.includes(page.id))"
                  />
                </td>
                <td class="data-table__dynamic-cell">
                  <div class="data-table__clamp">
                    <strong>{{ page.title ?? page.errorCode ?? "Не извлечено" }}</strong>
                    <span class="data-table__secondary data-table__nowrap">
                      {{ page.normalizedUrl }}
                    </span>
                  </div>
                  <details v-if="page.contentPreview" class="crawl-preview">
                    <summary>Фрагмент</summary>
                    <p>{{ page.contentPreview }}</p>
                  </details>
                </td>
                <td>
                  {{
                    page.documentType === "product"
                      ? "Товар"
                      : page.documentType === "service"
                        ? "Услуга"
                        : page.documentType === "page"
                          ? "Инфо"
                          : "—"
                  }}
                </td>
                <td>{{ changeLabel(page.changeType) }}</td>
                <td>
                  {{ page.confidence === null ? "—" : `${Math.round(page.confidence * 100)}%` }}
                </td>
                <td class="data-table__dynamic-cell">
                  <div class="data-table__clamp">
                    <NuxtLink
                      v-if="page.documentId"
                      class="data-table__link"
                      :to="`/projects/${projectId}/knowledge/documents/${page.documentId}`"
                    >
                      {{ page.reviewStatus === "approved" ? "Опубликовано" : "Открыть запись" }}
                    </NuxtLink>
                    <span v-else>{{ page.errorCode ?? "Пропущено" }}</span>
                    <span v-if="page.status === 'failed'" class="data-table__secondary">
                      Попыток: {{ page.attemptCount }} из 3
                    </span>
                    <span v-if="page.warnings.length" class="data-table__secondary">
                      {{ page.warnings.join(", ") }}
                    </span>
                  </div>
                </td>
                <td>
                  <div class="table-actions">
                    <button
                      v-if="canEdit"
                      class="icon-button icon-button--compact icon-button--ghost"
                      type="button"
                      :aria-label="
                        isRetryingPageId === page.id
                          ? 'Запускаем повторный парсинг страницы'
                          : 'Парсить страницу заново'
                      "
                      :title="isRetryingPageId === page.id ? 'Запускаем…' : 'Парсить заново'"
                      :disabled="
                        ['queued', 'running'].includes(selectedRun.run.status) ||
                        Boolean(isRetryingPageId)
                      "
                      @click="retryCrawlPage(page)"
                    >
                      <UiIcon name="refresh" />
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <nav
          v-if="selectedRun.pagination.totalPages > 1"
          class="crawl-pagination"
          aria-label="Страницы результатов обхода"
        >
          <button
            class="button button--compact"
            type="button"
            :disabled="crawlPage <= 1"
            @click="changeCrawlPage(crawlPage - 1)"
          >
            Назад
          </button>
          <span>
            Страница {{ selectedRun.pagination.page }} из {{ selectedRun.pagination.totalPages }} ·
            записей: {{ selectedRun.pagination.totalItems }}
          </span>
          <button
            class="button button--compact"
            type="button"
            :disabled="crawlPage >= selectedRun.pagination.totalPages"
            @click="changeCrawlPage(crawlPage + 1)"
          >
            Далее
          </button>
        </nav>
      </section>
    </template>

    <ConfirmModal
      v-if="crawlRunConfirmation === 'stop'"
      title="Остановить парсинг?"
      description="Запуск нельзя будет продолжить. Уже обработанные страницы и созданные записи базы знаний сохранятся."
      confirm-label="Остановить"
      pending-label="Останавливаем…"
      :pending="isStoppingRun"
      danger
      @close="crawlRunConfirmation = null"
      @confirm="stopCrawl"
    />

    <ConfirmModal
      v-if="crawlRunConfirmation === 'delete'"
      title="Удалить запуск парсинга?"
      description="Запуск и его постраничные результаты будут удалены. Уже созданные записи базы знаний сохранятся."
      confirm-label="Удалить"
      pending-label="Удаляем…"
      :pending="isDeletingRun"
      danger
      @close="crawlRunConfirmation = null"
      @confirm="deleteCrawl"
    />
    <ConfirmModal
      v-if="destructiveAction && !reauthenticationVisible"
      :title="destructiveConfirmation.title"
      :description="destructiveConfirmation.description"
      :confirm-label="destructiveConfirmation.label"
      pending-label="Удаляем…"
      :pending="isManagingData"
      danger
      @close="destructiveAction = null"
      @confirm="executeDestructiveAction"
    />
    <ReauthenticateModal
      v-if="reauthenticationVisible"
      description="Для удаления источников или истории парсинга подтвердите текущий пароль."
      :pending="isReauthenticating"
      @close="reauthenticationVisible = false"
      @confirm="reauthenticate"
    />
  </main>
</template>

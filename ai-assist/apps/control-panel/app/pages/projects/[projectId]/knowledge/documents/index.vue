<script setup lang="ts">
import type {
  BulkKnowledgeDocumentsResponse,
  ClearKnowledgeDataResponse,
  DeleteKnowledgeProcessingRunResponse,
  DeleteKnowledgeDocumentResponse,
  KnowledgeDocumentDetailResponse,
  KnowledgeDocumentListResponse,
  KnowledgeDocumentSummaryResponse,
  KnowledgeDocumentStatus,
  KnowledgeDocumentType,
  KnowledgeIndexStateResponse,
  KnowledgeProcessingRunResponse,
  KnowledgeProcessingRunHistoryResponse,
  ProjectResponse,
  ReauthenticateResponse,
  RequestKnowledgeProcessingResponse,
  RequestKnowledgeReindexResponse,
} from "@ai-assist/contracts";

const route = useRoute();
const session = useAdminSessionState();
const requestFetch = useRequestFetch();
const projectId = computed(() => String(route.params.projectId));
const { setKnowledgeIndexState } = useKnowledgeIndexState();
const isRequestingIndex = ref(false);
const togglingPublicationDocumentId = ref<string | null>(null);
type DeleteAction =
  | { kind: "document"; document: KnowledgeDocumentSummaryResponse }
  | { kind: "selected"; documentIds: string[] }
  | { kind: "documents" }
  | { kind: "all" };
const deleteAction = ref<DeleteAction | null>(null);
const isDeleting = ref(false);
const reauthenticationVisible = ref(false);
const isReauthenticating = ref(false);
const message = ref<{ type: "success" | "error"; text: string } | null>(null);
useToastMessage(message);
type DocumentPageSize = "10" | "25" | "50" | "100" | "500" | "all";
type DocumentSortColumn = "title" | "type" | "status" | "updatedAt";
const searchQuery = ref("");
const pageSize = ref<DocumentPageSize>("10");
const currentPage = ref(1);
const {
  sortColumn: documentSortColumn,
  sortDirection: documentSortDirection,
  toggleSort: toggleDocumentSort,
} = useTableSort<DocumentSortColumn>("updatedAt", "descending");
const setDocumentSort = (column: string): void => toggleDocumentSort(column as DocumentSortColumn);
type BulkAction = "publish" | "unpublish" | "delete";
const bulkAction = ref<BulkAction>("publish");
const selectedDocumentIds = ref<string[]>([]);
const isApplyingBulkAction = ref(false);
type ProcessingSortColumn = "instruction" | "status" | "progress" | "requestedBy" | "createdAt";
const {
  sortColumn: processingSortColumn,
  sortDirection: processingSortDirection,
  toggleSort: toggleProcessingSort,
} = useTableSort<ProcessingSortColumn>("createdAt", "descending");
const setProcessingSort = (column: string): void =>
  toggleProcessingSort(column as ProcessingSortColumn);
const processingInstruction = useState<string>(
  `knowledge-processing-instruction-${projectId.value}`,
  () => "",
);
const isRequestingProcessing = ref(false);
const controllingProcessingRunId = ref<string | null>(null);
const processingRunToStop = ref<KnowledgeProcessingRunResponse | null>(null);
const processingRunToDelete = ref<KnowledgeProcessingRunResponse | null>(null);
const processingInstructionStorageKey = `ai-assist:knowledge-processing-instruction:${projectId.value}`;
let stopProcessingInstructionPersistence: (() => void) | undefined;

onMounted(() => {
  try {
    if (!processingInstruction.value) {
      processingInstruction.value = (
        window.localStorage.getItem(processingInstructionStorageKey) ?? ""
      ).slice(0, 10_000);
    }
    if (processingInstruction.value) {
      window.localStorage.setItem(
        processingInstructionStorageKey,
        processingInstruction.value.slice(0, 10_000),
      );
    }
  } catch {
    // The editor remains usable when browser storage is restricted or full.
  }
  stopProcessingInstructionPersistence = watch(
    processingInstruction,
    (value) => {
      try {
        if (value)
          window.localStorage.setItem(processingInstructionStorageKey, value.slice(0, 10_000));
        else window.localStorage.removeItem(processingInstructionStorageKey);
      } catch {
        // In-memory Nuxt state still preserves the draft during application navigation.
      }
    },
    { flush: "sync" },
  );
});
const bulkActionOptions = [
  { value: "publish", label: "Опубликовать" },
  { value: "unpublish", label: "Снять с публикации" },
  { value: "delete", label: "Удалить" },
] as const;
const pageSizeOptions = [
  { value: "10", label: "10" },
  { value: "25", label: "25" },
  { value: "50", label: "50" },
  { value: "100", label: "100" },
  { value: "500", label: "500" },
  { value: "all", label: "Показать все" },
] as const;

const { data, error, refresh } = await useAsyncData(
  () => `project-knowledge-${projectId.value}`,
  async () => {
    const [project, documentList, indexState, processingHistory] = await Promise.all([
      requestFetch<ProjectResponse>(`/api/v1/projects/${projectId.value}`),
      requestFetch<KnowledgeDocumentListResponse>(
        `/api/v1/projects/${projectId.value}/knowledge/documents`,
      ),
      requestFetch<KnowledgeIndexStateResponse>(`/api/v1/projects/${projectId.value}/knowledge`),
      requestFetch<KnowledgeProcessingRunHistoryResponse>(
        `/api/v1/projects/${projectId.value}/knowledge/processing-runs`,
      ),
    ]);
    return { project, documentList, indexState, processingHistory };
  },
);

const processingRuns = computed(() => data.value?.processingHistory.runs ?? []);
const activeProcessingRun = computed(
  () =>
    processingRuns.value.find(
      (run) =>
        run.status === "queued" ||
        run.status === "running" ||
        (run.status === "cancelled" && !run.finishedAt),
    ) ?? null,
);
const latestProcessingRun = computed(() => processingRuns.value[0] ?? null);
const pendingIndex = computed(() => {
  const latest = data.value?.indexState.latest;
  return latest && (latest.status === "queued" || latest.status === "building") ? latest : null;
});
const indexTaskLabel = computed(() => {
  if (isRequestingIndex.value && !pendingIndex.value) return "Создаём задачу переиндексации";
  return pendingIndex.value?.status === "building"
    ? "Переиндексация выполняется"
    : "Переиндексация ожидает запуска";
});
const indexTaskDetails = computed(() => {
  const index = pendingIndex.value;
  if (!index || index.status === "queued" || index.chunkCount === 0) {
    return "Подготавливаем данные";
  }
  return `${index.documentCount} документов · ${index.chunkCount} фрагментов`;
});
const sortedProcessingRuns = computed(() =>
  sortTableRows(processingRuns.value, processingSortDirection.value, (run) => {
    switch (processingSortColumn.value) {
      case "instruction":
        return run.instruction;
      case "status":
        return processingStatusLabel(run.status, run.paused, run.finishedAt);
      case "progress":
        return run.totalCount ? run.processedCount / run.totalCount : 0;
      case "requestedBy":
        return run.requestedByEmail ?? "";
      case "createdAt":
        return Date.parse(run.createdAt);
    }
  }),
);

let indexPollTimer: ReturnType<typeof setTimeout> | undefined;
watch(
  () => [
    data.value?.indexState.latest?.status,
    activeProcessingRun.value?.status,
    activeProcessingRun.value?.finishedAt,
  ],
  ([indexStatus, processingStatus, processingFinishedAt]) => {
    if (!import.meta.client) return;
    if (indexPollTimer) clearTimeout(indexPollTimer);
    if (
      indexStatus === "queued" ||
      indexStatus === "building" ||
      processingStatus === "queued" ||
      processingStatus === "running" ||
      (processingStatus === "cancelled" && !processingFinishedAt)
    ) {
      indexPollTimer = setTimeout(() => void refresh(), 1_500);
    }
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  if (indexPollTimer) clearTimeout(indexPollTimer);
  stopProcessingInstructionPersistence?.();
});

const role = computed(
  () =>
    session.value?.projects.find((project) => project.id === projectId.value)?.role ??
    data.value?.project.role,
);
const canEdit = computed(() => role.value === "owner" || role.value === "editor");
const isOwner = computed(() => role.value === "owner");

const deleteConfirmation = computed(() => {
  if (deleteAction.value?.kind === "document") {
    return {
      title: "Удалить запись базы знаний?",
      description: `Запись «${deleteAction.value.document.title}», все её версии и публикации будут удалены без возможности восстановления.`,
      label: "Удалить запись",
    };
  }
  if (deleteAction.value?.kind === "selected") {
    return {
      title: "Удалить выбранные записи?",
      description: `Будут удалены выбранные записи (${deleteAction.value.documentIds.length}), все их версии и публикации без возможности восстановления.`,
      label: "Удалить выбранные",
    };
  }
  if (deleteAction.value?.kind === "all") {
    return {
      title: "Очистить базу знаний и историю парсинга?",
      description:
        "Будут удалены все записи БЗ, версии, публикации, индексы, запуски парсинга, источники сайта и их настройки.",
      label: "Очистить всё",
    };
  }
  return {
    title: "Очистить базу знаний?",
    description:
      "Будут удалены все записи, версии, публикации, фрагменты и векторные индексы. История парсинга сохранится.",
    label: "Очистить записи",
  };
});

const getErrorCode = (requestError: unknown): string | undefined => {
  const fetchError = requestError as { data?: { code?: string; data?: { code?: string } } };
  return fetchError.data?.data?.code ?? fetchError.data?.code;
};

const executeDeleteAction = async (): Promise<void> => {
  const action = deleteAction.value;
  if (!action || isDeleting.value) return;
  isDeleting.value = true;
  message.value = null;
  try {
    if (action.kind === "document") {
      await $fetch<DeleteKnowledgeDocumentResponse>(
        `/api/v1/projects/${projectId.value}/knowledge/documents/${action.document.id}`,
        {
          method: "DELETE",
          headers: getCsrfHeaders(),
          query: { expectedVersion: action.document.version },
        },
      );
      message.value = { type: "success", text: "Запись базы знаний удалена." };
    } else if (action.kind === "selected") {
      const result = await $fetch<BulkKnowledgeDocumentsResponse>(
        `/api/v1/projects/${projectId.value}/knowledge/documents/bulk`,
        {
          method: "POST",
          headers: getCsrfHeaders(),
          body: { action: "delete", documentIds: action.documentIds },
        },
      );
      selectedDocumentIds.value = [];
      message.value = {
        type: "success",
        text: `Удалено записей: ${result.processedCount}.`,
      };
    } else {
      const result = await $fetch<ClearKnowledgeDataResponse>(
        `/api/v1/projects/${projectId.value}/knowledge/data`,
        {
          method: "DELETE",
          headers: getCsrfHeaders(),
          body: { scope: action.kind === "all" ? "all" : "documents" },
        },
      );
      message.value = {
        type: "success",
        text:
          action.kind === "all"
            ? `Удалено записей: ${result.deletedDocuments}; запусков: ${result.deletedCrawlRuns}; источников: ${result.deletedSources}.`
            : `Удалено записей: ${result.deletedDocuments}.`,
      };
    }
    deleteAction.value = null;
    await refresh();
  } catch (requestError) {
    if (getErrorCode(requestError) === "RECENT_AUTHENTICATION_REQUIRED") {
      reauthenticationVisible.value = true;
      return;
    }
    const fetchError = requestError as { data?: { statusMessage?: string } };
    message.value = {
      type: "error",
      text: fetchError.data?.statusMessage ?? "Не удалось удалить данные",
    };
  } finally {
    isDeleting.value = false;
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
    await executeDeleteAction();
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

watch(
  () => data.value?.indexState,
  (indexState) => {
    if (indexState) setKnowledgeIndexState(projectId.value, indexState);
  },
  { immediate: true },
);

const statusLabel = (status: KnowledgeDocumentStatus): string =>
  ({ draft: "Не опубликован", published: "Опубликован", archived: "Архив" })[status];

const typeLabel = (type: KnowledgeDocumentType): string =>
  ({ page: "Инфо", manual: "Инфо", product: "Товар", service: "Услуга" })[type];

const filteredDocuments = computed(() => {
  const documents = data.value?.documentList.documents ?? [];
  const query = searchQuery.value.trim().toLocaleLowerCase("ru-RU");
  if (!query) return documents;
  return documents.filter((document) =>
    [document.title, typeLabel(document.type), statusLabel(document.status)].some((value) =>
      value.toLocaleLowerCase("ru-RU").includes(query),
    ),
  );
});
const sortedDocuments = computed(() =>
  sortTableRows(filteredDocuments.value, documentSortDirection.value, (document) => {
    switch (documentSortColumn.value) {
      case "title":
        return document.title;
      case "type":
        return typeLabel(document.type);
      case "status":
        return statusLabel(document.status);
      case "updatedAt":
        return Date.parse(document.updatedAt);
    }
  }),
);
const effectivePageSize = computed(() =>
  pageSize.value === "all" ? Math.max(filteredDocuments.value.length, 1) : Number(pageSize.value),
);
const totalPages = computed(() =>
  Math.max(1, Math.ceil(filteredDocuments.value.length / effectivePageSize.value)),
);
const paginatedDocuments = computed(() => {
  const start = (currentPage.value - 1) * effectivePageSize.value;
  return sortedDocuments.value.slice(start, start + effectivePageSize.value);
});
const selectedDocumentCount = computed(() => selectedDocumentIds.value.length);
const allFilteredDocumentsSelected = computed(
  () =>
    filteredDocuments.value.length > 0 &&
    filteredDocuments.value.every((document) => selectedDocumentIds.value.includes(document.id)),
);
const someFilteredDocumentsSelected = computed(
  () =>
    !allFilteredDocumentsSelected.value &&
    filteredDocuments.value.some((document) => selectedDocumentIds.value.includes(document.id)),
);
const paginationItems = computed(() => getPaginationItems(currentPage.value, totalPages.value));
const firstVisibleRecord = computed(() =>
  filteredDocuments.value.length ? (currentPage.value - 1) * effectivePageSize.value + 1 : 0,
);
const lastVisibleRecord = computed(() =>
  Math.min(currentPage.value * effectivePageSize.value, filteredDocuments.value.length),
);

watch([searchQuery, pageSize, projectId], () => {
  currentPage.value = 1;
});
watch([documentSortColumn, documentSortDirection], () => {
  currentPage.value = 1;
});
watch(totalPages, (pageCount) => {
  if (currentPage.value > pageCount) currentPage.value = pageCount;
});
watch(
  () => data.value?.documentList.documents,
  (documents) => {
    const availableIds = new Set((documents ?? []).map((document) => document.id));
    selectedDocumentIds.value = selectedDocumentIds.value.filter((id) => availableIds.has(id));
  },
);

const goToPage = (page: number): void => {
  currentPage.value = Math.min(Math.max(page, 1), totalPages.value);
};

const setDocumentSelected = (documentId: string, selected: boolean): void => {
  selectedDocumentIds.value = selected
    ? [...new Set([...selectedDocumentIds.value, documentId])]
    : selectedDocumentIds.value.filter((id) => id !== documentId);
};

const setAllFilteredDocumentsSelected = (selected: boolean): void => {
  const filteredIds = new Set(filteredDocuments.value.map((document) => document.id));
  selectedDocumentIds.value = selected
    ? [...new Set([...selectedDocumentIds.value, ...filteredIds])]
    : selectedDocumentIds.value.filter((id) => !filteredIds.has(id));
};

const notifyUploadUnavailable = (): void => {
  message.value = {
    type: "error",
    text: "Безопасная загрузка файлов пока не подключена.",
  };
};

const formatDate = (value: string): string =>
  new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

const indexStatusLabel = (status: string): string =>
  ({
    queued: "В очереди",
    building: "Выполняется",
    active: "Завершено",
    superseded: "Заменён",
    failed: "Ошибка",
  })[status] ?? status;

const processingStatusLabel = (
  status: string,
  paused = false,
  finishedAt: string | null = null,
): string =>
  status === "cancelled"
    ? finishedAt
      ? "Остановлено"
      : "Останавливается"
    : paused
      ? "Приостановлено"
      : ({
          queued: "В очереди",
          running: "Обрабатывается",
          succeeded: "Завершено",
          partial: "Завершено с ошибками",
          failed: "Ошибка",
        }[status] ?? status);

const replaceProcessingRun = (updated: KnowledgeProcessingRunResponse): void => {
  if (!data.value) return;
  const runs = data.value.processingHistory.runs;
  const index = runs.findIndex((run) => run.id === updated.id);
  data.value.processingHistory.runs =
    index < 0 ? [updated, ...runs] : runs.map((run) => (run.id === updated.id ? updated : run));
};

const controlProcessingRun = async (
  run: KnowledgeProcessingRunResponse,
  paused: boolean,
): Promise<void> => {
  if (!canEdit.value || controllingProcessingRunId.value) return;
  controllingProcessingRunId.value = run.id;
  message.value = null;
  try {
    const updated = await $fetch<KnowledgeProcessingRunResponse>(
      `/api/v1/projects/${projectId.value}/knowledge/processing-runs/${run.id}`,
      {
        method: "PATCH",
        headers: getCsrfHeaders(),
        body: { paused },
      },
    );
    replaceProcessingRun(updated);
    message.value = {
      type: "success",
      text: paused ? "Постобработка приостановлена." : "Постобработка продолжена.",
    };
  } catch (requestError) {
    const fetchError = requestError as { data?: { statusMessage?: string } };
    message.value = {
      type: "error",
      text: fetchError.data?.statusMessage ?? "Не удалось изменить состояние постобработки",
    };
    await refresh();
  } finally {
    controllingProcessingRunId.value = null;
  }
};

const stopProcessingRun = async (run: KnowledgeProcessingRunResponse): Promise<void> => {
  if (!canEdit.value || controllingProcessingRunId.value) return;
  controllingProcessingRunId.value = run.id;
  message.value = null;
  try {
    const updated = await $fetch<KnowledgeProcessingRunResponse>(
      `/api/v1/projects/${projectId.value}/knowledge/processing-runs/${run.id}/stop`,
      { method: "POST", headers: getCsrfHeaders() },
    );
    replaceProcessingRun(updated);
    processingRunToStop.value = null;
    message.value = {
      type: "success",
      text: "Остановка запрошена. Выполняющиеся запросы завершатся безопасно.",
    };
  } catch (requestError) {
    const fetchError = requestError as { data?: { statusMessage?: string } };
    message.value = {
      type: "error",
      text: fetchError.data?.statusMessage ?? "Не удалось остановить постобработку",
    };
    await refresh();
  } finally {
    controllingProcessingRunId.value = null;
  }
};

const deleteProcessingRun = async (): Promise<void> => {
  const run = processingRunToDelete.value;
  if (!run || !canEdit.value || controllingProcessingRunId.value) return;
  controllingProcessingRunId.value = run.id;
  message.value = null;
  try {
    await $fetch<DeleteKnowledgeProcessingRunResponse>(
      `/api/v1/projects/${projectId.value}/knowledge/processing-runs/${run.id}`,
      { method: "DELETE", headers: getCsrfHeaders() },
    );
    if (data.value) {
      data.value.processingHistory.runs = data.value.processingHistory.runs.filter(
        (historyRun) => historyRun.id !== run.id,
      );
    }
    processingRunToDelete.value = null;
    message.value = { type: "success", text: "Запуск постобработки удалён из истории." };
  } catch (requestError) {
    const fetchError = requestError as { data?: { statusMessage?: string } };
    message.value = {
      type: "error",
      text: fetchError.data?.statusMessage ?? "Не удалось удалить запуск постобработки",
    };
    await refresh();
  } finally {
    controllingProcessingRunId.value = null;
  }
};

const retryFailedProcessingRun = async (run: KnowledgeProcessingRunResponse): Promise<void> => {
  if (
    !canEdit.value ||
    controllingProcessingRunId.value ||
    activeProcessingRun.value ||
    run.failedCount === 0 ||
    !["partial", "failed"].includes(run.status)
  )
    return;
  controllingProcessingRunId.value = run.id;
  message.value = null;
  try {
    const result = await $fetch<RequestKnowledgeProcessingResponse>(
      `/api/v1/projects/${projectId.value}/knowledge/processing-runs/${run.id}/retry-failed`,
      { method: "POST", headers: getCsrfHeaders() },
    );
    replaceProcessingRun(result.run);
    message.value = {
      type: "success",
      text: `Ошибочные записи поставлены в очередь: ${result.run.totalCount}.`,
    };
    await refresh();
  } catch (requestError) {
    const fetchError = requestError as { data?: { statusMessage?: string; message?: string } };
    message.value = {
      type: "error",
      text:
        fetchError.data?.statusMessage ??
        fetchError.data?.message ??
        "Не удалось повторить обработку ошибочных записей",
    };
    await refresh();
  } finally {
    controllingProcessingRunId.value = null;
  }
};

const applyBulkAction = async (): Promise<void> => {
  if (!canEdit.value || !selectedDocumentIds.value.length || isApplyingBulkAction.value) return;
  if (bulkAction.value === "delete") {
    deleteAction.value = { kind: "selected", documentIds: [...selectedDocumentIds.value] };
    return;
  }
  isApplyingBulkAction.value = true;
  message.value = null;
  try {
    const result = await $fetch<BulkKnowledgeDocumentsResponse>(
      `/api/v1/projects/${projectId.value}/knowledge/documents/bulk`,
      {
        method: "POST",
        headers: getCsrfHeaders(),
        body: { action: bulkAction.value, documentIds: selectedDocumentIds.value },
      },
    );
    message.value = {
      type: "success",
      text: `${bulkAction.value === "publish" ? "Опубликовано" : "Снято с публикации"}: ${result.processedCount}. Пропущено: ${result.skippedCount}.`,
    };
    selectedDocumentIds.value = [];
    await refresh();
  } catch (requestError) {
    const fetchError = requestError as { data?: { statusMessage?: string } };
    message.value = {
      type: "error",
      text: fetchError.data?.statusMessage ?? "Не удалось выполнить массовое действие",
    };
  } finally {
    isApplyingBulkAction.value = false;
  }
};

const requestKnowledgeProcessing = async (): Promise<void> => {
  const instruction = processingInstruction.value.trim();
  if (!canEdit.value || instruction.length < 20 || isRequestingProcessing.value) return;
  isRequestingProcessing.value = true;
  message.value = null;
  try {
    const result = await $fetch<RequestKnowledgeProcessingResponse>(
      `/api/v1/projects/${projectId.value}/knowledge/processing-runs`,
      {
        method: "POST",
        headers: getCsrfHeaders(),
        body: {
          instruction,
          selection: selectedDocumentIds.value.length
            ? { scope: "selected", documentIds: selectedDocumentIds.value }
            : { scope: "all" },
        },
      },
    );
    replaceProcessingRun(result.run);
    message.value = {
      type: "success",
      text: `Массовая обработка поставлена в очередь: ${result.run.totalCount} записей.`,
    };
    processingInstruction.value = "";
  } catch (requestError) {
    const fetchError = requestError as { data?: { statusMessage?: string; message?: string } };
    message.value = {
      type: "error",
      text:
        fetchError.data?.statusMessage ??
        fetchError.data?.message ??
        "Не удалось запустить массовую обработку",
    };
    await refresh();
  } finally {
    isRequestingProcessing.value = false;
  }
};

const requestReindex = async (): Promise<void> => {
  if (!canEdit.value || isRequestingIndex.value) return;
  isRequestingIndex.value = true;
  message.value = null;
  try {
    const result = await $fetch<RequestKnowledgeReindexResponse>(
      `/api/v1/projects/${projectId.value}/knowledge/reindex`,
      {
        method: "POST",
        headers: getCsrfHeaders(),
      },
    );
    if (data.value) {
      data.value.indexState.latest = result.index;
      setKnowledgeIndexState(projectId.value, data.value.indexState);
    }
    message.value = { type: "success", text: "Переиндексация поставлена в очередь." };
    await refresh();
  } catch (requestError) {
    const fetchError = requestError as { data?: { statusMessage?: string } };
    message.value = {
      type: "error",
      text: fetchError.data?.statusMessage ?? "Не удалось запустить переиндексацию",
    };
    await refresh();
  } finally {
    isRequestingIndex.value = false;
  }
};

const togglePublication = async (document: KnowledgeDocumentSummaryResponse): Promise<void> => {
  if (!canEdit.value || document.status === "archived" || togglingPublicationDocumentId.value)
    return;
  togglingPublicationDocumentId.value = document.id;
  message.value = null;
  try {
    if (document.status === "published") {
      await $fetch<KnowledgeDocumentDetailResponse>(
        `/api/v1/projects/${projectId.value}/knowledge/documents/${document.id}/unpublish`,
        {
          method: "POST",
          headers: getCsrfHeaders(),
          body: { expectedVersion: document.version },
        },
      );
      message.value = { type: "success", text: "Запись снята с публикации." };
    } else {
      const detail = await $fetch<KnowledgeDocumentDetailResponse>(
        `/api/v1/projects/${projectId.value}/knowledge/documents/${document.id}`,
      );
      const latestVersion = detail.versions[0];
      if (!latestVersion) throw new Error("Knowledge document has no versions");
      await $fetch<KnowledgeDocumentDetailResponse>(
        `/api/v1/projects/${projectId.value}/knowledge/documents/${document.id}/publish`,
        {
          method: "POST",
          headers: getCsrfHeaders(),
          body: {
            expectedVersion: detail.document.version,
            versionId: latestVersion.id,
          },
        },
      );
      message.value = { type: "success", text: "Запись опубликована." };
    }
    await refresh();
  } catch (requestError) {
    const fetchError = requestError as { data?: { statusMessage?: string } };
    message.value = {
      type: "error",
      text: fetchError.data?.statusMessage ?? "Не удалось изменить публикацию записи",
    };
    await refresh();
  } finally {
    togglingPublicationDocumentId.value = null;
  }
};
</script>

<template>
  <main class="page-frame">
    <div class="button-row page-actions" aria-label="Действия базы знаний">
      <NuxtLink class="button" :to="`/projects/${projectId}/knowledge/sources`">
        Парсинг данных
      </NuxtLink>
      <button v-if="canEdit" class="button" type="button" @click="notifyUploadUnavailable">
        Загрузить документ
      </button>
      <NuxtLink
        v-if="canEdit"
        class="button button--primary"
        :to="`/projects/${projectId}/knowledge/documents/new`"
      >
        Создать запись
      </NuxtLink>
      <button
        v-if="isOwner"
        class="button button--danger"
        type="button"
        :disabled="isDeleting"
        @click="deleteAction = { kind: 'documents' }"
      >
        Очистить записи
      </button>
      <button
        v-if="isOwner"
        class="button button--danger"
        type="button"
        :disabled="isDeleting"
        @click="deleteAction = { kind: 'all' }"
      >
        Очистить всё
      </button>
    </div>

    <div v-if="error" class="empty-state" role="alert">База знаний недоступна.</div>

    <template v-else-if="data">
      <div class="split-layout">
        <div class="panel-stack">
          <section class="panel" aria-labelledby="knowledge-index-title">
            <header class="section-header">
              <div>
                <h2 id="knowledge-index-title" class="section-title">Векторный индекс</h2>
              </div>
              <button
                v-if="canEdit"
                class="icon-button"
                type="button"
                :aria-label="isRequestingIndex ? 'Запускаем переиндексацию' : 'Переиндексировать'"
                :title="isRequestingIndex ? 'Запускаем…' : 'Переиндексировать'"
                :disabled="
                  isRequestingIndex ||
                  data.indexState.latest?.status === 'queued' ||
                  data.indexState.latest?.status === 'building'
                "
                @click="requestReindex"
              >
                <UiIcon name="refresh" />
              </button>
            </header>

            <div
              v-if="isRequestingIndex || pendingIndex"
              class="task-progress"
              role="status"
              aria-live="polite"
            >
              <div class="task-progress__header">
                <strong>{{ indexTaskLabel }}</strong>
                <span>{{ indexTaskDetails }}</span>
              </div>
              <progress :aria-label="indexTaskLabel">Выполняется переиндексация</progress>
            </div>

            <dl class="settings-summary">
              <div>
                <dt>Модель векторизации (Embedding model)</dt>
                <dd>{{ data.indexState.configuredEmbeddingModelId ?? "Не выбрана" }}</dd>
              </div>
              <div>
                <dt>Последний запуск</dt>
                <dd>
                  <span
                    v-if="data.indexState.latest"
                    class="status-badge status-badge--compact"
                    :data-status="data.indexState.latest.status"
                  >
                    {{ indexStatusLabel(data.indexState.latest.status) }}
                  </span>
                  <span v-else>Ещё не запускался</span>
                </dd>
              </div>
              <div>
                <dt>Опубликовано</dt>
                <dd>
                  {{ data.indexState.publishedDocumentCount }} документов ·
                  {{ data.indexState.publishedChunkCount }} фрагментов
                </dd>
              </div>
              <div>
                <dt>Состояние</dt>
                <dd>
                  {{
                    data.indexState.active
                      ? data.indexState.stale
                        ? "Нужна переиндексация"
                        : `Актуален · ${data.indexState.active.embeddingDimension} измерений`
                      : "Активного индекса нет — используется текстовый поиск"
                  }}
                </dd>
              </div>
            </dl>
            <p v-if="data.indexState.latest?.errorCode" class="field-note field-note--error">
              Код последней ошибки: {{ data.indexState.latest.errorCode }}. Действующий индекс и
              текстовый поиск продолжили работать.
            </p>
          </section>

          <section class="panel" aria-label="Документы базы знаний">
            <div class="table-controls">
              <input
                v-model="searchQuery"
                class="form-field__control table-controls__search"
                type="search"
                placeholder="Быстрый поиск"
                aria-label="Быстрый поиск по записям"
              />
              <div class="table-controls__limit">
                <span>Показывать</span>
                <BaseSelect
                  v-model="pageSize"
                  :options="pageSizeOptions"
                  label="Количество записей на странице"
                  variant="compact"
                  width="content"
                />
              </div>
            </div>
            <div v-if="canEdit && data.documentList.documents.length" class="table-controls">
              <div class="table-controls__bulk">
                <BaseSelect
                  v-model="bulkAction"
                  :options="bulkActionOptions"
                  label="Действие с выбранными записями"
                  variant="compact"
                  width="content"
                />
                <button
                  class="button button--compact"
                  type="button"
                  :disabled="!selectedDocumentCount || isApplyingBulkAction || isDeleting"
                  @click="applyBulkAction"
                >
                  {{ isApplyingBulkAction ? "Выполняем…" : "Применить" }}
                </button>
              </div>
              <span class="pagination__summary">Выбрано: {{ selectedDocumentCount }}</span>
            </div>

            <div v-if="!data.documentList.documents.length" class="empty-state">
              База знаний пока пуста. Создайте первую запись.
            </div>
            <div v-else-if="!filteredDocuments.length" class="empty-state">
              По вашему запросу ничего не найдено.
            </div>
            <div v-else class="table-scroll">
              <table class="data-table" aria-label="Документы базы знаний">
                <thead>
                  <tr>
                    <th v-if="canEdit" class="data-table__selection-column" scope="col">
                      <input
                        type="checkbox"
                        :checked="allFilteredDocumentsSelected"
                        :indeterminate="someFilteredDocumentsSelected"
                        aria-label="Выбрать все найденные записи"
                        @change="setAllFilteredDocumentsSelected(!allFilteredDocumentsSelected)"
                      />
                    </th>
                    <TableSortHeader
                      class="data-table__dynamic-column"
                      label="Название"
                      column="title"
                      :active-column="documentSortColumn"
                      :direction="documentSortDirection"
                      @sort="setDocumentSort"
                    />
                    <TableSortHeader
                      class="data-table__compact-column"
                      label="Тип"
                      column="type"
                      :active-column="documentSortColumn"
                      :direction="documentSortDirection"
                      @sort="setDocumentSort"
                    />
                    <TableSortHeader
                      class="data-table__status-column"
                      label="Статус"
                      column="status"
                      :active-column="documentSortColumn"
                      :direction="documentSortDirection"
                      @sort="setDocumentSort"
                    />
                    <TableSortHeader
                      class="data-table__date-column"
                      label="Обновлён"
                      column="updatedAt"
                      :active-column="documentSortColumn"
                      :direction="documentSortDirection"
                      @sort="setDocumentSort"
                    />
                    <th class="data-table__actions-column" scope="col">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="document in paginatedDocuments" :key="document.id">
                    <td v-if="canEdit" class="data-table__selection-cell">
                      <input
                        type="checkbox"
                        :checked="selectedDocumentIds.includes(document.id)"
                        :aria-label="`Выбрать запись ${document.title}`"
                        @change="
                          setDocumentSelected(
                            document.id,
                            !selectedDocumentIds.includes(document.id),
                          )
                        "
                      />
                    </td>
                    <td class="data-table__dynamic-cell">
                      <div class="data-table__clamp">
                        <strong>{{ document.title }}</strong>
                      </div>
                    </td>
                    <td>{{ typeLabel(document.type) }}</td>
                    <td>
                      <span
                        class="status-badge status-badge--compact"
                        :data-status="document.status"
                      >
                        {{ statusLabel(document.status) }}
                      </span>
                      <span
                        v-if="
                          document.status === 'published' &&
                          document.activeVersionNo !== document.latestVersionNo
                        "
                        class="data-table__secondary"
                      >
                        Есть неопубликованные изменения
                      </span>
                    </td>
                    <td>
                      <time :datetime="document.updatedAt">{{
                        formatDate(document.updatedAt)
                      }}</time>
                    </td>
                    <td>
                      <div class="table-actions">
                        <NuxtLink
                          class="icon-button icon-button--compact icon-button--ghost"
                          :to="`/projects/${projectId}/knowledge/documents/${document.id}`"
                          aria-label="Смотреть запись"
                          title="Смотреть"
                        >
                          <UiIcon name="eye" />
                        </NuxtLink>
                        <button
                          class="icon-button icon-button--compact icon-button--ghost"
                          type="button"
                          :aria-label="
                            document.status === 'published'
                              ? 'Снять запись с публикации'
                              : 'Опубликовать запись'
                          "
                          :title="
                            document.status === 'archived'
                              ? 'Архивную запись нельзя опубликовать'
                              : document.status === 'published'
                                ? 'Снять с публикации'
                                : 'Опубликовать'
                          "
                          :disabled="
                            !canEdit ||
                            document.status === 'archived' ||
                            Boolean(togglingPublicationDocumentId)
                          "
                          @click="togglePublication(document)"
                        >
                          <UiIcon
                            :name="document.status === 'published' ? 'unpublish' : 'publish'"
                          />
                        </button>
                        <button
                          class="icon-button icon-button--compact icon-button--ghost icon-button--danger"
                          type="button"
                          aria-label="Удалить запись"
                          title="Удалить"
                          :disabled="!canEdit || isDeleting"
                          @click="deleteAction = { kind: 'document', document }"
                        >
                          <UiIcon name="trash" />
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div v-if="filteredDocuments.length" class="pagination">
              <span class="pagination__summary">
                Записи {{ firstVisibleRecord }}–{{ lastVisibleRecord }} из
                {{ filteredDocuments.length }} · Страница {{ currentPage }} из {{ totalPages }}
              </span>
              <nav class="pagination__actions" aria-label="Навигация по страницам записей">
                <button
                  class="button button--compact"
                  type="button"
                  :disabled="currentPage === 1"
                  @click="goToPage(currentPage - 1)"
                >
                  Предыдущая
                </button>
                <template v-for="(item, index) in paginationItems" :key="`${item}-${index}`">
                  <span v-if="item === 'ellipsis'" class="pagination__ellipsis" aria-hidden="true">
                    …
                  </span>
                  <button
                    v-else
                    class="button button--compact pagination__page"
                    :class="{ 'button--primary': item === currentPage }"
                    type="button"
                    :aria-current="item === currentPage ? 'page' : undefined"
                    :aria-label="`Страница ${item}`"
                    @click="goToPage(item)"
                  >
                    {{ item }}
                  </button>
                </template>
                <button
                  class="button button--compact"
                  type="button"
                  :disabled="currentPage === totalPages"
                  @click="goToPage(currentPage + 1)"
                >
                  Следующая
                </button>
              </nav>
            </div>
          </section>
        </div>

        <aside class="panel-stack" aria-label="Массовая обработка базы знаний">
          <section class="panel" aria-labelledby="knowledge-processing-title">
            <header class="section-header">
              <div>
                <h2 id="knowledge-processing-title" class="section-title">Постобработка записей</h2>
              </div>
              <div v-if="canEdit && activeProcessingRun" class="table-actions">
                <button
                  class="icon-button icon-button--compact icon-button--ghost"
                  type="button"
                  :aria-label="
                    activeProcessingRun.paused
                      ? 'Продолжить постобработку'
                      : 'Приостановить постобработку'
                  "
                  :title="activeProcessingRun.paused ? 'Продолжить' : 'Приостановить'"
                  :disabled="
                    activeProcessingRun.status !== 'running' || Boolean(controllingProcessingRunId)
                  "
                  @click="controlProcessingRun(activeProcessingRun, !activeProcessingRun.paused)"
                >
                  <UiIcon :name="activeProcessingRun.paused ? 'play' : 'pause'" />
                </button>
                <button
                  class="icon-button icon-button--compact icon-button--ghost icon-button--danger"
                  type="button"
                  aria-label="Остановить постобработку"
                  title="Остановить"
                  :disabled="
                    !['queued', 'running'].includes(activeProcessingRun.status) ||
                    Boolean(controllingProcessingRunId)
                  "
                  @click="processingRunToStop = activeProcessingRun"
                >
                  <UiIcon name="stop" />
                </button>
              </div>
            </header>
            <div class="panel__content form-stack">
              <label class="form-field">
                <span class="form-field__label form-field__label--wrap">
                  Инструкция для массовой обработки записей в БЗ
                </span>
                <textarea
                  v-model="processingInstruction"
                  class="form-field__control"
                  rows="12"
                  maxlength="10000"
                  placeholder="Например: удалите из описаний служебные блоки о доставке, сохранив все характеристики и подтверждённые факты."
                />
                <span class="field-note">
                  Агент создаст новые версии {{ selectedDocumentCount ? "выбранных" : "всех" }}
                  записей. Статус публикации не изменится. Временные ошибки автоматически
                  повторяются до трёх раз.
                </span>
              </label>

              <div v-if="latestProcessingRun" class="readonly-summary">
                <span>Последний запуск</span>
                <strong>
                  {{
                    processingStatusLabel(
                      latestProcessingRun.status,
                      latestProcessingRun.paused,
                      latestProcessingRun.finishedAt,
                    )
                  }}
                </strong>
                <span>
                  {{ latestProcessingRun.processedCount }} из {{ latestProcessingRun.totalCount }} ·
                  успешно {{ latestProcessingRun.succeededCount }} · ошибок
                  {{ latestProcessingRun.failedCount }}
                </span>
                <code v-if="latestProcessingRun.errorCode">
                  {{ latestProcessingRun.errorCode }}
                </code>
              </div>

              <button
                v-if="canEdit"
                class="button button--primary button--wide"
                type="button"
                :disabled="
                  processingInstruction.trim().length < 20 ||
                  isRequestingProcessing ||
                  Boolean(activeProcessingRun)
                "
                @click="requestKnowledgeProcessing"
              >
                {{
                  isRequestingProcessing
                    ? "Запускаем…"
                    : selectedDocumentCount
                      ? `Обработать выбранные (${selectedDocumentCount})`
                      : "Обработать все записи"
                }}
              </button>
            </div>
          </section>
        </aside>
      </div>

      <section class="panel" aria-labelledby="knowledge-processing-history-title">
        <header class="section-header">
          <div>
            <h2 id="knowledge-processing-history-title" class="section-title">
              История постобработки
            </h2>
          </div>
        </header>
        <div v-if="!processingRuns.length" class="empty-state">
          Постобработка ещё не запускалась.
        </div>
        <div v-else class="table-scroll">
          <table class="data-table" aria-label="История постобработки записей">
            <thead>
              <tr>
                <TableSortHeader
                  class="data-table__dynamic-column"
                  label="Инструкция"
                  column="instruction"
                  :active-column="processingSortColumn"
                  :direction="processingSortDirection"
                  @sort="setProcessingSort"
                />
                <TableSortHeader
                  class="data-table__status-column"
                  label="Статус"
                  column="status"
                  :active-column="processingSortColumn"
                  :direction="processingSortDirection"
                  @sort="setProcessingSort"
                />
                <TableSortHeader
                  class="data-table__compact-column"
                  label="Прогресс"
                  column="progress"
                  :active-column="processingSortColumn"
                  :direction="processingSortDirection"
                  @sort="setProcessingSort"
                />
                <TableSortHeader
                  class="data-table__dynamic-column data-table__dynamic-column--compact"
                  label="Запустил"
                  column="requestedBy"
                  :active-column="processingSortColumn"
                  :direction="processingSortDirection"
                  @sort="setProcessingSort"
                />
                <TableSortHeader
                  class="data-table__date-column"
                  label="Создан"
                  column="createdAt"
                  :active-column="processingSortColumn"
                  :direction="processingSortDirection"
                  @sort="setProcessingSort"
                />
                <th
                  class="data-table__dynamic-column data-table__dynamic-column--compact"
                  scope="col"
                >
                  Ошибка
                </th>
                <th class="data-table__actions-column" scope="col">Действия</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="run in sortedProcessingRuns" :key="run.id">
                <td class="data-table__dynamic-cell">
                  <div class="data-table__clamp">{{ run.instruction }}</div>
                </td>
                <td>
                  <span class="status-badge status-badge--compact" :data-status="run.status">
                    {{ processingStatusLabel(run.status, run.paused, run.finishedAt) }}
                  </span>
                </td>
                <td>{{ run.processedCount }} из {{ run.totalCount }}</td>
                <td class="data-table__dynamic-cell data-table__dynamic-cell--compact">
                  <div class="data-table__nowrap data-table__nowrap--compact">
                    {{ run.requestedByEmail ?? "—" }}
                  </div>
                </td>
                <td>
                  <time :datetime="run.createdAt">{{ formatDate(run.createdAt) }}</time>
                </td>
                <td class="data-table__dynamic-cell data-table__dynamic-cell--compact">
                  <div class="data-table__clamp data-table__clamp--compact">
                    <code v-if="run.errorCode">{{ run.errorCode }}</code>
                    <span v-else>—</span>
                  </div>
                </td>
                <td>
                  <div class="table-actions">
                    <button
                      v-if="canEdit && run.status === 'running'"
                      class="icon-button icon-button--compact icon-button--ghost"
                      type="button"
                      :aria-label="
                        run.paused ? 'Продолжить постобработку' : 'Приостановить постобработку'
                      "
                      :title="run.paused ? 'Продолжить' : 'Приостановить'"
                      :disabled="Boolean(controllingProcessingRunId)"
                      @click="controlProcessingRun(run, !run.paused)"
                    >
                      <UiIcon :name="run.paused ? 'play' : 'pause'" />
                    </button>
                    <button
                      v-if="canEdit && ['queued', 'running'].includes(run.status)"
                      class="icon-button icon-button--compact icon-button--ghost icon-button--danger"
                      type="button"
                      aria-label="Остановить постобработку"
                      title="Остановить"
                      :disabled="Boolean(controllingProcessingRunId)"
                      @click="processingRunToStop = run"
                    >
                      <UiIcon name="stop" />
                    </button>
                    <button
                      v-if="
                        canEdit &&
                        !['queued', 'running'].includes(run.status) &&
                        !(run.status === 'cancelled' && !run.finishedAt)
                      "
                      class="icon-button icon-button--compact icon-button--ghost icon-button--danger"
                      type="button"
                      aria-label="Удалить запуск постобработки"
                      title="Удалить"
                      :disabled="Boolean(controllingProcessingRunId)"
                      @click="processingRunToDelete = run"
                    >
                      <UiIcon name="trash" />
                    </button>
                    <button
                      v-if="
                        canEdit && run.failedCount > 0 && ['partial', 'failed'].includes(run.status)
                      "
                      class="icon-button icon-button--compact icon-button--ghost"
                      type="button"
                      aria-label="Повторить ошибочные записи постобработки"
                      title="Повторить ошибки"
                      :disabled="
                        Boolean(controllingProcessingRunId) || Boolean(activeProcessingRun)
                      "
                      @click="retryFailedProcessingRun(run)"
                    >
                      <UiIcon name="refresh" />
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>

    <ConfirmModal
      v-if="deleteAction && !reauthenticationVisible"
      :title="deleteConfirmation.title"
      :description="deleteConfirmation.description"
      :confirm-label="deleteConfirmation.label"
      pending-label="Удаляем…"
      :pending="isDeleting"
      danger
      @close="deleteAction = null"
      @confirm="executeDeleteAction"
    />
    <ReauthenticateModal
      v-if="reauthenticationVisible"
      description="Для удаления данных базы знаний подтвердите текущий пароль."
      :pending="isReauthenticating"
      @close="reauthenticationVisible = false"
      @confirm="reauthenticate"
    />
    <ConfirmModal
      v-if="processingRunToStop"
      title="Остановить постобработку?"
      description="Новые записи больше не будут обрабатываться. Уже выполняющиеся запросы завершатся безопасно, а созданные версии сохранятся."
      confirm-label="Остановить"
      pending-label="Останавливаем…"
      :pending="controllingProcessingRunId === processingRunToStop.id"
      danger
      @close="processingRunToStop = null"
      @confirm="stopProcessingRun(processingRunToStop)"
    />
    <ConfirmModal
      v-if="processingRunToDelete"
      title="Удалить запуск из истории?"
      description="Будут удалены запуск и его технические результаты. Уже созданные версии записей базы знаний сохранятся."
      confirm-label="Удалить запуск"
      pending-label="Удаляем…"
      :pending="controllingProcessingRunId === processingRunToDelete.id"
      danger
      @close="processingRunToDelete = null"
      @confirm="deleteProcessingRun"
    />
  </main>
</template>

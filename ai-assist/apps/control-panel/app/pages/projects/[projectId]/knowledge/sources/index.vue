<script setup lang="ts">
import type {
  CrawlChangeType,
  CrawlPageResponse,
  CrawlRunDetailResponse,
  CrawlRunStatus,
  DiscoverSiteStructureResponse,
  ProjectResponse,
  PublishCrawlRunResponse,
  RequestKnowledgeCrawlResponse,
  SiteStructureNode,
  UrlKnowledgeSourceListResponse,
  UrlKnowledgeSourceResponse,
} from "@ai-assist/contracts";

const route = useRoute();
const requestFetch = useRequestFetch();
const session = useAdminSessionState();
const projectId = computed(() => String(route.params.projectId));
const isSaving = ref(false);
const isDiscovering = ref(false);
const runningSourceId = ref<string | null>(null);
const isPublishing = ref(false);
const selectedRun = ref<CrawlRunDetailResponse | null>(null);
const selectedPageIds = ref<string[]>([]);
const selectAllRunPages = ref(false);
const selectionRunId = ref<string | null>(null);
const crawlPage = ref(1);
const crawlPageSize = 50;
const structure = ref<DiscoverSiteStructureResponse | null>(null);
const structureStartUrl = ref<string | null>(null);
type SectionSelection = Record<string, { included: boolean; includeDescendants: boolean }>;
const sectionSelections = ref<SectionSelection>({});
const message = ref<{ type: "success" | "error"; text: string } | null>(null);
useToastMessage(message);
const form = reactive({
  startUrl: "",
  maxDepth: 5,
});

const { data, error, refresh } = await useAsyncData(
  () => `project-knowledge-sources-${projectId.value}`,
  async () => {
    const [project, sourceList] = await Promise.all([
      requestFetch<ProjectResponse>(`/api/v1/projects/${projectId.value}`),
      requestFetch<UrlKnowledgeSourceListResponse>(
        `/api/v1/projects/${projectId.value}/knowledge/sources`,
      ),
    ]);
    return { project, sourceList };
  },
);

const role = computed(
  () =>
    session.value?.projects.find((project) => project.id === projectId.value)?.role ??
    data.value?.project.role,
);
const canEdit = computed(() => role.value === "owner" || role.value === "editor");

watch(
  () => data.value?.project.primaryOrigin,
  (origin) => {
    if (origin && !form.startUrl) form.startUrl = origin.endsWith("/") ? origin : `${origin}/`;
  },
  { immediate: true },
);

const runStatusLabel = (status: CrawlRunStatus): string =>
  ({
    queued: "В очереди",
    running: "Выполняется",
    succeeded: "Завершён",
    partial: "Завершён с ошибками",
    failed: "Ошибка",
    cancelled: "Отменён",
  })[status];

const changeLabel = (change: CrawlChangeType | null): string =>
  change ? { new: "Новый", changed: "Изменён", unchanged: "Без изменений" }[change] : "—";

const formatDate = (value: string): string =>
  new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );

const flattenNodes = (nodes: SiteStructureNode[]): SiteStructureNode[] =>
  nodes.flatMap((node) => [node, ...flattenNodes(node.children)]);
const structureNodes = computed(() => flattenNodes(structure.value?.nodes ?? []));
const includedSections = computed(() =>
  structureNodes.value.filter((node) => sectionSelections.value[node.path]?.included),
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
  sectionSelections.value = {};
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
    sectionSelections.value = Object.fromEntries(
      flattenNodes(result.nodes).map((node) => [
        node.path,
        { included: false, includeDescendants: true },
      ]),
    );
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
  sectionSelections.value = Object.fromEntries(
    structureNodes.value.map((node) => [
      node.path,
      { ...(sectionSelections.value[node.path] ?? { includeDescendants: true }), included },
    ]),
  );
};

const setSectionIncluded = (path: string, included: boolean): void => {
  const current = sectionSelections.value[path] ?? { included: false, includeDescendants: true };
  sectionSelections.value = { ...sectionSelections.value, [path]: { ...current, included } };
};

const setSectionDescendants = (path: string, includeDescendants: boolean): void => {
  const current = sectionSelections.value[path] ?? { included: false, includeDescendants: true };
  sectionSelections.value = {
    ...sectionSelections.value,
    [path]: { ...current, includeDescendants },
  };
};

watch(
  () => form.startUrl,
  (value) => {
    if (structureStartUrl.value && value !== structureStartUrl.value) {
      structure.value = null;
      structureStartUrl.value = null;
      sectionSelections.value = {};
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
    if (runId && selectedRun.value?.run.id !== runId) void loadRun(runId);
  },
  { immediate: true },
);

let pollTimer: ReturnType<typeof setTimeout> | undefined;
const schedulePoll = (): void => {
  if (!import.meta.client) return;
  if (pollTimer) clearTimeout(pollTimer);
  const status = selectedRun.value?.run.status;
  const runId = selectedRun.value?.run.id;
  if ((status === "queued" || status === "running") && runId) {
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
  if (!structure.value || !includedSections.value.length) {
    message.value = {
      type: "error",
      text: "Сначала получите структуру сайта и выберите хотя бы один раздел.",
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
            includePathPrefixes: includedSections.value
              .filter((section) => sectionSelections.value[section.path]?.includeDescendants)
              .map((section) => section.path),
            includeExactPaths: includedSections.value
              .filter((section) => !sectionSelections.value[section.path]?.includeDescendants)
              .map((section) => section.path),
            excludePathPrefixes: ["/bitrix/", "/basket/", "/search/", "/auth/", "/personal/"],
            maxPages: 5_000,
            maxDepth: Number(form.maxDepth),
            requestDelayMs: 500,
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
                  <ul v-if="structureNodes.length" class="site-tree__list">
                    <KnowledgeSiteTreeNode
                      v-for="node in structure?.nodes ?? []"
                      :key="node.path"
                      :node="node"
                      :selection="sectionSelections"
                      @include="setSectionIncluded"
                      @descendants="setSectionDescendants"
                    />
                  </ul>
                  <div v-else class="empty-state">Структура сайта не найдена.</div>
                  <p v-if="structureNodes.length" class="site-tree__summary">
                    Выбрано узлов: {{ includedSections.length }} из {{ structureNodes.length }}.
                  </p>
                </div>
              </section>
            </div>
          </fieldset>
          <div class="form-actions">
            <button
              class="button button--primary"
              type="submit"
              :disabled="isSaving || !structure || !includedSections.length"
            >
              {{ isSaving ? "Проверяем…" : "Сохранить и запустить" }}
            </button>
          </div>
        </form>
      </section>

      <section class="panel panel--flush" aria-label="Настроенные источники сайта">
        <div v-if="!data.sourceList.sources.length" class="empty-state">
          Источники пока не добавлены.
        </div>
        <div v-else class="table-scroll">
          <table class="data-table" aria-label="Настроенные источники сайта">
            <thead>
              <tr>
                <th scope="col">Источник</th>
                <th scope="col">Ограничения</th>
                <th scope="col">Последний запуск</th>
                <th scope="col">Действия</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="source in data.sourceList.sources" :key="source.id">
                <td>
                  <strong>{{ source.name }}</strong>
                  <span class="data-table__secondary">{{ source.settings.startUrl }}</span>
                </td>
                <td>
                  {{ source.settings.crawlMode === "full" ? "Полный" : "Быстрый" }} режим ·
                  {{
                    source.settings.includePathPrefixes.length +
                    source.settings.includeExactPaths.length
                  }}
                  разделов · {{ source.settings.maxPages }} стр. · глубина
                  {{ source.settings.maxDepth }} · {{ source.settings.requestDelayMs }} мс
                </td>
                <td>
                  <button
                    v-if="source.latestRun"
                    class="button button--text"
                    type="button"
                    @click="loadRun(source.latestRun.id)"
                  >
                    {{ runStatusLabel(source.latestRun.status) }} ·
                    {{ formatDate(source.latestRun.createdAt) }}
                  </button>
                  <span v-else>Не запускался</span>
                </td>
                <td>
                  <div class="button-row">
                    <button
                      v-if="canEdit && source.status === 'active'"
                      class="button button--compact"
                      type="button"
                      :disabled="Boolean(runningSourceId) || source.latestRun?.status === 'running'"
                      @click="startCrawl(source)"
                    >
                      {{ runningSourceId === source.id ? "Запускаем…" : "Запустить" }}
                    </button>
                    <button
                      v-if="canEdit"
                      class="button button--text"
                      type="button"
                      @click="toggleSource(source)"
                    >
                      {{ source.status === "active" ? "В архив" : "Вернуть" }}
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-if="selectedRun" class="panel panel--flush" aria-labelledby="crawl-result-title">
        <header class="section-header crawl-result__header">
          <div>
            <h2 id="crawl-result-title" class="section-title">
              {{ runStatusLabel(selectedRun.run.status) }}
            </h2>
          </div>
          <button
            v-if="
              canEdit &&
              ['succeeded', 'partial'].includes(selectedRun.run.status) &&
              reviewablePageCount > 0
            "
            class="button button--primary"
            type="button"
            :disabled="isPublishing || !selectedPublicationCount"
            @click="publishRun"
          >
            {{
              isPublishing ? "Публикуем…" : `Опубликовать выбранные (${selectedPublicationCount})`
            }}
          </button>
        </header>

        <div
          v-if="selectedRun.run.status === 'queued' || selectedRun.run.status === 'running'"
          class="crawl-progress"
        >
          <div class="crawl-progress__header">
            <strong>Идёт обход сайта</strong>
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
                <th scope="col">Страница</th>
                <th scope="col">Тип</th>
                <th scope="col">Изменение</th>
                <th scope="col">Точность</th>
                <th scope="col">Проверка</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="page in selectedRun.pages" :key="page.id">
                <td class="crawl-result__selection-cell">
                  <input
                    type="checkbox"
                    :checked="selectAllRunPages || selectedPageIds.includes(page.id)"
                    :disabled="selectAllRunPages || !isSelectablePage(page)"
                    :aria-label="`Выбрать ${page.title ?? page.normalizedUrl}`"
                    @change="setPageSelected(page.id, !selectedPageIds.includes(page.id))"
                  />
                </td>
                <td>
                  <strong>{{ page.title ?? page.errorCode ?? "Не извлечено" }}</strong>
                  <span class="data-table__secondary">{{ page.normalizedUrl }}</span>
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
                <td>
                  <NuxtLink
                    v-if="page.documentId"
                    class="data-table__link"
                    :to="`/projects/${projectId}/knowledge/documents/${page.documentId}`"
                  >
                    {{ page.reviewStatus === "approved" ? "Опубликовано" : "Открыть запись" }}
                  </NuxtLink>
                  <span v-else>{{ page.errorCode ?? "Пропущено" }}</span>
                  <span v-if="page.warnings.length" class="data-table__secondary">
                    {{ page.warnings.join(", ") }}
                  </span>
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
  </main>
</template>

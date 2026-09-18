import type {
  CreateUrlKnowledgeSourceRequest,
  CrawlPageResponse,
  CrawlRunDetailResponse,
  CrawlRunHistoryResponse,
  CrawlRunPagesQuery,
  CrawlRunResponse,
  ControlKnowledgeCrawlRequest,
  DeleteKnowledgeCrawlResponse,
  DeleteUrlKnowledgeSourceQuery,
  DeleteUrlKnowledgeSourceResponse,
  DiscoverSiteStructureRequest,
  DiscoverSiteStructureResponse,
  PublishCrawlRunRequest,
  PublishCrawlRunResponse,
  ReprocessKnowledgeCrawlRequest,
  RequestKnowledgeCrawlResponse,
  UpdateUrlKnowledgeSourceRequest,
  UrlKnowledgeSourceListResponse,
  UrlKnowledgeSourceResponse,
} from "@ai-assist/contracts";
import {
  defaultKnowledgeNormalizationPrompt,
  knowledgeCrawlJobName,
  urlKnowledgeSourceSettingsSchema,
} from "@ai-assist/contracts";
import { CrawlerError, discoverSiteStructure, validateCrawlSource } from "@ai-assist/crawler";
import type { H3Event } from "h3";

import { writeAuditEvent } from "../repositories/audit";
import {
  acknowledgeStoppedCrawlRunRecord,
  createCrawlRunRecord,
  createUrlSourceRecord,
  deleteTerminalCrawlRunRecord,
  deleteUrlSourceRecord,
  failQueuedCrawlRunRecord,
  findCrawlPageRetryRecord,
  findCrawlRunRecord,
  findLatestCrawlRunRecords,
  findPendingCrawlRunRecord,
  findUrlSourceRecord,
  hasRawCrawlContent,
  hasFailedCrawlPageRecords,
  listCrawlPageRecords,
  listCrawlRunRecords,
  listUrlSourceRecords,
  publishCrawlRunRecords,
  setCrawlRunPausedRecord,
  stopPausedCrawlRunRecord,
  updateUrlSourceRecord,
  type CrawlPageRecord,
  type CrawlRunRecord,
  type UrlSourceRecord,
} from "../repositories/crawler";
import { getInfrastructure } from "../utils/infrastructure";
import { getRequestId } from "../utils/request";
import { assertCsrf, assertRecentAdminAuthentication, requireProjectScope } from "./auth";
import { requestKnowledgeReindex } from "./knowledge";

const toRunResponse = (run: CrawlRunRecord): CrawlRunResponse => ({
  ...run,
  paused: Boolean(run.pauseRequestedAt),
  normalizationPrompt: run.normalizationPrompt ?? defaultKnowledgeNormalizationPrompt,
  requestedByEmail: run.requestedByEmail,
  startedAt: run.startedAt?.toISOString() ?? null,
  finishedAt: run.finishedAt?.toISOString() ?? null,
  createdAt: run.createdAt.toISOString(),
  updatedAt: run.updatedAt.toISOString(),
});

const toSourceResponse = (
  source: UrlSourceRecord,
  latestRun: CrawlRunRecord | null,
): UrlKnowledgeSourceResponse => ({
  id: source.id,
  projectId: source.projectId,
  type: "url",
  name: source.name,
  status: source.status,
  version: source.version,
  settings: urlKnowledgeSourceSettingsSchema.parse(source.settings),
  lastCrawledAt: source.lastCrawledAt?.toISOString() ?? null,
  lastSuccessfulCrawlAt: source.lastSuccessfulCrawlAt?.toISOString() ?? null,
  lastErrorCode: source.lastErrorCode,
  latestRun: latestRun ? toRunResponse(latestRun) : null,
  createdAt: source.createdAt.toISOString(),
  updatedAt: source.updatedAt.toISOString(),
});

const toPageResponse = (page: CrawlPageRecord): CrawlPageResponse => ({
  ...page,
  fetchedAt: page.fetchedAt?.toISOString() ?? null,
});

const removeCrawlRunJobs = async (runId: string): Promise<void> => {
  for (const prefix of [
    "knowledge-crawl",
    "knowledge-page-retry",
    "knowledge-failed-pages-retry",
    "knowledge-reprocess",
  ]) {
    const job = await getInfrastructure().systemQueue.getJob(`${prefix}-${runId}`);
    if (!job) continue;
    if ((await job.getState()) === "active") {
      throw createError({
        statusCode: 409,
        statusMessage: "Дождитесь завершения активной операции парсинга",
      });
    }
    await job.remove();
  }
};

const reconcileStoppedCrawlRun = async (run: CrawlRunRecord): Promise<CrawlRunRecord> => {
  if (run.status !== "cancelled" || run.finishedAt) return run;
  try {
    const jobs = await Promise.all(
      [
        "knowledge-crawl",
        "knowledge-page-retry",
        "knowledge-failed-pages-retry",
        "knowledge-reprocess",
      ].map((prefix) => getInfrastructure().systemQueue.getJob(`${prefix}-${run.id}`)),
    );
    const queueJobs = jobs.filter((job) => Boolean(job));
    const states = await Promise.all(queueJobs.map((job) => job!.getState()));
    if (states.includes("active")) return run;
    await Promise.all(queueJobs.map((job) => job!.remove()));
    return (
      (await acknowledgeStoppedCrawlRunRecord({
        projectId: run.projectId,
        runId: run.id,
        sourceId: run.sourceId,
      })) ?? run
    );
  } catch {
    return run;
  }
};

const validateSettings = async <
  T extends { settings: CreateUrlKnowledgeSourceRequest["settings"] },
>(
  input: T,
): Promise<T> => {
  try {
    const validated = await validateCrawlSource(input.settings);
    return { ...input, settings: { ...input.settings, startUrl: validated.startUrl } };
  } catch (error) {
    const code = error instanceof CrawlerError ? error.code : "CRAWL_SOURCE_VALIDATION_FAILED";
    throw createError({
      statusCode: 422,
      statusMessage: "URL источника не прошёл проверку безопасности",
      data: { code },
    });
  }
};

export const discoverUrlKnowledgeStructure = async (
  event: H3Event,
  projectId: string,
  input: DiscoverSiteStructureRequest,
): Promise<DiscoverSiteStructureResponse> => {
  const { session, project } = await requireProjectScope(event, projectId, "editor");
  assertCsrf(event, session);
  let structure: DiscoverSiteStructureResponse;
  try {
    structure = await discoverSiteStructure({
      startUrl: input.startUrl,
      maxDepth: input.maxDepth,
    });
  } catch (error) {
    const crawlerError = error instanceof CrawlerError ? error : null;
    throw createError({
      statusCode: crawlerError?.retryable ? 502 : 422,
      statusMessage: crawlerError?.retryable
        ? "Не удалось получить структуру сайта"
        : "URL сайта не прошёл проверку безопасности",
      data: { code: crawlerError?.code ?? "SITE_STRUCTURE_DISCOVERY_FAILED" },
    });
  }
  await writeAuditEvent({
    projectId: project.id,
    actorUserId: session.userId,
    action: "knowledge.source_structure_discovered",
    resourceType: "project",
    resourceId: project.id,
    requestId: getRequestId(event),
    metadata: {
      origin: structure.origin,
      method: structure.method,
      rootNodeCount: structure.nodes.length,
      maxDepth: input.maxDepth,
    },
  });
  return structure;
};

export const getUrlKnowledgeSources = async (
  event: H3Event,
  projectId: string,
): Promise<UrlKnowledgeSourceListResponse> => {
  const { project } = await requireProjectScope(event, projectId);
  const [sources, runs] = await Promise.all([
    listUrlSourceRecords(project.id),
    findLatestCrawlRunRecords(project.id),
  ]);
  const latestBySource = new Map(runs.map((run) => [run.sourceId, run]));
  return {
    sources: sources.map((source) =>
      toSourceResponse(source, latestBySource.get(source.id) ?? null),
    ),
  };
};

export const getKnowledgeCrawlHistory = async (
  event: H3Event,
  projectId: string,
): Promise<CrawlRunHistoryResponse> => {
  const { project } = await requireProjectScope(event, projectId);
  const [runs, sources] = await Promise.all([
    listCrawlRunRecords(project.id),
    listUrlSourceRecords(project.id),
  ]);
  const sourceNames = new Map(sources.map((source) => [source.id, source.name]));
  return {
    runs: runs.map((run) => ({
      ...toRunResponse(run),
      sourceName: sourceNames.get(run.sourceId) ?? "Источник сайта",
    })),
  };
};

export const createUrlKnowledgeSource = async (
  event: H3Event,
  projectId: string,
  rawInput: CreateUrlKnowledgeSourceRequest,
): Promise<UrlKnowledgeSourceResponse> => {
  const { session, project } = await requireProjectScope(event, projectId, "editor");
  assertCsrf(event, session);
  const input = await validateSettings(rawInput);
  const source = await createUrlSourceRecord({ projectId: project.id, ...input });
  await writeAuditEvent({
    projectId: project.id,
    actorUserId: session.userId,
    action: "knowledge.source_created",
    resourceType: "knowledge_source",
    resourceId: source.id,
    requestId: getRequestId(event),
    metadata: { sourceType: "url", origin: new URL(input.settings.startUrl).origin },
  });
  return toSourceResponse(source, null);
};

export const updateUrlKnowledgeSource = async (
  event: H3Event,
  projectId: string,
  sourceId: string,
  rawInput: UpdateUrlKnowledgeSourceRequest,
): Promise<UrlKnowledgeSourceResponse> => {
  const { session, project } = await requireProjectScope(event, projectId, "editor");
  assertCsrf(event, session);
  const input = rawInput.status === "archived" ? rawInput : await validateSettings(rawInput);
  if (input.status === "archived" && (await findPendingCrawlRunRecord(project.id, sourceId))) {
    throw createError({ statusCode: 409, statusMessage: "Нельзя архивировать активный обход" });
  }
  const source = await updateUrlSourceRecord({ projectId: project.id, sourceId, ...input });
  if (!source) {
    const current = await findUrlSourceRecord(project.id, sourceId);
    if (!current) throw createError({ statusCode: 404, statusMessage: "Источник не найден" });
    throw createError({
      statusCode: 409,
      statusMessage: "Источник был изменён другим запросом",
      data: { code: "SOURCE_VERSION_CONFLICT", currentVersion: current.version },
    });
  }
  await writeAuditEvent({
    projectId: project.id,
    actorUserId: session.userId,
    action: "knowledge.source_updated",
    resourceType: "knowledge_source",
    resourceId: source.id,
    requestId: getRequestId(event),
    metadata: { status: source.status },
  });
  const latest = (await findLatestCrawlRunRecords(project.id)).find(
    (run) => run.sourceId === source.id,
  );
  return toSourceResponse(source, latest ?? null);
};

export const deleteUrlKnowledgeSource = async (
  event: H3Event,
  projectId: string,
  sourceId: string,
  input: DeleteUrlKnowledgeSourceQuery,
): Promise<DeleteUrlKnowledgeSourceResponse> => {
  const { session, project } = await requireProjectScope(event, projectId, "owner");
  assertCsrf(event, session);
  assertRecentAdminAuthentication(session);
  const source = await findUrlSourceRecord(project.id, sourceId);
  if (!source) throw createError({ statusCode: 404, statusMessage: "Источник не найден" });
  if (await findPendingCrawlRunRecord(project.id, source.id)) {
    throw createError({ statusCode: 409, statusMessage: "Сначала остановите активный парсинг" });
  }
  const sourceRuns = (await listCrawlRunRecords(project.id)).filter(
    (run) => run.sourceId === source.id,
  );
  for (const run of sourceRuns) await removeCrawlRunJobs(run.id);

  const result = await deleteUrlSourceRecord({
    projectId: project.id,
    sourceId: source.id,
    expectedVersion: input.expectedVersion,
  });
  if (result.status !== "deleted") {
    if (result.status === "not_found") {
      throw createError({ statusCode: 404, statusMessage: "Источник не найден" });
    }
    if (result.status === "version_conflict") {
      throw createError({
        statusCode: 409,
        statusMessage: "Источник был изменён другим запросом",
        data: { code: "SOURCE_VERSION_CONFLICT" },
      });
    }
    throw createError({ statusCode: 409, statusMessage: "Сначала остановите активный парсинг" });
  }
  await writeAuditEvent({
    projectId: project.id,
    actorUserId: session.userId,
    action: "knowledge.source_deleted",
    resourceType: "knowledge_source",
    resourceId: source.id,
    requestId: getRequestId(event),
    metadata: {
      deletedCrawlRuns: result.deletedCrawlRuns,
      preservedDocuments: result.preservedDocuments,
    },
  });
  return {
    id: source.id,
    deleted: true,
    deletedCrawlRuns: result.deletedCrawlRuns,
    preservedDocuments: result.preservedDocuments,
  };
};

export const requestKnowledgeCrawl = async (
  event: H3Event,
  projectId: string,
  sourceId: string,
): Promise<RequestKnowledgeCrawlResponse> => {
  const { session, project } = await requireProjectScope(event, projectId, "editor");
  assertCsrf(event, session);
  const source = await findUrlSourceRecord(project.id, sourceId);
  if (!source) throw createError({ statusCode: 404, statusMessage: "Источник не найден" });
  if (source.status !== "active") {
    throw createError({ statusCode: 409, statusMessage: "Источник находится в архиве" });
  }
  const pending = await findPendingCrawlRunRecord(project.id, source.id);
  if (pending) return { jobId: `knowledge-crawl-${pending.id}`, run: toRunResponse(pending) };
  const requestId = getRequestId(event);
  const settings = urlKnowledgeSourceSettingsSchema.parse(source.settings);
  let run: CrawlRunRecord;
  try {
    run = await createCrawlRunRecord({
      projectId: project.id,
      sourceId: source.id,
      requestedBy: session.userId,
      requestId,
      normalizationPrompt: settings.normalizationPrompt,
    });
  } catch (error) {
    const raced = await findPendingCrawlRunRecord(project.id, source.id);
    if (raced) return { jobId: `knowledge-crawl-${raced.id}`, run: toRunResponse(raced) };
    throw error;
  }
  const jobId = `knowledge-crawl-${run.id}`;
  try {
    await getInfrastructure().systemQueue.add(
      knowledgeCrawlJobName,
      {
        projectId: project.id,
        sourceId: source.id,
        runId: run.id,
        requestedAt: new Date().toISOString(),
        requestId,
        rawSourceRunId: null,
        targetUrl: null,
        failedSourceRunId: null,
      },
      { jobId, attempts: 1, removeOnComplete: 100 },
    );
  } catch {
    await failQueuedCrawlRunRecord(run.id, "CRAWL_QUEUE_UNAVAILABLE");
    throw createError({ statusCode: 503, statusMessage: "Очередь обхода недоступна" });
  }
  await writeAuditEvent({
    projectId: project.id,
    actorUserId: session.userId,
    action: "knowledge.crawl_requested",
    resourceType: "knowledge_crawl_run",
    resourceId: run.id,
    requestId,
    metadata: { sourceId: source.id },
  });
  return { jobId, run: toRunResponse(run) };
};

export const controlKnowledgeCrawl = async (
  event: H3Event,
  projectId: string,
  runId: string,
  input: ControlKnowledgeCrawlRequest,
): Promise<CrawlRunResponse> => {
  const { session, project } = await requireProjectScope(event, projectId, "editor");
  assertCsrf(event, session);
  const current = await findCrawlRunRecord(project.id, runId);
  if (!current) throw createError({ statusCode: 404, statusMessage: "Задание обхода не найдено" });
  if (current.status !== "running") {
    throw createError({
      statusCode: 409,
      statusMessage: "Приостановить или продолжить можно только выполняющийся парсинг",
    });
  }
  const run = await setCrawlRunPausedRecord({ projectId: project.id, runId, paused: input.paused });
  if (!run) {
    throw createError({ statusCode: 409, statusMessage: "Состояние парсинга уже изменилось" });
  }
  await writeAuditEvent({
    projectId: project.id,
    actorUserId: session.userId,
    action: input.paused ? "knowledge.crawl_paused" : "knowledge.crawl_resumed",
    resourceType: "knowledge_crawl_run",
    resourceId: run.id,
    requestId: getRequestId(event),
    metadata: { sourceId: run.sourceId },
  });
  return toRunResponse(run);
};

export const stopKnowledgeCrawl = async (
  event: H3Event,
  projectId: string,
  runId: string,
): Promise<CrawlRunResponse> => {
  const { session, project } = await requireProjectScope(event, projectId, "editor");
  assertCsrf(event, session);
  const current = await findCrawlRunRecord(project.id, runId);
  if (!current) throw createError({ statusCode: 404, statusMessage: "Задание обхода не найдено" });
  if (current.status !== "running" || !current.pauseRequestedAt) {
    throw createError({
      statusCode: 409,
      statusMessage: "Остановить можно только приостановленный парсинг",
    });
  }
  const run = await stopPausedCrawlRunRecord({ projectId: project.id, runId });
  if (!run) {
    throw createError({ statusCode: 409, statusMessage: "Состояние парсинга уже изменилось" });
  }
  await writeAuditEvent({
    projectId: project.id,
    actorUserId: session.userId,
    action: "knowledge.crawl_stop_requested",
    resourceType: "knowledge_crawl_run",
    resourceId: run.id,
    requestId: getRequestId(event),
    metadata: { sourceId: run.sourceId },
  });
  return toRunResponse(run);
};

export const deleteKnowledgeCrawl = async (
  event: H3Event,
  projectId: string,
  runId: string,
): Promise<DeleteKnowledgeCrawlResponse> => {
  const { session, project } = await requireProjectScope(event, projectId, "editor");
  assertCsrf(event, session);
  const found = await findCrawlRunRecord(project.id, runId);
  if (!found) throw createError({ statusCode: 404, statusMessage: "Задание обхода не найдено" });
  const current = await reconcileStoppedCrawlRun(found);
  if (["queued", "running"].includes(current.status)) {
    throw createError({
      statusCode: 409,
      statusMessage: "Сначала остановите активный парсинг",
    });
  }
  if (current.status === "cancelled" && !current.finishedAt) {
    throw createError({
      statusCode: 409,
      statusMessage: "Дождитесь подтверждения остановки worker-ом",
    });
  }
  await removeCrawlRunJobs(runId);
  const deleted = await deleteTerminalCrawlRunRecord({ projectId: project.id, runId });
  if (!deleted) {
    throw createError({ statusCode: 409, statusMessage: "Состояние парсинга уже изменилось" });
  }
  await writeAuditEvent({
    projectId: project.id,
    actorUserId: session.userId,
    action: "knowledge.crawl_deleted",
    resourceType: "knowledge_crawl_run",
    resourceId: current.id,
    requestId: getRequestId(event),
    metadata: {
      sourceId: current.sourceId,
      processedCount: current.processedCount,
      succeededCount: current.succeededCount,
      failedCount: current.failedCount,
    },
  });
  return { deleted: true };
};

export const requestKnowledgeCrawlPageRetry = async (
  event: H3Event,
  projectId: string,
  sourceRunId: string,
  pageId: string,
): Promise<RequestKnowledgeCrawlResponse> => {
  const { session, project } = await requireProjectScope(event, projectId, "editor");
  assertCsrf(event, session);
  const sourceRun = await findCrawlRunRecord(project.id, sourceRunId);
  if (!sourceRun)
    throw createError({ statusCode: 404, statusMessage: "Задание обхода не найдено" });
  if (["queued", "running"].includes(sourceRun.status)) {
    throw createError({ statusCode: 409, statusMessage: "Дождитесь завершения текущего парсинга" });
  }
  const page = await findCrawlPageRetryRecord(project.id, sourceRun.id, pageId);
  if (!page) throw createError({ statusCode: 404, statusMessage: "Страница обхода не найдена" });
  const source = await findUrlSourceRecord(project.id, sourceRun.sourceId);
  if (!source) throw createError({ statusCode: 404, statusMessage: "Источник не найден" });
  if (source.status !== "active") {
    throw createError({ statusCode: 409, statusMessage: "Источник находится в архиве" });
  }
  if (await findPendingCrawlRunRecord(project.id, source.id)) {
    throw createError({ statusCode: 409, statusMessage: "Для источника уже выполняется парсинг" });
  }

  const requestId = getRequestId(event);
  const settings = urlKnowledgeSourceSettingsSchema.parse(source.settings);
  let run: CrawlRunRecord;
  try {
    run = await createCrawlRunRecord({
      projectId: project.id,
      sourceId: source.id,
      requestedBy: session.userId,
      requestId,
      normalizationPrompt: settings.normalizationPrompt,
    });
  } catch (error) {
    if (await findPendingCrawlRunRecord(project.id, source.id)) {
      throw createError({
        statusCode: 409,
        statusMessage: "Для источника уже выполняется парсинг",
      });
    }
    throw error;
  }
  const jobId = `knowledge-page-retry-${run.id}`;
  try {
    await getInfrastructure().systemQueue.add(
      knowledgeCrawlJobName,
      {
        projectId: project.id,
        sourceId: source.id,
        runId: run.id,
        requestedAt: new Date().toISOString(),
        requestId,
        rawSourceRunId: null,
        targetUrl: page.normalizedUrl,
        failedSourceRunId: null,
      },
      { jobId, attempts: 1, removeOnComplete: 100 },
    );
  } catch {
    await failQueuedCrawlRunRecord(run.id, "CRAWL_QUEUE_UNAVAILABLE");
    throw createError({ statusCode: 503, statusMessage: "Очередь парсинга недоступна" });
  }
  await writeAuditEvent({
    projectId: project.id,
    actorUserId: session.userId,
    action: "knowledge.crawl_page_retry_requested",
    resourceType: "knowledge_crawl_run",
    resourceId: run.id,
    requestId,
    metadata: { sourceId: source.id, sourceRunId, pageId },
  });
  return { jobId, run: toRunResponse(run) };
};

export const requestFailedKnowledgeCrawlPagesRetry = async (
  event: H3Event,
  projectId: string,
  sourceRunId: string,
): Promise<RequestKnowledgeCrawlResponse> => {
  const { session, project } = await requireProjectScope(event, projectId, "editor");
  assertCsrf(event, session);
  const sourceRun = await findCrawlRunRecord(project.id, sourceRunId);
  if (!sourceRun) {
    throw createError({ statusCode: 404, statusMessage: "Задание обхода не найдено" });
  }
  if (["queued", "running"].includes(sourceRun.status)) {
    throw createError({ statusCode: 409, statusMessage: "Дождитесь завершения текущего парсинга" });
  }
  if (!(await hasFailedCrawlPageRecords(project.id, sourceRun.id))) {
    throw createError({ statusCode: 409, statusMessage: "В запуске нет страниц с ошибками" });
  }
  const source = await findUrlSourceRecord(project.id, sourceRun.sourceId);
  if (!source) throw createError({ statusCode: 404, statusMessage: "Источник не найден" });
  if (source.status !== "active") {
    throw createError({ statusCode: 409, statusMessage: "Источник находится в архиве" });
  }
  if (await findPendingCrawlRunRecord(project.id, source.id)) {
    throw createError({ statusCode: 409, statusMessage: "Для источника уже выполняется парсинг" });
  }

  const requestId = getRequestId(event);
  const settings = urlKnowledgeSourceSettingsSchema.parse(source.settings);
  let run: CrawlRunRecord;
  try {
    run = await createCrawlRunRecord({
      projectId: project.id,
      sourceId: source.id,
      requestedBy: session.userId,
      requestId,
      normalizationPrompt: settings.normalizationPrompt,
    });
  } catch (error) {
    if (await findPendingCrawlRunRecord(project.id, source.id)) {
      throw createError({
        statusCode: 409,
        statusMessage: "Для источника уже выполняется парсинг",
      });
    }
    throw error;
  }
  const jobId = `knowledge-failed-pages-retry-${run.id}`;
  try {
    await getInfrastructure().systemQueue.add(
      knowledgeCrawlJobName,
      {
        projectId: project.id,
        sourceId: source.id,
        runId: run.id,
        requestedAt: new Date().toISOString(),
        requestId,
        rawSourceRunId: null,
        targetUrl: null,
        failedSourceRunId: sourceRun.id,
      },
      { jobId, attempts: 1, removeOnComplete: 100 },
    );
  } catch {
    await failQueuedCrawlRunRecord(run.id, "CRAWL_QUEUE_UNAVAILABLE");
    throw createError({ statusCode: 503, statusMessage: "Очередь парсинга недоступна" });
  }
  await writeAuditEvent({
    projectId: project.id,
    actorUserId: session.userId,
    action: "knowledge.crawl_failed_pages_retry_requested",
    resourceType: "knowledge_crawl_run",
    resourceId: run.id,
    requestId,
    metadata: { sourceId: source.id, sourceRunId },
  });
  return { jobId, run: toRunResponse(run) };
};

export const requestKnowledgeCrawlReprocess = async (
  event: H3Event,
  projectId: string,
  rawSourceRunId: string,
  input: ReprocessKnowledgeCrawlRequest,
): Promise<RequestKnowledgeCrawlResponse> => {
  const { session, project } = await requireProjectScope(event, projectId, "editor");
  assertCsrf(event, session);
  const sourceRun = await findCrawlRunRecord(project.id, rawSourceRunId);
  if (!sourceRun)
    throw createError({ statusCode: 404, statusMessage: "Задание обхода не найдено" });
  if (["queued", "running"].includes(sourceRun.status)) {
    throw createError({ statusCode: 409, statusMessage: "Технический парсинг ещё не завершён" });
  }
  if (!(await hasRawCrawlContent(project.id, sourceRun.id))) {
    throw createError({
      statusCode: 409,
      statusMessage: "В этом запуске не сохранён сырой текст страниц",
      data: { code: "CRAWL_RAW_CONTENT_UNAVAILABLE" },
    });
  }
  const source = await findUrlSourceRecord(project.id, sourceRun.sourceId);
  if (!source) throw createError({ statusCode: 404, statusMessage: "Источник не найден" });
  if (source.status !== "active") {
    throw createError({ statusCode: 409, statusMessage: "Источник находится в архиве" });
  }
  if (await findPendingCrawlRunRecord(project.id, source.id)) {
    throw createError({
      statusCode: 409,
      statusMessage: "Для источника уже выполняется обработка",
    });
  }

  const settings = urlKnowledgeSourceSettingsSchema.parse(source.settings);
  const updatedSource = await updateUrlSourceRecord({
    projectId: project.id,
    sourceId: source.id,
    expectedVersion: input.expectedSourceVersion,
    name: source.name,
    status: source.status,
    settings: { ...settings, normalizationPrompt: input.normalizationPrompt },
  });
  if (!updatedSource) {
    throw createError({
      statusCode: 409,
      statusMessage: "Источник был изменён другим запросом",
      data: { code: "SOURCE_VERSION_CONFLICT" },
    });
  }

  const requestId = getRequestId(event);
  let run: CrawlRunRecord;
  try {
    run = await createCrawlRunRecord({
      projectId: project.id,
      sourceId: source.id,
      requestedBy: session.userId,
      requestId,
      normalizationPrompt: input.normalizationPrompt,
    });
  } catch (error) {
    if (await findPendingCrawlRunRecord(project.id, source.id)) {
      throw createError({
        statusCode: 409,
        statusMessage: "Для источника уже выполняется обработка",
      });
    }
    throw error;
  }
  const jobId = `knowledge-reprocess-${run.id}`;
  try {
    await getInfrastructure().systemQueue.add(
      knowledgeCrawlJobName,
      {
        projectId: project.id,
        sourceId: source.id,
        runId: run.id,
        requestedAt: new Date().toISOString(),
        requestId,
        rawSourceRunId: sourceRun.id,
        targetUrl: null,
        failedSourceRunId: null,
      },
      { jobId, attempts: 1, removeOnComplete: 100 },
    );
  } catch {
    await failQueuedCrawlRunRecord(run.id, "CRAWL_QUEUE_UNAVAILABLE");
    throw createError({ statusCode: 503, statusMessage: "Очередь обработки недоступна" });
  }
  await writeAuditEvent({
    projectId: project.id,
    actorUserId: session.userId,
    action: "knowledge.crawl_reprocessing_requested",
    resourceType: "knowledge_crawl_run",
    resourceId: run.id,
    requestId,
    metadata: { sourceId: source.id, rawSourceRunId: sourceRun.id },
  });
  return { jobId, run: toRunResponse(run) };
};

export const getKnowledgeCrawlRun = async (
  event: H3Event,
  projectId: string,
  runId: string,
  query: CrawlRunPagesQuery,
): Promise<CrawlRunDetailResponse> => {
  const { project } = await requireProjectScope(event, projectId);
  const [foundRun, pageResult] = await Promise.all([
    findCrawlRunRecord(project.id, runId),
    listCrawlPageRecords(project.id, runId, {
      limit: query.pageSize,
      offset: (query.page - 1) * query.pageSize,
    }),
  ]);
  if (!foundRun) throw createError({ statusCode: 404, statusMessage: "Задание обхода не найдено" });
  const run = await reconcileStoppedCrawlRun(foundRun);
  return {
    run: toRunResponse(run),
    pages: pageResult.records.map(toPageResponse),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      totalItems: pageResult.totalItems,
      totalPages: Math.ceil(pageResult.totalItems / query.pageSize),
    },
  };
};

export const publishKnowledgeCrawlRun = async (
  event: H3Event,
  projectId: string,
  runId: string,
  input: PublishCrawlRunRequest,
): Promise<PublishCrawlRunResponse> => {
  const { session, project } = await requireProjectScope(event, projectId, "editor");
  assertCsrf(event, session);
  let publication;
  try {
    publication = await publishCrawlRunRecords({
      projectId: project.id,
      runId,
      publishedBy: session.userId,
      selection: input.selection,
      pageIds: input.selection === "selected" ? input.pageIds : [],
    });
  } catch (error) {
    if (error instanceof Error && error.message === "CRAWL_RUN_NOT_FOUND") {
      throw createError({ statusCode: 404, statusMessage: "Задание обхода не найдено" });
    }
    if (error instanceof Error && error.message === "CRAWL_RUN_NOT_REVIEWABLE") {
      throw createError({ statusCode: 409, statusMessage: "Задание ещё не готово к публикации" });
    }
    throw error;
  }
  let indexJobId: string | null = null;
  let indexWarning: string | null = null;
  if (publication.publishedCount) {
    try {
      indexJobId = (await requestKnowledgeReindex(event, project.id)).jobId;
    } catch {
      indexWarning = "KNOWLEDGE_INDEX_NOT_REQUESTED";
    }
  }
  await writeAuditEvent({
    projectId: project.id,
    actorUserId: session.userId,
    action: "knowledge.crawl_published",
    resourceType: "knowledge_crawl_run",
    resourceId: runId,
    requestId: getRequestId(event),
    metadata: {
      ...publication,
      requestedCount:
        input.selection === "selected"
          ? input.pageIds.length
          : publication.publishedCount + publication.skippedCount,
      selection: input.selection,
      indexRequested: Boolean(indexJobId),
    },
  });
  return { runId, ...publication, indexJobId, indexWarning };
};

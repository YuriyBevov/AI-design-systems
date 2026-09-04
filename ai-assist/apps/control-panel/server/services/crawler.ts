import type {
  CreateUrlKnowledgeSourceRequest,
  CrawlPageResponse,
  CrawlRunDetailResponse,
  CrawlRunPagesQuery,
  CrawlRunResponse,
  DiscoverSiteStructureRequest,
  DiscoverSiteStructureResponse,
  PublishCrawlRunRequest,
  PublishCrawlRunResponse,
  RequestKnowledgeCrawlResponse,
  UpdateUrlKnowledgeSourceRequest,
  UrlKnowledgeSourceListResponse,
  UrlKnowledgeSourceResponse,
} from "@ai-assist/contracts";
import { knowledgeCrawlJobName, urlKnowledgeSourceSettingsSchema } from "@ai-assist/contracts";
import { CrawlerError, discoverSiteStructure, validateCrawlSource } from "@ai-assist/crawler";
import type { H3Event } from "h3";

import { writeAuditEvent } from "../repositories/audit";
import {
  createCrawlRunRecord,
  createUrlSourceRecord,
  failQueuedCrawlRunRecord,
  findCrawlRunRecord,
  findLatestCrawlRunRecords,
  findPendingCrawlRunRecord,
  findUrlSourceRecord,
  listCrawlPageRecords,
  listUrlSourceRecords,
  publishCrawlRunRecords,
  updateUrlSourceRecord,
  type CrawlPageRecord,
  type CrawlRunRecord,
  type UrlSourceRecord,
} from "../repositories/crawler";
import { getInfrastructure } from "../utils/infrastructure";
import { getRequestId } from "../utils/request";
import { assertCsrf, requireProjectScope } from "./auth";
import { requestKnowledgeReindex } from "./knowledge";

const toRunResponse = (run: CrawlRunRecord): CrawlRunResponse => ({
  ...run,
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
    structure = await discoverSiteStructure({ startUrl: input.startUrl });
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
      sectionCount: structure.sections.length,
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
  let run: CrawlRunRecord;
  try {
    run = await createCrawlRunRecord({
      projectId: project.id,
      sourceId: source.id,
      requestedBy: session.userId,
      requestId,
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

export const getKnowledgeCrawlRun = async (
  event: H3Event,
  projectId: string,
  runId: string,
  query: CrawlRunPagesQuery,
): Promise<CrawlRunDetailResponse> => {
  const { project } = await requireProjectScope(event, projectId);
  const [run, pageResult] = await Promise.all([
    findCrawlRunRecord(project.id, runId),
    listCrawlPageRecords(project.id, runId, {
      limit: query.pageSize,
      offset: (query.page - 1) * query.pageSize,
    }),
  ]);
  if (!run) throw createError({ statusCode: 404, statusMessage: "Задание обхода не найдено" });
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

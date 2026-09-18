import type {
  BulkKnowledgeDocumentsRequest,
  BulkKnowledgeDocumentsResponse,
  ControlKnowledgeProcessingRequest,
  DeleteKnowledgeProcessingRunResponse,
  KnowledgeProcessingRunHistoryResponse,
  KnowledgeProcessingRunResponse,
  RequestKnowledgeProcessing,
  RequestKnowledgeProcessingResponse,
} from "@ai-assist/contracts";
import { knowledgeProcessingJobName } from "@ai-assist/contracts";
import type { H3Event } from "h3";

import { writeAuditEvent } from "../repositories/audit";
import { listCrawlRunRecords } from "../repositories/crawler";
import {
  bulkMutateKnowledgeDocumentRecords,
  findPendingKnowledgeIndexVersion,
} from "../repositories/knowledge";
import {
  acknowledgeStoppedKnowledgeProcessingRunRecord,
  createKnowledgeProcessingRunRecord,
  deleteTerminalKnowledgeProcessingRunRecord,
  failQueuedKnowledgeProcessingRunRecord,
  findKnowledgeProcessingRunRecord,
  findLatestKnowledgeProcessingRunRecord,
  findPendingKnowledgeProcessingRunRecord,
  listKnowledgeProcessingRunRecords,
  setKnowledgeProcessingRunPausedRecord,
  stopKnowledgeProcessingRunRecord,
  type KnowledgeProcessingRunRecord,
} from "../repositories/knowledge-processing";
import { getInfrastructure } from "../utils/infrastructure";
import { getRequestId } from "../utils/request";
import { assertCsrf, assertRecentAdminAuthentication, requireProjectScope } from "./auth";

const toRunResponse = (run: KnowledgeProcessingRunRecord): KnowledgeProcessingRunResponse => ({
  ...run,
  paused: Boolean(run.pauseRequestedAt),
  startedAt: run.startedAt?.toISOString() ?? null,
  finishedAt: run.finishedAt?.toISOString() ?? null,
  createdAt: run.createdAt.toISOString(),
  updatedAt: run.updatedAt.toISOString(),
});

const removeKnowledgeProcessingRunJob = async (runId: string): Promise<void> => {
  const job = await getInfrastructure().systemQueue.getJob(`knowledge-processing-${runId}`);
  if (!job) return;
  if ((await job.getState()) === "active") {
    throw createError({
      statusCode: 409,
      statusMessage: "Дождитесь завершения активной постобработки",
    });
  }
  await job.remove();
};

const reconcileStoppedKnowledgeProcessingRun = async (
  run: KnowledgeProcessingRunRecord,
): Promise<KnowledgeProcessingRunRecord> => {
  if (run.status !== "cancelled" || run.finishedAt) return run;
  try {
    const job = await getInfrastructure().systemQueue.getJob(`knowledge-processing-${run.id}`);
    if (job && (await job.getState()) === "active") return run;
    if (job) await job.remove();
    return (
      (await acknowledgeStoppedKnowledgeProcessingRunRecord({
        projectId: run.projectId,
        runId: run.id,
      })) ?? run
    );
  } catch {
    return run;
  }
};

const assertKnowledgeIsMutable = async (projectId: string): Promise<void> => {
  const crawlRuns = await listCrawlRunRecords(projectId);
  if (crawlRuns.some((run) => run.status === "queued" || run.status === "running")) {
    throw createError({
      statusCode: 409,
      statusMessage: "Дождитесь завершения парсинга перед изменением базы знаний",
    });
  }
  if (await findPendingKnowledgeProcessingRunRecord(projectId)) {
    throw createError({
      statusCode: 409,
      statusMessage: "Дождитесь завершения массовой обработки записей",
    });
  }
  if (await findPendingKnowledgeIndexVersion(projectId)) {
    throw createError({ statusCode: 409, statusMessage: "Дождитесь завершения индексации" });
  }
};

export const getLatestKnowledgeProcessingRun = async (
  event: H3Event,
  projectId: string,
): Promise<KnowledgeProcessingRunResponse | null> => {
  const { project } = await requireProjectScope(event, projectId);
  const run = await findLatestKnowledgeProcessingRunRecord(project.id);
  return run ? toRunResponse(run) : null;
};

export const getKnowledgeProcessingHistory = async (
  event: H3Event,
  projectId: string,
): Promise<KnowledgeProcessingRunHistoryResponse> => {
  const { project } = await requireProjectScope(event, projectId);
  const records = await listKnowledgeProcessingRunRecords(project.id);
  const runs = await Promise.all(records.map(reconcileStoppedKnowledgeProcessingRun));
  return { runs: runs.map(toRunResponse) };
};

export const requestKnowledgeProcessing = async (
  event: H3Event,
  projectId: string,
  input: RequestKnowledgeProcessing,
): Promise<RequestKnowledgeProcessingResponse> => {
  const { session, project } = await requireProjectScope(event, projectId, "editor");
  assertCsrf(event, session);
  await assertKnowledgeIsMutable(project.id);
  const requestId = getRequestId(event);
  let run: KnowledgeProcessingRunRecord;
  try {
    run = await createKnowledgeProcessingRunRecord({
      projectId: project.id,
      requestedBy: session.userId,
      requestId,
      instruction: input.instruction,
      documentIds: input.selection.scope === "selected" ? input.selection.documentIds : null,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "KNOWLEDGE_PROCESSING_DOCUMENTS_REQUIRED") {
      throw createError({ statusCode: 409, statusMessage: "Нет записей для обработки" });
    }
    if ((error as { code?: string }).code === "23505") {
      throw createError({
        statusCode: 409,
        statusMessage: "Массовая обработка уже выполняется",
      });
    }
    throw error;
  }
  const jobId = `knowledge-processing-${run.id}`;
  try {
    await getInfrastructure().systemQueue.add(
      knowledgeProcessingJobName,
      {
        projectId: project.id,
        runId: run.id,
        requestedAt: new Date().toISOString(),
        requestId,
      },
      { jobId, attempts: 1, removeOnComplete: 100 },
    );
  } catch {
    await failQueuedKnowledgeProcessingRunRecord(run.id, "KNOWLEDGE_PROCESSING_QUEUE_UNAVAILABLE");
    throw createError({ statusCode: 503, statusMessage: "Очередь обработки недоступна" });
  }
  await writeAuditEvent({
    projectId: project.id,
    actorUserId: session.userId,
    action: "knowledge.processing_requested",
    resourceType: "knowledge_processing_run",
    resourceId: run.id,
    requestId,
    metadata: { totalCount: run.totalCount, selection: input.selection.scope },
  });
  return { jobId, run: toRunResponse(run) };
};

export const controlKnowledgeProcessing = async (
  event: H3Event,
  projectId: string,
  runId: string,
  input: ControlKnowledgeProcessingRequest,
): Promise<KnowledgeProcessingRunResponse> => {
  const { session, project } = await requireProjectScope(event, projectId, "editor");
  assertCsrf(event, session);
  const current = await findKnowledgeProcessingRunRecord(project.id, runId);
  if (!current) {
    throw createError({ statusCode: 404, statusMessage: "Запуск постобработки не найден" });
  }
  if (current.status !== "running") {
    throw createError({
      statusCode: 409,
      statusMessage: "Приостановить или продолжить можно только выполняющуюся постобработку",
    });
  }
  const run = await setKnowledgeProcessingRunPausedRecord({
    projectId: project.id,
    runId,
    paused: input.paused,
  });
  if (!run) {
    throw createError({ statusCode: 409, statusMessage: "Состояние постобработки уже изменилось" });
  }
  await writeAuditEvent({
    projectId: project.id,
    actorUserId: session.userId,
    action: input.paused ? "knowledge.processing_paused" : "knowledge.processing_resumed",
    resourceType: "knowledge_processing_run",
    resourceId: run.id,
    requestId: getRequestId(event),
    metadata: { processedCount: run.processedCount, totalCount: run.totalCount },
  });
  return toRunResponse(run);
};

export const stopKnowledgeProcessing = async (
  event: H3Event,
  projectId: string,
  runId: string,
): Promise<KnowledgeProcessingRunResponse> => {
  const { session, project } = await requireProjectScope(event, projectId, "editor");
  assertCsrf(event, session);
  const current = await findKnowledgeProcessingRunRecord(project.id, runId);
  if (!current) {
    throw createError({ statusCode: 404, statusMessage: "Запуск постобработки не найден" });
  }
  if (!["queued", "running"].includes(current.status)) {
    throw createError({
      statusCode: 409,
      statusMessage: "Остановить можно только активную постобработку",
    });
  }
  const run = await stopKnowledgeProcessingRunRecord({ projectId: project.id, runId });
  if (!run) {
    throw createError({ statusCode: 409, statusMessage: "Состояние постобработки уже изменилось" });
  }
  await writeAuditEvent({
    projectId: project.id,
    actorUserId: session.userId,
    action: "knowledge.processing_stop_requested",
    resourceType: "knowledge_processing_run",
    resourceId: run.id,
    requestId: getRequestId(event),
    metadata: { processedCount: run.processedCount, totalCount: run.totalCount },
  });
  return toRunResponse(run);
};

export const deleteKnowledgeProcessingRun = async (
  event: H3Event,
  projectId: string,
  runId: string,
): Promise<DeleteKnowledgeProcessingRunResponse> => {
  const { session, project } = await requireProjectScope(event, projectId, "editor");
  assertCsrf(event, session);
  const found = await findKnowledgeProcessingRunRecord(project.id, runId);
  if (!found) {
    throw createError({ statusCode: 404, statusMessage: "Запуск постобработки не найден" });
  }
  const current = await reconcileStoppedKnowledgeProcessingRun(found);
  if (["queued", "running"].includes(current.status)) {
    throw createError({
      statusCode: 409,
      statusMessage: "Сначала остановите активную постобработку",
    });
  }
  if (current.status === "cancelled" && !current.finishedAt) {
    throw createError({
      statusCode: 409,
      statusMessage: "Дождитесь подтверждения остановки worker-ом",
    });
  }
  await removeKnowledgeProcessingRunJob(runId);
  const deleted = await deleteTerminalKnowledgeProcessingRunRecord({
    projectId: project.id,
    runId,
  });
  if (!deleted) {
    throw createError({ statusCode: 409, statusMessage: "Состояние постобработки уже изменилось" });
  }
  await writeAuditEvent({
    projectId: project.id,
    actorUserId: session.userId,
    action: "knowledge.processing_deleted",
    resourceType: "knowledge_processing_run",
    resourceId: current.id,
    requestId: getRequestId(event),
    metadata: {
      processedCount: current.processedCount,
      succeededCount: current.succeededCount,
      failedCount: current.failedCount,
    },
  });
  return { deleted: true };
};

export const bulkMutateKnowledgeDocuments = async (
  event: H3Event,
  projectId: string,
  input: BulkKnowledgeDocumentsRequest,
): Promise<BulkKnowledgeDocumentsResponse> => {
  const { session, project } = await requireProjectScope(event, projectId, "editor");
  assertCsrf(event, session);
  if (input.action === "delete") assertRecentAdminAuthentication(session);
  await assertKnowledgeIsMutable(project.id);
  const result = await bulkMutateKnowledgeDocumentRecords({
    projectId: project.id,
    documentIds: input.documentIds,
    action: input.action,
    actorUserId: session.userId,
  });
  await writeAuditEvent({
    projectId: project.id,
    actorUserId: session.userId,
    action: `knowledge.documents_bulk_${input.action}`,
    resourceType: "knowledge_document",
    resourceId: project.id,
    requestId: getRequestId(event),
    metadata: { requestedCount: input.documentIds.length, ...result },
  });
  return { action: input.action, ...result };
};

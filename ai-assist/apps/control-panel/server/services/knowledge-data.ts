import type { ClearKnowledgeDataRequest, ClearKnowledgeDataResponse } from "@ai-assist/contracts";
import type { H3Event } from "h3";

import { writeAuditEvent } from "../repositories/audit";
import {
  deleteTerminalCrawlRunRecords,
  deleteUrlSourceRecords,
  listCrawlRunRecords,
} from "../repositories/crawler";
import {
  clearKnowledgeDocumentRecords,
  findPendingKnowledgeIndexVersion,
} from "../repositories/knowledge";
import { findPendingKnowledgeProcessingRunRecord } from "../repositories/knowledge-processing";
import { getInfrastructure } from "../utils/infrastructure";
import { getRequestId } from "../utils/request";
import { assertCsrf, assertRecentAdminAuthentication, requireProjectScope } from "./auth";

const removeCrawlRunJobs = async (runIds: string[]): Promise<void> => {
  for (const runId of runIds) {
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
  }
};

export const clearKnowledgeData = async (
  event: H3Event,
  projectId: string,
  input: ClearKnowledgeDataRequest,
): Promise<ClearKnowledgeDataResponse> => {
  const { session, project } = await requireProjectScope(event, projectId, "owner");
  assertCsrf(event, session);
  assertRecentAdminAuthentication(session);

  const clearsSources = input.scope === "sources" || input.scope === "all";
  const clearsHistory =
    input.scope === "crawl_history" || input.scope === "sources" || input.scope === "all";
  const clearsDocuments = input.scope === "documents" || input.scope === "all";
  const runs = clearsHistory ? await listCrawlRunRecords(project.id) : [];
  if (runs.some((run) => run.status === "queued" || run.status === "running")) {
    throw createError({
      statusCode: 409,
      statusMessage: "Сначала остановите все активные задания парсинга",
    });
  }
  if (clearsDocuments && (await findPendingKnowledgeIndexVersion(project.id))) {
    throw createError({
      statusCode: 409,
      statusMessage: "Дождитесь завершения текущей индексации",
    });
  }
  if (clearsDocuments && (await findPendingKnowledgeProcessingRunRecord(project.id))) {
    throw createError({
      statusCode: 409,
      statusMessage: "Дождитесь завершения массовой обработки записей",
    });
  }

  if (clearsHistory) await removeCrawlRunJobs(runs.map((run) => run.id));
  const deletedRunIds = clearsHistory ? await deleteTerminalCrawlRunRecords(project.id) : [];
  const documentResult = clearsDocuments
    ? await clearKnowledgeDocumentRecords(project.id)
    : { deletedDocuments: 0, deletedIndexVersions: 0 };
  const sourceResult = clearsSources
    ? await deleteUrlSourceRecords({
        projectId: project.id,
        preserveDocuments: !clearsDocuments,
      })
    : {
        status: "deleted" as const,
        deletedSources: 0,
        deletedCrawlRuns: 0,
        preservedDocuments: 0,
      };
  if (sourceResult.status === "active") {
    throw createError({ statusCode: 409, statusMessage: "Сначала остановите активный парсинг" });
  }
  if (sourceResult.status !== "deleted") {
    throw createError({ statusCode: 409, statusMessage: "Не удалось удалить источники сайта" });
  }

  const result = {
    deletedCrawlRuns: deletedRunIds.length + sourceResult.deletedCrawlRuns,
    ...documentResult,
    deletedSources: sourceResult.deletedSources,
    preservedDocuments: sourceResult.preservedDocuments,
  };
  await writeAuditEvent({
    projectId: project.id,
    actorUserId: session.userId,
    action: "knowledge.data_cleared",
    resourceType: "project_knowledge",
    resourceId: project.id,
    requestId: getRequestId(event),
    metadata: { scope: input.scope, ...result },
  });
  return result;
};

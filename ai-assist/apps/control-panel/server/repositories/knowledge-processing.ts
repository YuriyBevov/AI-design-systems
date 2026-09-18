import { and, asc, desc, eq, inArray, isNull, max } from "drizzle-orm";

import {
  knowledgeDocuments,
  knowledgeDocumentVersions,
  knowledgeProcessingItems,
  knowledgeProcessingRuns,
  users,
} from "@ai-assist/database";
import type { KnowledgeProcessingRunStatus } from "@ai-assist/contracts";

import { getInfrastructure } from "../utils/infrastructure";

export type KnowledgeProcessingRunRecord = {
  id: string;
  projectId: string;
  status: KnowledgeProcessingRunStatus;
  instruction: string;
  totalCount: number;
  processedCount: number;
  succeededCount: number;
  failedCount: number;
  pauseRequestedAt: Date | null;
  errorCode: string | null;
  requestedByEmail: string | null;
  requestId: string;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const runSelection = {
  id: knowledgeProcessingRuns.id,
  projectId: knowledgeProcessingRuns.projectId,
  status: knowledgeProcessingRuns.status,
  instruction: knowledgeProcessingRuns.instruction,
  totalCount: knowledgeProcessingRuns.totalCount,
  processedCount: knowledgeProcessingRuns.processedCount,
  succeededCount: knowledgeProcessingRuns.succeededCount,
  failedCount: knowledgeProcessingRuns.failedCount,
  pauseRequestedAt: knowledgeProcessingRuns.pauseRequestedAt,
  errorCode: knowledgeProcessingRuns.errorCode,
  requestedByEmail: users.emailNormalized,
  requestId: knowledgeProcessingRuns.requestId,
  startedAt: knowledgeProcessingRuns.startedAt,
  finishedAt: knowledgeProcessingRuns.finishedAt,
  createdAt: knowledgeProcessingRuns.createdAt,
  updatedAt: knowledgeProcessingRuns.updatedAt,
};

const runQuery = () =>
  getInfrastructure()
    .database.db.select(runSelection)
    .from(knowledgeProcessingRuns)
    .leftJoin(users, eq(users.id, knowledgeProcessingRuns.requestedBy));

export const findLatestKnowledgeProcessingRunRecord = async (
  projectId: string,
): Promise<KnowledgeProcessingRunRecord | null> => {
  const [run] = await runQuery()
    .where(eq(knowledgeProcessingRuns.projectId, projectId))
    .orderBy(desc(knowledgeProcessingRuns.createdAt), desc(knowledgeProcessingRuns.id))
    .limit(1);
  return run ?? null;
};

export const findKnowledgeProcessingRunRecord = async (
  projectId: string,
  runId: string,
): Promise<KnowledgeProcessingRunRecord | null> => {
  const [run] = await runQuery()
    .where(
      and(eq(knowledgeProcessingRuns.projectId, projectId), eq(knowledgeProcessingRuns.id, runId)),
    )
    .limit(1);
  return run ?? null;
};

export const listKnowledgeProcessingRunRecords = async (
  projectId: string,
): Promise<KnowledgeProcessingRunRecord[]> =>
  runQuery()
    .where(eq(knowledgeProcessingRuns.projectId, projectId))
    .orderBy(desc(knowledgeProcessingRuns.createdAt), desc(knowledgeProcessingRuns.id))
    .limit(5_000);

export const findPendingKnowledgeProcessingRunRecord = async (
  projectId: string,
): Promise<KnowledgeProcessingRunRecord | null> => {
  const [run] = await runQuery()
    .where(
      and(
        eq(knowledgeProcessingRuns.projectId, projectId),
        inArray(knowledgeProcessingRuns.status, ["queued", "running"]),
      ),
    )
    .orderBy(asc(knowledgeProcessingRuns.createdAt))
    .limit(1);
  return run ?? null;
};

export const createKnowledgeProcessingRunRecord = async (input: {
  projectId: string;
  requestedBy: string;
  requestId: string;
  instruction: string;
  documentIds: string[] | null;
}): Promise<KnowledgeProcessingRunRecord> => {
  const runId = await getInfrastructure().database.db.transaction(async (transaction) => {
    const latestVersions = transaction
      .select({
        documentId: knowledgeDocumentVersions.documentId,
        versionNo: max(knowledgeDocumentVersions.versionNo).as("latest_version_no"),
      })
      .from(knowledgeDocumentVersions)
      .groupBy(knowledgeDocumentVersions.documentId)
      .as("latest_versions");
    const candidates = await transaction
      .select({
        documentId: knowledgeDocuments.id,
        sourceVersionId: knowledgeDocumentVersions.id,
      })
      .from(knowledgeDocuments)
      .innerJoin(latestVersions, eq(latestVersions.documentId, knowledgeDocuments.id))
      .innerJoin(
        knowledgeDocumentVersions,
        and(
          eq(knowledgeDocumentVersions.documentId, knowledgeDocuments.id),
          eq(knowledgeDocumentVersions.versionNo, latestVersions.versionNo),
        ),
      )
      .where(
        and(
          eq(knowledgeDocuments.projectId, input.projectId),
          inArray(knowledgeDocuments.status, ["draft", "published"]),
          ...(input.documentIds ? [inArray(knowledgeDocuments.id, input.documentIds)] : []),
        ),
      )
      .orderBy(asc(knowledgeDocuments.createdAt), asc(knowledgeDocuments.id));
    if (!candidates.length) throw new Error("KNOWLEDGE_PROCESSING_DOCUMENTS_REQUIRED");
    const [run] = await transaction
      .insert(knowledgeProcessingRuns)
      .values({
        projectId: input.projectId,
        instruction: input.instruction,
        totalCount: candidates.length,
        requestedBy: input.requestedBy,
        requestId: input.requestId,
      })
      .returning({ id: knowledgeProcessingRuns.id });
    if (!run) throw new Error("KNOWLEDGE_PROCESSING_RUN_CREATE_FAILED");
    await transaction.insert(knowledgeProcessingItems).values(
      candidates.map((candidate) => ({
        runId: run.id,
        projectId: input.projectId,
        documentId: candidate.documentId,
        sourceVersionId: candidate.sourceVersionId,
      })),
    );
    return run.id;
  });
  const [created] = await runQuery()
    .where(
      and(
        eq(knowledgeProcessingRuns.projectId, input.projectId),
        eq(knowledgeProcessingRuns.id, runId),
      ),
    )
    .limit(1);
  if (!created) throw new Error("KNOWLEDGE_PROCESSING_RUN_CREATE_FAILED");
  return created;
};

export const failQueuedKnowledgeProcessingRunRecord = async (
  runId: string,
  errorCode: string,
): Promise<void> => {
  const failedAt = new Date();
  await getInfrastructure()
    .database.db.update(knowledgeProcessingRuns)
    .set({ status: "failed", errorCode, finishedAt: failedAt, updatedAt: failedAt })
    .where(
      and(eq(knowledgeProcessingRuns.id, runId), eq(knowledgeProcessingRuns.status, "queued")),
    );
};

export const setKnowledgeProcessingRunPausedRecord = async (input: {
  projectId: string;
  runId: string;
  paused: boolean;
}): Promise<KnowledgeProcessingRunRecord | null> => {
  const [updated] = await getInfrastructure()
    .database.db.update(knowledgeProcessingRuns)
    .set({ pauseRequestedAt: input.paused ? new Date() : null, updatedAt: new Date() })
    .where(
      and(
        eq(knowledgeProcessingRuns.projectId, input.projectId),
        eq(knowledgeProcessingRuns.id, input.runId),
        eq(knowledgeProcessingRuns.status, "running"),
      ),
    )
    .returning({ id: knowledgeProcessingRuns.id });
  return updated ? findKnowledgeProcessingRunRecord(input.projectId, updated.id) : null;
};

export const stopKnowledgeProcessingRunRecord = async (input: {
  projectId: string;
  runId: string;
}): Promise<KnowledgeProcessingRunRecord | null> => {
  const [updated] = await getInfrastructure()
    .database.db.update(knowledgeProcessingRuns)
    .set({
      status: "cancelled",
      pauseRequestedAt: null,
      errorCode: null,
      finishedAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(knowledgeProcessingRuns.projectId, input.projectId),
        eq(knowledgeProcessingRuns.id, input.runId),
        inArray(knowledgeProcessingRuns.status, ["queued", "running"]),
      ),
    )
    .returning({ id: knowledgeProcessingRuns.id });
  return updated ? findKnowledgeProcessingRunRecord(input.projectId, updated.id) : null;
};

export const acknowledgeStoppedKnowledgeProcessingRunRecord = async (input: {
  projectId: string;
  runId: string;
}): Promise<KnowledgeProcessingRunRecord | null> => {
  const stoppedAt = new Date();
  await getInfrastructure()
    .database.db.update(knowledgeProcessingRuns)
    .set({ finishedAt: stoppedAt, updatedAt: stoppedAt })
    .where(
      and(
        eq(knowledgeProcessingRuns.projectId, input.projectId),
        eq(knowledgeProcessingRuns.id, input.runId),
        eq(knowledgeProcessingRuns.status, "cancelled"),
        isNull(knowledgeProcessingRuns.finishedAt),
      ),
    );
  return findKnowledgeProcessingRunRecord(input.projectId, input.runId);
};

export const deleteTerminalKnowledgeProcessingRunRecord = async (input: {
  projectId: string;
  runId: string;
}): Promise<boolean> => {
  const [deleted] = await getInfrastructure()
    .database.db.delete(knowledgeProcessingRuns)
    .where(
      and(
        eq(knowledgeProcessingRuns.projectId, input.projectId),
        eq(knowledgeProcessingRuns.id, input.runId),
        inArray(knowledgeProcessingRuns.status, ["succeeded", "partial", "failed", "cancelled"]),
      ),
    )
    .returning({ id: knowledgeProcessingRuns.id });
  return Boolean(deleted);
};

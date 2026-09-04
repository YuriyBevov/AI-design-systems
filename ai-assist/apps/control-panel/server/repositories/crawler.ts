import { and, asc, desc, eq, inArray, max, ne, sql } from "drizzle-orm";

import {
  knowledgeCrawlPages,
  knowledgeCrawlRuns,
  knowledgeDocumentPublications,
  knowledgeDocuments,
  knowledgeDocumentVersions,
  knowledgeSources,
  users,
} from "@ai-assist/database";
import type {
  CrawlChangeType,
  CrawlPageStatus,
  CrawlReviewStatus,
  CrawlRunStatus,
  UrlKnowledgeSourceSettings,
} from "@ai-assist/contracts";

import { getInfrastructure } from "../utils/infrastructure";

export type UrlSourceRecord = {
  id: string;
  projectId: string;
  name: string;
  status: "active" | "archived";
  version: number;
  settings: Record<string, unknown>;
  lastCrawledAt: Date | null;
  lastSuccessfulCrawlAt: Date | null;
  lastErrorCode: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CrawlRunRecord = {
  id: string;
  projectId: string;
  sourceId: string;
  status: CrawlRunStatus;
  discoveredCount: number;
  processedCount: number;
  succeededCount: number;
  failedCount: number;
  newCount: number;
  changedCount: number;
  unchangedCount: number;
  approvedCount: number;
  profileVersion: string;
  errorCode: string | null;
  requestedByEmail: string | null;
  requestId: string;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CrawlPageRecord = {
  id: string;
  normalizedUrl: string;
  depth: number;
  status: CrawlPageStatus;
  httpStatus: number | null;
  contentType: string | null;
  documentId: string | null;
  documentVersionId: string | null;
  changeType: CrawlChangeType | null;
  documentType: "page" | "product" | null;
  title: string | null;
  contentChecksum: string | null;
  confidence: number | null;
  warnings: string[];
  errorCode: string | null;
  retryable: boolean;
  reviewStatus: CrawlReviewStatus;
  contentPreview: string | null;
  fetchedAt: Date | null;
};

const sourceSelection = {
  id: knowledgeSources.id,
  projectId: knowledgeSources.projectId,
  name: knowledgeSources.name,
  status: knowledgeSources.status,
  version: knowledgeSources.version,
  settings: knowledgeSources.settings,
  lastCrawledAt: knowledgeSources.lastCrawledAt,
  lastSuccessfulCrawlAt: knowledgeSources.lastSuccessfulCrawlAt,
  lastErrorCode: knowledgeSources.lastErrorCode,
  createdAt: knowledgeSources.createdAt,
  updatedAt: knowledgeSources.updatedAt,
};

const runSelection = {
  id: knowledgeCrawlRuns.id,
  projectId: knowledgeCrawlRuns.projectId,
  sourceId: knowledgeCrawlRuns.sourceId,
  status: knowledgeCrawlRuns.status,
  discoveredCount: knowledgeCrawlRuns.discoveredCount,
  processedCount: knowledgeCrawlRuns.processedCount,
  succeededCount: knowledgeCrawlRuns.succeededCount,
  failedCount: knowledgeCrawlRuns.failedCount,
  newCount: knowledgeCrawlRuns.newCount,
  changedCount: knowledgeCrawlRuns.changedCount,
  unchangedCount: knowledgeCrawlRuns.unchangedCount,
  approvedCount: knowledgeCrawlRuns.approvedCount,
  profileVersion: knowledgeCrawlRuns.profileVersion,
  errorCode: knowledgeCrawlRuns.errorCode,
  requestedByEmail: users.emailNormalized,
  requestId: knowledgeCrawlRuns.requestId,
  startedAt: knowledgeCrawlRuns.startedAt,
  finishedAt: knowledgeCrawlRuns.finishedAt,
  createdAt: knowledgeCrawlRuns.createdAt,
  updatedAt: knowledgeCrawlRuns.updatedAt,
};

const runQuery = () =>
  getInfrastructure()
    .database.db.select(runSelection)
    .from(knowledgeCrawlRuns)
    .leftJoin(users, eq(users.id, knowledgeCrawlRuns.requestedBy));

export const listUrlSourceRecords = async (projectId: string): Promise<UrlSourceRecord[]> =>
  getInfrastructure()
    .database.db.select(sourceSelection)
    .from(knowledgeSources)
    .where(and(eq(knowledgeSources.projectId, projectId), eq(knowledgeSources.type, "url")))
    .orderBy(desc(knowledgeSources.updatedAt), asc(knowledgeSources.id));

export const findUrlSourceRecord = async (
  projectId: string,
  sourceId: string,
): Promise<UrlSourceRecord | null> => {
  const [source] = await getInfrastructure()
    .database.db.select(sourceSelection)
    .from(knowledgeSources)
    .where(
      and(
        eq(knowledgeSources.projectId, projectId),
        eq(knowledgeSources.id, sourceId),
        eq(knowledgeSources.type, "url"),
      ),
    )
    .limit(1);
  return source ?? null;
};

export const createUrlSourceRecord = async (input: {
  projectId: string;
  name: string;
  settings: UrlKnowledgeSourceSettings;
}): Promise<UrlSourceRecord> => {
  const [source] = await getInfrastructure()
    .database.db.insert(knowledgeSources)
    .values({ projectId: input.projectId, type: "url", name: input.name, settings: input.settings })
    .returning(sourceSelection);
  if (!source) throw new Error("URL source creation failed");
  return source;
};

export const updateUrlSourceRecord = async (input: {
  projectId: string;
  sourceId: string;
  expectedVersion: number;
  name: string;
  status: "active" | "archived";
  settings: UrlKnowledgeSourceSettings;
}): Promise<UrlSourceRecord | null> => {
  const [source] = await getInfrastructure()
    .database.db.update(knowledgeSources)
    .set({
      name: input.name,
      status: input.status,
      settings: input.settings,
      version: sql`${knowledgeSources.version} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(knowledgeSources.projectId, input.projectId),
        eq(knowledgeSources.id, input.sourceId),
        eq(knowledgeSources.type, "url"),
        eq(knowledgeSources.version, input.expectedVersion),
      ),
    )
    .returning(sourceSelection);
  return source ?? null;
};

export const findLatestCrawlRunRecords = async (projectId: string): Promise<CrawlRunRecord[]> => {
  const rows = await runQuery()
    .where(eq(knowledgeCrawlRuns.projectId, projectId))
    .orderBy(asc(knowledgeCrawlRuns.sourceId), desc(knowledgeCrawlRuns.createdAt))
    .limit(1_000);
  const latest = new Map<string, CrawlRunRecord>();
  for (const row of rows) if (!latest.has(row.sourceId)) latest.set(row.sourceId, row);
  return [...latest.values()];
};

export const findCrawlRunRecord = async (
  projectId: string,
  runId: string,
): Promise<CrawlRunRecord | null> => {
  const [run] = await runQuery()
    .where(and(eq(knowledgeCrawlRuns.projectId, projectId), eq(knowledgeCrawlRuns.id, runId)))
    .limit(1);
  return run ?? null;
};

export const findPendingCrawlRunRecord = async (
  projectId: string,
  sourceId: string,
): Promise<CrawlRunRecord | null> => {
  const [run] = await runQuery()
    .where(
      and(
        eq(knowledgeCrawlRuns.projectId, projectId),
        eq(knowledgeCrawlRuns.sourceId, sourceId),
        inArray(knowledgeCrawlRuns.status, ["queued", "running"]),
      ),
    )
    .orderBy(desc(knowledgeCrawlRuns.createdAt))
    .limit(1);
  return run ?? null;
};

export const createCrawlRunRecord = async (input: {
  projectId: string;
  sourceId: string;
  requestedBy: string;
  requestId: string;
}): Promise<CrawlRunRecord> => {
  const [run] = await getInfrastructure()
    .database.db.insert(knowledgeCrawlRuns)
    .values({ ...input, profileVersion: "pending-v1" })
    .returning();
  if (!run) throw new Error("Crawl run creation failed");
  return { ...run, requestedByEmail: null };
};

export const failQueuedCrawlRunRecord = async (runId: string, errorCode: string): Promise<void> => {
  const now = new Date();
  await getInfrastructure()
    .database.db.update(knowledgeCrawlRuns)
    .set({ status: "failed", errorCode, finishedAt: now, updatedAt: now })
    .where(and(eq(knowledgeCrawlRuns.id, runId), eq(knowledgeCrawlRuns.status, "queued")));
};

export const listCrawlPageRecords = async (
  projectId: string,
  runId: string,
  input: { limit: number; offset: number },
): Promise<{ records: CrawlPageRecord[]; totalItems: number }> => {
  const where = and(
    eq(knowledgeCrawlPages.projectId, projectId),
    eq(knowledgeCrawlPages.runId, runId),
  );
  const [rows, [total]] = await Promise.all([
    getInfrastructure()
      .database.db.select({
        id: knowledgeCrawlPages.id,
        normalizedUrl: knowledgeCrawlPages.normalizedUrl,
        depth: knowledgeCrawlPages.depth,
        status: knowledgeCrawlPages.status,
        httpStatus: knowledgeCrawlPages.httpStatus,
        contentType: knowledgeCrawlPages.contentType,
        documentId: knowledgeCrawlPages.documentId,
        documentVersionId: knowledgeCrawlPages.documentVersionId,
        changeType: knowledgeCrawlPages.changeType,
        documentType: knowledgeCrawlPages.documentType,
        title: knowledgeCrawlPages.title,
        contentChecksum: knowledgeCrawlPages.contentChecksum,
        confidence: knowledgeCrawlPages.confidence,
        warnings: knowledgeCrawlPages.warnings,
        errorCode: knowledgeCrawlPages.errorCode,
        retryable: knowledgeCrawlPages.retryable,
        reviewStatus: knowledgeCrawlPages.reviewStatus,
        contentPreview: sql<
          string | null
        >`substring(${knowledgeDocumentVersions.plainText}, 1, 1000)`,
        fetchedAt: knowledgeCrawlPages.fetchedAt,
      })
      .from(knowledgeCrawlPages)
      .leftJoin(
        knowledgeDocumentVersions,
        eq(knowledgeDocumentVersions.id, knowledgeCrawlPages.documentVersionId),
      )
      .where(where)
      .orderBy(asc(knowledgeCrawlPages.createdAt), asc(knowledgeCrawlPages.id))
      .limit(input.limit)
      .offset(input.offset),
    getInfrastructure()
      .database.db.select({ value: sql<number>`count(*)::int` })
      .from(knowledgeCrawlPages)
      .where(where),
  ]);
  return {
    records: rows.map((row) => ({
      ...row,
      documentType: row.documentType === "manual" ? null : row.documentType,
      contentPreview: row.contentPreview || null,
    })),
    totalItems: total?.value ?? 0,
  };
};

export const publishCrawlRunRecords = async (input: {
  projectId: string;
  runId: string;
  publishedBy: string;
  selection: "selected" | "all";
  pageIds: string[];
}): Promise<{ publishedCount: number; skippedCount: number }> =>
  getInfrastructure().database.db.transaction(async (transaction) => {
    const [run] = await transaction
      .select({ id: knowledgeCrawlRuns.id, status: knowledgeCrawlRuns.status })
      .from(knowledgeCrawlRuns)
      .where(
        and(
          eq(knowledgeCrawlRuns.projectId, input.projectId),
          eq(knowledgeCrawlRuns.id, input.runId),
        ),
      )
      .limit(1);
    if (!run) throw new Error("CRAWL_RUN_NOT_FOUND");
    if (!(["succeeded", "partial"] as CrawlRunStatus[]).includes(run.status)) {
      throw new Error("CRAWL_RUN_NOT_REVIEWABLE");
    }
    const pages = await transaction
      .select({
        id: knowledgeCrawlPages.id,
        documentId: knowledgeCrawlPages.documentId,
        documentVersionId: knowledgeCrawlPages.documentVersionId,
      })
      .from(knowledgeCrawlPages)
      .where(
        and(
          eq(knowledgeCrawlPages.projectId, input.projectId),
          eq(knowledgeCrawlPages.runId, input.runId),
          ...(input.selection === "selected"
            ? [inArray(knowledgeCrawlPages.id, input.pageIds)]
            : []),
          eq(knowledgeCrawlPages.status, "succeeded"),
          eq(knowledgeCrawlPages.reviewStatus, "pending"),
          inArray(knowledgeCrawlPages.changeType, ["new", "changed"]),
        ),
      );
    let publishedCount = 0;
    for (const page of pages) {
      if (!page.documentId || !page.documentVersionId) continue;
      const [latest] = await transaction
        .select({
          versionNo: max(knowledgeDocumentVersions.versionNo),
          status: knowledgeDocuments.status,
          currentVersion: knowledgeDocuments.version,
        })
        .from(knowledgeDocuments)
        .innerJoin(
          knowledgeDocumentVersions,
          eq(knowledgeDocumentVersions.documentId, knowledgeDocuments.id),
        )
        .where(
          and(
            eq(knowledgeDocuments.projectId, input.projectId),
            eq(knowledgeDocuments.id, page.documentId),
          ),
        )
        .groupBy(knowledgeDocuments.status, knowledgeDocuments.version)
        .limit(1);
      const [target] = await transaction
        .select({ versionNo: knowledgeDocumentVersions.versionNo })
        .from(knowledgeDocumentVersions)
        .where(
          and(
            eq(knowledgeDocumentVersions.id, page.documentVersionId),
            eq(knowledgeDocumentVersions.documentId, page.documentId),
          ),
        )
        .limit(1);
      if (
        !latest ||
        !target ||
        latest.status === "archived" ||
        target.versionNo !== Number(latest.versionNo)
      ) {
        await transaction
          .update(knowledgeCrawlPages)
          .set({
            reviewStatus: "rejected",
            warnings: sql`${knowledgeCrawlPages.warnings} || '["STALE_DRAFT"]'::jsonb`,
          })
          .where(eq(knowledgeCrawlPages.id, page.id));
        continue;
      }
      const [changed] = await transaction
        .update(knowledgeDocuments)
        .set({
          activeVersionId: page.documentVersionId,
          status: "published",
          version: sql`${knowledgeDocuments.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(knowledgeDocuments.projectId, input.projectId),
            eq(knowledgeDocuments.id, page.documentId),
            eq(knowledgeDocuments.version, latest.currentVersion),
            ne(knowledgeDocuments.status, "archived"),
          ),
        )
        .returning({ id: knowledgeDocuments.id });
      if (!changed) continue;
      await transaction.insert(knowledgeDocumentPublications).values({
        documentId: page.documentId,
        documentVersionId: page.documentVersionId,
        publishedBy: input.publishedBy,
      });
      await transaction
        .update(knowledgeCrawlPages)
        .set({ reviewStatus: "approved" })
        .where(eq(knowledgeCrawlPages.id, page.id));
      publishedCount += 1;
    }
    if (publishedCount) {
      await transaction
        .update(knowledgeCrawlRuns)
        .set({
          approvedCount: sql`${knowledgeCrawlRuns.approvedCount} + ${publishedCount}`,
          updatedAt: new Date(),
        })
        .where(eq(knowledgeCrawlRuns.id, input.runId));
    }
    return {
      publishedCount,
      skippedCount:
        (input.selection === "selected" ? input.pageIds.length : pages.length) - publishedCount,
    };
  });

import { createHash } from "node:crypto";

import {
  knowledgeProductInputSchema,
  urlKnowledgeSourceSettingsSchema,
  type CrawlChangeType,
  type KnowledgeCrawlJobData,
  type KnowledgeCrawlJobResult,
  type KnowledgeProductInput,
} from "@ai-assist/contracts";
import { CrawlerError, crawlWebsite, type CrawlPageResult } from "@ai-assist/crawler";
import {
  auditEvents,
  type DatabaseConnection,
  knowledgeChunks,
  knowledgeCrawlPages,
  knowledgeCrawlRuns,
  knowledgeDocuments,
  knowledgeDocumentVersions,
  knowledgeProducts,
  knowledgeSources,
  projects,
} from "@ai-assist/database";
import {
  checksumKnowledgeContent,
  chunkKnowledgeText,
  estimateKnowledgeTokenCount,
  normalizeKnowledgeText,
} from "@ai-assist/domain";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";

class KnowledgeCrawlError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "KnowledgeCrawlError";
    this.code = code;
  }
}

const errorCode = (error: unknown): string => {
  if (error instanceof KnowledgeCrawlError || error instanceof CrawlerError) return error.code;
  return "KNOWLEDGE_CRAWL_FAILED";
};

const buildProductFacts = (product: KnowledgeProductInput): string[] => [
  ...(product.externalId ? [`Внешний идентификатор: ${product.externalId}`] : []),
  ...(product.sku ? [`Артикул: ${product.sku}`] : []),
  ...(product.category ? [`Категория: ${product.category}`] : []),
  ...(product.priceDisplay ? [`Цена: ${product.priceDisplay}`] : []),
  ...(product.priceAmount !== null
    ? [`Сумма цены: ${product.priceAmount}${product.currency ? ` ${product.currency}` : ""}`]
    : []),
  ...(product.availability ? [`Наличие: ${product.availability}`] : []),
  ...Object.entries(product.characteristics)
    .sort(([left], [right]) => left.localeCompare(right, "ru-RU"))
    .map(([name, value]) => `${name}: ${value}`),
];

const buildVersion = (page: CrawlPageResult, locale: string) => {
  const extracted = page.extracted;
  if (!extracted) throw new KnowledgeCrawlError("CRAWL_EXTRACTED_PAGE_REQUIRED");
  const title = normalizeKnowledgeText(extracted.title);
  const content = normalizeKnowledgeText(extracted.content);
  const product = extracted.product
    ? knowledgeProductInputSchema.parse({
        ...extracted.product,
        priceDisplay:
          extracted.product.priceDisplay ??
          (extracted.product.priceAmount !== null
            ? `${extracted.product.priceAmount} ${extracted.product.currency ?? "RUB"}`
            : null),
      })
    : null;
  const retrievalText = normalizeKnowledgeText(
    [title, ...(product ? buildProductFacts(product) : []), content].join("\n\n"),
  );
  const checksumPayload = JSON.stringify({
    type: extracted.type,
    title,
    content,
    canonicalUrl: extracted.canonicalUrl,
    locale,
    tags: ["site-crawl"],
    product,
  });
  const chunks = chunkKnowledgeText(retrievalText).map((text) => ({
    text,
    tokenCount: estimateKnowledgeTokenCount(text),
    contentChecksum: checksumKnowledgeContent(text),
  }));
  if (!chunks.length || chunks.length > 40) {
    throw new KnowledgeCrawlError("KNOWLEDGE_CHUNK_LIMIT");
  }
  return {
    title,
    canonicalUrl: extracted.canonicalUrl,
    locale,
    plainText: content,
    tags: ["site-crawl"],
    contentChecksum: checksumKnowledgeContent(checksumPayload),
    product,
    chunks,
  };
};

const insertVersionChildren = async (
  transaction: Parameters<Parameters<DatabaseConnection["db"]["transaction"]>[0]>[0],
  input: {
    projectId: string;
    documentVersionId: string;
    product: KnowledgeProductInput | null;
    chunks: Array<{ text: string; tokenCount: number; contentChecksum: string }>;
  },
): Promise<void> => {
  if (input.product) {
    await transaction.insert(knowledgeProducts).values({
      documentVersionId: input.documentVersionId,
      externalId: input.product.externalId,
      sku: input.product.sku,
      category: input.product.category,
      priceDisplay: input.product.priceDisplay,
      priceAmount: input.product.priceAmount?.toString() ?? null,
      currency: input.product.currency,
      availability: input.product.availability,
      minimumOrder: input.product.minimumOrder?.toString() ?? null,
      characteristics: input.product.characteristics,
    });
  }
  await transaction.insert(knowledgeChunks).values(
    input.chunks.map((chunk, ordinal) => ({
      projectId: input.projectId,
      documentVersionId: input.documentVersionId,
      ordinal,
      plainText: chunk.text,
      tokenCount: chunk.tokenCount,
      contentChecksum: chunk.contentChecksum,
    })),
  );
};

const syncPageDraft = async (
  database: DatabaseConnection,
  input: {
    projectId: string;
    sourceId: string;
    requestedBy: string | null;
    locale: string;
    page: CrawlPageResult;
  },
): Promise<{
  documentId: string;
  documentVersionId: string;
  changeType: CrawlChangeType;
  title: string;
  contentChecksum: string;
}> => {
  const version = buildVersion(input.page, input.locale);
  const sourceExternalId = createHash("sha256")
    .update(input.page.extracted?.canonicalUrl ?? input.page.normalizedUrl, "utf8")
    .digest("hex");
  return database.db.transaction(async (transaction) => {
    const [existing] = await transaction
      .select({
        id: knowledgeDocuments.id,
        status: knowledgeDocuments.status,
        version: knowledgeDocuments.version,
      })
      .from(knowledgeDocuments)
      .where(
        and(
          eq(knowledgeDocuments.projectId, input.projectId),
          eq(knowledgeDocuments.sourceId, input.sourceId),
          eq(knowledgeDocuments.sourceExternalId, sourceExternalId),
        ),
      )
      .limit(1);
    if (existing?.status === "archived") {
      throw new KnowledgeCrawlError("CRAWL_DOCUMENT_ARCHIVED");
    }
    const [latest] = existing
      ? await transaction
          .select({
            id: knowledgeDocumentVersions.id,
            contentChecksum: knowledgeDocumentVersions.contentChecksum,
            versionNo: knowledgeDocumentVersions.versionNo,
          })
          .from(knowledgeDocumentVersions)
          .where(eq(knowledgeDocumentVersions.documentId, existing.id))
          .orderBy(desc(knowledgeDocumentVersions.versionNo))
          .limit(1)
      : [];
    if (existing && latest?.contentChecksum === version.contentChecksum) {
      return {
        documentId: existing.id,
        documentVersionId: latest.id,
        changeType: "unchanged" as const,
        title: version.title,
        contentChecksum: version.contentChecksum,
      };
    }
    let documentId: string;
    let versionNo: number;
    let changeType: CrawlChangeType;
    if (existing) {
      const [updated] = await transaction
        .update(knowledgeDocuments)
        .set({
          type: input.page.extracted!.type,
          version: sql`${knowledgeDocuments.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(knowledgeDocuments.id, existing.id),
            eq(knowledgeDocuments.projectId, input.projectId),
            eq(knowledgeDocuments.version, existing.version),
            ne(knowledgeDocuments.status, "archived"),
          ),
        )
        .returning({ id: knowledgeDocuments.id });
      if (!updated) throw new KnowledgeCrawlError("CRAWL_DOCUMENT_VERSION_CONFLICT");
      documentId = updated.id;
      versionNo = (latest?.versionNo ?? 0) + 1;
      changeType = "changed";
    } else {
      const [created] = await transaction
        .insert(knowledgeDocuments)
        .values({
          projectId: input.projectId,
          sourceId: input.sourceId,
          sourceExternalId,
          type: input.page.extracted!.type,
        })
        .returning({ id: knowledgeDocuments.id });
      if (!created) throw new KnowledgeCrawlError("CRAWL_DOCUMENT_CREATE_FAILED");
      documentId = created.id;
      versionNo = 1;
      changeType = "new";
    }
    const [createdVersion] = await transaction
      .insert(knowledgeDocumentVersions)
      .values({
        documentId,
        versionNo,
        title: version.title,
        canonicalUrl: version.canonicalUrl,
        locale: version.locale,
        plainText: version.plainText,
        tags: version.tags,
        contentChecksum: version.contentChecksum,
        createdBy: input.requestedBy,
      })
      .returning({ id: knowledgeDocumentVersions.id });
    if (!createdVersion) throw new KnowledgeCrawlError("CRAWL_VERSION_CREATE_FAILED");
    await insertVersionChildren(transaction, {
      projectId: input.projectId,
      documentVersionId: createdVersion.id,
      product: version.product,
      chunks: version.chunks,
    });
    return {
      documentId,
      documentVersionId: createdVersion.id,
      changeType,
      title: version.title,
      contentChecksum: version.contentChecksum,
    };
  });
};

export const createKnowledgeCrawlProcessor =
  (input: {
    database: DatabaseConnection;
  }): ((data: KnowledgeCrawlJobData) => Promise<KnowledgeCrawlJobResult>) =>
  async (data) => {
    const startedAt = new Date();
    const [claimed] = await input.database.db
      .update(knowledgeCrawlRuns)
      .set({
        status: "running",
        errorCode: null,
        startedAt,
        finishedAt: null,
        updatedAt: startedAt,
      })
      .where(
        and(
          eq(knowledgeCrawlRuns.id, data.runId),
          eq(knowledgeCrawlRuns.projectId, data.projectId),
          eq(knowledgeCrawlRuns.sourceId, data.sourceId),
          inArray(knowledgeCrawlRuns.status, ["queued", "failed"]),
        ),
      )
      .returning();
    if (!claimed) {
      const [existing] = await input.database.db
        .select()
        .from(knowledgeCrawlRuns)
        .where(
          and(
            eq(knowledgeCrawlRuns.id, data.runId),
            eq(knowledgeCrawlRuns.projectId, data.projectId),
          ),
        )
        .limit(1);
      if (existing && (existing.status === "succeeded" || existing.status === "partial")) {
        return {
          runId: existing.id,
          projectId: existing.projectId,
          status: existing.status,
          processedCount: existing.processedCount,
          succeededCount: existing.succeededCount,
          failedCount: existing.failedCount,
        };
      }
      throw new KnowledgeCrawlError("KNOWLEDGE_CRAWL_JOB_NOT_CLAIMABLE");
    }

    try {
      const [[source], [project]] = await Promise.all([
        input.database.db
          .select({
            id: knowledgeSources.id,
            type: knowledgeSources.type,
            status: knowledgeSources.status,
            settings: knowledgeSources.settings,
          })
          .from(knowledgeSources)
          .where(
            and(
              eq(knowledgeSources.id, data.sourceId),
              eq(knowledgeSources.projectId, data.projectId),
            ),
          )
          .limit(1),
        input.database.db
          .select({ defaultLocale: projects.defaultLocale })
          .from(projects)
          .where(eq(projects.id, data.projectId))
          .limit(1),
      ]);
      if (!source || source.type !== "url" || source.status !== "active") {
        throw new KnowledgeCrawlError("CRAWL_SOURCE_NOT_ACTIVE");
      }
      if (!project) throw new KnowledgeCrawlError("CRAWL_PROJECT_NOT_FOUND");
      const settings = urlKnowledgeSourceSettingsSchema.parse(source.settings);
      await input.database.db
        .delete(knowledgeCrawlPages)
        .where(eq(knowledgeCrawlPages.runId, data.runId));
      await input.database.db
        .update(knowledgeCrawlRuns)
        .set({
          discoveredCount: 0,
          processedCount: 0,
          succeededCount: 0,
          failedCount: 0,
          newCount: 0,
          changedCount: 0,
          unchangedCount: 0,
          approvedCount: 0,
          updatedAt: new Date(),
        })
        .where(eq(knowledgeCrawlRuns.id, data.runId));

      let succeededCount = 0;
      let failedCount = 0;
      let newCount = 0;
      let changedCount = 0;
      let unchangedCount = 0;
      const summary = await crawlWebsite({
        settings,
        onPage: async (page, discoveredCount) => {
          let persistedPage = page;
          let draft: Awaited<ReturnType<typeof syncPageDraft>> | null = null;
          if (page.status === "succeeded") {
            try {
              draft = await syncPageDraft(input.database, {
                projectId: data.projectId,
                sourceId: data.sourceId,
                requestedBy: claimed.requestedBy,
                locale: project.defaultLocale,
                page,
              });
              succeededCount += 1;
              if (draft.changeType === "new") newCount += 1;
              if (draft.changeType === "changed") changedCount += 1;
              if (draft.changeType === "unchanged") unchangedCount += 1;
            } catch (error) {
              failedCount += 1;
              persistedPage = {
                ...page,
                status: "failed",
                extracted: null,
                errorCode: errorCode(error),
                retryable: false,
              };
            }
          } else if (page.status === "failed") {
            failedCount += 1;
          }
          await input.database.db.insert(knowledgeCrawlPages).values({
            runId: data.runId,
            projectId: data.projectId,
            normalizedUrl: persistedPage.normalizedUrl,
            depth: persistedPage.depth,
            status: persistedPage.status,
            httpStatus: persistedPage.httpStatus,
            contentType: persistedPage.contentType,
            documentId: draft?.documentId ?? null,
            documentVersionId: draft?.documentVersionId ?? null,
            changeType: draft?.changeType ?? null,
            documentType: page.extracted?.type ?? null,
            title: draft?.title ?? page.extracted?.title ?? null,
            contentChecksum: draft?.contentChecksum ?? null,
            confidence: page.extracted?.confidence ?? null,
            warnings: page.extracted?.warnings ?? [],
            errorCode: persistedPage.errorCode,
            retryable: persistedPage.retryable,
            reviewStatus:
              draft?.changeType === "unchanged"
                ? "approved"
                : persistedPage.status === "succeeded"
                  ? "pending"
                  : "rejected",
            fetchedAt: persistedPage.fetchedAt,
          });
          await input.database.db
            .update(knowledgeCrawlRuns)
            .set({
              discoveredCount,
              processedCount: sql`${knowledgeCrawlRuns.processedCount} + 1`,
              succeededCount,
              failedCount,
              newCount,
              changedCount,
              unchangedCount,
              updatedAt: new Date(),
            })
            .where(eq(knowledgeCrawlRuns.id, data.runId));
        },
      });
      if (!succeededCount) throw new KnowledgeCrawlError("CRAWL_NO_PAGES_EXTRACTED");
      const finishedAt = new Date();
      const status = failedCount ? "partial" : "succeeded";
      await input.database.db.transaction(async (transaction) => {
        await transaction
          .update(knowledgeCrawlRuns)
          .set({
            status,
            discoveredCount: summary.discoveredCount,
            processedCount: summary.processedCount,
            succeededCount,
            failedCount,
            newCount,
            changedCount,
            unchangedCount,
            profileVersion: summary.profileVersion,
            errorCode: null,
            finishedAt,
            updatedAt: finishedAt,
          })
          .where(
            and(eq(knowledgeCrawlRuns.id, data.runId), eq(knowledgeCrawlRuns.status, "running")),
          );
        await transaction
          .update(knowledgeSources)
          .set({
            lastCrawledAt: finishedAt,
            lastSuccessfulCrawlAt: finishedAt,
            lastErrorCode: null,
            updatedAt: finishedAt,
          })
          .where(
            and(
              eq(knowledgeSources.id, data.sourceId),
              eq(knowledgeSources.projectId, data.projectId),
            ),
          );
        await transaction.insert(auditEvents).values({
          projectId: data.projectId,
          actorUserId: claimed.requestedBy,
          action: "knowledge.crawl_completed",
          resourceType: "knowledge_crawl_run",
          resourceId: data.runId,
          requestId: data.requestId,
          metadata: {
            status,
            ...summary,
            succeededCount,
            failedCount,
            newCount,
            changedCount,
            unchangedCount,
          },
        });
      });
      return {
        runId: data.runId,
        projectId: data.projectId,
        status,
        processedCount: summary.processedCount,
        succeededCount,
        failedCount,
      };
    } catch (error) {
      const code = errorCode(error);
      const failedAt = new Date();
      await input.database.db
        .transaction(async (transaction) => {
          await transaction
            .update(knowledgeCrawlRuns)
            .set({ status: "failed", errorCode: code, finishedAt: failedAt, updatedAt: failedAt })
            .where(
              and(eq(knowledgeCrawlRuns.id, data.runId), eq(knowledgeCrawlRuns.status, "running")),
            );
          await transaction
            .update(knowledgeSources)
            .set({ lastCrawledAt: failedAt, lastErrorCode: code, updatedAt: failedAt })
            .where(
              and(
                eq(knowledgeSources.id, data.sourceId),
                eq(knowledgeSources.projectId, data.projectId),
              ),
            );
          await transaction.insert(auditEvents).values({
            projectId: data.projectId,
            actorUserId: claimed.requestedBy,
            action: "knowledge.crawl_failed",
            resourceType: "knowledge_crawl_run",
            resourceId: data.runId,
            requestId: data.requestId,
            metadata: { errorCode: code },
          });
        })
        .catch(() => undefined);
      throw error instanceof Error ? error : new KnowledgeCrawlError(code);
    }
  };

import type { ServiceEnvironment } from "@ai-assist/config";
import type {
  KnowledgeProcessingJobData,
  KnowledgeProcessingJobResult,
  KnowledgeProductInput,
} from "@ai-assist/contracts";
import type { CrawlPageResult } from "@ai-assist/crawler";
import {
  auditEvents,
  type DatabaseConnection,
  knowledgeChunks,
  knowledgeDocuments,
  knowledgeDocumentVersions,
  knowledgeProcessingItems,
  knowledgeProcessingRuns,
  knowledgeProducts,
  projectModelSettings,
  projects,
  providerCredentials,
} from "@ai-assist/database";
import {
  checksumKnowledgeContent,
  chunkKnowledgeText,
  createCredentialAssociatedData,
  createCredentialKeyring,
  decryptCredential,
  estimateKnowledgeTokenCount,
  normalizeKnowledgeText,
} from "@ai-assist/domain";
import { AitunnelClient, AitunnelProviderError } from "@ai-assist/provider-aitunnel";
import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { processRawPage } from "./knowledge-crawler.js";

class KnowledgeProcessingError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "KnowledgeProcessingError";
    this.code = code;
  }
}

const processingErrorCode = (error: unknown): string => {
  if (error instanceof KnowledgeProcessingError || error instanceof AitunnelProviderError) {
    return error.code;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code.slice(0, 100);
  }
  return "KNOWLEDGE_PROCESSING_FAILED";
};

const forEachConcurrent = async <Item>(
  items: Item[],
  concurrency: number,
  handler: (item: Item) => Promise<boolean | void>,
): Promise<void> => {
  let nextIndex = 0;
  await Promise.all(
    Array.from({ length: Math.min(items.length, Math.max(1, concurrency)) }, async () => {
      while (nextIndex < items.length) {
        const item = items[nextIndex];
        nextIndex += 1;
        if (item !== undefined && (await handler(item)) === false) break;
      }
    }),
  );
};

const createProcessedVersion = (input: {
  processed: { type: "info" | "product" | "service"; title: string; markdown: string };
  canonicalUrl: string | null;
  locale: string;
  tags: string[];
}) => {
  const documentType = input.processed.type === "info" ? ("page" as const) : input.processed.type;
  const title = normalizeKnowledgeText(input.processed.title);
  const plainText = normalizeKnowledgeText(input.processed.markdown);
  if (!title || !plainText) throw new KnowledgeProcessingError("KNOWLEDGE_PROCESSING_EMPTY_RESULT");
  const product: KnowledgeProductInput | null =
    documentType === "product"
      ? {
          externalId: null,
          sku: null,
          category: null,
          priceDisplay: null,
          priceAmount: null,
          currency: null,
          availability: null,
          minimumOrder: null,
          characteristics: {},
        }
      : null;
  const contentChecksum = checksumKnowledgeContent(
    JSON.stringify({
      type: documentType,
      title,
      content: plainText,
      canonicalUrl: input.canonicalUrl,
      locale: input.locale,
      tags: input.tags,
      product,
    }),
  );
  const chunks = chunkKnowledgeText(normalizeKnowledgeText([title, plainText].join("\n\n"))).map(
    (text) => ({
      text,
      tokenCount: estimateKnowledgeTokenCount(text),
      contentChecksum: checksumKnowledgeContent(text),
    }),
  );
  if (!chunks.length || chunks.length > 40) {
    throw new KnowledgeProcessingError("KNOWLEDGE_CHUNK_LIMIT");
  }
  return { documentType, title, plainText, product, contentChecksum, chunks };
};

export const createKnowledgeProcessingProcessor = (input: {
  database: DatabaseConnection;
  environment: ServiceEnvironment;
  client?: Pick<AitunnelClient, "streamChat">;
  runWithAiLimit?: <Result>(task: () => Promise<Result>) => Promise<Result>;
}): ((data: KnowledgeProcessingJobData) => Promise<KnowledgeProcessingJobResult>) =>
  async function processKnowledgeProcessing(data) {
    const runWithAiLimit = input.runWithAiLimit ?? (async (task) => task());
    const startedAt = new Date();
    const [runBeforeClaim] = await input.database.db
      .select()
      .from(knowledgeProcessingRuns)
      .where(
        and(
          eq(knowledgeProcessingRuns.id, data.runId),
          eq(knowledgeProcessingRuns.projectId, data.projectId),
        ),
      )
      .limit(1);
    if (
      runBeforeClaim &&
      ["succeeded", "partial", "failed", "cancelled"].includes(runBeforeClaim.status)
    ) {
      if (runBeforeClaim.status === "cancelled" && !runBeforeClaim.finishedAt) {
        const finishedAt = new Date();
        await input.database.db
          .update(knowledgeProcessingRuns)
          .set({ finishedAt, pauseRequestedAt: null, updatedAt: finishedAt })
          .where(
            and(
              eq(knowledgeProcessingRuns.id, runBeforeClaim.id),
              eq(knowledgeProcessingRuns.status, "cancelled"),
            ),
          );
      }
      return {
        runId: runBeforeClaim.id,
        projectId: runBeforeClaim.projectId,
        status: runBeforeClaim.status as "succeeded" | "partial" | "failed" | "cancelled",
        processedCount: runBeforeClaim.processedCount,
        succeededCount: runBeforeClaim.succeededCount,
        failedCount: runBeforeClaim.failedCount,
      };
    }
    const [claimed] = await input.database.db
      .update(knowledgeProcessingRuns)
      .set({
        status: "running",
        errorCode: null,
        startedAt: runBeforeClaim?.startedAt ?? startedAt,
        finishedAt: null,
        updatedAt: startedAt,
      })
      .where(
        and(
          eq(knowledgeProcessingRuns.id, data.runId),
          eq(knowledgeProcessingRuns.projectId, data.projectId),
          inArray(knowledgeProcessingRuns.status, ["queued", "running"]),
        ),
      )
      .returning();
    if (!claimed) throw new KnowledgeProcessingError("KNOWLEDGE_PROCESSING_NOT_CLAIMABLE");

    try {
      const [[project], [modelSettings], [credential]] = await Promise.all([
        input.database.db
          .select({ status: projects.status })
          .from(projects)
          .where(eq(projects.id, data.projectId))
          .limit(1),
        input.database.db
          .select({
            chatModelId: projectModelSettings.chatModelId,
            crawlMaxOutputTokens: projectModelSettings.crawlMaxOutputTokens,
          })
          .from(projectModelSettings)
          .where(eq(projectModelSettings.projectId, data.projectId))
          .limit(1),
        input.database.db
          .select()
          .from(providerCredentials)
          .where(
            and(
              eq(providerCredentials.projectId, data.projectId),
              eq(providerCredentials.provider, "aitunnel"),
            ),
          )
          .limit(1),
      ]);
      if (!project) throw new KnowledgeProcessingError("KNOWLEDGE_PROCESSING_PROJECT_NOT_FOUND");
      if (project.status !== "active") {
        throw new KnowledgeProcessingError("KNOWLEDGE_PROCESSING_PROJECT_NOT_ACTIVE");
      }
      if (!modelSettings?.chatModelId) {
        throw new KnowledgeProcessingError("KNOWLEDGE_PROCESSING_AI_MODEL_REQUIRED");
      }
      const chatModelId = modelSettings.chatModelId;
      if (!credential || credential.status !== "verified") {
        throw new KnowledgeProcessingError("KNOWLEDGE_PROCESSING_AI_CREDENTIAL_REQUIRED");
      }

      let keyring: Map<number, Buffer> | undefined;
      let apiKey = "";
      try {
        keyring = createCredentialKeyring({
          currentVersion: input.environment.CREDENTIAL_ENCRYPTION_KEY_VERSION,
          currentKey: input.environment.CREDENTIAL_ENCRYPTION_KEY,
          previousKeysJson: input.environment.CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS,
        });
        const key = keyring.get(credential.keyVersion);
        if (!key) throw new KnowledgeProcessingError("CREDENTIAL_KEY_VERSION_UNAVAILABLE");
        apiKey = decryptCredential({
          envelope: {
            ciphertext: credential.ciphertext,
            nonce: credential.nonce,
            authTag: credential.authTag,
            keyVersion: credential.keyVersion,
          },
          associatedData: createCredentialAssociatedData({
            projectId: credential.projectId,
            credentialId: credential.id,
            provider: credential.provider,
          }),
          key,
        });
      } catch (error) {
        if (error instanceof KnowledgeProcessingError) throw error;
        throw new KnowledgeProcessingError("CREDENTIAL_DECRYPTION_FAILED");
      } finally {
        if (keyring) for (const key of keyring.values()) key.fill(0);
      }

      const client =
        input.client ??
        new AitunnelClient({
          baseUrl: input.environment.AITUNNEL_BASE_URL,
          publicCatalogUrl: input.environment.AITUNNEL_PUBLIC_CATALOG_URL,
          timeoutMs: input.environment.PROVIDER_REQUEST_TIMEOUT_MS,
          maxResponseBytes: input.environment.PROVIDER_RESPONSE_MAX_BYTES,
        });
      const items = await input.database.db
        .select({
          itemId: knowledgeProcessingItems.id,
          documentId: knowledgeProcessingItems.documentId,
          sourceVersionId: knowledgeProcessingItems.sourceVersionId,
          title: knowledgeDocumentVersions.title,
          plainText: knowledgeDocumentVersions.plainText,
          canonicalUrl: knowledgeDocumentVersions.canonicalUrl,
          locale: knowledgeDocumentVersions.locale,
          tags: knowledgeDocumentVersions.tags,
        })
        .from(knowledgeProcessingItems)
        .innerJoin(
          knowledgeDocumentVersions,
          eq(knowledgeDocumentVersions.id, knowledgeProcessingItems.sourceVersionId),
        )
        .where(
          and(
            eq(knowledgeProcessingItems.runId, data.runId),
            eq(knowledgeProcessingItems.projectId, data.projectId),
            eq(knowledgeProcessingItems.status, "queued"),
          ),
        );
      const existingItems = await input.database.db
        .select({ status: knowledgeProcessingItems.status })
        .from(knowledgeProcessingItems)
        .where(eq(knowledgeProcessingItems.runId, data.runId));
      const recoveredSucceeded = existingItems.filter((item) => item.status === "succeeded").length;
      const recoveredFailed = existingItems.filter((item) => item.status === "failed").length;
      await input.database.db
        .update(knowledgeProcessingRuns)
        .set({
          processedCount: recoveredSucceeded + recoveredFailed,
          succeededCount: recoveredSucceeded,
          failedCount: recoveredFailed,
          updatedAt: new Date(),
        })
        .where(eq(knowledgeProcessingRuns.id, data.runId));

      const waitForProcessingResume = async (): Promise<boolean> => {
        while (true) {
          const [runState] = await input.database.db
            .select({
              status: knowledgeProcessingRuns.status,
              pauseRequestedAt: knowledgeProcessingRuns.pauseRequestedAt,
            })
            .from(knowledgeProcessingRuns)
            .where(
              and(
                eq(knowledgeProcessingRuns.id, data.runId),
                eq(knowledgeProcessingRuns.projectId, data.projectId),
              ),
            )
            .limit(1);
          if (runState?.status === "cancelled") return false;
          if (!runState || runState.status !== "running") {
            throw new KnowledgeProcessingError("KNOWLEDGE_PROCESSING_RUN_NOT_RUNNING");
          }
          if (!runState.pauseRequestedAt) return true;
          await new Promise((resolve) => setTimeout(resolve, 1_000));
        }
      };

      await forEachConcurrent(
        items,
        input.environment.KNOWLEDGE_CRAWL_AI_CONCURRENCY,
        async (item) => {
          if (!(await waitForProcessingResume())) return false;
          try {
            const page: CrawlPageResult = {
              normalizedUrl:
                item.canonicalUrl ?? `https://knowledge.local/documents/${item.documentId}`,
              depth: 0,
              status: "succeeded",
              httpStatus: 200,
              contentType: "text/markdown",
              extracted: {
                title: item.title,
                sourceUrl:
                  item.canonicalUrl ?? `https://knowledge.local/documents/${item.documentId}`,
                content: item.plainText,
                links: [],
              },
              errorCode: null,
              retryable: false,
              fetchedAt: null,
            };
            const processed = await runWithAiLimit(() =>
              processRawPage({
                page,
                apiKey,
                modelId: chatModelId,
                maxOutputTokens: modelSettings.crawlMaxOutputTokens,
                timeoutMs: input.environment.KNOWLEDGE_CRAWL_AI_TIMEOUT_MS,
                idleTimeoutMs: input.environment.KNOWLEDGE_CRAWL_AI_IDLE_TIMEOUT_MS,
                normalizationPrompt: [
                  "Отредактируй существующую запись базы знаний по инструкции оператора.",
                  "Сохрани все подтверждённые факты, которые инструкция не просит удалить или изменить.",
                  "Не выдумывай новые факты и не добавляй сведения из внешних источников.",
                  `Инструкция оператора: ${claimed.instruction}`,
                ].join("\n"),
                client,
              }),
            );
            const version = createProcessedVersion({
              processed,
              canonicalUrl: item.canonicalUrl,
              locale: item.locale,
              tags: item.tags,
            });
            await input.database.db.transaction(async (transaction) => {
              const [document] = await transaction
                .select({ status: knowledgeDocuments.status, version: knowledgeDocuments.version })
                .from(knowledgeDocuments)
                .where(
                  and(
                    eq(knowledgeDocuments.id, item.documentId),
                    eq(knowledgeDocuments.projectId, data.projectId),
                  ),
                )
                .limit(1);
              if (!document || document.status === "archived") {
                throw new KnowledgeProcessingError("KNOWLEDGE_PROCESSING_DOCUMENT_UNAVAILABLE");
              }
              const [latest] = await transaction
                .select({
                  id: knowledgeDocumentVersions.id,
                  versionNo: knowledgeDocumentVersions.versionNo,
                  contentChecksum: knowledgeDocumentVersions.contentChecksum,
                })
                .from(knowledgeDocumentVersions)
                .where(eq(knowledgeDocumentVersions.documentId, item.documentId))
                .orderBy(desc(knowledgeDocumentVersions.versionNo))
                .limit(1);
              if (!latest || latest.id !== item.sourceVersionId) {
                throw new KnowledgeProcessingError("KNOWLEDGE_PROCESSING_VERSION_CONFLICT");
              }

              let resultVersionId = latest.id;
              if (latest.contentChecksum !== version.contentChecksum) {
                const [updated] = await transaction
                  .update(knowledgeDocuments)
                  .set({
                    type: version.documentType,
                    version: sql`${knowledgeDocuments.version} + 1`,
                    updatedAt: new Date(),
                  })
                  .where(
                    and(
                      eq(knowledgeDocuments.id, item.documentId),
                      eq(knowledgeDocuments.projectId, data.projectId),
                      eq(knowledgeDocuments.version, document.version),
                    ),
                  )
                  .returning({ id: knowledgeDocuments.id });
                if (!updated) {
                  throw new KnowledgeProcessingError("KNOWLEDGE_PROCESSING_VERSION_CONFLICT");
                }
                const [createdVersion] = await transaction
                  .insert(knowledgeDocumentVersions)
                  .values({
                    documentId: item.documentId,
                    versionNo: latest.versionNo + 1,
                    title: version.title,
                    canonicalUrl: item.canonicalUrl,
                    locale: item.locale,
                    plainText: version.plainText,
                    tags: item.tags,
                    contentChecksum: version.contentChecksum,
                    createdBy: claimed.requestedBy,
                  })
                  .returning({ id: knowledgeDocumentVersions.id });
                if (!createdVersion) {
                  throw new KnowledgeProcessingError("KNOWLEDGE_PROCESSING_VERSION_CREATE_FAILED");
                }
                resultVersionId = createdVersion.id;
                if (version.product) {
                  await transaction.insert(knowledgeProducts).values({
                    documentVersionId: resultVersionId,
                    characteristics: {},
                  });
                }
                await transaction.insert(knowledgeChunks).values(
                  version.chunks.map((chunk, ordinal) => ({
                    projectId: data.projectId,
                    documentVersionId: resultVersionId,
                    ordinal,
                    plainText: chunk.text,
                    tokenCount: chunk.tokenCount,
                    contentChecksum: chunk.contentChecksum,
                  })),
                );
              }
              const succeeded = await transaction
                .update(knowledgeProcessingItems)
                .set({
                  status: "succeeded",
                  resultVersionId,
                  errorCode: null,
                  updatedAt: new Date(),
                })
                .where(
                  and(
                    eq(knowledgeProcessingItems.id, item.itemId),
                    eq(knowledgeProcessingItems.status, "queued"),
                  ),
                )
                .returning({ id: knowledgeProcessingItems.id });
              if (succeeded.length) {
                await transaction
                  .update(knowledgeProcessingRuns)
                  .set({
                    processedCount: sql`${knowledgeProcessingRuns.processedCount} + 1`,
                    succeededCount: sql`${knowledgeProcessingRuns.succeededCount} + 1`,
                    updatedAt: new Date(),
                  })
                  .where(eq(knowledgeProcessingRuns.id, data.runId));
              }
            });
            return true;
          } catch (error) {
            const code = processingErrorCode(error);
            await input.database.db.transaction(async (transaction) => {
              const failed = await transaction
                .update(knowledgeProcessingItems)
                .set({ status: "failed", errorCode: code, updatedAt: new Date() })
                .where(
                  and(
                    eq(knowledgeProcessingItems.id, item.itemId),
                    eq(knowledgeProcessingItems.status, "queued"),
                  ),
                )
                .returning({ id: knowledgeProcessingItems.id });
              if (failed.length) {
                await transaction
                  .update(knowledgeProcessingRuns)
                  .set({
                    processedCount: sql`${knowledgeProcessingRuns.processedCount} + 1`,
                    failedCount: sql`${knowledgeProcessingRuns.failedCount} + 1`,
                    updatedAt: new Date(),
                  })
                  .where(eq(knowledgeProcessingRuns.id, data.runId));
              }
            });
            return true;
          }
        },
      );

      const [counts] = await input.database.db
        .select({
          runStatus: knowledgeProcessingRuns.status,
          processedCount: knowledgeProcessingRuns.processedCount,
          succeededCount: knowledgeProcessingRuns.succeededCount,
          failedCount: knowledgeProcessingRuns.failedCount,
        })
        .from(knowledgeProcessingRuns)
        .where(eq(knowledgeProcessingRuns.id, data.runId))
        .limit(1);
      if (!counts) throw new KnowledgeProcessingError("KNOWLEDGE_PROCESSING_RUN_NOT_FOUND");
      if (counts.runStatus === "cancelled") {
        const finishedAt = new Date();
        await input.database.db.transaction(async (transaction) => {
          await transaction
            .update(knowledgeProcessingRuns)
            .set({ pauseRequestedAt: null, finishedAt, updatedAt: finishedAt })
            .where(
              and(
                eq(knowledgeProcessingRuns.id, data.runId),
                eq(knowledgeProcessingRuns.status, "cancelled"),
              ),
            );
          await transaction.insert(auditEvents).values({
            projectId: data.projectId,
            actorUserId: claimed.requestedBy,
            action: "knowledge.processing_stopped",
            resourceType: "knowledge_processing_run",
            resourceId: data.runId,
            requestId: data.requestId,
            metadata: {
              processedCount: counts.processedCount,
              succeededCount: counts.succeededCount,
              failedCount: counts.failedCount,
            },
          });
        });
        return {
          runId: data.runId,
          projectId: data.projectId,
          status: "cancelled",
          processedCount: counts.processedCount,
          succeededCount: counts.succeededCount,
          failedCount: counts.failedCount,
        };
      }
      if (counts.runStatus !== "running") {
        throw new KnowledgeProcessingError("KNOWLEDGE_PROCESSING_RUN_NOT_RUNNING");
      }
      const status =
        counts.failedCount === 0
          ? ("succeeded" as const)
          : counts.succeededCount > 0
            ? ("partial" as const)
            : ("failed" as const);
      const finishedAt = new Date();
      await input.database.db.transaction(async (transaction) => {
        await transaction
          .update(knowledgeProcessingRuns)
          .set({ status, finishedAt, updatedAt: finishedAt })
          .where(eq(knowledgeProcessingRuns.id, data.runId));
        await transaction.insert(auditEvents).values({
          projectId: data.projectId,
          actorUserId: claimed.requestedBy,
          action: "knowledge.processing_completed",
          resourceType: "knowledge_processing_run",
          resourceId: data.runId,
          requestId: data.requestId,
          metadata: {
            status,
            processedCount: counts.processedCount,
            succeededCount: counts.succeededCount,
            failedCount: counts.failedCount,
          },
        });
      });
      return {
        runId: data.runId,
        projectId: data.projectId,
        status,
        processedCount: counts.processedCount,
        succeededCount: counts.succeededCount,
        failedCount: counts.failedCount,
      };
    } catch (error) {
      const code = processingErrorCode(error);
      const failedAt = new Date();
      const [currentRun] = await input.database.db
        .select({
          status: knowledgeProcessingRuns.status,
          processedCount: knowledgeProcessingRuns.processedCount,
          succeededCount: knowledgeProcessingRuns.succeededCount,
          failedCount: knowledgeProcessingRuns.failedCount,
        })
        .from(knowledgeProcessingRuns)
        .where(eq(knowledgeProcessingRuns.id, data.runId))
        .limit(1);
      if (currentRun?.status === "cancelled") {
        await input.database.db
          .update(knowledgeProcessingRuns)
          .set({ pauseRequestedAt: null, finishedAt: failedAt, updatedAt: failedAt })
          .where(
            and(
              eq(knowledgeProcessingRuns.id, data.runId),
              eq(knowledgeProcessingRuns.status, "cancelled"),
            ),
          );
        return {
          runId: data.runId,
          projectId: data.projectId,
          status: "cancelled",
          processedCount: currentRun.processedCount,
          succeededCount: currentRun.succeededCount,
          failedCount: currentRun.failedCount,
        };
      }
      await input.database.db
        .transaction(async (transaction) => {
          await transaction
            .update(knowledgeProcessingRuns)
            .set({
              status: "failed",
              pauseRequestedAt: null,
              errorCode: code,
              finishedAt: failedAt,
              updatedAt: failedAt,
            })
            .where(
              and(
                eq(knowledgeProcessingRuns.id, data.runId),
                eq(knowledgeProcessingRuns.status, "running"),
              ),
            );
          await transaction.insert(auditEvents).values({
            projectId: data.projectId,
            actorUserId: claimed.requestedBy,
            action: "knowledge.processing_failed",
            resourceType: "knowledge_processing_run",
            resourceId: data.runId,
            requestId: data.requestId,
            metadata: { errorCode: code },
          });
        })
        .catch(() => undefined);
      throw error instanceof Error ? error : new KnowledgeProcessingError(code);
    }
  };

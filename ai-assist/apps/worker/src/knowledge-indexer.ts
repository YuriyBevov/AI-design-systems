import type { ServiceEnvironment } from "@ai-assist/config";
import type { KnowledgeIndexJobData, KnowledgeIndexJobResult } from "@ai-assist/contracts";
import {
  auditEvents,
  type DatabaseConnection,
  knowledgeChunks,
  knowledgeDocuments,
  knowledgeDocumentVersions,
  knowledgeIndexEmbeddings,
  knowledgeIndexVersions,
  projectModelSettings,
  providerCredentials,
} from "@ai-assist/database";
import {
  createCredentialAssociatedData,
  createCredentialKeyring,
  decryptCredential,
  fingerprintKnowledgeChunks,
} from "@ai-assist/domain";
import {
  AitunnelClient,
  AitunnelProviderError,
  type EmbeddingResult,
} from "@ai-assist/provider-aitunnel";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";

const embeddingBatchSize = 8;
const maximumEmbeddingDimension = 16_000;

type IndexChunk = {
  chunkId: string;
  documentId: string;
  text: string;
  contentChecksum: string;
};

class KnowledgeIndexError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "KnowledgeIndexError";
    this.code = code;
  }
}

const getErrorCode = (error: unknown): string => {
  if (error instanceof KnowledgeIndexError || error instanceof AitunnelProviderError) {
    return error.code;
  }
  return "KNOWLEDGE_INDEX_FAILED";
};

const listPublishedChunks = async (
  database: DatabaseConnection,
  projectId: string,
): Promise<IndexChunk[]> =>
  database.db
    .select({
      chunkId: knowledgeChunks.id,
      documentId: knowledgeDocuments.id,
      text: knowledgeChunks.plainText,
      contentChecksum: knowledgeChunks.contentChecksum,
    })
    .from(knowledgeChunks)
    .innerJoin(
      knowledgeDocumentVersions,
      eq(knowledgeDocumentVersions.id, knowledgeChunks.documentVersionId),
    )
    .innerJoin(
      knowledgeDocuments,
      and(
        eq(knowledgeDocuments.id, knowledgeDocumentVersions.documentId),
        eq(knowledgeDocuments.activeVersionId, knowledgeDocumentVersions.id),
      ),
    )
    .where(
      and(
        eq(knowledgeChunks.projectId, projectId),
        eq(knowledgeDocuments.projectId, projectId),
        eq(knowledgeDocuments.status, "published"),
      ),
    )
    .orderBy(asc(knowledgeChunks.id));

const validateEmbeddingBatch = (
  result: EmbeddingResult,
  expectedCount: number,
  expectedDimension: number | null,
): number => {
  if (result.embeddings.length !== expectedCount || !result.embeddings.length) {
    throw new KnowledgeIndexError("KNOWLEDGE_EMBEDDING_COUNT_INVALID");
  }
  const dimension = result.embeddings[0]?.length ?? 0;
  if (
    dimension < 1 ||
    dimension > maximumEmbeddingDimension ||
    (expectedDimension !== null && dimension !== expectedDimension) ||
    result.embeddings.some(
      (embedding) =>
        embedding.length !== dimension || embedding.some((value) => !Number.isFinite(value)),
    )
  ) {
    throw new KnowledgeIndexError("KNOWLEDGE_EMBEDDING_DIMENSION_INVALID");
  }
  return dimension;
};

export const createKnowledgeIndexProcessor = (input: {
  database: DatabaseConnection;
  environment: ServiceEnvironment;
  client?: Pick<AitunnelClient, "createEmbeddings">;
}): ((data: KnowledgeIndexJobData) => Promise<KnowledgeIndexJobResult>) => {
  const client =
    input.client ??
    new AitunnelClient({
      baseUrl: input.environment.AITUNNEL_BASE_URL,
      publicCatalogUrl: input.environment.AITUNNEL_PUBLIC_CATALOG_URL,
      timeoutMs: input.environment.PROVIDER_REQUEST_TIMEOUT_MS,
      maxResponseBytes: input.environment.PROVIDER_RESPONSE_MAX_BYTES,
    });

  return async (data) => {
    const [claimed] = await input.database.db
      .update(knowledgeIndexVersions)
      .set({
        status: "building",
        errorCode: null,
        startedAt: new Date(),
        finishedAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(knowledgeIndexVersions.id, data.indexVersionId),
          eq(knowledgeIndexVersions.projectId, data.projectId),
          inArray(knowledgeIndexVersions.status, ["queued", "failed"]),
        ),
      )
      .returning();

    if (!claimed) {
      const [existing] = await input.database.db
        .select()
        .from(knowledgeIndexVersions)
        .where(
          and(
            eq(knowledgeIndexVersions.id, data.indexVersionId),
            eq(knowledgeIndexVersions.projectId, data.projectId),
          ),
        )
        .limit(1);
      if (existing?.status === "active" && existing.embeddingDimension) {
        return {
          indexVersionId: existing.id,
          projectId: existing.projectId,
          status: "active",
          documentCount: existing.documentCount,
          chunkCount: existing.chunkCount,
          embeddingDimension: existing.embeddingDimension,
          inputTokens: existing.inputTokens,
        };
      }
      throw new KnowledgeIndexError("KNOWLEDGE_INDEX_JOB_NOT_CLAIMABLE");
    }

    try {
      const [[settings], [credential], chunks] = await Promise.all([
        input.database.db
          .select()
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
        listPublishedChunks(input.database, data.projectId),
      ]);
      if (!settings?.embeddingModelId || settings.embeddingModelId !== claimed.embeddingModelId) {
        throw new KnowledgeIndexError("KNOWLEDGE_EMBEDDING_MODEL_CHANGED");
      }
      if (!credential || credential.status !== "verified") {
        throw new KnowledgeIndexError("PROVIDER_CREDENTIAL_NOT_READY");
      }
      if (!chunks.length) {
        throw new KnowledgeIndexError("KNOWLEDGE_PUBLISHED_CONTENT_REQUIRED");
      }

      let keyring: Map<number, Buffer> | undefined;
      let apiKey: string;
      try {
        keyring = createCredentialKeyring({
          currentVersion: input.environment.CREDENTIAL_ENCRYPTION_KEY_VERSION,
          currentKey: input.environment.CREDENTIAL_ENCRYPTION_KEY,
          previousKeysJson: input.environment.CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS,
        });
        const key = keyring.get(credential.keyVersion);
        if (!key) throw new KnowledgeIndexError("CREDENTIAL_KEY_VERSION_UNAVAILABLE");
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
        if (error instanceof KnowledgeIndexError) throw error;
        throw new KnowledgeIndexError("CREDENTIAL_DECRYPTION_FAILED");
      } finally {
        if (keyring) for (const key of keyring.values()) key.fill(0);
      }

      const sourceFingerprint = fingerprintKnowledgeChunks(chunks);
      const documentCount = new Set(chunks.map((chunk) => chunk.documentId)).size;
      await input.database.db.transaction(async (transaction) => {
        await transaction
          .delete(knowledgeIndexEmbeddings)
          .where(eq(knowledgeIndexEmbeddings.indexVersionId, claimed.id));
        await transaction
          .update(knowledgeIndexVersions)
          .set({
            sourceFingerprint,
            documentCount,
            chunkCount: chunks.length,
            updatedAt: new Date(),
          })
          .where(eq(knowledgeIndexVersions.id, claimed.id));
      });

      let embeddingDimension: number | null = null;
      let inputTokens = 0;
      let hasInputTokenUsage = false;
      for (let offset = 0; offset < chunks.length; offset += embeddingBatchSize) {
        const batch = chunks.slice(offset, offset + embeddingBatchSize);
        const result = await client.createEmbeddings({
          apiKey,
          model: claimed.embeddingModelId,
          values: batch.map((chunk) => chunk.text),
        });
        embeddingDimension = validateEmbeddingBatch(result, batch.length, embeddingDimension);
        if (result.inputTokens !== null) {
          inputTokens += result.inputTokens;
          hasInputTokenUsage = true;
        }
        await input.database.db.insert(knowledgeIndexEmbeddings).values(
          batch.map((chunk, index) => ({
            indexVersionId: claimed.id,
            knowledgeChunkId: chunk.chunkId,
            embedding: result.embeddings[index]!,
          })),
        );
      }
      if (!embeddingDimension) {
        throw new KnowledgeIndexError("KNOWLEDGE_EMBEDDING_DIMENSION_INVALID");
      }

      const finishedAt = new Date();
      await input.database.db.transaction(
        async (transaction) => {
          await transaction.execute(
            sql`select pg_advisory_xact_lock(hashtextextended(${data.projectId}, 0))`,
          );
          const [currentSettings] = await transaction
            .select({ embeddingModelId: projectModelSettings.embeddingModelId })
            .from(projectModelSettings)
            .where(eq(projectModelSettings.projectId, data.projectId))
            .limit(1);
          if (currentSettings?.embeddingModelId !== claimed.embeddingModelId) {
            throw new KnowledgeIndexError("KNOWLEDGE_EMBEDDING_MODEL_CHANGED");
          }
          const currentChunks = await transaction
            .select({
              chunkId: knowledgeChunks.id,
              contentChecksum: knowledgeChunks.contentChecksum,
            })
            .from(knowledgeChunks)
            .innerJoin(
              knowledgeDocumentVersions,
              eq(knowledgeDocumentVersions.id, knowledgeChunks.documentVersionId),
            )
            .innerJoin(
              knowledgeDocuments,
              and(
                eq(knowledgeDocuments.id, knowledgeDocumentVersions.documentId),
                eq(knowledgeDocuments.activeVersionId, knowledgeDocumentVersions.id),
              ),
            )
            .where(
              and(
                eq(knowledgeChunks.projectId, data.projectId),
                eq(knowledgeDocuments.projectId, data.projectId),
                eq(knowledgeDocuments.status, "published"),
              ),
            );
          if (fingerprintKnowledgeChunks(currentChunks) !== sourceFingerprint) {
            throw new KnowledgeIndexError("KNOWLEDGE_SNAPSHOT_CHANGED");
          }
          await transaction
            .update(knowledgeIndexVersions)
            .set({ status: "superseded", finishedAt, updatedAt: finishedAt })
            .where(
              and(
                eq(knowledgeIndexVersions.projectId, data.projectId),
                eq(knowledgeIndexVersions.status, "active"),
                ne(knowledgeIndexVersions.id, claimed.id),
              ),
            );
          const [activated] = await transaction
            .update(knowledgeIndexVersions)
            .set({
              status: "active",
              embeddingDimension,
              inputTokens: hasInputTokenUsage ? inputTokens : null,
              errorCode: null,
              finishedAt,
              activatedAt: finishedAt,
              updatedAt: finishedAt,
            })
            .where(
              and(
                eq(knowledgeIndexVersions.id, claimed.id),
                eq(knowledgeIndexVersions.status, "building"),
              ),
            )
            .returning({ id: knowledgeIndexVersions.id });
          if (!activated) {
            throw new KnowledgeIndexError("KNOWLEDGE_INDEX_ACTIVATION_CONFLICT");
          }
          await transaction
            .update(projectModelSettings)
            .set({ embeddingDimension, updatedAt: finishedAt })
            .where(
              and(
                eq(projectModelSettings.projectId, data.projectId),
                eq(projectModelSettings.embeddingModelId, claimed.embeddingModelId),
              ),
            );
          await transaction.insert(auditEvents).values({
            projectId: data.projectId,
            actorUserId: claimed.requestedBy,
            action: "knowledge.index_activated",
            resourceType: "knowledge_index_version",
            resourceId: claimed.id,
            requestId: data.requestId,
            metadata: {
              embeddingModelId: claimed.embeddingModelId,
              embeddingDimension,
              documentCount,
              chunkCount: chunks.length,
            },
          });
        },
        { isolationLevel: "serializable" },
      );

      return {
        indexVersionId: claimed.id,
        projectId: data.projectId,
        status: "active",
        documentCount,
        chunkCount: chunks.length,
        embeddingDimension,
        inputTokens: hasInputTokenUsage ? inputTokens : null,
      };
    } catch (error) {
      const errorCode = getErrorCode(error);
      const failedAt = new Date();
      await input.database.db
        .update(knowledgeIndexVersions)
        .set({ status: "failed", errorCode, finishedAt: failedAt, updatedAt: failedAt })
        .where(
          and(
            eq(knowledgeIndexVersions.id, data.indexVersionId),
            eq(knowledgeIndexVersions.status, "building"),
          ),
        )
        .catch(() => undefined);
      await input.database.db
        .insert(auditEvents)
        .values({
          projectId: data.projectId,
          actorUserId: claimed.requestedBy,
          action: "knowledge.index_failed",
          resourceType: "knowledge_index_version",
          resourceId: claimed.id,
          requestId: data.requestId,
          metadata: { errorCode },
        })
        .catch(() => undefined);
      throw error instanceof Error ? error : new KnowledgeIndexError(errorCode);
    }
  };
};

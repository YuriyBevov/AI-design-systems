import { and, asc, desc, eq, max, ne, sql } from "drizzle-orm";

import {
  knowledgeChunks,
  knowledgeDocumentPublications,
  knowledgeDocuments,
  knowledgeDocumentVersions,
  knowledgeIndexEmbeddings,
  knowledgeIndexVersions,
  knowledgeProducts,
  knowledgeSources,
  users,
} from "@ai-assist/database";
import type {
  KnowledgeDocumentStatus,
  KnowledgeDocumentType,
  KnowledgeIndexStatus,
  KnowledgeProductInput,
} from "@ai-assist/contracts";
import type { KnowledgeChunkCandidate } from "@ai-assist/domain";

import { getInfrastructure } from "../utils/infrastructure";

export type KnowledgeDocumentRecord = {
  id: string;
  projectId: string;
  sourceId: string;
  type: KnowledgeDocumentType;
  status: KnowledgeDocumentStatus;
  version: number;
  activeVersionId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type KnowledgeDocumentVersionRecord = {
  id: string;
  documentId: string;
  versionNo: number;
  title: string;
  canonicalUrl: string | null;
  locale: string;
  plainText: string;
  tags: string[];
  contentChecksum: string;
  createdByEmail: string | null;
  createdAt: Date;
  chunkCount: number;
  product: KnowledgeProductInput | null;
};

export type KnowledgeDocumentPublicationRecord = {
  id: string;
  documentId: string;
  documentVersionId: string;
  versionNo: number;
  publishedByEmail: string | null;
  publishedAt: Date;
};

export type KnowledgeIndexVersionRecord = {
  id: string;
  projectId: string;
  status: KnowledgeIndexStatus;
  embeddingModelId: string;
  embeddingDimension: number | null;
  sourceFingerprint: string | null;
  documentCount: number;
  chunkCount: number;
  inputTokens: number | null;
  errorCode: string | null;
  requestedByEmail: string | null;
  requestId: string;
  startedAt: Date | null;
  finishedAt: Date | null;
  activatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type KnowledgeVersionValues = {
  title: string;
  canonicalUrl: string | null;
  locale: string;
  plainText: string;
  tags: string[];
  contentChecksum: string;
  product: KnowledgeProductInput | null;
  chunks: Array<{ text: string; tokenCount: number; contentChecksum: string }>;
};

const documentSelection = {
  id: knowledgeDocuments.id,
  projectId: knowledgeDocuments.projectId,
  sourceId: knowledgeDocuments.sourceId,
  type: knowledgeDocuments.type,
  status: knowledgeDocuments.status,
  version: knowledgeDocuments.version,
  activeVersionId: knowledgeDocuments.activeVersionId,
  createdAt: knowledgeDocuments.createdAt,
  updatedAt: knowledgeDocuments.updatedAt,
};

const versionSelection = {
  id: knowledgeDocumentVersions.id,
  documentId: knowledgeDocumentVersions.documentId,
  versionNo: knowledgeDocumentVersions.versionNo,
  title: knowledgeDocumentVersions.title,
  canonicalUrl: knowledgeDocumentVersions.canonicalUrl,
  locale: knowledgeDocumentVersions.locale,
  plainText: knowledgeDocumentVersions.plainText,
  tags: knowledgeDocumentVersions.tags,
  contentChecksum: knowledgeDocumentVersions.contentChecksum,
  createdByEmail: users.emailNormalized,
  createdAt: knowledgeDocumentVersions.createdAt,
  chunkCount: sql<number>`(
    select count(*)::int
    from ${knowledgeChunks}
    where ${knowledgeChunks.documentVersionId} = ${knowledgeDocumentVersions.id}
  )`,
  productExternalId: knowledgeProducts.externalId,
  productSku: knowledgeProducts.sku,
  productCategory: knowledgeProducts.category,
  productPriceDisplay: knowledgeProducts.priceDisplay,
  productPriceAmount: knowledgeProducts.priceAmount,
  productCurrency: knowledgeProducts.currency,
  productAvailability: knowledgeProducts.availability,
  productMinimumOrder: knowledgeProducts.minimumOrder,
  productCharacteristics: knowledgeProducts.characteristics,
};

const indexVersionSelection = {
  id: knowledgeIndexVersions.id,
  projectId: knowledgeIndexVersions.projectId,
  status: knowledgeIndexVersions.status,
  embeddingModelId: knowledgeIndexVersions.embeddingModelId,
  embeddingDimension: knowledgeIndexVersions.embeddingDimension,
  sourceFingerprint: knowledgeIndexVersions.sourceFingerprint,
  documentCount: knowledgeIndexVersions.documentCount,
  chunkCount: knowledgeIndexVersions.chunkCount,
  inputTokens: knowledgeIndexVersions.inputTokens,
  errorCode: knowledgeIndexVersions.errorCode,
  requestedByEmail: users.emailNormalized,
  requestId: knowledgeIndexVersions.requestId,
  startedAt: knowledgeIndexVersions.startedAt,
  finishedAt: knowledgeIndexVersions.finishedAt,
  activatedAt: knowledgeIndexVersions.activatedAt,
  createdAt: knowledgeIndexVersions.createdAt,
  updatedAt: knowledgeIndexVersions.updatedAt,
};

type SelectedVersion = Awaited<ReturnType<typeof getInfrastructure>>["database"]["db"] extends never
  ? never
  : {
      id: string;
      documentId: string;
      versionNo: number;
      title: string;
      canonicalUrl: string | null;
      locale: string;
      plainText: string;
      tags: string[];
      contentChecksum: string;
      createdByEmail: string | null;
      createdAt: Date;
      chunkCount: number;
      productExternalId: string | null;
      productSku: string | null;
      productCategory: string | null;
      productPriceDisplay: string | null;
      productPriceAmount: string | null;
      productCurrency: string | null;
      productAvailability: string | null;
      productMinimumOrder: string | null;
      productCharacteristics: Record<string, string> | null;
    };

const toVersionRecord = (row: SelectedVersion): KnowledgeDocumentVersionRecord => {
  const hasProduct =
    row.productExternalId !== null ||
    row.productSku !== null ||
    row.productCategory !== null ||
    row.productPriceDisplay !== null ||
    row.productPriceAmount !== null ||
    row.productCurrency !== null ||
    row.productAvailability !== null ||
    row.productMinimumOrder !== null ||
    row.productCharacteristics !== null;
  return {
    id: row.id,
    documentId: row.documentId,
    versionNo: row.versionNo,
    title: row.title,
    canonicalUrl: row.canonicalUrl,
    locale: row.locale,
    plainText: row.plainText,
    tags: row.tags,
    contentChecksum: row.contentChecksum,
    createdByEmail: row.createdByEmail,
    createdAt: row.createdAt,
    chunkCount: Number(row.chunkCount),
    product: hasProduct
      ? {
          externalId: row.productExternalId,
          sku: row.productSku,
          category: row.productCategory,
          priceDisplay: row.productPriceDisplay,
          priceAmount: row.productPriceAmount === null ? null : Number(row.productPriceAmount),
          currency: row.productCurrency,
          availability: row.productAvailability,
          minimumOrder: row.productMinimumOrder === null ? null : Number(row.productMinimumOrder),
          characteristics: row.productCharacteristics ?? {},
        }
      : null,
  };
};

const insertVersionChildren = async (
  transaction: Parameters<
    Parameters<ReturnType<typeof getInfrastructure>["database"]["db"]["transaction"]>[0]
  >[0],
  input: {
    projectId: string;
    documentVersionId: string;
    product: KnowledgeProductInput | null;
    chunks: KnowledgeVersionValues["chunks"];
  },
): Promise<void> => {
  if (input.product) {
    await transaction.insert(knowledgeProducts).values({
      documentVersionId: input.documentVersionId,
      externalId: input.product.externalId,
      sku: input.product.sku,
      category: input.product.category,
      priceDisplay: input.product.priceDisplay,
      priceAmount: input.product.priceAmount === null ? null : input.product.priceAmount.toString(),
      currency: input.product.currency,
      availability: input.product.availability,
      minimumOrder:
        input.product.minimumOrder === null ? null : input.product.minimumOrder.toString(),
      characteristics: input.product.characteristics,
    });
  }
  if (input.chunks.length) {
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
  }
};

export const listKnowledgeDocumentRecords = async (
  projectId: string,
): Promise<KnowledgeDocumentRecord[]> =>
  getInfrastructure()
    .database.db.select(documentSelection)
    .from(knowledgeDocuments)
    .where(eq(knowledgeDocuments.projectId, projectId))
    .orderBy(desc(knowledgeDocuments.updatedAt), asc(knowledgeDocuments.id));

export const findKnowledgeDocumentRecord = async (
  projectId: string,
  documentId: string,
): Promise<KnowledgeDocumentRecord | null> => {
  const result = await getInfrastructure()
    .database.db.select(documentSelection)
    .from(knowledgeDocuments)
    .where(and(eq(knowledgeDocuments.projectId, projectId), eq(knowledgeDocuments.id, documentId)))
    .limit(1);
  return result[0] ?? null;
};

const versionQuery = () =>
  getInfrastructure()
    .database.db.select(versionSelection)
    .from(knowledgeDocumentVersions)
    .innerJoin(knowledgeDocuments, eq(knowledgeDocuments.id, knowledgeDocumentVersions.documentId))
    .leftJoin(users, eq(users.id, knowledgeDocumentVersions.createdBy))
    .leftJoin(
      knowledgeProducts,
      eq(knowledgeProducts.documentVersionId, knowledgeDocumentVersions.id),
    );

export const listKnowledgeDocumentVersionRecords = async (
  projectId: string,
  documentId: string,
): Promise<KnowledgeDocumentVersionRecord[]> => {
  const rows = await versionQuery()
    .where(and(eq(knowledgeDocuments.projectId, projectId), eq(knowledgeDocuments.id, documentId)))
    .orderBy(desc(knowledgeDocumentVersions.versionNo));
  return rows.map((row) => toVersionRecord(row as SelectedVersion));
};

export const listKnowledgeDocumentVersionRecordsForProject = async (
  projectId: string,
): Promise<KnowledgeDocumentVersionRecord[]> => {
  const rows = await versionQuery()
    .where(eq(knowledgeDocuments.projectId, projectId))
    .orderBy(asc(knowledgeDocumentVersions.documentId), desc(knowledgeDocumentVersions.versionNo));
  return rows.map((row) => toVersionRecord(row as SelectedVersion));
};

export const findKnowledgeDocumentVersionRecord = async (
  projectId: string,
  documentId: string,
  versionId: string,
): Promise<KnowledgeDocumentVersionRecord | null> => {
  const rows = await versionQuery()
    .where(
      and(
        eq(knowledgeDocuments.projectId, projectId),
        eq(knowledgeDocuments.id, documentId),
        eq(knowledgeDocumentVersions.id, versionId),
      ),
    )
    .limit(1);
  return rows[0] ? toVersionRecord(rows[0] as SelectedVersion) : null;
};

export const findActiveKnowledgePublicationRecord = async (
  projectId: string,
  documentId: string,
): Promise<KnowledgeDocumentPublicationRecord | null> => {
  const rows = await getInfrastructure()
    .database.db.select({
      id: knowledgeDocumentPublications.id,
      documentId: knowledgeDocumentPublications.documentId,
      documentVersionId: knowledgeDocumentPublications.documentVersionId,
      versionNo: knowledgeDocumentVersions.versionNo,
      publishedByEmail: users.emailNormalized,
      publishedAt: knowledgeDocumentPublications.publishedAt,
    })
    .from(knowledgeDocumentPublications)
    .innerJoin(
      knowledgeDocuments,
      and(
        eq(knowledgeDocuments.id, knowledgeDocumentPublications.documentId),
        eq(knowledgeDocuments.activeVersionId, knowledgeDocumentPublications.documentVersionId),
      ),
    )
    .innerJoin(
      knowledgeDocumentVersions,
      eq(knowledgeDocumentVersions.id, knowledgeDocumentPublications.documentVersionId),
    )
    .leftJoin(users, eq(users.id, knowledgeDocumentPublications.publishedBy))
    .where(and(eq(knowledgeDocuments.projectId, projectId), eq(knowledgeDocuments.id, documentId)))
    .orderBy(desc(knowledgeDocumentPublications.publishedAt))
    .limit(1);
  return rows[0] ?? null;
};

export const createKnowledgeDocumentRecord = async (input: {
  projectId: string;
  type: Exclude<KnowledgeDocumentType, "page">;
  createdBy: string;
  version: KnowledgeVersionValues;
}): Promise<{ document: KnowledgeDocumentRecord; version: KnowledgeDocumentVersionRecord }> =>
  getInfrastructure().database.db.transaction(async (transaction) => {
    const systemKey = `managed-${input.type}`;
    await transaction
      .insert(knowledgeSources)
      .values({
        projectId: input.projectId,
        type: input.type,
        name: input.type === "product" ? "Ручные товары" : "Ручные документы",
        systemKey,
      })
      .onConflictDoNothing({ target: [knowledgeSources.projectId, knowledgeSources.systemKey] });
    const [source] = await transaction
      .select({ id: knowledgeSources.id })
      .from(knowledgeSources)
      .where(
        and(
          eq(knowledgeSources.projectId, input.projectId),
          eq(knowledgeSources.systemKey, systemKey),
        ),
      )
      .limit(1);
    if (!source) throw new Error("Managed knowledge source creation failed");

    const [document] = await transaction
      .insert(knowledgeDocuments)
      .values({ projectId: input.projectId, sourceId: source.id, type: input.type })
      .returning(documentSelection);
    if (!document) throw new Error("Knowledge document creation failed");
    const [version] = await transaction
      .insert(knowledgeDocumentVersions)
      .values({
        documentId: document.id,
        versionNo: 1,
        title: input.version.title,
        canonicalUrl: input.version.canonicalUrl,
        locale: input.version.locale,
        plainText: input.version.plainText,
        tags: input.version.tags,
        contentChecksum: input.version.contentChecksum,
        createdBy: input.createdBy,
      })
      .returning();
    if (!version) throw new Error("Knowledge document version creation failed");
    await insertVersionChildren(transaction, {
      projectId: input.projectId,
      documentVersionId: version.id,
      product: input.version.product,
      chunks: input.version.chunks,
    });
    return {
      document,
      version: {
        ...version,
        createdByEmail: null,
        chunkCount: input.version.chunks.length,
        product: input.version.product,
      },
    };
  });

export const createKnowledgeDocumentVersionRecord = async (input: {
  projectId: string;
  documentId: string;
  expectedVersion: number;
  createdBy: string;
  version: KnowledgeVersionValues;
}): Promise<{
  document: KnowledgeDocumentRecord;
  version: KnowledgeDocumentVersionRecord;
} | null> =>
  getInfrastructure().database.db.transaction(async (transaction) => {
    const [document] = await transaction
      .update(knowledgeDocuments)
      .set({ version: sql`${knowledgeDocuments.version} + 1`, updatedAt: new Date() })
      .where(
        and(
          eq(knowledgeDocuments.projectId, input.projectId),
          eq(knowledgeDocuments.id, input.documentId),
          eq(knowledgeDocuments.version, input.expectedVersion),
          ne(knowledgeDocuments.status, "archived"),
        ),
      )
      .returning(documentSelection);
    if (!document) return null;
    const [latest] = await transaction
      .select({ versionNo: max(knowledgeDocumentVersions.versionNo) })
      .from(knowledgeDocumentVersions)
      .where(eq(knowledgeDocumentVersions.documentId, input.documentId));
    const versionNo = Number(latest?.versionNo ?? 0) + 1;
    const [version] = await transaction
      .insert(knowledgeDocumentVersions)
      .values({
        documentId: input.documentId,
        versionNo,
        title: input.version.title,
        canonicalUrl: input.version.canonicalUrl,
        locale: input.version.locale,
        plainText: input.version.plainText,
        tags: input.version.tags,
        contentChecksum: input.version.contentChecksum,
        createdBy: input.createdBy,
      })
      .returning();
    if (!version) throw new Error("Knowledge document version creation failed");
    await insertVersionChildren(transaction, {
      projectId: input.projectId,
      documentVersionId: version.id,
      product: input.version.product,
      chunks: input.version.chunks,
    });
    return {
      document,
      version: {
        ...version,
        createdByEmail: null,
        chunkCount: input.version.chunks.length,
        product: input.version.product,
      },
    };
  });

export type PublishKnowledgeDocumentRecordResult =
  "published" | "not_found" | "version_not_found" | "version_conflict";

export const publishKnowledgeDocumentRecord = async (input: {
  projectId: string;
  documentId: string;
  documentVersionId: string;
  expectedVersion: number;
  publishedBy: string;
}): Promise<PublishKnowledgeDocumentRecordResult> =>
  getInfrastructure().database.db.transaction(async (transaction) => {
    const [version] = await transaction
      .select({ id: knowledgeDocumentVersions.id })
      .from(knowledgeDocumentVersions)
      .innerJoin(
        knowledgeDocuments,
        eq(knowledgeDocuments.id, knowledgeDocumentVersions.documentId),
      )
      .where(
        and(
          eq(knowledgeDocuments.projectId, input.projectId),
          eq(knowledgeDocuments.id, input.documentId),
          eq(knowledgeDocumentVersions.id, input.documentVersionId),
        ),
      )
      .limit(1);
    if (!version) {
      const existing = await transaction
        .select({ id: knowledgeDocuments.id })
        .from(knowledgeDocuments)
        .where(
          and(
            eq(knowledgeDocuments.projectId, input.projectId),
            eq(knowledgeDocuments.id, input.documentId),
          ),
        )
        .limit(1);
      return existing.length ? "version_not_found" : "not_found";
    }
    const [document] = await transaction
      .update(knowledgeDocuments)
      .set({
        activeVersionId: version.id,
        status: "published",
        version: sql`${knowledgeDocuments.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(knowledgeDocuments.projectId, input.projectId),
          eq(knowledgeDocuments.id, input.documentId),
          eq(knowledgeDocuments.version, input.expectedVersion),
          ne(knowledgeDocuments.status, "archived"),
        ),
      )
      .returning({ id: knowledgeDocuments.id });
    if (!document) return "version_conflict";
    await transaction.insert(knowledgeDocumentPublications).values({
      documentId: input.documentId,
      documentVersionId: version.id,
      publishedBy: input.publishedBy,
    });
    return "published";
  });

export const unpublishKnowledgeDocumentRecord = async (input: {
  projectId: string;
  documentId: string;
  expectedVersion: number;
}): Promise<boolean> => {
  const rows = await getInfrastructure()
    .database.db.update(knowledgeDocuments)
    .set({
      activeVersionId: null,
      status: "draft",
      version: sql`${knowledgeDocuments.version} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(knowledgeDocuments.projectId, input.projectId),
        eq(knowledgeDocuments.id, input.documentId),
        eq(knowledgeDocuments.version, input.expectedVersion),
        eq(knowledgeDocuments.status, "published"),
      ),
    )
    .returning({ id: knowledgeDocuments.id });
  return rows.length === 1;
};

export const archiveKnowledgeDocumentRecord = async (input: {
  projectId: string;
  documentId: string;
  expectedVersion: number;
}): Promise<boolean> => {
  const rows = await getInfrastructure()
    .database.db.update(knowledgeDocuments)
    .set({
      status: "archived",
      version: sql`${knowledgeDocuments.version} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(knowledgeDocuments.projectId, input.projectId),
        eq(knowledgeDocuments.id, input.documentId),
        eq(knowledgeDocuments.version, input.expectedVersion),
        eq(knowledgeDocuments.status, "draft"),
        sql`${knowledgeDocuments.activeVersionId} is null`,
      ),
    )
    .returning({ id: knowledgeDocuments.id });
  return rows.length === 1;
};

export type DeleteKnowledgeDocumentRecordResult =
  "deleted" | "not_found" | "version_conflict" | "not_draft" | "used";

export const deleteKnowledgeDocumentRecord = async (input: {
  projectId: string;
  documentId: string;
  expectedVersion: number;
}): Promise<DeleteKnowledgeDocumentRecordResult> =>
  getInfrastructure().database.db.transaction(async (transaction) => {
    const [document] = await transaction
      .select({ version: knowledgeDocuments.version, status: knowledgeDocuments.status })
      .from(knowledgeDocuments)
      .where(
        and(
          eq(knowledgeDocuments.projectId, input.projectId),
          eq(knowledgeDocuments.id, input.documentId),
        ),
      )
      .limit(1);
    if (!document) return "not_found";
    if (document.version !== input.expectedVersion) return "version_conflict";
    const [usage] = await transaction
      .select({ count: sql<number>`count(*)::int` })
      .from(knowledgeDocumentPublications)
      .where(eq(knowledgeDocumentPublications.documentId, input.documentId));
    if ((usage?.count ?? 0) > 0) return "used";
    if (document.status !== "draft") return "not_draft";
    const deleted = await transaction
      .delete(knowledgeDocuments)
      .where(
        and(
          eq(knowledgeDocuments.projectId, input.projectId),
          eq(knowledgeDocuments.id, input.documentId),
          eq(knowledgeDocuments.version, input.expectedVersion),
        ),
      )
      .returning({ id: knowledgeDocuments.id });
    return deleted.length === 1 ? "deleted" : "version_conflict";
  });

export const listPublishedKnowledgeChunkCandidates = async (
  projectId: string,
  locale: string,
): Promise<KnowledgeChunkCandidate[]> => {
  const rows = await getInfrastructure()
    .database.db.select({
      chunkId: knowledgeChunks.id,
      documentId: knowledgeDocuments.id,
      documentVersionId: knowledgeDocumentVersions.id,
      title: knowledgeDocumentVersions.title,
      canonicalUrl: knowledgeDocumentVersions.canonicalUrl,
      tags: knowledgeDocumentVersions.tags,
      text: knowledgeChunks.plainText,
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
        eq(knowledgeDocumentVersions.locale, locale),
      ),
    )
    .orderBy(asc(knowledgeDocuments.id), asc(knowledgeChunks.ordinal))
    .limit(1_000);
  return rows;
};

export const listPublishedKnowledgeFingerprintRows = async (
  projectId: string,
): Promise<Array<{ chunkId: string; contentChecksum: string; documentId: string }>> =>
  getInfrastructure()
    .database.db.select({
      chunkId: knowledgeChunks.id,
      contentChecksum: knowledgeChunks.contentChecksum,
      documentId: knowledgeDocuments.id,
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

const indexVersionQuery = () =>
  getInfrastructure()
    .database.db.select(indexVersionSelection)
    .from(knowledgeIndexVersions)
    .leftJoin(users, eq(users.id, knowledgeIndexVersions.requestedBy));

export const findActiveKnowledgeIndexVersion = async (
  projectId: string,
): Promise<KnowledgeIndexVersionRecord | null> => {
  const rows = await indexVersionQuery()
    .where(
      and(
        eq(knowledgeIndexVersions.projectId, projectId),
        eq(knowledgeIndexVersions.status, "active"),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
};

export const findLatestKnowledgeIndexVersion = async (
  projectId: string,
): Promise<KnowledgeIndexVersionRecord | null> => {
  const rows = await indexVersionQuery()
    .where(eq(knowledgeIndexVersions.projectId, projectId))
    .orderBy(desc(knowledgeIndexVersions.createdAt))
    .limit(1);
  return rows[0] ?? null;
};

export const findPendingKnowledgeIndexVersion = async (
  projectId: string,
): Promise<KnowledgeIndexVersionRecord | null> => {
  const rows = await indexVersionQuery()
    .where(
      and(
        eq(knowledgeIndexVersions.projectId, projectId),
        sql`${knowledgeIndexVersions.status} in ('queued', 'building')`,
      ),
    )
    .orderBy(desc(knowledgeIndexVersions.createdAt))
    .limit(1);
  return rows[0] ?? null;
};

export const createKnowledgeIndexVersionRecord = async (input: {
  projectId: string;
  embeddingModelId: string;
  requestedBy: string;
  requestId: string;
}): Promise<KnowledgeIndexVersionRecord> => {
  const [row] = await getInfrastructure()
    .database.db.insert(knowledgeIndexVersions)
    .values(input)
    .returning();
  if (!row) throw new Error("Knowledge index version creation failed");
  return { ...row, requestedByEmail: null };
};

export const failQueuedKnowledgeIndexVersion = async (
  indexVersionId: string,
  errorCode: string,
): Promise<void> => {
  const now = new Date();
  await getInfrastructure()
    .database.db.update(knowledgeIndexVersions)
    .set({ status: "failed", errorCode, finishedAt: now, updatedAt: now })
    .where(
      and(
        eq(knowledgeIndexVersions.id, indexVersionId),
        eq(knowledgeIndexVersions.status, "queued"),
      ),
    );
};

export const listSemanticKnowledgeChunkCandidates = async (input: {
  projectId: string;
  locale: string;
  indexVersionId: string;
  embedding: number[];
  limit: number;
}): Promise<Array<KnowledgeChunkCandidate & { score: number }>> => {
  const queryVector = JSON.stringify(input.embedding);
  const distance = sql<number>`${knowledgeIndexEmbeddings.embedding} <=> ${queryVector}::vector`;
  const rows = await getInfrastructure()
    .database.db.select({
      chunkId: knowledgeChunks.id,
      documentId: knowledgeDocuments.id,
      documentVersionId: knowledgeDocumentVersions.id,
      title: knowledgeDocumentVersions.title,
      canonicalUrl: knowledgeDocumentVersions.canonicalUrl,
      tags: knowledgeDocumentVersions.tags,
      text: knowledgeChunks.plainText,
      distance,
    })
    .from(knowledgeIndexEmbeddings)
    .innerJoin(knowledgeChunks, eq(knowledgeChunks.id, knowledgeIndexEmbeddings.knowledgeChunkId))
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
        eq(knowledgeIndexEmbeddings.indexVersionId, input.indexVersionId),
        eq(knowledgeChunks.projectId, input.projectId),
        eq(knowledgeDocuments.projectId, input.projectId),
        eq(knowledgeDocuments.status, "published"),
        eq(knowledgeDocumentVersions.locale, input.locale),
      ),
    )
    .orderBy(distance)
    .limit(input.limit);
  return rows.map(({ distance: rawDistance, ...candidate }) => ({
    ...candidate,
    score: Number(Math.max(0, Math.min(1, 1 - Number(rawDistance))).toFixed(4)),
  }));
};

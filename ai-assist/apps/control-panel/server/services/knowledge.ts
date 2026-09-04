import type {
  CreateKnowledgeDocumentRequest,
  CreateKnowledgeDocumentVersionRequest,
  DeleteKnowledgeDocumentResponse,
  KnowledgeIndexStateResponse,
  KnowledgeIndexVersionResponse,
  KnowledgeDocumentDetailResponse,
  KnowledgeDocumentListResponse,
  KnowledgeDocumentPublicationResponse,
  KnowledgeDocumentSummaryResponse,
  KnowledgeDocumentVersionResponse,
  KnowledgeProductInput,
  KnowledgeRetrievalSource,
  MutateKnowledgeDocumentRequest,
  PublishKnowledgeDocumentRequest,
  RequestKnowledgeReindexResponse,
} from "@ai-assist/contracts";
import {
  checksumKnowledgeContent,
  chunkKnowledgeText,
  estimateKnowledgeTokenCount,
  fingerprintKnowledgeChunks,
  fuseKnowledgeRankings,
  normalizeKnowledgeText,
  rankKnowledgeChunks,
  type RankedKnowledgeChunk,
} from "@ai-assist/domain";
import type { AitunnelClient } from "@ai-assist/provider-aitunnel";
import type { H3Event } from "h3";

import { writeAuditEvent } from "../repositories/audit";
import {
  archiveKnowledgeDocumentRecord,
  createKnowledgeDocumentRecord,
  createKnowledgeDocumentVersionRecord,
  deleteKnowledgeDocumentRecord,
  failQueuedKnowledgeIndexVersion,
  findActiveKnowledgeIndexVersion,
  findActiveKnowledgePublicationRecord,
  findKnowledgeDocumentRecord,
  findKnowledgeDocumentVersionRecord,
  findLatestKnowledgeIndexVersion,
  findPendingKnowledgeIndexVersion,
  createKnowledgeIndexVersionRecord,
  listKnowledgeDocumentRecords,
  listKnowledgeDocumentVersionRecords,
  listKnowledgeDocumentVersionRecordsForProject,
  listPublishedKnowledgeChunkCandidates,
  listPublishedKnowledgeFingerprintRows,
  listSemanticKnowledgeChunkCandidates,
  publishKnowledgeDocumentRecord,
  unpublishKnowledgeDocumentRecord,
  type KnowledgeDocumentPublicationRecord,
  type KnowledgeDocumentRecord,
  type KnowledgeDocumentVersionRecord,
  type KnowledgeIndexVersionRecord,
  type KnowledgeVersionValues,
} from "../repositories/knowledge";
import { findProjectModelSettings, findProviderCredential } from "../repositories/provider";
import { getInfrastructure } from "../utils/infrastructure";
import { getRequestId } from "../utils/request";
import { assertCsrf, assertRecentAdminAuthentication, requireProjectScope } from "./auth";

const buildProductFacts = (product: KnowledgeProductInput): string[] => {
  const characteristics = Object.entries(product.characteristics)
    .sort(([left], [right]) => left.localeCompare(right, "ru-RU"))
    .map(([name, value]) => `${name}: ${value}`);
  return [
    product.externalId ? `Внешний идентификатор: ${product.externalId}` : null,
    product.sku ? `Артикул: ${product.sku}` : null,
    product.category ? `Категория: ${product.category}` : null,
    product.priceDisplay ? `Цена: ${product.priceDisplay}` : null,
    product.priceAmount !== null
      ? `Сумма цены: ${product.priceAmount}${product.currency ? ` ${product.currency}` : ""}`
      : null,
    product.availability ? `Наличие: ${product.availability}` : null,
    product.minimumOrder !== null ? `Минимальный заказ: ${product.minimumOrder}` : null,
    ...characteristics,
  ].filter((value): value is string => Boolean(value));
};

const buildVersionValues = (
  input: CreateKnowledgeDocumentRequest | CreateKnowledgeDocumentVersionRequest,
): KnowledgeVersionValues => {
  const title = normalizeKnowledgeText(input.title);
  const content = normalizeKnowledgeText(input.content);
  const product = input.type === "product" ? input.product : null;
  const productFacts = product ? buildProductFacts(product) : [];
  const retrievalText = normalizeKnowledgeText(
    [title, ...productFacts, content].filter(Boolean).join("\n\n"),
  );
  const checksumPayload = JSON.stringify({
    type: input.type,
    title,
    content,
    canonicalUrl: input.canonicalUrl,
    locale: input.locale,
    tags: input.tags,
    product,
  });
  const chunks = chunkKnowledgeText(retrievalText).map((text) => ({
    text,
    tokenCount: estimateKnowledgeTokenCount(text),
    contentChecksum: checksumKnowledgeContent(text),
  }));
  if (!chunks.length || chunks.length > 40) {
    throw createError({
      statusCode: 422,
      statusMessage: "Knowledge document cannot be chunked safely",
      data: { code: "KNOWLEDGE_CHUNK_LIMIT" },
    });
  }
  return {
    title,
    canonicalUrl: input.canonicalUrl ? new URL(input.canonicalUrl).toString() : null,
    locale: input.locale,
    plainText: content,
    tags: input.tags,
    contentChecksum: checksumKnowledgeContent(checksumPayload),
    product,
    chunks,
  };
};

const toVersionResponse = (
  version: KnowledgeDocumentVersionRecord,
): KnowledgeDocumentVersionResponse => ({
  id: version.id,
  documentId: version.documentId,
  versionNo: version.versionNo,
  title: version.title,
  content: version.plainText,
  canonicalUrl: version.canonicalUrl,
  locale: version.locale,
  tags: version.tags,
  product: version.product,
  contentChecksum: version.contentChecksum,
  chunkCount: version.chunkCount,
  createdByEmail: version.createdByEmail,
  createdAt: version.createdAt.toISOString(),
});

const toPublicationResponse = (
  publication: KnowledgeDocumentPublicationRecord,
): KnowledgeDocumentPublicationResponse => ({
  id: publication.id,
  documentId: publication.documentId,
  documentVersionId: publication.documentVersionId,
  versionNo: publication.versionNo,
  publishedByEmail: publication.publishedByEmail,
  publishedAt: publication.publishedAt.toISOString(),
});

const toIndexVersionResponse = (
  index: KnowledgeIndexVersionRecord,
): KnowledgeIndexVersionResponse => ({
  id: index.id,
  projectId: index.projectId,
  status: index.status,
  embeddingModelId: index.embeddingModelId,
  embeddingDimension: index.embeddingDimension,
  sourceFingerprint: index.sourceFingerprint,
  documentCount: index.documentCount,
  chunkCount: index.chunkCount,
  inputTokens: index.inputTokens,
  errorCode: index.errorCode,
  requestedByEmail: index.requestedByEmail,
  requestId: index.requestId,
  startedAt: index.startedAt?.toISOString() ?? null,
  finishedAt: index.finishedAt?.toISOString() ?? null,
  activatedAt: index.activatedAt?.toISOString() ?? null,
  createdAt: index.createdAt.toISOString(),
  updatedAt: index.updatedAt.toISOString(),
});

const toSummaryResponse = (
  document: KnowledgeDocumentRecord,
  versions: KnowledgeDocumentVersionRecord[],
): KnowledgeDocumentSummaryResponse => {
  const latest = versions[0];
  if (!latest) throw new Error("Knowledge document has no versions");
  const active = document.activeVersionId
    ? versions.find((version) => version.id === document.activeVersionId)
    : null;
  return {
    id: document.id,
    projectId: document.projectId,
    type: document.type,
    status: document.status,
    version: document.version,
    title: latest.title,
    locale: latest.locale,
    latestVersionNo: latest.versionNo,
    activeVersionId: document.activeVersionId,
    activeVersionNo: active?.versionNo ?? null,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
};

const loadKnowledgeDocumentDetail = async (
  projectId: string,
  documentId: string,
): Promise<KnowledgeDocumentDetailResponse> => {
  const [document, versions, activePublication] = await Promise.all([
    findKnowledgeDocumentRecord(projectId, documentId),
    listKnowledgeDocumentVersionRecords(projectId, documentId),
    findActiveKnowledgePublicationRecord(projectId, documentId),
  ]);
  if (!document) {
    throw createError({ statusCode: 404, statusMessage: "Knowledge document not found" });
  }
  return {
    document: toSummaryResponse(document, versions),
    versions: versions.map(toVersionResponse),
    activePublication: activePublication ? toPublicationResponse(activePublication) : null,
  };
};

const throwKnowledgeMutationConflict = async (
  projectId: string,
  documentId: string,
  expectedVersion: number,
): Promise<never> => {
  const current = await findKnowledgeDocumentRecord(projectId, documentId);
  if (!current) {
    throw createError({ statusCode: 404, statusMessage: "Knowledge document not found" });
  }
  if (current.status === "archived") {
    throw createError({
      statusCode: 409,
      statusMessage: "Archived knowledge document cannot be changed",
      data: { code: "KNOWLEDGE_DOCUMENT_ARCHIVED", currentVersion: current.version },
    });
  }
  throw createError({
    statusCode: 409,
    statusMessage: "Knowledge document was changed by another request",
    data: {
      code: "KNOWLEDGE_VERSION_CONFLICT",
      expectedVersion,
      currentVersion: current.version,
    },
  });
};

export const getKnowledgeDocuments = async (
  event: H3Event,
  projectId: string,
): Promise<KnowledgeDocumentListResponse> => {
  const { project } = await requireProjectScope(event, projectId);
  const [documents, versions] = await Promise.all([
    listKnowledgeDocumentRecords(project.id),
    listKnowledgeDocumentVersionRecordsForProject(project.id),
  ]);
  const byDocument = new Map<string, KnowledgeDocumentVersionRecord[]>();
  for (const version of versions) {
    const current = byDocument.get(version.documentId) ?? [];
    current.push(version);
    byDocument.set(version.documentId, current);
  }
  return {
    documents: documents.map((document) =>
      toSummaryResponse(document, byDocument.get(document.id) ?? []),
    ),
  };
};

export const getKnowledgeDocument = async (
  event: H3Event,
  projectId: string,
  documentId: string,
): Promise<KnowledgeDocumentDetailResponse> => {
  const { project } = await requireProjectScope(event, projectId);
  return loadKnowledgeDocumentDetail(project.id, documentId);
};

export const createKnowledgeDocument = async (
  event: H3Event,
  projectId: string,
  input: CreateKnowledgeDocumentRequest,
): Promise<KnowledgeDocumentDetailResponse> => {
  const { session, project } = await requireProjectScope(event, projectId, "editor");
  assertCsrf(event, session);
  const versionValues = buildVersionValues(input);
  const created = await createKnowledgeDocumentRecord({
    projectId: project.id,
    type: input.type,
    createdBy: session.userId,
    version: versionValues,
  });
  await writeAuditEvent({
    projectId: project.id,
    actorUserId: session.userId,
    action: "knowledge.document_created",
    resourceType: "knowledge_document",
    resourceId: created.document.id,
    requestId: getRequestId(event),
    metadata: {
      documentType: created.document.type,
      versionId: created.version.id,
      versionNo: created.version.versionNo,
      chunkCount: created.version.chunkCount,
    },
  });
  return loadKnowledgeDocumentDetail(project.id, created.document.id);
};

export const createKnowledgeDocumentVersion = async (
  event: H3Event,
  projectId: string,
  documentId: string,
  input: CreateKnowledgeDocumentVersionRequest,
): Promise<KnowledgeDocumentDetailResponse> => {
  const { session, project } = await requireProjectScope(event, projectId, "editor");
  assertCsrf(event, session);
  const document = await findKnowledgeDocumentRecord(project.id, documentId);
  if (!document) {
    throw createError({ statusCode: 404, statusMessage: "Knowledge document not found" });
  }
  if (document.type !== input.type) {
    throw createError({
      statusCode: 422,
      statusMessage: "Knowledge document type cannot be changed",
      data: { code: "KNOWLEDGE_TYPE_IMMUTABLE" },
    });
  }
  const versionValues = buildVersionValues(input);
  const versions = await listKnowledgeDocumentVersionRecords(project.id, documentId);
  if (versions[0]?.contentChecksum === versionValues.contentChecksum) {
    throw createError({
      statusCode: 409,
      statusMessage: "Knowledge document version is unchanged",
      data: { code: "KNOWLEDGE_REVISION_UNCHANGED" },
    });
  }
  const created = await createKnowledgeDocumentVersionRecord({
    projectId: project.id,
    documentId,
    expectedVersion: input.expectedVersion,
    createdBy: session.userId,
    version: versionValues,
  });
  if (!created) {
    return throwKnowledgeMutationConflict(project.id, documentId, input.expectedVersion);
  }
  await writeAuditEvent({
    projectId: project.id,
    actorUserId: session.userId,
    action: "knowledge.version_created",
    resourceType: "knowledge_document_version",
    resourceId: created.version.id,
    requestId: getRequestId(event),
    metadata: {
      documentId,
      documentType: created.document.type,
      versionNo: created.version.versionNo,
      chunkCount: created.version.chunkCount,
    },
  });
  return loadKnowledgeDocumentDetail(project.id, documentId);
};

export const publishKnowledgeDocument = async (
  event: H3Event,
  projectId: string,
  documentId: string,
  input: PublishKnowledgeDocumentRequest,
): Promise<KnowledgeDocumentDetailResponse> => {
  const { session, project } = await requireProjectScope(event, projectId, "editor");
  assertCsrf(event, session);
  const [document, target] = await Promise.all([
    findKnowledgeDocumentRecord(project.id, documentId),
    findKnowledgeDocumentVersionRecord(project.id, documentId, input.versionId),
  ]);
  if (!document) {
    throw createError({ statusCode: 404, statusMessage: "Knowledge document not found" });
  }
  if (!target) {
    throw createError({ statusCode: 404, statusMessage: "Knowledge document version not found" });
  }
  if (document.status === "published" && document.activeVersionId === target.id) {
    throw createError({
      statusCode: 409,
      statusMessage: "Knowledge document version is already active",
      data: { code: "KNOWLEDGE_VERSION_ALREADY_ACTIVE", currentVersion: document.version },
    });
  }
  const result = await publishKnowledgeDocumentRecord({
    projectId: project.id,
    documentId,
    documentVersionId: input.versionId,
    expectedVersion: input.expectedVersion,
    publishedBy: session.userId,
  });
  if (result === "not_found") {
    throw createError({ statusCode: 404, statusMessage: "Knowledge document not found" });
  }
  if (result === "version_not_found") {
    throw createError({ statusCode: 404, statusMessage: "Knowledge document version not found" });
  }
  if (result === "version_conflict") {
    return throwKnowledgeMutationConflict(project.id, documentId, input.expectedVersion);
  }
  await writeAuditEvent({
    projectId: project.id,
    actorUserId: session.userId,
    action: "knowledge.document_published",
    resourceType: "knowledge_document_version",
    resourceId: target.id,
    requestId: getRequestId(event),
    metadata: { documentId, versionNo: target.versionNo, chunkCount: target.chunkCount },
  });
  return loadKnowledgeDocumentDetail(project.id, documentId);
};

export const unpublishKnowledgeDocument = async (
  event: H3Event,
  projectId: string,
  documentId: string,
  input: MutateKnowledgeDocumentRequest,
): Promise<KnowledgeDocumentDetailResponse> => {
  const { session, project } = await requireProjectScope(event, projectId, "editor");
  assertCsrf(event, session);
  const current = await findKnowledgeDocumentRecord(project.id, documentId);
  if (!current) {
    throw createError({ statusCode: 404, statusMessage: "Knowledge document not found" });
  }
  if (current.status !== "published" || !current.activeVersionId) {
    throw createError({
      statusCode: 409,
      statusMessage: "Knowledge document is not published",
      data: { code: "KNOWLEDGE_DOCUMENT_NOT_PUBLISHED", currentVersion: current.version },
    });
  }
  const changed = await unpublishKnowledgeDocumentRecord({
    projectId: project.id,
    documentId,
    expectedVersion: input.expectedVersion,
  });
  if (!changed)
    return throwKnowledgeMutationConflict(project.id, documentId, input.expectedVersion);
  await writeAuditEvent({
    projectId: project.id,
    actorUserId: session.userId,
    action: "knowledge.document_unpublished",
    resourceType: "knowledge_document",
    resourceId: documentId,
    requestId: getRequestId(event),
    metadata: {},
  });
  return loadKnowledgeDocumentDetail(project.id, documentId);
};

export const archiveKnowledgeDocument = async (
  event: H3Event,
  projectId: string,
  documentId: string,
  input: MutateKnowledgeDocumentRequest,
): Promise<KnowledgeDocumentDetailResponse> => {
  const { session, project } = await requireProjectScope(event, projectId, "editor");
  assertCsrf(event, session);
  const current = await findKnowledgeDocumentRecord(project.id, documentId);
  if (!current) {
    throw createError({ statusCode: 404, statusMessage: "Knowledge document not found" });
  }
  if (current.status === "published") {
    throw createError({
      statusCode: 409,
      statusMessage: "Published knowledge document must be unpublished before archive",
      data: { code: "KNOWLEDGE_DOCUMENT_ACTIVE" },
    });
  }
  const changed = await archiveKnowledgeDocumentRecord({
    projectId: project.id,
    documentId,
    expectedVersion: input.expectedVersion,
  });
  if (!changed)
    return throwKnowledgeMutationConflict(project.id, documentId, input.expectedVersion);
  await writeAuditEvent({
    projectId: project.id,
    actorUserId: session.userId,
    action: "knowledge.document_archived",
    resourceType: "knowledge_document",
    resourceId: documentId,
    requestId: getRequestId(event),
    metadata: {},
  });
  return loadKnowledgeDocumentDetail(project.id, documentId);
};

export const deleteKnowledgeDocument = async (
  event: H3Event,
  projectId: string,
  documentId: string,
  expectedVersion: number,
): Promise<DeleteKnowledgeDocumentResponse> => {
  const { session, project } = await requireProjectScope(event, projectId, "editor");
  assertCsrf(event, session);
  assertRecentAdminAuthentication(session);
  const result = await deleteKnowledgeDocumentRecord({
    projectId: project.id,
    documentId,
    expectedVersion,
  });
  if (result === "not_found") {
    throw createError({ statusCode: 404, statusMessage: "Knowledge document not found" });
  }
  if (result === "used") {
    throw createError({
      statusCode: 409,
      statusMessage: "Published knowledge document must be archived instead of deleted",
      data: { code: "KNOWLEDGE_DELETE_REQUIRES_ARCHIVE" },
    });
  }
  if (result === "not_draft") {
    throw createError({
      statusCode: 409,
      statusMessage: "Only an unused draft knowledge document can be deleted",
      data: { code: "KNOWLEDGE_DELETE_DRAFT_ONLY" },
    });
  }
  if (result === "version_conflict") {
    return throwKnowledgeMutationConflict(project.id, documentId, expectedVersion);
  }
  await writeAuditEvent({
    projectId: project.id,
    actorUserId: session.userId,
    action: "knowledge.document_deleted",
    resourceType: "knowledge_document",
    resourceId: documentId,
    requestId: getRequestId(event),
    metadata: {},
  });
  return { id: documentId, deleted: true };
};

export const getKnowledgeIndexState = async (
  event: H3Event,
  projectId: string,
): Promise<KnowledgeIndexStateResponse> => {
  const { project } = await requireProjectScope(event, projectId);
  const [settings, active, latest, fingerprintRows] = await Promise.all([
    findProjectModelSettings(project.id),
    findActiveKnowledgeIndexVersion(project.id),
    findLatestKnowledgeIndexVersion(project.id),
    listPublishedKnowledgeFingerprintRows(project.id),
  ]);
  const currentFingerprint = fingerprintKnowledgeChunks(fingerprintRows);
  return {
    configuredEmbeddingModelId: settings?.embeddingModelId ?? null,
    active: active ? toIndexVersionResponse(active) : null,
    latest: latest ? toIndexVersionResponse(latest) : null,
    stale:
      !active ||
      active.embeddingModelId !== settings?.embeddingModelId ||
      active.sourceFingerprint !== currentFingerprint,
    publishedDocumentCount: new Set(fingerprintRows.map((row) => row.documentId)).size,
    publishedChunkCount: fingerprintRows.length,
  };
};

export const requestKnowledgeReindex = async (
  event: H3Event,
  projectId: string,
): Promise<RequestKnowledgeReindexResponse> => {
  const { session, project } = await requireProjectScope(event, projectId, "editor");
  assertCsrf(event, session);
  const [settings, credential, pending, fingerprintRows] = await Promise.all([
    findProjectModelSettings(project.id),
    findProviderCredential(project.id),
    findPendingKnowledgeIndexVersion(project.id),
    listPublishedKnowledgeFingerprintRows(project.id),
  ]);
  if (!settings?.embeddingModelId) {
    throw createError({
      statusCode: 422,
      statusMessage: "Embedding model must be selected before indexing",
      data: { code: "KNOWLEDGE_EMBEDDING_MODEL_REQUIRED" },
    });
  }
  if (!credential || credential.status !== "verified") {
    throw createError({
      statusCode: 422,
      statusMessage: "Verified provider credential is required before indexing",
      data: { code: "PROVIDER_CREDENTIAL_NOT_READY" },
    });
  }
  if (!fingerprintRows.length) {
    throw createError({
      statusCode: 422,
      statusMessage: "Publish at least one knowledge document before indexing",
      data: { code: "KNOWLEDGE_PUBLISHED_CONTENT_REQUIRED" },
    });
  }
  if (pending) {
    return {
      jobId: `knowledge-index-${pending.id}`,
      index: toIndexVersionResponse(pending),
    };
  }

  const requestId = getRequestId(event);
  let created: KnowledgeIndexVersionRecord;
  try {
    created = await createKnowledgeIndexVersionRecord({
      projectId: project.id,
      embeddingModelId: settings.embeddingModelId,
      requestedBy: session.userId,
      requestId,
    });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      const raced = await findPendingKnowledgeIndexVersion(project.id);
      if (raced) {
        return {
          jobId: `knowledge-index-${raced.id}`,
          index: toIndexVersionResponse(raced),
        };
      }
    }
    throw error;
  }
  const jobId = `knowledge-index-${created.id}`;
  try {
    await getInfrastructure().systemQueue.add(
      "knowledge.index",
      {
        projectId: project.id,
        indexVersionId: created.id,
        requestedAt: new Date().toISOString(),
        requestId,
      },
      {
        jobId,
        attempts: 1,
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    );
  } catch {
    await failQueuedKnowledgeIndexVersion(created.id, "KNOWLEDGE_QUEUE_UNAVAILABLE");
    throw createError({
      statusCode: 503,
      statusMessage: "Knowledge indexing queue is unavailable",
      data: { code: "KNOWLEDGE_QUEUE_UNAVAILABLE", retryable: true },
    });
  }
  await writeAuditEvent({
    projectId: project.id,
    actorUserId: session.userId,
    action: "knowledge.index_requested",
    resourceType: "knowledge_index_version",
    resourceId: created.id,
    requestId,
    metadata: { embeddingModelId: created.embeddingModelId },
  });
  return { jobId, index: toIndexVersionResponse(created) };
};

export const retrievePublishedKnowledge = async (input: {
  projectId: string;
  locale: string;
  query: string;
  limit?: number;
  embeddingProvider?: {
    apiKey: string;
    modelId: string;
    client: Pick<AitunnelClient, "createEmbeddings">;
  };
}): Promise<{
  ranked: RankedKnowledgeChunk[];
  sources: KnowledgeRetrievalSource[];
  mode: "hybrid" | "lexical";
  indexVersionId: string | null;
  warningCode: string | null;
}> => {
  const candidates = await listPublishedKnowledgeChunkCandidates(input.projectId, input.locale);
  const resultLimit = input.limit ?? 5;
  const lexical = rankKnowledgeChunks(input.query, candidates, 20);
  let ranked = lexical.slice(0, resultLimit);
  let mode: "hybrid" | "lexical" = "lexical";
  let indexVersionId: string | null = null;
  let warningCode: string | null = null;
  const active = input.embeddingProvider
    ? await findActiveKnowledgeIndexVersion(input.projectId)
    : null;
  if (
    candidates.length &&
    input.embeddingProvider &&
    active &&
    active.embeddingModelId === input.embeddingProvider.modelId &&
    active.embeddingDimension
  ) {
    try {
      const result = await input.embeddingProvider.client.createEmbeddings({
        apiKey: input.embeddingProvider.apiKey,
        model: input.embeddingProvider.modelId,
        values: [input.query],
      });
      const embedding = result.embeddings[0];
      if (
        !embedding ||
        embedding.length !== active.embeddingDimension ||
        embedding.some((value) => !Number.isFinite(value))
      ) {
        warningCode = "KNOWLEDGE_INDEX_DIMENSION_MISMATCH";
      } else {
        const semantic = await listSemanticKnowledgeChunkCandidates({
          projectId: input.projectId,
          locale: input.locale,
          indexVersionId: active.id,
          embedding,
          limit: 20,
        });
        ranked = fuseKnowledgeRankings(lexical, semantic, resultLimit);
        mode = "hybrid";
        indexVersionId = active.id;
      }
    } catch {
      warningCode = "KNOWLEDGE_QUERY_EMBEDDING_FAILED";
    }
  } else if (input.embeddingProvider && candidates.length) {
    warningCode = "KNOWLEDGE_VECTOR_INDEX_UNAVAILABLE";
  }
  return {
    ranked,
    mode,
    indexVersionId,
    warningCode,
    sources: ranked.map((source) => ({
      chunkId: source.chunkId,
      documentId: source.documentId,
      documentVersionId: source.documentVersionId,
      title: source.title,
      canonicalUrl: source.canonicalUrl,
      excerpt: source.text,
      score: source.score,
    })),
  };
};

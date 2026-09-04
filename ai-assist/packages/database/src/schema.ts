import { sql } from "drizzle-orm";
import type { QualificationState } from "@ai-assist/domain";
import {
  type AnyPgColumn,
  boolean,
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const userStatus = pgEnum("user_status", ["invited", "active", "disabled"]);
export const projectStatus = pgEnum("project_status", ["active", "archived"]);
export const projectRole = pgEnum("project_role", ["owner", "editor", "viewer"]);
export const providerCredentialStatus = pgEnum("provider_credential_status", [
  "verified",
  "invalid",
  "disabled",
]);
export const modelCapability = pgEnum("model_capability", ["chat", "embeddings", "rerank"]);
export const assistantStatus = pgEnum("assistant_status", ["draft", "active", "disabled"]);
export const promptType = pgEnum("prompt_type", ["system"]);
export const promptStatus = pgEnum("prompt_status", ["draft", "published", "archived"]);
export const knowledgeSourceType = pgEnum("knowledge_source_type", [
  "feed",
  "url",
  "manual",
  "product",
]);
export const knowledgeSourceStatus = pgEnum("knowledge_source_status", ["active", "archived"]);
export const knowledgeDocumentType = pgEnum("knowledge_document_type", [
  "page",
  "manual",
  "product",
]);
export const knowledgeDocumentStatus = pgEnum("knowledge_document_status", [
  "draft",
  "published",
  "archived",
]);
export const knowledgeIndexStatus = pgEnum("knowledge_index_status", [
  "queued",
  "building",
  "active",
  "superseded",
  "failed",
]);
export const knowledgeCrawlRunStatus = pgEnum("knowledge_crawl_run_status", [
  "queued",
  "running",
  "succeeded",
  "partial",
  "failed",
  "cancelled",
]);
export const knowledgeCrawlPageStatus = pgEnum("knowledge_crawl_page_status", [
  "succeeded",
  "failed",
  "skipped",
]);
export const knowledgeCrawlChangeType = pgEnum("knowledge_crawl_change_type", [
  "new",
  "changed",
  "unchanged",
]);
export const knowledgeCrawlReviewStatus = pgEnum("knowledge_crawl_review_status", [
  "pending",
  "approved",
  "rejected",
]);
export const widgetConversationStatus = pgEnum("widget_conversation_status", ["active", "closed"]);
export const widgetMessageRole = pgEnum("widget_message_role", ["user", "assistant"]);
export const widgetMessageStatus = pgEnum("widget_message_status", [
  "pending",
  "completed",
  "failed",
]);
export const widgetGenerationStatus = pgEnum("widget_generation_status", [
  "running",
  "completed",
  "failed",
  "cancelled",
]);

const unboundedVector = customType<{ data: number[]; driverData: string }>({
  dataType: () => "vector",
  toDriver: (value) => JSON.stringify(value),
  fromDriver: (value) =>
    value
      .slice(1, -1)
      .split(",")
      .filter(Boolean)
      .map((item) => Number.parseFloat(item)),
});

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    emailNormalized: varchar("email_normalized", { length: 320 }).notNull(),
    passwordHash: text("password_hash"),
    status: userStatus("status").default("invited").notNull(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [uniqueIndex("users_email_normalized_uidx").on(table.emailNormalized)],
);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 160 }).notNull(),
    slug: varchar("slug", { length: 80 }).notNull(),
    status: projectStatus("status").default("active").notNull(),
    timezone: varchar("timezone", { length: 80 }).default("Europe/Moscow").notNull(),
    defaultLocale: varchar("default_locale", { length: 16 }).default("ru").notNull(),
    primaryOrigin: varchar("primary_origin", { length: 512 }),
    conversationRetentionDays: integer("conversation_retention_days").default(30).notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("projects_slug_uidx").on(table.slug)],
);

export const projectMemberships = pgTable(
  "project_memberships",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: projectRole("role").notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.userId] }),
    index("project_memberships_user_idx").on(table.userId),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    csrfTokenHash: varchar("csrf_token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
    rotatedFromId: uuid("rotated_from_id").references((): AnyPgColumn => sessions.id, {
      onDelete: "set null",
    }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("sessions_token_hash_uidx").on(table.tokenHash),
    index("sessions_user_expires_idx").on(table.userId, table.expiresAt),
  ],
);

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    requestedSubjectHash: varchar("requested_subject_hash", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("password_reset_tokens_token_hash_uidx").on(table.tokenHash),
    index("password_reset_tokens_user_expires_idx").on(table.userId, table.expiresAt),
  ],
);

export const providerCredentials = pgTable(
  "provider_credentials",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 50 }).default("aitunnel").notNull(),
    ciphertext: text("ciphertext").notNull(),
    nonce: varchar("nonce", { length: 64 }).notNull(),
    authTag: varchar("auth_tag", { length: 64 }).notNull(),
    keyVersion: integer("key_version").notNull(),
    maskedHint: varchar("masked_hint", { length: 64 }).notNull(),
    status: providerCredentialStatus("status").default("verified").notNull(),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    lastErrorCode: varchar("last_error_code", { length: 100 }),
    verificationMetadata: jsonb("verification_metadata")
      .$type<Record<string, unknown> | null>()
      .default(null),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("provider_credentials_project_provider_uidx").on(table.projectId, table.provider),
    index("provider_credentials_status_idx").on(table.status),
  ],
);

export const providerModelCatalog = pgTable(
  "provider_model_catalog",
  {
    provider: varchar("provider", { length: 50 }).default("aitunnel").notNull(),
    modelId: varchar("model_id", { length: 255 }).notNull(),
    capability: modelCapability("capability").notNull(),
    upstreamProvider: varchar("upstream_provider", { length: 100 }),
    description: text("description"),
    inputModalities: jsonb("input_modalities").$type<string[]>().default([]).notNull(),
    outputModalities: jsonb("output_modalities").$type<string[]>().default([]).notNull(),
    contextSize: integer("context_size"),
    maxOutput: integer("max_output"),
    maxTokens: integer("max_tokens"),
    pricing: jsonb("pricing").$type<Record<string, number>>().default({}).notNull(),
    available: boolean("available").default(true).notNull(),
    providerCreatedAt: timestamp("provider_created_at", { withTimezone: true }),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
    rawChecksum: varchar("raw_checksum", { length: 64 }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.provider, table.modelId, table.capability] }),
    index("provider_model_catalog_capability_available_idx").on(
      table.provider,
      table.capability,
      table.available,
    ),
  ],
);

export const projectModelSettings = pgTable("project_model_settings", {
  projectId: uuid("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  chatModelId: varchar("chat_model_id", { length: 255 }),
  embeddingModelId: varchar("embedding_model_id", { length: 255 }),
  rerankModelId: varchar("rerank_model_id", { length: 255 }),
  embeddingDimension: integer("embedding_dimension"),
  maxOutputTokens: integer("max_output_tokens").default(1500).notNull(),
  temperature: doublePrecision("temperature"),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  ...timestamps,
});

export const prompts = pgTable(
  "prompts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    type: promptType("type").default("system").notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    description: text("description"),
    status: promptStatus("status").default("draft").notNull(),
    version: integer("version").default(1).notNull(),
    ...timestamps,
  },
  (table) => [index("prompts_project_status_idx").on(table.projectId, table.status)],
);

export const promptRevisions = pgTable(
  "prompt_revisions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    promptId: uuid("prompt_id")
      .notNull()
      .references(() => prompts.id, { onDelete: "cascade" }),
    revisionNo: integer("revision_no").notNull(),
    content: text("content").notNull(),
    variables: jsonb("variables").$type<string[]>().default([]).notNull(),
    contentChecksum: varchar("content_checksum", { length: 64 }).notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("prompt_revisions_prompt_revision_uidx").on(table.promptId, table.revisionNo),
    index("prompt_revisions_prompt_created_idx").on(table.promptId, table.createdAt),
  ],
);

export type PromptModelSettingsSnapshot = {
  chatModelId: string | null;
  embeddingModelId: string | null;
  rerankModelId: string | null;
  maxOutputTokens: number;
  temperature: number | null;
};

export const assistants = pgTable(
  "assistants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    publicId: varchar("public_id", { length: 80 }).notNull(),
    status: assistantStatus("status").default("draft").notNull(),
    configVersion: integer("config_version").default(0).notNull(),
    activePublicationId: uuid("active_publication_id").references(
      (): AnyPgColumn => assistantPublications.id,
      { onDelete: "set null" },
    ),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("assistants_project_uidx").on(table.projectId),
    uniqueIndex("assistants_public_id_uidx").on(table.publicId),
  ],
);

export const assistantConfigRevisions = pgTable(
  "assistant_config_revisions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    assistantId: uuid("assistant_id")
      .notNull()
      .references(() => assistants.id, { onDelete: "cascade" }),
    revisionNo: integer("revision_no").notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    greeting: text("greeting").notNull(),
    placeholder: varchar("placeholder", { length: 200 }).notNull(),
    accentColor: varchar("accent_color", { length: 7 }).notNull(),
    launcherPosition: varchar("launcher_position", { length: 16 }).notNull(),
    contactFallback: text("contact_fallback"),
    locale: varchar("locale", { length: 16 }).notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    maintenanceMessage: text("maintenance_message"),
    maxConversationTurns: integer("max_conversation_turns").notNull(),
    responseTimeoutSeconds: integer("response_timeout_seconds").notNull(),
    dailyRateLimit: integer("daily_rate_limit").notNull(),
    citationsEnabled: boolean("citations_enabled").default(true).notNull(),
    contentChecksum: varchar("content_checksum", { length: 64 }).notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("assistant_config_revisions_assistant_revision_uidx").on(
      table.assistantId,
      table.revisionNo,
    ),
    index("assistant_config_revisions_assistant_created_idx").on(
      table.assistantId,
      table.createdAt,
    ),
  ],
);

export const assistantAllowedOrigins = pgTable(
  "assistant_allowed_origins",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    configRevisionId: uuid("config_revision_id")
      .notNull()
      .references(() => assistantConfigRevisions.id, { onDelete: "cascade" }),
    origin: varchar("origin", { length: 512 }).notNull(),
    scheme: varchar("scheme", { length: 8 }).notNull(),
    host: varchar("host", { length: 255 }).notNull(),
    port: integer("port"),
    environment: varchar("environment", { length: 16 }).notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("assistant_allowed_origins_revision_origin_uidx").on(
      table.configRevisionId,
      table.origin,
    ),
    index("assistant_allowed_origins_revision_idx").on(table.configRevisionId),
  ],
);

export const assistantPublications = pgTable(
  "assistant_publications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    assistantId: uuid("assistant_id")
      .notNull()
      .references(() => assistants.id, { onDelete: "cascade" }),
    promptRevisionId: uuid("prompt_revision_id")
      .notNull()
      .references(() => promptRevisions.id, { onDelete: "restrict" }),
    configRevisionId: uuid("config_revision_id")
      .notNull()
      .references(() => assistantConfigRevisions.id, { onDelete: "restrict" }),
    supersedesId: uuid("supersedes_id").references((): AnyPgColumn => assistantPublications.id, {
      onDelete: "set null",
    }),
    modelSettingsSnapshot: jsonb("model_settings_snapshot")
      .$type<PromptModelSettingsSnapshot>()
      .notNull(),
    publishedBy: uuid("published_by").references(() => users.id, { onDelete: "set null" }),
    publishedAt: timestamp("published_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("assistant_publications_assistant_published_idx").on(
      table.assistantId,
      table.publishedAt,
    ),
    index("assistant_publications_prompt_revision_idx").on(table.promptRevisionId),
  ],
);

export const widgetSessions = pgTable(
  "widget_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    assistantId: uuid("assistant_id")
      .notNull()
      .references(() => assistants.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    originHash: varchar("origin_hash", { length: 64 }).notNull(),
    locale: varchar("locale", { length: 16 }).notNull(),
    widgetVersion: varchar("widget_version", { length: 40 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("widget_sessions_token_hash_uidx").on(table.tokenHash),
    index("widget_sessions_project_expires_idx").on(table.projectId, table.expiresAt),
    index("widget_sessions_assistant_expires_idx").on(table.assistantId, table.expiresAt),
  ],
);

export const widgetConversations = pgTable(
  "widget_conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    publicId: varchar("public_id", { length: 80 }).notNull(),
    widgetSessionId: uuid("widget_session_id")
      .notNull()
      .references(() => widgetSessions.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    assistantId: uuid("assistant_id")
      .notNull()
      .references(() => assistants.id, { onDelete: "cascade" }),
    status: widgetConversationStatus("status").default("active").notNull(),
    locale: varchar("locale", { length: 16 }).notNull(),
    qualificationState: jsonb("qualification_state").$type<QualificationState>().notNull(),
    summary: text("summary"),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("widget_conversations_public_id_uidx").on(table.publicId),
    uniqueIndex("widget_conversations_session_active_uidx")
      .on(table.widgetSessionId)
      .where(sql`${table.status} = 'active'`),
    index("widget_conversations_project_activity_idx").on(table.projectId, table.lastActivityAt),
    index("widget_conversations_session_activity_idx").on(
      table.widgetSessionId,
      table.lastActivityAt,
    ),
  ],
);

export const widgetMessages = pgTable(
  "widget_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => widgetConversations.id, { onDelete: "cascade" }),
    role: widgetMessageRole("role").notNull(),
    content: text("content").default("").notNull(),
    status: widgetMessageStatus("status").default("completed").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("widget_messages_conversation_created_idx").on(table.conversationId, table.createdAt),
  ],
);

export const knowledgeSources = pgTable(
  "knowledge_sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    type: knowledgeSourceType("type").notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    status: knowledgeSourceStatus("status").default("active").notNull(),
    version: integer("version").default(1).notNull(),
    systemKey: varchar("system_key", { length: 80 }),
    settings: jsonb("settings").$type<Record<string, unknown>>().default({}).notNull(),
    lastCrawledAt: timestamp("last_crawled_at", { withTimezone: true }),
    lastSuccessfulCrawlAt: timestamp("last_successful_crawl_at", { withTimezone: true }),
    lastErrorCode: varchar("last_error_code", { length: 100 }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("knowledge_sources_project_system_key_uidx").on(table.projectId, table.systemKey),
    index("knowledge_sources_project_status_idx").on(table.projectId, table.status),
  ],
);

export const knowledgeDocuments = pgTable(
  "knowledge_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => knowledgeSources.id, { onDelete: "restrict" }),
    type: knowledgeDocumentType("type").notNull(),
    status: knowledgeDocumentStatus("status").default("draft").notNull(),
    version: integer("version").default(1).notNull(),
    sourceExternalId: varchar("source_external_id", { length: 64 }),
    activeVersionId: uuid("active_version_id").references(
      (): AnyPgColumn => knowledgeDocumentVersions.id,
      { onDelete: "restrict" },
    ),
    ...timestamps,
  },
  (table) => [
    index("knowledge_documents_project_status_idx").on(table.projectId, table.status),
    index("knowledge_documents_source_idx").on(table.sourceId),
    uniqueIndex("knowledge_documents_source_external_uidx")
      .on(table.sourceId, table.sourceExternalId)
      .where(sql`${table.sourceExternalId} is not null`),
  ],
);

export type KnowledgeProductCharacteristics = Record<string, string>;

export const knowledgeDocumentVersions = pgTable(
  "knowledge_document_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => knowledgeDocuments.id, { onDelete: "cascade" }),
    versionNo: integer("version_no").notNull(),
    title: varchar("title", { length: 500 }).notNull(),
    canonicalUrl: varchar("canonical_url", { length: 2048 }),
    locale: varchar("locale", { length: 16 }).notNull(),
    plainText: text("plain_text").notNull(),
    tags: jsonb("tags").$type<string[]>().default([]).notNull(),
    contentChecksum: varchar("content_checksum", { length: 64 }).notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("knowledge_document_versions_document_version_uidx").on(
      table.documentId,
      table.versionNo,
    ),
    index("knowledge_document_versions_document_created_idx").on(table.documentId, table.createdAt),
  ],
);

export const knowledgeProducts = pgTable("knowledge_products", {
  documentVersionId: uuid("document_version_id")
    .primaryKey()
    .references(() => knowledgeDocumentVersions.id, { onDelete: "cascade" }),
  externalId: varchar("external_id", { length: 255 }),
  sku: varchar("sku", { length: 255 }),
  category: varchar("category", { length: 500 }),
  priceDisplay: varchar("price_display", { length: 255 }),
  priceAmount: numeric("price_amount", { precision: 18, scale: 2 }),
  currency: varchar("currency", { length: 3 }),
  availability: varchar("availability", { length: 255 }),
  minimumOrder: numeric("minimum_order", { precision: 18, scale: 3 }),
  characteristics: jsonb("characteristics")
    .$type<KnowledgeProductCharacteristics>()
    .default({})
    .notNull(),
});

export const knowledgeChunks = pgTable(
  "knowledge_chunks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    documentVersionId: uuid("document_version_id")
      .notNull()
      .references(() => knowledgeDocumentVersions.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    plainText: text("plain_text").notNull(),
    tokenCount: integer("token_count").notNull(),
    contentChecksum: varchar("content_checksum", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("knowledge_chunks_version_ordinal_uidx").on(table.documentVersionId, table.ordinal),
    index("knowledge_chunks_project_version_idx").on(table.projectId, table.documentVersionId),
  ],
);

export const knowledgeDocumentPublications = pgTable(
  "knowledge_document_publications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => knowledgeDocuments.id, { onDelete: "cascade" }),
    documentVersionId: uuid("document_version_id")
      .notNull()
      .references(() => knowledgeDocumentVersions.id, { onDelete: "restrict" }),
    publishedBy: uuid("published_by").references(() => users.id, { onDelete: "set null" }),
    publishedAt: timestamp("published_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("knowledge_document_publications_document_published_idx").on(
      table.documentId,
      table.publishedAt,
    ),
    index("knowledge_document_publications_version_idx").on(table.documentVersionId),
  ],
);

export const knowledgeIndexVersions = pgTable(
  "knowledge_index_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    status: knowledgeIndexStatus("status").default("queued").notNull(),
    embeddingModelId: varchar("embedding_model_id", { length: 255 }).notNull(),
    embeddingDimension: integer("embedding_dimension"),
    sourceFingerprint: varchar("source_fingerprint", { length: 64 }),
    documentCount: integer("document_count").default(0).notNull(),
    chunkCount: integer("chunk_count").default(0).notNull(),
    inputTokens: integer("input_tokens"),
    errorCode: varchar("error_code", { length: 100 }),
    requestedBy: uuid("requested_by").references(() => users.id, { onDelete: "set null" }),
    requestId: varchar("request_id", { length: 128 }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("knowledge_index_versions_project_created_idx").on(table.projectId, table.createdAt),
    uniqueIndex("knowledge_index_versions_project_active_uidx")
      .on(table.projectId)
      .where(sql`${table.status} = 'active'`),
    uniqueIndex("knowledge_index_versions_project_pending_uidx")
      .on(table.projectId)
      .where(sql`${table.status} in ('queued', 'building')`),
  ],
);

export const knowledgeIndexEmbeddings = pgTable(
  "knowledge_index_embeddings",
  {
    indexVersionId: uuid("index_version_id")
      .notNull()
      .references(() => knowledgeIndexVersions.id, { onDelete: "cascade" }),
    knowledgeChunkId: uuid("knowledge_chunk_id")
      .notNull()
      .references(() => knowledgeChunks.id, { onDelete: "cascade" }),
    embedding: unboundedVector("embedding").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.indexVersionId, table.knowledgeChunkId] }),
    index("knowledge_index_embeddings_chunk_idx").on(table.knowledgeChunkId),
  ],
);

export const knowledgeCrawlRuns = pgTable(
  "knowledge_crawl_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => knowledgeSources.id, { onDelete: "restrict" }),
    status: knowledgeCrawlRunStatus("status").default("queued").notNull(),
    discoveredCount: integer("discovered_count").default(0).notNull(),
    processedCount: integer("processed_count").default(0).notNull(),
    succeededCount: integer("succeeded_count").default(0).notNull(),
    failedCount: integer("failed_count").default(0).notNull(),
    newCount: integer("new_count").default(0).notNull(),
    changedCount: integer("changed_count").default(0).notNull(),
    unchangedCount: integer("unchanged_count").default(0).notNull(),
    approvedCount: integer("approved_count").default(0).notNull(),
    profileVersion: varchar("profile_version", { length: 100 }).notNull(),
    errorCode: varchar("error_code", { length: 100 }),
    requestedBy: uuid("requested_by").references(() => users.id, { onDelete: "set null" }),
    requestId: varchar("request_id", { length: 128 }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("knowledge_crawl_runs_project_created_idx").on(table.projectId, table.createdAt),
    index("knowledge_crawl_runs_source_created_idx").on(table.sourceId, table.createdAt),
    uniqueIndex("knowledge_crawl_runs_source_pending_uidx")
      .on(table.sourceId)
      .where(sql`${table.status} in ('queued', 'running')`),
  ],
);

export const knowledgeCrawlPages = pgTable(
  "knowledge_crawl_pages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => knowledgeCrawlRuns.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    normalizedUrl: varchar("normalized_url", { length: 2_048 }).notNull(),
    depth: integer("depth").notNull(),
    status: knowledgeCrawlPageStatus("status").notNull(),
    httpStatus: integer("http_status"),
    contentType: varchar("content_type", { length: 255 }),
    documentId: uuid("document_id").references(() => knowledgeDocuments.id, {
      onDelete: "set null",
    }),
    documentVersionId: uuid("document_version_id").references(() => knowledgeDocumentVersions.id, {
      onDelete: "set null",
    }),
    changeType: knowledgeCrawlChangeType("change_type"),
    documentType: knowledgeDocumentType("document_type"),
    title: varchar("title", { length: 500 }),
    contentChecksum: varchar("content_checksum", { length: 64 }),
    confidence: doublePrecision("confidence"),
    warnings: jsonb("warnings").$type<string[]>().default([]).notNull(),
    errorCode: varchar("error_code", { length: 100 }),
    retryable: boolean("retryable").default(false).notNull(),
    reviewStatus: knowledgeCrawlReviewStatus("review_status").default("pending").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("knowledge_crawl_pages_run_url_uidx").on(table.runId, table.normalizedUrl),
    index("knowledge_crawl_pages_project_run_idx").on(table.projectId, table.runId),
    index("knowledge_crawl_pages_run_review_idx").on(table.runId, table.reviewStatus),
  ],
);

export const widgetGenerationRuns = pgTable(
  "widget_generation_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    widgetSessionId: uuid("widget_session_id")
      .notNull()
      .references(() => widgetSessions.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => widgetConversations.id, { onDelete: "cascade" }),
    userMessageId: uuid("user_message_id").references(() => widgetMessages.id, {
      onDelete: "set null",
    }),
    assistantMessageId: uuid("assistant_message_id").references(() => widgetMessages.id, {
      onDelete: "set null",
    }),
    publicationId: uuid("publication_id")
      .notNull()
      .references(() => assistantPublications.id, { onDelete: "restrict" }),
    idempotencyKeyHash: varchar("idempotency_key_hash", { length: 64 }).notNull(),
    status: widgetGenerationStatus("status").default("running").notNull(),
    modelId: varchar("model_id", { length: 255 }).notNull(),
    resolvedModelId: varchar("resolved_model_id", { length: 255 }),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    firstTokenLatencyMs: integer("first_token_latency_ms"),
    totalLatencyMs: integer("total_latency_ms"),
    finishReason: varchar("finish_reason", { length: 100 }),
    errorCode: varchar("error_code", { length: 100 }),
    requestId: varchar("request_id", { length: 128 }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("widget_generation_runs_session_idempotency_uidx").on(
      table.widgetSessionId,
      table.idempotencyKeyHash,
    ),
    index("widget_generation_runs_project_created_idx").on(table.projectId, table.createdAt),
    index("widget_generation_runs_conversation_created_idx").on(
      table.conversationId,
      table.createdAt,
    ),
  ],
);

export const widgetGenerationSources = pgTable(
  "widget_generation_sources",
  {
    generationRunId: uuid("generation_run_id")
      .notNull()
      .references(() => widgetGenerationRuns.id, { onDelete: "cascade" }),
    knowledgeChunkId: uuid("knowledge_chunk_id")
      .notNull()
      .references(() => knowledgeChunks.id, { onDelete: "restrict" }),
    rank: integer("rank").notNull(),
    score: doublePrecision("score").notNull(),
    cited: boolean("cited").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.generationRunId, table.knowledgeChunkId] }),
    index("widget_generation_sources_chunk_idx").on(table.knowledgeChunkId),
  ],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    action: varchar("action", { length: 160 }).notNull(),
    resourceType: varchar("resource_type", { length: 100 }).notNull(),
    resourceId: varchar("resource_id", { length: 255 }),
    requestId: varchar("request_id", { length: 128 }).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("audit_events_project_created_idx").on(table.projectId, table.createdAt),
    index("audit_events_actor_created_idx").on(table.actorUserId, table.createdAt),
  ],
);

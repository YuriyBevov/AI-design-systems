import { and, asc, desc, eq, inArray, max, ne, sql } from "drizzle-orm";

import {
  assistantConfigRevisions,
  assistantPublications,
  assistants,
  projectModelSettings,
  promptRevisions,
  prompts,
  users,
  widgetGenerationRuns,
  type PromptModelSettingsSnapshot,
} from "@ai-assist/database";
import type {
  AssistantConfigSnapshot,
  CreatePromptRequest,
  PromptStatus,
  PromptType,
  UpdatePromptRequest,
} from "@ai-assist/contracts";

import { getInfrastructure } from "../utils/infrastructure";
import { findAssistantConfigSnapshotRecord } from "./assistant";

export type PromptRecord = {
  id: string;
  projectId: string;
  type: PromptType;
  name: string;
  description: string | null;
  status: PromptStatus;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

export type PromptRevisionRecord = {
  id: string;
  promptId: string;
  revisionNo: number;
  content: string;
  variables: string[];
  contentChecksum: string;
  createdByEmail: string | null;
  createdAt: Date;
};

export type PromptPublicationRecord = {
  id: string;
  assistantId: string;
  promptId: string;
  promptRevisionId: string;
  revisionNo: number;
  supersedesId: string | null;
  configRevisionId: string;
  assistantConfigSnapshot: AssistantConfigSnapshot;
  modelSettingsSnapshot: PromptModelSettingsSnapshot;
  publishedByEmail: string | null;
  publishedAt: Date;
};

const promptSelection = {
  id: prompts.id,
  projectId: prompts.projectId,
  type: prompts.type,
  name: prompts.name,
  description: prompts.description,
  status: prompts.status,
  version: prompts.version,
  createdAt: prompts.createdAt,
  updatedAt: prompts.updatedAt,
};

const revisionSelection = {
  id: promptRevisions.id,
  promptId: promptRevisions.promptId,
  revisionNo: promptRevisions.revisionNo,
  content: promptRevisions.content,
  variables: promptRevisions.variables,
  contentChecksum: promptRevisions.contentChecksum,
  createdByEmail: users.emailNormalized,
  createdAt: promptRevisions.createdAt,
};

const publicationSelection = {
  id: assistantPublications.id,
  assistantId: assistantPublications.assistantId,
  promptId: prompts.id,
  promptRevisionId: assistantPublications.promptRevisionId,
  revisionNo: promptRevisions.revisionNo,
  supersedesId: assistantPublications.supersedesId,
  configRevisionId: assistantPublications.configRevisionId,
  modelSettingsSnapshot: assistantPublications.modelSettingsSnapshot,
  publishedByEmail: users.emailNormalized,
  publishedAt: assistantPublications.publishedAt,
};

export const listPromptRecords = async (projectId: string): Promise<PromptRecord[]> =>
  getInfrastructure()
    .database.db.select(promptSelection)
    .from(prompts)
    .where(eq(prompts.projectId, projectId))
    .orderBy(desc(prompts.updatedAt), asc(prompts.name));

export const findPromptRecord = async (
  projectId: string,
  promptId: string,
): Promise<PromptRecord | null> => {
  const result = await getInfrastructure()
    .database.db.select(promptSelection)
    .from(prompts)
    .where(and(eq(prompts.projectId, projectId), eq(prompts.id, promptId)))
    .limit(1);
  return result[0] ?? null;
};

export const listPromptRevisionRecordsForProject = async (
  projectId: string,
): Promise<PromptRevisionRecord[]> =>
  getInfrastructure()
    .database.db.select(revisionSelection)
    .from(promptRevisions)
    .innerJoin(prompts, eq(prompts.id, promptRevisions.promptId))
    .leftJoin(users, eq(users.id, promptRevisions.createdBy))
    .where(eq(prompts.projectId, projectId))
    .orderBy(asc(promptRevisions.promptId), desc(promptRevisions.revisionNo));

export const listPromptRevisionRecords = async (
  projectId: string,
  promptId: string,
): Promise<PromptRevisionRecord[]> =>
  getInfrastructure()
    .database.db.select(revisionSelection)
    .from(promptRevisions)
    .innerJoin(prompts, eq(prompts.id, promptRevisions.promptId))
    .leftJoin(users, eq(users.id, promptRevisions.createdBy))
    .where(and(eq(prompts.projectId, projectId), eq(prompts.id, promptId)))
    .orderBy(desc(promptRevisions.revisionNo));

export const findPromptRevisionRecord = async (
  projectId: string,
  promptId: string,
  revisionId: string,
): Promise<PromptRevisionRecord | null> => {
  const result = await getInfrastructure()
    .database.db.select(revisionSelection)
    .from(promptRevisions)
    .innerJoin(prompts, eq(prompts.id, promptRevisions.promptId))
    .leftJoin(users, eq(users.id, promptRevisions.createdBy))
    .where(
      and(
        eq(prompts.projectId, projectId),
        eq(prompts.id, promptId),
        eq(promptRevisions.id, revisionId),
      ),
    )
    .limit(1);
  return result[0] ?? null;
};

export const findActivePromptPublication = async (
  projectId: string,
): Promise<PromptPublicationRecord | null> => {
  const result = await getInfrastructure()
    .database.db.select(publicationSelection)
    .from(assistants)
    .innerJoin(assistantPublications, eq(assistantPublications.id, assistants.activePublicationId))
    .innerJoin(promptRevisions, eq(promptRevisions.id, assistantPublications.promptRevisionId))
    .innerJoin(prompts, eq(prompts.id, promptRevisions.promptId))
    .leftJoin(users, eq(users.id, assistantPublications.publishedBy))
    .where(and(eq(assistants.projectId, projectId), eq(prompts.projectId, projectId)))
    .limit(1);
  const publication = result[0];
  if (!publication) return null;
  const config = await findAssistantConfigSnapshotRecord(projectId, publication.configRevisionId);
  if (!config) throw new Error("Published assistant config snapshot not found");
  return { ...publication, assistantConfigSnapshot: config.config };
};

export const findPublishedPromptRecord = async (projectId: string) => {
  const result = await getInfrastructure()
    .database.db.select({
      assistantId: assistants.id,
      assistantPublicId: assistants.publicId,
      publicationId: assistantPublications.id,
      promptId: prompts.id,
      promptRevisionId: promptRevisions.id,
      revisionNo: promptRevisions.revisionNo,
      content: promptRevisions.content,
      variables: promptRevisions.variables,
      configRevisionId: assistantPublications.configRevisionId,
      modelSettingsSnapshot: assistantPublications.modelSettingsSnapshot,
      publishedAt: assistantPublications.publishedAt,
    })
    .from(assistants)
    .innerJoin(assistantPublications, eq(assistantPublications.id, assistants.activePublicationId))
    .innerJoin(promptRevisions, eq(promptRevisions.id, assistantPublications.promptRevisionId))
    .innerJoin(prompts, eq(prompts.id, promptRevisions.promptId))
    .where(
      and(
        eq(assistants.projectId, projectId),
        eq(assistants.status, "active"),
        eq(prompts.projectId, projectId),
        eq(prompts.status, "published"),
      ),
    )
    .limit(1);
  const published = result[0];
  if (!published) return null;
  const config = await findAssistantConfigSnapshotRecord(projectId, published.configRevisionId);
  if (!config) throw new Error("Published assistant config snapshot not found");
  return { ...published, assistantConfigSnapshot: config.config };
};

export const createPromptRecord = async (input: {
  projectId: string;
  createdBy: string;
  prompt: CreatePromptRequest;
  variables: string[];
  contentChecksum: string;
}): Promise<{ prompt: PromptRecord; revision: PromptRevisionRecord }> =>
  getInfrastructure().database.db.transaction(async (transaction) => {
    const [prompt] = await transaction
      .insert(prompts)
      .values({
        projectId: input.projectId,
        type: input.prompt.type,
        name: input.prompt.name,
        description: input.prompt.description,
      })
      .returning(promptSelection);
    if (!prompt) throw new Error("Prompt insert failed");

    const [revision] = await transaction
      .insert(promptRevisions)
      .values({
        promptId: prompt.id,
        revisionNo: 1,
        content: input.prompt.content,
        variables: input.variables,
        contentChecksum: input.contentChecksum,
        createdBy: input.createdBy,
      })
      .returning();
    if (!revision) throw new Error("Prompt revision insert failed");

    return {
      prompt,
      revision: {
        ...revision,
        createdByEmail: null,
      },
    };
  });

export const updatePromptRecord = async (
  projectId: string,
  promptId: string,
  update: UpdatePromptRequest,
): Promise<PromptRecord | null> => {
  const result = await getInfrastructure()
    .database.db.update(prompts)
    .set({
      ...(update.name !== undefined ? { name: update.name } : {}),
      ...(update.description !== undefined ? { description: update.description } : {}),
      version: sql`${prompts.version} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(prompts.projectId, projectId),
        eq(prompts.id, promptId),
        eq(prompts.version, update.expectedVersion),
        ne(prompts.status, "archived"),
      ),
    )
    .returning(promptSelection);
  return result[0] ?? null;
};

export const createPromptRevisionRecord = async (input: {
  projectId: string;
  promptId: string;
  expectedVersion: number;
  content: string;
  variables: string[];
  contentChecksum: string;
  createdBy: string;
}): Promise<{ prompt: PromptRecord; revision: PromptRevisionRecord } | null> =>
  getInfrastructure().database.db.transaction(async (transaction) => {
    const [prompt] = await transaction
      .update(prompts)
      .set({ version: sql`${prompts.version} + 1`, updatedAt: new Date() })
      .where(
        and(
          eq(prompts.projectId, input.projectId),
          eq(prompts.id, input.promptId),
          eq(prompts.version, input.expectedVersion),
          ne(prompts.status, "archived"),
        ),
      )
      .returning(promptSelection);
    if (!prompt) return null;

    const [latestRevision] = await transaction
      .select({ revisionNo: max(promptRevisions.revisionNo) })
      .from(promptRevisions)
      .where(eq(promptRevisions.promptId, input.promptId));
    const revisionNo = Number(latestRevision?.revisionNo ?? 0) + 1;
    const [revision] = await transaction
      .insert(promptRevisions)
      .values({
        promptId: input.promptId,
        revisionNo,
        content: input.content,
        variables: input.variables,
        contentChecksum: input.contentChecksum,
        createdBy: input.createdBy,
      })
      .returning();
    if (!revision) throw new Error("Prompt revision insert failed");

    return { prompt, revision: { ...revision, createdByEmail: null } };
  });

export type PublishPromptRecordResult =
  | {
      outcome: "published";
      prompt: PromptRecord;
      publication: PromptPublicationRecord;
      previousPromptId: string | null;
      previousRevisionNo: number | null;
    }
  | { outcome: "prompt_conflict" }
  | { outcome: "revision_not_found" }
  | { outcome: "assistant_config_missing" };

type PublishPromptTransactionResult =
  | {
      outcome: "published";
      prompt: PromptRecord;
      publication: Omit<PromptPublicationRecord, "assistantConfigSnapshot">;
      previousPromptId: string | null;
      previousRevisionNo: number | null;
    }
  | { outcome: "prompt_conflict" }
  | { outcome: "revision_not_found" }
  | { outcome: "assistant_config_missing" };

export const publishPromptRecord = async (input: {
  projectId: string;
  promptId: string;
  revisionId: string;
  expectedVersion: number;
  assistantPublicId: string;
  publishedBy: string;
  publishedByEmail: string;
  modelSettingsSnapshot: PromptModelSettingsSnapshot;
}): Promise<PublishPromptRecordResult> => {
  const result: PublishPromptTransactionResult = await getInfrastructure().database.db.transaction(
    async (transaction) => {
      const [revision] = await transaction
        .select({ id: promptRevisions.id, revisionNo: promptRevisions.revisionNo })
        .from(promptRevisions)
        .innerJoin(prompts, eq(prompts.id, promptRevisions.promptId))
        .where(
          and(
            eq(prompts.projectId, input.projectId),
            eq(prompts.id, input.promptId),
            eq(promptRevisions.id, input.revisionId),
          ),
        )
        .limit(1);
      if (!revision) return { outcome: "revision_not_found" };

      const [updatedPrompt] = await transaction
        .update(prompts)
        .set({
          status: "published",
          version: sql`${prompts.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(prompts.projectId, input.projectId),
            eq(prompts.id, input.promptId),
            eq(prompts.version, input.expectedVersion),
            ne(prompts.status, "archived"),
          ),
        )
        .returning(promptSelection);
      if (!updatedPrompt) return { outcome: "prompt_conflict" };

      await transaction
        .insert(assistants)
        .values({
          projectId: input.projectId,
          publicId: input.assistantPublicId,
        })
        .onConflictDoNothing({ target: assistants.projectId });

      const [assistant] = await transaction
        .select({ id: assistants.id })
        .from(assistants)
        .where(eq(assistants.projectId, input.projectId))
        .limit(1);
      if (!assistant) throw new Error("Assistant creation failed");

      await transaction.execute(
        sql`select ${assistants.id} from ${assistants} where ${assistants.id} = ${assistant.id} for update`,
      );

      const [lockedAssistant] = await transaction
        .select({
          activePublicationId: assistants.activePublicationId,
          configVersion: assistants.configVersion,
        })
        .from(assistants)
        .where(eq(assistants.id, assistant.id))
        .limit(1);
      if (!lockedAssistant) throw new Error("Assistant lock failed");

      const [configRevision] = await transaction
        .select({ id: assistantConfigRevisions.id })
        .from(assistantConfigRevisions)
        .where(
          and(
            eq(assistantConfigRevisions.assistantId, assistant.id),
            eq(assistantConfigRevisions.revisionNo, lockedAssistant.configVersion),
          ),
        )
        .limit(1);
      if (!configRevision) return { outcome: "assistant_config_missing" };

      const [previousPublication] = lockedAssistant.activePublicationId
        ? await transaction
            .select({
              promptId: promptRevisions.promptId,
              revisionNo: promptRevisions.revisionNo,
            })
            .from(assistantPublications)
            .innerJoin(
              promptRevisions,
              eq(promptRevisions.id, assistantPublications.promptRevisionId),
            )
            .where(eq(assistantPublications.id, lockedAssistant.activePublicationId))
            .limit(1)
        : [];

      await transaction
        .update(prompts)
        .set({
          status: "draft",
          version: sql`${prompts.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(prompts.projectId, input.projectId),
            eq(prompts.type, "system"),
            eq(prompts.status, "published"),
            ne(prompts.id, input.promptId),
          ),
        );

      const [publication] = await transaction
        .insert(assistantPublications)
        .values({
          assistantId: assistant.id,
          promptRevisionId: revision.id,
          configRevisionId: configRevision.id,
          supersedesId: lockedAssistant.activePublicationId,
          modelSettingsSnapshot: input.modelSettingsSnapshot,
          publishedBy: input.publishedBy,
        })
        .returning();
      if (!publication) throw new Error("Prompt publication insert failed");

      await transaction
        .update(assistants)
        .set({
          activePublicationId: publication.id,
          status: "active",
          updatedAt: publication.publishedAt,
        })
        .where(eq(assistants.id, assistant.id));

      return {
        outcome: "published",
        prompt: updatedPrompt,
        publication: {
          ...publication,
          promptId: updatedPrompt.id,
          revisionNo: revision.revisionNo,
          publishedByEmail: input.publishedByEmail,
        },
        previousPromptId: previousPublication?.promptId ?? null,
        previousRevisionNo: previousPublication?.revisionNo ?? null,
      };
    },
  );
  if (result.outcome !== "published") return result;
  const config = await findAssistantConfigSnapshotRecord(
    input.projectId,
    result.publication.configRevisionId,
  );
  if (!config) throw new Error("Published assistant config snapshot not found");
  return {
    ...result,
    publication: { ...result.publication, assistantConfigSnapshot: config.config },
  };
};

export const archivePromptRecord = async (input: {
  projectId: string;
  promptId: string;
  expectedVersion: number;
}): Promise<PromptRecord | null> => {
  const result = await getInfrastructure()
    .database.db.update(prompts)
    .set({ status: "archived", version: sql`${prompts.version} + 1`, updatedAt: new Date() })
    .where(
      and(
        eq(prompts.projectId, input.projectId),
        eq(prompts.id, input.promptId),
        eq(prompts.version, input.expectedVersion),
        eq(prompts.status, "draft"),
      ),
    )
    .returning(promptSelection);
  return result[0] ?? null;
};

export type DeletePromptRecordResult = "deleted" | "not_found" | "version_conflict";

const deletePublicationHistory = async (
  transaction: Parameters<
    Parameters<ReturnType<typeof getInfrastructure>["database"]["db"]["transaction"]>[0]
  >[0],
  publicationIds: string[],
): Promise<void> => {
  if (!publicationIds.length) return;

  await transaction
    .update(assistants)
    .set({ activePublicationId: null, status: "draft", updatedAt: new Date() })
    .where(inArray(assistants.activePublicationId, publicationIds));
  await transaction
    .delete(widgetGenerationRuns)
    .where(inArray(widgetGenerationRuns.publicationId, publicationIds));
  await transaction
    .delete(assistantPublications)
    .where(inArray(assistantPublications.id, publicationIds));
};

export const deletePromptRecord = async (input: {
  projectId: string;
  promptId: string;
  expectedVersion: number;
}): Promise<DeletePromptRecordResult> =>
  getInfrastructure().database.db.transaction(async (transaction) => {
    const [prompt] = await transaction
      .select({ id: prompts.id, version: prompts.version })
      .from(prompts)
      .where(and(eq(prompts.projectId, input.projectId), eq(prompts.id, input.promptId)))
      .limit(1);
    if (!prompt) return "not_found";
    if (prompt.version !== input.expectedVersion) return "version_conflict";

    const [lockedPrompt] = await transaction
      .update(prompts)
      .set({ version: sql`${prompts.version} + 1`, updatedAt: new Date() })
      .where(
        and(
          eq(prompts.id, input.promptId),
          eq(prompts.projectId, input.projectId),
          eq(prompts.version, input.expectedVersion),
        ),
      )
      .returning({ id: prompts.id });
    if (!lockedPrompt) return "version_conflict";

    const publicationUsage = await transaction
      .select({ id: assistantPublications.id })
      .from(assistantPublications)
      .innerJoin(promptRevisions, eq(promptRevisions.id, assistantPublications.promptRevisionId))
      .where(eq(promptRevisions.promptId, input.promptId));
    await deletePublicationHistory(
      transaction,
      publicationUsage.map((publication) => publication.id),
    );

    const deleted = await transaction
      .delete(prompts)
      .where(
        and(
          eq(prompts.id, input.promptId),
          eq(prompts.projectId, input.projectId),
          eq(prompts.version, input.expectedVersion + 1),
        ),
      )
      .returning({ id: prompts.id });
    if (deleted.length !== 1) throw new Error("Prompt delete failed after acquiring version lock");
    return "deleted";
  });

export type DeletePromptRevisionRecordResult =
  | { outcome: "deleted"; revisionNo: number }
  | { outcome: "not_found" }
  | { outcome: "version_conflict" }
  | { outcome: "current" }
  | { outcome: "last_revision" };

export const deletePromptRevisionRecord = async (input: {
  projectId: string;
  promptId: string;
  revisionId: string;
  expectedVersion: number;
}): Promise<DeletePromptRevisionRecordResult> =>
  getInfrastructure().database.db.transaction(async (transaction) => {
    const [revision] = await transaction
      .select({ id: promptRevisions.id, revisionNo: promptRevisions.revisionNo })
      .from(promptRevisions)
      .innerJoin(prompts, eq(prompts.id, promptRevisions.promptId))
      .where(
        and(
          eq(prompts.projectId, input.projectId),
          eq(prompts.id, input.promptId),
          eq(promptRevisions.id, input.revisionId),
        ),
      )
      .limit(1);
    if (!revision) return { outcome: "not_found" };

    const [revisionCount] = await transaction
      .select({ count: sql<number>`count(*)::int` })
      .from(promptRevisions)
      .where(eq(promptRevisions.promptId, input.promptId));
    if ((revisionCount?.count ?? 0) <= 1) return { outcome: "last_revision" };

    const [activeUsage] = await transaction
      .select({ id: assistantPublications.id })
      .from(assistants)
      .innerJoin(
        assistantPublications,
        eq(assistantPublications.id, assistants.activePublicationId),
      )
      .where(eq(assistantPublications.promptRevisionId, input.revisionId))
      .limit(1);
    if (activeUsage) return { outcome: "current" };

    const [updatedPrompt] = await transaction
      .update(prompts)
      .set({ version: sql`${prompts.version} + 1`, updatedAt: new Date() })
      .where(
        and(
          eq(prompts.projectId, input.projectId),
          eq(prompts.id, input.promptId),
          eq(prompts.version, input.expectedVersion),
        ),
      )
      .returning({ id: prompts.id });
    if (!updatedPrompt) return { outcome: "version_conflict" };

    const publicationUsage = await transaction
      .select({ id: assistantPublications.id })
      .from(assistantPublications)
      .where(eq(assistantPublications.promptRevisionId, input.revisionId));
    await deletePublicationHistory(
      transaction,
      publicationUsage.map((publication) => publication.id),
    );

    await transaction.delete(promptRevisions).where(eq(promptRevisions.id, input.revisionId));
    return { outcome: "deleted", revisionNo: revision.revisionNo };
  });

export const getPromptModelSettingsSnapshot = async (
  projectId: string,
): Promise<PromptModelSettingsSnapshot | null> => {
  const result = await getInfrastructure()
    .database.db.select({
      chatModelId: projectModelSettings.chatModelId,
      embeddingModelId: projectModelSettings.embeddingModelId,
      rerankModelId: projectModelSettings.rerankModelId,
      maxOutputTokens: projectModelSettings.maxOutputTokens,
      temperature: projectModelSettings.temperature,
    })
    .from(projectModelSettings)
    .where(eq(projectModelSettings.projectId, projectId))
    .limit(1);
  return result[0] ?? null;
};

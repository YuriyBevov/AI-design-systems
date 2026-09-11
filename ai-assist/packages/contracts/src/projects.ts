import { z } from "zod";

import { projectRoleSchema } from "./auth.js";

export const projectStatusSchema = z.enum(["active", "suspended", "archived"]);

export const projectResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(160),
  slug: z.string().min(1).max(80),
  status: projectStatusSchema,
  timezone: z.string().min(1).max(80),
  defaultLocale: z.string().min(2).max(16),
  primaryOrigin: z.string().url().nullable(),
  conversationRetentionDays: z.number().int().min(0).max(3650),
  role: projectRoleSchema,
  updatedAt: z.string().datetime(),
});

export const updateProjectRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    timezone: z.string().trim().min(1).max(80).optional(),
    conversationRetentionDays: z.number().int().min(0).max(3650).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: "Укажите хотя бы одно поле" });

export const createProjectRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    timezone: z.string().trim().min(1).max(80).default("Europe/Moscow"),
    templateProjectId: z.string().uuid().nullable().default(null),
    userIds: z
      .array(z.string().uuid())
      .max(500)
      .default([])
      .transform((userIds) => [...new Set(userIds)]),
  })
  .strict();

export const updateProjectStatusRequestSchema = z
  .object({ status: z.enum(["active", "suspended"]) })
  .strict();

export const projectListResponseSchema = z.array(projectResponseSchema);

export const auditEventResponseSchema = z.object({
  id: z.string().uuid(),
  action: z.string(),
  resourceType: z.string(),
  resourceId: z.string().nullable(),
  requestId: z.string(),
  actorEmail: z.string().email().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.string().datetime(),
});

export type ProjectResponse = z.infer<typeof projectResponseSchema>;
export type ProjectStatus = z.infer<typeof projectStatusSchema>;
export type UpdateProjectRequest = z.infer<typeof updateProjectRequestSchema>;
export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>;
export type UpdateProjectStatusRequest = z.infer<typeof updateProjectStatusRequestSchema>;
export type AuditEventResponse = z.infer<typeof auditEventResponseSchema>;

import { z } from "zod";

import { projectRoleSchema } from "./auth.js";

export const projectResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(160),
  slug: z.string().min(1).max(80),
  status: z.enum(["active", "archived"]),
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
    defaultLocale: z.string().trim().min(2).max(16).optional(),
    conversationRetentionDays: z.number().int().min(0).max(3650).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: "At least one field is required" });

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
export type UpdateProjectRequest = z.infer<typeof updateProjectRequestSchema>;
export type AuditEventResponse = z.infer<typeof auditEventResponseSchema>;

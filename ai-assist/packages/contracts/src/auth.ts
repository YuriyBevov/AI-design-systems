import { z } from "zod";

import { accountRoleSchema } from "./users.js";

export const loginRequestSchema = z
  .object({
    email: z
      .string()
      .trim()
      .email()
      .max(320)
      .transform((value) => value.toLowerCase()),
    password: z.string().min(1).max(128),
  })
  .strict();

export const reauthenticateRequestSchema = z
  .object({
    password: z.string().min(1).max(128),
  })
  .strict();

export const reauthenticateResponseSchema = z.object({
  status: z.literal("ok"),
  validForMinutes: z.number().int().positive(),
});

export const projectRoleSchema = z.enum(["owner", "editor", "viewer"]);

export const sessionProjectSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  slug: z.string().min(1),
  role: projectRoleSchema,
});

export const adminSessionResponseSchema = z.object({
  user: z.object({
    id: z.string().uuid(),
    name: z.string().min(1).max(160),
    email: z.string().email(),
    role: accountRoleSchema,
  }),
  projects: z.array(sessionProjectSchema),
  expiresAt: z.string().datetime(),
  csrfToken: z.string().min(32).optional(),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type ReauthenticateRequest = z.infer<typeof reauthenticateRequestSchema>;
export type ReauthenticateResponse = z.infer<typeof reauthenticateResponseSchema>;
export type ProjectRole = z.infer<typeof projectRoleSchema>;
export type SessionProject = z.infer<typeof sessionProjectSchema>;
export type AdminSessionResponse = z.infer<typeof adminSessionResponseSchema>;

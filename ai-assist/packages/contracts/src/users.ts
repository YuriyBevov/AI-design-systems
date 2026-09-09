import { z } from "zod";

export const accountRoleSchema = z.enum(["admin", "user"]);
export const userStatusSchema = z.enum(["invited", "active", "disabled"]);
export const mutableUserStatusSchema = z.enum(["active", "disabled"]);

const userNameSchema = z.string().trim().min(1).max(160);
const userEmailSchema = z
  .string()
  .trim()
  .email()
  .max(320)
  .transform((value) => value.toLowerCase());
const projectIdListSchema = z
  .array(z.string().uuid())
  .max(500)
  .transform((projectIds) => [...new Set(projectIds)]);
const projectIdsSchema = projectIdListSchema.default([]);

export const userResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(160),
  email: z.string().email(),
  role: accountRoleSchema,
  status: userStatusSchema,
  projectIds: z.array(z.string().uuid()),
  lastLoginAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const userListResponseSchema = z.array(userResponseSchema);

export const createUserRequestSchema = z
  .object({
    name: userNameSchema,
    email: userEmailSchema,
    password: z.string().min(12).max(128),
    role: accountRoleSchema,
    projectIds: projectIdsSchema,
  })
  .strict();

export const updateUserRequestSchema = z
  .object({
    name: userNameSchema.optional(),
    email: userEmailSchema.optional(),
    password: z.string().min(12).max(128).optional(),
    role: accountRoleSchema.optional(),
    status: mutableUserStatusSchema.optional(),
    projectIds: projectIdListSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: "At least one field is required" });

export type AccountRole = z.infer<typeof accountRoleSchema>;
export type UserStatus = z.infer<typeof userStatusSchema>;
export type UserResponse = z.infer<typeof userResponseSchema>;
export type CreateUserRequest = z.infer<typeof createUserRequestSchema>;
export type UpdateUserRequest = z.infer<typeof updateUserRequestSchema>;

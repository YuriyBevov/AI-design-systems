import type { CreateUserRequest, UpdateUserRequest, UserResponse } from "@ai-assist/contracts";
import { hashPassword } from "@ai-assist/domain";
import type { H3Event } from "h3";

import { writeAuditEvent } from "../repositories/audit";
import {
  createUserRecord,
  findUserRecord,
  listUserRecords,
  updateUserRecord,
  type UserRecord,
} from "../repositories/users";
import { getRequestId } from "../utils/request";
import { assertCsrf, requireAccountAdmin } from "./auth";

const toUserResponse = (user: UserRecord): UserResponse => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  status: user.status,
  projectIds: user.projectIds,
  lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
  createdAt: user.createdAt.toISOString(),
  updatedAt: user.updatedAt.toISOString(),
});

const hasDatabaseErrorCode = (error: unknown, code: string): boolean => {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth += 1) {
    if ((current as { code?: unknown }).code === code) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
};

const translateUserWriteError = (error: unknown): never => {
  if (hasDatabaseErrorCode(error, "23505")) {
    throw createError({
      statusCode: 409,
      statusMessage: "Пользователь с таким email уже существует",
      data: { code: "USER_EMAIL_CONFLICT" },
    });
  }
  if (error instanceof Error && error.message === "USER_PROJECTS_NOT_FOUND") {
    throw createError({
      statusCode: 400,
      statusMessage: "Один или несколько проектов недоступны",
      data: { code: "USER_PROJECTS_NOT_FOUND" },
    });
  }
  if (error instanceof Error && error.message === "LAST_ACTIVE_ADMIN") {
    throw createError({
      statusCode: 409,
      statusMessage: "Нельзя отключить или изменить роль последнего администратора",
      data: { code: "LAST_ACTIVE_ADMIN" },
    });
  }
  throw error;
};

export const listUsers = async (event: H3Event): Promise<UserResponse[]> => {
  await requireAccountAdmin(event);
  return (await listUserRecords()).map(toUserResponse);
};

export const createUser = async (
  event: H3Event,
  input: CreateUserRequest,
): Promise<UserResponse> => {
  const session = await requireAccountAdmin(event);
  assertCsrf(event, session);

  try {
    const user = await createUserRecord({
      ...input,
      passwordHash: await hashPassword(input.password),
    });
    await writeAuditEvent({
      actorUserId: session.userId,
      action: "user.created",
      resourceType: "user",
      resourceId: user.id,
      requestId: getRequestId(event),
      metadata: { role: user.role, projectIds: user.projectIds },
    });
    return toUserResponse(user);
  } catch (error) {
    return translateUserWriteError(error);
  }
};

export const patchUser = async (
  event: H3Event,
  userId: string,
  input: UpdateUserRequest,
): Promise<UserResponse> => {
  const session = await requireAccountAdmin(event);
  assertCsrf(event, session);
  const current = await findUserRecord(userId);
  if (!current) throw createError({ statusCode: 404, statusMessage: "Пользователь не найден" });

  const nextRole = input.role ?? current.role;
  const nextStatus = input.status ?? current.status;
  const protectLastAdministrator =
    current.role === "admin" &&
    current.status === "active" &&
    (nextRole !== "admin" || nextStatus !== "active");

  try {
    const updated = await updateUserRecord({
      userId,
      name: input.name ?? current.name,
      email: input.email ?? current.email,
      passwordHash: input.password ? await hashPassword(input.password) : null,
      role: nextRole,
      status: nextStatus,
      projectIds: input.projectIds ?? current.projectIds,
      protectLastAdministrator,
    });
    if (!updated) throw createError({ statusCode: 404, statusMessage: "Пользователь не найден" });

    await writeAuditEvent({
      actorUserId: session.userId,
      action: "user.updated",
      resourceType: "user",
      resourceId: updated.id,
      requestId: getRequestId(event),
      metadata: { changedFields: Object.keys(input), role: updated.role, status: updated.status },
    });
    return toUserResponse(updated);
  } catch (error) {
    return translateUserWriteError(error);
  }
};

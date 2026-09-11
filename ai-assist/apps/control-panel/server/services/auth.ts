import { createHmac } from "node:crypto";

import type {
  AdminSessionResponse,
  LoginRequest,
  ProjectRole,
  ReauthenticateResponse,
} from "@ai-assist/contracts";
import {
  canProjectRole,
  createOpaqueToken,
  createProjectScope,
  hashPassword,
  hashOpaqueToken,
  opaqueTokenMatches,
  verifyPassword,
  type ProjectScope,
} from "@ai-assist/domain";
import { createError, type H3Event } from "h3";

import {
  createAdminSession,
  findActiveSession,
  findUserByEmail,
  listSessionProjects,
  markLoginSuccessful,
  markSessionReauthenticated,
  revokeSession,
  touchSession,
  type AuthSessionRecord,
} from "../repositories/auth";
import { writeAuditEvent } from "../repositories/audit";
import { findProjectForUser } from "../repositories/projects";
import { getInfrastructure, getServiceEnvironment } from "../utils/infrastructure";
import { assertSameOrigin, getRequestId, getRequestSubject } from "../utils/request";

const sessionCookieName = "ai_assist_session";
const csrfCookieName = "ai_assist_csrf";
const invalidLoginMessage = "Неверный email или пароль";
const invalidReauthenticationMessage = "Неверный пароль";
const recentAuthenticationMaxAgeMinutes = 30;
const dummyPasswordHash = hashPassword("dummy-password-used-only-for-equalized-login-checks");

const hashRateSubject = (value: string): string =>
  createHmac("sha256", getServiceEnvironment().SESSION_SECRET).update(value).digest("hex");

const consumeAuthenticationRateLimit = async (
  event: H3Event,
  email: string,
  operation: "login" | "reauthenticate",
): Promise<string> => {
  const environment = getServiceEnvironment();
  const subjectHash = hashRateSubject(`${getRequestSubject(event)}|${email}`);
  const key = `admin-${operation}:${subjectHash}`;
  const count = await getInfrastructure().redis.incr(key);

  if (count === 1) {
    await getInfrastructure().redis.expire(key, environment.LOGIN_RATE_LIMIT_WINDOW_SECONDS);
  }

  if (count > environment.LOGIN_RATE_LIMIT_MAX) {
    throw createError({
      statusCode: 429,
      statusMessage: "Слишком много попыток. Повторите позже",
      data: { retryAfter: await getInfrastructure().redis.ttl(key) },
    });
  }

  return key;
};

const setSessionCookies = (
  event: H3Event,
  sessionToken: string,
  csrfToken: string,
  maxAge: number,
): void => {
  const secure = getServiceEnvironment().NODE_ENV === "production";
  setCookie(event, sessionCookieName, sessionToken, {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: "/",
    maxAge,
  });
  setCookie(event, csrfCookieName, csrfToken, {
    httpOnly: false,
    secure,
    sameSite: "strict",
    path: "/",
    maxAge,
  });
};

const clearSessionCookies = (event: H3Event): void => {
  deleteCookie(event, sessionCookieName, { path: "/" });
  deleteCookie(event, csrfCookieName, { path: "/" });
};

const toSessionResponse = async (
  session: AuthSessionRecord,
  csrfToken?: string,
): Promise<AdminSessionResponse> => ({
  user: { id: session.userId, name: session.name, email: session.email, role: session.role },
  projects: await listSessionProjects(session.userId),
  expiresAt: session.expiresAt.toISOString(),
  ...(csrfToken ? { csrfToken } : {}),
});

export const loginAdmin = async (
  event: H3Event,
  credentials: LoginRequest,
): Promise<AdminSessionResponse> => {
  assertSameOrigin(event);
  const requestId = getRequestId(event);
  const rateLimitKey = await consumeAuthenticationRateLimit(event, credentials.email, "login");
  const user = await findUserByEmail(credentials.email);
  const passwordMatches = await verifyPassword(
    user?.passwordHash ?? (await dummyPasswordHash),
    credentials.password,
  );

  if (!user || user.status !== "active" || !user.passwordHash || !passwordMatches) {
    await writeAuditEvent({
      action: "auth.login_failed",
      resourceType: "session",
      requestId,
      metadata: { subjectHash: hashRateSubject(credentials.email) },
    }).catch(() => undefined);
    throw createError({ statusCode: 401, statusMessage: invalidLoginMessage });
  }

  const environment = getServiceEnvironment();
  const ttlSeconds = environment.ADMIN_SESSION_TTL_HOURS * 60 * 60;
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  const sessionToken = createOpaqueToken();
  const csrfToken = createOpaqueToken();

  await createAdminSession({
    userId: user.id,
    tokenHash: hashOpaqueToken(sessionToken),
    csrfTokenHash: hashOpaqueToken(csrfToken),
    expiresAt,
  });
  await markLoginSuccessful(user.id);
  await getInfrastructure().redis.del(rateLimitKey);
  setSessionCookies(event, sessionToken, csrfToken, ttlSeconds);

  const session = await findActiveSession(hashOpaqueToken(sessionToken));
  if (!session) {
    clearSessionCookies(event);
    throw createError({ statusCode: 500, statusMessage: "Не удалось создать сессию" });
  }

  const response = await toSessionResponse(session, csrfToken);
  await writeAuditEvent({
    projectId: response.projects[0]?.id,
    actorUserId: user.id,
    action: "auth.login",
    resourceType: "session",
    resourceId: session.id,
    requestId,
  });

  return response;
};

export const requireAdminSession = async (event: H3Event): Promise<AuthSessionRecord> => {
  const token = getCookie(event, sessionCookieName);
  if (!token) {
    throw createError({ statusCode: 401, statusMessage: "Требуется авторизация" });
  }

  const session = await findActiveSession(hashOpaqueToken(token));
  if (!session) {
    clearSessionCookies(event);
    throw createError({ statusCode: 401, statusMessage: "Срок действия сессии истёк" });
  }

  await touchSession(session.id);
  return session;
};

export const requireAccountAdmin = async (event: H3Event): Promise<AuthSessionRecord> => {
  const session = await requireAdminSession(event);
  if (session.role !== "admin") {
    throw createError({ statusCode: 403, statusMessage: "Требуются права администратора" });
  }
  return session;
};

export const assertRecentAdminAuthentication = (
  session: AuthSessionRecord,
  maxAgeMinutes = recentAuthenticationMaxAgeMinutes,
): void => {
  const oldestAccepted = Date.now() - maxAgeMinutes * 60 * 1000;
  if (session.reauthenticatedAt.getTime() < oldestAccepted) {
    throw createError({
      statusCode: 403,
      statusMessage: "Требуется повторное подтверждение пароля",
      data: { code: "RECENT_AUTHENTICATION_REQUIRED" },
    });
  }
};

export const reauthenticateAdmin = async (
  event: H3Event,
  password: string,
): Promise<ReauthenticateResponse> => {
  const session = await requireAdminSession(event);
  assertCsrf(event, session);
  const rateLimitKey = await consumeAuthenticationRateLimit(event, session.email, "reauthenticate");
  const user = await findUserByEmail(session.email);
  const passwordMatches = await verifyPassword(
    user?.passwordHash ?? (await dummyPasswordHash),
    password,
  );

  if (!user || user.id !== session.userId || !user.passwordHash || !passwordMatches) {
    await writeAuditEvent({
      projectId: (await listSessionProjects(session.userId))[0]?.id,
      actorUserId: session.userId,
      action: "auth.reauthentication_failed",
      resourceType: "session",
      resourceId: session.id,
      requestId: getRequestId(event),
    }).catch(() => undefined);
    throw createError({
      statusCode: 401,
      statusMessage: invalidReauthenticationMessage,
      data: { code: "REAUTHENTICATION_FAILED" },
    });
  }

  await markSessionReauthenticated(session.id);
  await getInfrastructure().redis.del(rateLimitKey);
  await writeAuditEvent({
    projectId: (await listSessionProjects(session.userId))[0]?.id,
    actorUserId: session.userId,
    action: "auth.reauthenticated",
    resourceType: "session",
    resourceId: session.id,
    requestId: getRequestId(event),
  });
  return { status: "ok", validForMinutes: recentAuthenticationMaxAgeMinutes };
};

export const getAdminSessionResponse = async (event: H3Event): Promise<AdminSessionResponse> =>
  toSessionResponse(await requireAdminSession(event));

export const assertCsrf = (event: H3Event, session: AuthSessionRecord): void => {
  assertSameOrigin(event);
  const cookieToken = getCookie(event, csrfCookieName);
  const headerToken = getRequestHeader(event, "x-csrf-token");

  if (
    !cookieToken ||
    !headerToken ||
    cookieToken !== headerToken ||
    !opaqueTokenMatches(headerToken, session.csrfTokenHash)
  ) {
    throw createError({
      statusCode: 403,
      statusMessage: "Не удалось проверить безопасность запроса",
    });
  }
};

export const logoutAdmin = async (event: H3Event): Promise<void> => {
  const session = await requireAdminSession(event);
  assertCsrf(event, session);
  const projects = await listSessionProjects(session.userId);

  await revokeSession(session.id);
  clearSessionCookies(event);
  await writeAuditEvent({
    projectId: projects[0]?.id,
    actorUserId: session.userId,
    action: "auth.logout",
    resourceType: "session",
    resourceId: session.id,
    requestId: getRequestId(event),
  });
};

export const requireProjectScope = async (
  event: H3Event,
  projectId: string,
  requiredRole: ProjectRole = "viewer",
): Promise<{
  session: AuthSessionRecord;
  scope: ProjectScope;
  project: NonNullable<Awaited<ReturnType<typeof findProjectForUser>>>;
}> => {
  const session = await requireAdminSession(event);
  const project = await findProjectForUser(session.userId, projectId);

  if (!project) {
    throw createError({ statusCode: 404, statusMessage: "Проект не найден" });
  }

  if (!canProjectRole(project.role, requiredRole)) {
    throw createError({ statusCode: 403, statusMessage: "Недостаточно прав в проекте" });
  }

  return {
    session,
    scope: createProjectScope({
      projectId: project.id,
      userId: session.userId,
      role: project.role,
    }),
    project,
  };
};

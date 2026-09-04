import { healthResponseSchema } from "@ai-assist/contracts";
import { pingDatabase } from "@ai-assist/database";

import { getInfrastructure } from "../../utils/infrastructure";

export default defineEventHandler(async (event) => {
  const { database, redis } = getInfrastructure();
  const [databaseResult, redisResult] = await Promise.allSettled([
    pingDatabase(database),
    redis.ping(),
  ]);
  const checks = {
    database: databaseResult.status === "fulfilled" ? ("ok" as const) : ("error" as const),
    redis: redisResult.status === "fulfilled" ? ("ok" as const) : ("error" as const),
  };
  const status = Object.values(checks).every((check) => check === "ok") ? "ok" : "degraded";
  const body = healthResponseSchema.parse({
    status,
    service: "control-panel",
    timestamp: new Date().toISOString(),
    checks,
  });

  if (status === "degraded") {
    setResponseStatus(event, 503);
  }

  return body;
});

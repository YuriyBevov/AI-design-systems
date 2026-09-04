import { randomUUID } from "node:crypto";

import { systemPingJobDataSchema, systemPingJobName } from "@ai-assist/contracts";

import { getInfrastructure } from "../../../utils/infrastructure";

export default defineEventHandler(async (event) => {
  if (process.env.NODE_ENV === "production") {
    throw createError({ statusCode: 404, statusMessage: "Not found" });
  }

  const requestId = getRequestHeader(event, "x-request-id") ?? randomUUID();
  const data = systemPingJobDataSchema.parse({
    requestedAt: new Date().toISOString(),
    requestId,
  });
  const job = await getInfrastructure().systemQueue.add(systemPingJobName, data, {
    removeOnComplete: { age: 3600, count: 100 },
    removeOnFail: { age: 86_400, count: 500 },
  });

  setResponseStatus(event, 202);
  return { id: job.id, status: "queued" as const };
});

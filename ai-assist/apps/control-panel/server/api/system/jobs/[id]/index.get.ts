import { getInfrastructure } from "../../../../utils/infrastructure";

export default defineEventHandler(async (event) => {
  if (process.env.NODE_ENV === "production") {
    throw createError({ statusCode: 404, statusMessage: "Not found" });
  }

  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Job id is required" });
  }

  const job = await getInfrastructure().systemQueue.getJob(id);
  if (!job) {
    throw createError({ statusCode: 404, statusMessage: "Job not found" });
  }

  return {
    id: job.id,
    name: job.name,
    status: await job.getState(),
    result: job.returnvalue ?? null,
    failedReason: job.failedReason || null,
  };
});

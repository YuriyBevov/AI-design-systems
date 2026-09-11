import { getInfrastructure } from "../../../../utils/infrastructure";

export default defineEventHandler(async (event) => {
  if (process.env.NODE_ENV === "production") {
    throw createError({ statusCode: 404, statusMessage: "Не найдено" });
  }

  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Не указан идентификатор задания" });
  }

  const job = await getInfrastructure().systemQueue.getJob(id);
  if (!job) {
    throw createError({ statusCode: 404, statusMessage: "Задание не найдено" });
  }

  return {
    id: job.id,
    name: job.name,
    status: await job.getState(),
    result: job.returnvalue ?? null,
    failedReason: job.failedReason || null,
  };
});

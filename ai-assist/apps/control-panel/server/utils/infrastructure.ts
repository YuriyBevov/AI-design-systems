import { parseServiceEnvironment } from "@ai-assist/config";
import { systemQueueName } from "@ai-assist/contracts";
import { createDatabase } from "@ai-assist/database";
import { Queue } from "bullmq";
import IORedis from "ioredis";

const environment = parseServiceEnvironment(process.env);
const database = createDatabase(environment.DATABASE_URL);
const redis = new IORedis(environment.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  retryStrategy: () => null,
});
const systemQueue = new Queue(systemQueueName, { connection: redis });

export const getInfrastructure = () => ({ database, redis, systemQueue });
export const getServiceEnvironment = () => environment;

export const closeInfrastructure = async (): Promise<void> => {
  await systemQueue.close();
  await redis.quit().catch(() => undefined);
  await database.client.end({ timeout: 5 });
};

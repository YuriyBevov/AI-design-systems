import { hostname } from "node:os";

import { parseServiceEnvironment } from "@ai-assist/config";
import { systemQueueName } from "@ai-assist/contracts";
import { createDatabase } from "@ai-assist/database";
import { Worker } from "bullmq";
import IORedis from "ioredis";
import pino from "pino";

import { processSystemJob } from "./processor.js";
import { createKnowledgeIndexProcessor } from "./knowledge-indexer.js";
import { createConcurrencyLimiter, createKnowledgeCrawlProcessor } from "./knowledge-crawler.js";
import { createKnowledgeProcessingProcessor } from "./knowledge-processing.js";
import { systemWorkerOptions } from "./worker-options.js";

const environment = parseServiceEnvironment(process.env);
const logger = pino({
  level: environment.LOG_LEVEL,
  base: {
    service: "worker",
    environment: environment.NODE_ENV,
  },
});
const workerId = `${hostname()}:${process.pid}`;
const connection = new IORedis(environment.REDIS_URL, {
  maxRetriesPerRequest: null,
});
const database = createDatabase(environment.DATABASE_URL);
const processKnowledgeIndex = createKnowledgeIndexProcessor({ database, environment });
const runWithAiLimit = createConcurrencyLimiter(environment.KNOWLEDGE_CRAWL_AI_CONCURRENCY);
const processKnowledgeCrawl = createKnowledgeCrawlProcessor({
  database,
  environment,
  runWithAiLimit,
});
const processKnowledgeProcessing = createKnowledgeProcessingProcessor({
  database,
  environment,
  runWithAiLimit,
});

const worker = new Worker(
  systemQueueName,
  async (job) =>
    processSystemJob(job.name, job.data, workerId, {
      processKnowledgeCrawl,
      processKnowledgeIndex,
      processKnowledgeProcessing,
    }),
  {
    connection,
    ...systemWorkerOptions,
  },
);

worker.on("ready", () => {
  logger.info({ queue: systemQueueName, workerId }, "worker ready");
});

worker.on("completed", (job) => {
  logger.info({ jobId: job.id, jobName: job.name }, "job completed");
});

worker.on("failed", (job, error) => {
  logger.error(
    {
      jobId: job?.id,
      jobName: job?.name,
      errorName: error.name,
      errorCode: "code" in error ? error.code : "WORKER_JOB_FAILED",
    },
    "job failed",
  );
});

worker.on("lockRenewalFailed", (jobIds) => {
  logger.error({ jobIds }, "worker job lock renewal failed");
});

worker.on("stalled", (jobId) => {
  logger.warn({ jobId }, "worker job recovered from a stalled state");
});

const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
  logger.info({ signal }, "worker shutting down");
  await worker.close();
  await connection.quit();
  await database.client.end({ timeout: 5 });
};

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void shutdown(signal).finally(() => process.exit(0));
  });
}

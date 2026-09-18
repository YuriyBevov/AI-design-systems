import type { WorkerOptions } from "bullmq";

// A crawl job can live for hours and individual provider calls may take up to five minutes.
// Keep renewing often, but leave enough lease headroom for a temporarily busy event loop or Redis.
export const systemWorkerOptions = {
  concurrency: 2,
  lockDuration: 10 * 60_000,
  lockRenewTime: 60_000,
  stalledInterval: 60_000,
  maxStalledCount: 3,
} satisfies Pick<
  WorkerOptions,
  "concurrency" | "lockDuration" | "lockRenewTime" | "stalledInterval" | "maxStalledCount"
>;

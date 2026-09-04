import {
  knowledgeCrawlJobDataSchema,
  knowledgeCrawlJobName,
  type KnowledgeCrawlJobData,
  type KnowledgeCrawlJobResult,
  knowledgeIndexJobDataSchema,
  knowledgeIndexJobName,
  type KnowledgeIndexJobData,
  type KnowledgeIndexJobResult,
  systemPingJobDataSchema,
  systemPingJobName,
  type SystemPingJobResult,
} from "@ai-assist/contracts";

export type SystemJobProcessorDependencies = {
  processKnowledgeCrawl: (data: KnowledgeCrawlJobData) => Promise<KnowledgeCrawlJobResult>;
  processKnowledgeIndex: (data: KnowledgeIndexJobData) => Promise<KnowledgeIndexJobResult>;
};

export const processSystemJob = async (
  jobName: string,
  data: unknown,
  workerId: string,
  dependencies: SystemJobProcessorDependencies,
): Promise<SystemPingJobResult | KnowledgeIndexJobResult | KnowledgeCrawlJobResult> => {
  if (jobName === knowledgeCrawlJobName) {
    return dependencies.processKnowledgeCrawl(knowledgeCrawlJobDataSchema.parse(data));
  }
  if (jobName === knowledgeIndexJobName) {
    return dependencies.processKnowledgeIndex(knowledgeIndexJobDataSchema.parse(data));
  }
  if (jobName !== systemPingJobName) throw new Error(`Unsupported system job: ${jobName}`);

  systemPingJobDataSchema.parse(data);

  return {
    respondedAt: new Date().toISOString(),
    workerId,
  };
};

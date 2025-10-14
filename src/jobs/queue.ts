import { Queue } from 'bullmq';
import type { QueueOptions } from 'bullmq';
import { redisConnection } from './redis-config';

const defaultQueueOptions: QueueOptions = {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: {
      age: 3600,
      count: 100,
    },
    removeOnFail: {
      age: 24 * 3600,
    },
  },
};

export const analysisQueue = new Queue('analysis', defaultQueueOptions);

export interface AnalysisJobData {
  query: string;
  userId?: string;
  metadata?: Record<string, any>;
}

export async function addAnalysisJob(data: AnalysisJobData, jobId?: string) {
  return await analysisQueue.add('analyze', data, {
    jobId,
    attempts: 3,
  });
}

export async function scheduleAnalysisJob(
  data: AnalysisJobData,
  delayMs: number,
  jobId?: string
) {
  return await analysisQueue.add('analyze', data, {
    jobId,
    delay: delayMs,
  });
}

export async function addRecurringAnalysisJob(
  name: string,
  data: AnalysisJobData,
  cronExpression: string
) {
  return await analysisQueue.add('analyze', data, {
    repeat: {
      pattern: cronExpression,
    },
  });
}

export async function closeQueues() {
  await analysisQueue.close();
}

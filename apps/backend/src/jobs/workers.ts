import { Worker, Job } from 'bullmq';
import { redisConnection } from './redis-config';
import type { AnalysisJobData } from './queue';
import { runWorkflow } from '../workflow/graph';

export const analysisWorker = new Worker(
  'analysis',
  async (job: Job<AnalysisJobData>) => {
    console.log(`Processing analysis job ${job.id} with query: ${job.data.query}`);
    
    try {
      const result = await runWorkflow(job.data.query);
      
      await job.updateProgress(100);
      
      return {
        success: true,
        result,
        processedAt: new Date().toISOString(),
        metadata: job.data.metadata,
      };
    } catch (error) {
      console.error(`Analysis job ${job.id} failed:`, error);
      throw error;
    }
  },
  {
    connection: redisConnection,
    concurrency: 5,
    limiter: {
      max: 10, 
      duration: 1000, 
    },
  }
);

analysisWorker.on('completed', (job) => {
  console.log(`Analysis job ${job.id} completed successfully`);
});

analysisWorker.on('failed', (job, err) => {
  console.error(`Analysis job ${job?.id} failed:`, err.message);
});

analysisWorker.on('progress', (job, progress) => {
  console.log(`Analysis job ${job.id} progress: ${progress}%`);
});

export async function closeWorkers() {
  await analysisWorker.close();
}

console.log('BullMQ Workers Started');
console.log('Analysis Worker: Ready (concurrency: 5)');

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing workers...');
  await closeWorkers();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing workers...');
  await closeWorkers();
  process.exit(0);
});

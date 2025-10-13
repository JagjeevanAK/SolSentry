import { Worker, Job } from 'bullmq';
import { redisConnection } from './redis-config';
import type { 
  AnalysisJobData, 
  TransactionJobData, 
  NotificationJobData 
} from './queue';
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

export const transactionWorker = new Worker(
  'transaction',
  async (job: Job<TransactionJobData>) => {
    console.log(`Processing transaction job ${job.id} for: ${job.data.transactionSignature}`);
    
    try {
      const result = await processTransaction(job.data);
      
      await job.updateProgress(100);
      
      return {
        success: true,
        result,
        processedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error(`Transaction job ${job.id} failed:`, error);
      throw error;
    }
  },
  {
    connection: redisConnection,
    concurrency: 3,
  }
);

async function processTransaction(data: TransactionJobData) {
  return {
    signature: data.transactionSignature,
    action: data.action,
    processed: true,
  };
}

async function sendNotification(data: NotificationJobData) {
  console.log(`Sending ${data.type} notification to ${data.recipient}: ${data.message}`);
  return {
    sent: true,
    type: data.type,
    recipient: data.recipient,
  };
}

analysisWorker.on('completed', (job) => {
  console.log(`Analysis job ${job.id} completed successfully`);
});

analysisWorker.on('failed', (job, err) => {
  console.error(`Analysis job ${job?.id} failed:`, err.message);
});

analysisWorker.on('progress', (job, progress) => {
  console.log(`Analysis job ${job.id} progress: ${progress}%`);
});

transactionWorker.on('completed', (job) => {
  console.log(`Transaction job ${job.id} completed successfully`);
});

transactionWorker.on('failed', (job, err) => {
  console.error(`Transaction job ${job?.id} failed:`, err.message);
});

export async function closeWorkers() {
  await Promise.all([
    analysisWorker.close(),
    transactionWorker.close(),
  ]);
}

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

import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { analysisQueue } from './jobs/queue';
import './jobs/workers'; // Start the worker
import type { AnalysisJobData } from './jobs/queue';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/query', async (req: Request, res: Response) => {
  try {
    const { query, userId, metadata } = req.body;

    if (!query) {
      return res.status(400).json({
        error: 'Query is required',
        example: { query: 'Analyze wallet xyz...', userId: 'user123' },
      });
    }

    const job = await analysisQueue.add(
      'analysis-job',
      {
        query,
        userId,
        metadata,
      } as AnalysisJobData,
      {
        priority: metadata?.priority || 10,
        delay: metadata?.delay || 0,
      }
    );

    res.status(202).json({
      message: 'Job submitted successfully',
      jobId: job.id,
      data: {
        query,
        userId,
        metadata,
      },
      status: 'pending',
      links: {
        status: `/jobs/${job.id}`,
        result: `/jobs/${job.id}/result`,
      },
    });
  } catch (error) {
    console.error('Error submitting job:', error);
    res.status(500).json({
      error: 'Failed to submit job',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

app.get('/jobs/:jobId', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

    if (!jobId) {
      return res.status(400).json({ error: 'Job ID is required' });
    }

    const job = await analysisQueue.getJob(jobId);

    if (!job) {
      return res.status(404).json({
        error: 'Job not found',
        jobId,
      });
    }

    const state = await job.getState();
    const progress = job.progress;

    res.json({
      jobId: job.id,
      queue: 'analysis',
      state,
      progress,
      data: job.data,
      timestamp: job.timestamp,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
      failedReason: job.failedReason,
      attemptsMade: job.attemptsMade,
    });
  } catch (error) {
    console.error('Error fetching job status:', error);
    res.status(500).json({
      error: 'Failed to fetch job status',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

app.get('/jobs/:jobId/result', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

    if (!jobId) {
      return res.status(400).json({ error: 'Job ID is required' });
    }

    const job = await analysisQueue.getJob(jobId);

    if (!job) {
      return res.status(404).json({
        error: 'Job not found',
        jobId,
      });
    }

    const state = await job.getState();

    if (state === 'completed') {
      res.json({
        jobId: job.id,
        state,
        result: job.returnvalue,
        finishedOn: job.finishedOn,
      });
    } else if (state === 'failed') {
      res.status(500).json({
        jobId: job.id,
        state,
        error: job.failedReason,
        attemptsMade: job.attemptsMade,
      });
    } else {
      res.json({
        jobId: job.id,
        state,
        message: 'Job is still processing',
        progress: job.progress,
      });
    }
  } catch (error) {
    console.error('Error fetching job result:', error);
    res.status(500).json({
      error: 'Failed to fetch job result',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

app.get('/jobs', async (req: Request, res: Response) => {
  try {
    const { state = 'active', limit = '10' } = req.query;
    const limitNum = parseInt(limit as string);

    let jobs;
    switch (state) {
      case 'completed':
        jobs = await analysisQueue.getCompleted(0, limitNum - 1);
        break;
      case 'failed':
        jobs = await analysisQueue.getFailed(0, limitNum - 1);
        break;
      case 'delayed':
        jobs = await analysisQueue.getDelayed(0, limitNum - 1);
        break;
      case 'active':
      default:
        jobs = await analysisQueue.getActive(0, limitNum - 1);
        break;
    }

    res.json({
      queue: 'analysis',
      state,
      count: jobs.length,
      jobs: jobs.map((job) => ({
        id: job.id,
        name: job.name,
        data: job.data,
        progress: job.progress,
        timestamp: job.timestamp,
        processedOn: job.processedOn,
        finishedOn: job.finishedOn,
      })),
    });
  } catch (error) {
    console.error('Error listing jobs:', error);
    res.status(500).json({
      error: 'Failed to list jobs',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

app.delete('/jobs/:jobId', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

    if (!jobId) {
      return res.status(400).json({ error: 'Job ID is required' });
    }

    const job = await analysisQueue.getJob(jobId);

    if (!job) {
      return res.status(404).json({
        error: 'Job not found',
        jobId,
      });
    }

    await job.remove();

    res.json({
      message: 'Job removed successfully',
      jobId,
    });
  } catch (error) {
    console.error('Error removing job:', error);
    res.status(500).json({
      error: 'Failed to remove job',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

app.get('/queues/stats', async (req: Request, res: Response) => {
  try {
    const analysisStats = await analysisQueue.getJobCounts();

    res.json({
      queue: 'analysis',
      stats: analysisStats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching queue stats:', error);
    res.status(500).json({
      error: 'Failed to fetch queue statistics',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

export default app;

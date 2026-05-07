import {Worker} from 'bullmq';
import dotenv from 'dotenv';
import {redisConnection} from '../queues/redis.connection';
import {screenshotReport} from '../utils/screenshotReport';

dotenv.config();

export const reportWorker = new Worker(
  'report-queue',
  async job => {
    if (job.name === 'screenshot-report') {
      const {reportId} = job.data;
      console.log('Generating report screenshot for:', reportId);
      await screenshotReport(reportId);
    }
  },
  {
    connection: redisConnection,
    concurrency: 5,
  },
);

reportWorker.on('completed', job => {
  console.log(`Job ${job.id} completed`);
});

reportWorker.on('failed', (job, error) => {
  console.error(`Job ${job?.id} failed`, error);
});

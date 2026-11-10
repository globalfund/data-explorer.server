// Must be the first import: the modules below read process.env when loaded.
import 'dotenv/config';
import {UnrecoverableError, Worker} from 'bullmq';
import {createWorkerConnection} from '../queues/redis.connection';
import {
  screenshotReport,
  ThumbnailUnavailableError,
} from '../utils/screenshotReport';

export const reportWorker = new Worker(
  'report-queue',
  async job => {
    try {
      if (job.name === 'screenshot-report') {
        const {reportId, authorization, apiOrigin} = job.data;
        console.log('Generating report screenshot for:', reportId);
        await screenshotReport(reportId, false, {authorization, apiOrigin});
      } else if (job.name === 'screenshot-asset') {
        const {assetId, authorization, apiOrigin} = job.data;
        console.log('Generating asset screenshot for:', assetId);
        await screenshotReport(assetId, true, {authorization, apiOrigin});
      }
    } catch (error) {
      // Fail without the remaining attempts: they'd fail the same way.
      if (error instanceof ThumbnailUnavailableError) {
        throw new UnrecoverableError(error.message);
      }
      throw error;
    }
  },
  {
    connection: createWorkerConnection(),
    // Each job runs a full Chromium; keep this low.
    concurrency: Number(process.env.THUMBNAIL_WORKER_CONCURRENCY ?? 2),
  },
);

reportWorker.on('completed', job => {
  console.log(`Job ${job.id} completed`);
});

reportWorker.on('failed', (job, error) => {
  console.error(`Job ${job?.id} failed`, error);
});

// Let the current job finish (and its browser close) before exiting.
const shutdown = () => {
  reportWorker
    .close()
    .catch(error => console.error('Failed to close report worker', error))
    .finally(() => process.exit(0));
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

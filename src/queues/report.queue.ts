import {Queue} from 'bullmq';
import {redisConnection} from './redis.connection';

export const reportQueue = new Queue('report-queue', {
  connection: redisConnection,
});

export const queueReportThumbnailGeneration = async (reportId: string) => {
  const jobId = `report-thumbnail-${reportId}`;

  const existingJob = await reportQueue.getJob(jobId);

  if (existingJob) {
    const state = await existingJob.getState();

    if (state === 'waiting' || state === 'delayed') {
      await existingJob.remove();
    }
  }

  return reportQueue.add(
    'screenshot-report',
    {
      reportId,
      requestedAt: new Date().toISOString(),
    },
    {
      jobId,
      delay: 3000,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    },
  );
};

import {Queue} from 'bullmq';
import {getReadyRequestConnection} from './redis.connection';
import {PuppeteerAuth} from '../utils/puppeteerAuth';

/**
 * Autosave PATCHes every couple of seconds while someone edits. Each save
 * replaces the pending job, so this is how long editing has to pause before a
 * thumbnail is actually rendered.
 */
const THUMBNAIL_DEBOUNCE_MS = 10_000;

let reportQueue: Queue | undefined;

const getReportQueue = async () => {
  const connection = await getReadyRequestConnection();
  return (reportQueue ??= new Queue('report-queue', {connection}));
};

const queueThumbnail = async (
  jobName: 'screenshot-report' | 'screenshot-asset',
  jobId: string,
  data: Record<string, unknown>,
) => {
  const queue = await getReportQueue();
  const existingJob = await queue.getJob(jobId);

  if (existingJob) {
    const state = await existingJob.getState();

    if (state !== 'active') {
      await existingJob.remove();
    }
  }

  await queue.add(
    jobName,
    {...data, requestedAt: new Date().toISOString()},
    {
      jobId,
      delay: THUMBNAIL_DEBOUNCE_MS,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: true,
      // Job data holds the user's bearer token, so don't keep failures forever.
      removeOnFail: {age: 24 * 60 * 60, count: 100},
    },
  );
};

/**
 * Thumbnails are best effort: callers don't await this, and a Redis outage
 * must never fail or stall the save that triggered it.
 */
const queueThumbnailSafely = async (
  jobName: 'screenshot-report' | 'screenshot-asset',
  jobId: string,
  data: Record<string, unknown>,
) => {
  try {
    await queueThumbnail(jobName, jobId, data);
  } catch (error) {
    console.error(`Failed to queue thumbnail job ${jobId}`, error);
  }
};

export const queueReportThumbnailGeneration = (
  reportId: string,
  auth: PuppeteerAuth = {},
) =>
  queueThumbnailSafely('screenshot-report', `report-thumbnail-${reportId}`, {
    reportId,
    ...auth,
  });

export const queueAssetThumbnailGeneration = (
  assetId: string,
  auth: PuppeteerAuth = {},
) =>
  queueThumbnailSafely('screenshot-asset', `asset-thumbnail-${assetId}`, {
    assetId,
    ...auth,
  });

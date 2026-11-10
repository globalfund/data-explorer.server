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

// A job that's already rendering can't be removed; it finishes on its own.
const removePendingJob = async (queue: Queue, jobId: string) => {
  const existingJob = await queue.getJob(jobId);

  if (existingJob) {
    const state = await existingJob.getState();

    if (state !== 'active') {
      await existingJob.remove();
    }
  }
};

const queueThumbnail = async (
  jobName: 'screenshot-report' | 'screenshot-asset',
  jobId: string,
  data: Record<string, unknown>,
) => {
  const queue = await getReportQueue();
  await removePendingJob(queue, jobId);

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

const cancelThumbnailSafely = async (jobId: string) => {
  try {
    await removePendingJob(await getReportQueue(), jobId);
  } catch (error) {
    console.error(`Failed to cancel thumbnail job ${jobId}`, error);
  }
};

/** Drops a deleted report's pending thumbnail, so it isn't rendered anyway. */
export const cancelReportThumbnailGeneration = (reportId: string) =>
  cancelThumbnailSafely(`report-thumbnail-${reportId}`);

/** Drops a deleted asset's pending thumbnail, so it isn't rendered anyway. */
export const cancelAssetThumbnailGeneration = (assetId: string) =>
  cancelThumbnailSafely(`asset-thumbnail-${assetId}`);

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

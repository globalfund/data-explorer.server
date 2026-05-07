import {Queue} from 'bullmq';
import {redisConnection} from './redis.connection';

export const reportQueue = new Queue('report-queue', {
  connection: redisConnection,
});

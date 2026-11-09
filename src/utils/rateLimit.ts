// src/utils/rateLimit.ts

import {HttpErrors} from '@loopback/rest';
import {getReadyRequestConnection} from '../queues/redis.connection';

const incrementScript = `
  local current = redis.call('INCR', KEYS[1])

  if current == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
  end

  return current
`;

async function checkWindow({
  key,
  limit,
  windowSeconds,
}: {
  key: string;
  limit: number;
  windowSeconds: number;
}) {
  const count = Number(
    await (
      await getReadyRequestConnection()
    ).eval(incrementScript, 1, key, windowSeconds),
  );

  if (count > limit) {
    throw new HttpErrors.TooManyRequests(
      'Too many error reports. Please try again later.',
    );
  }
}

export async function rateLimitErrorReport(userId: string) {
  const now = Date.now();

  const minuteBucket = Math.floor(now / 60_000);
  const hourBucket = Math.floor(now / 3_600_000);

  await checkWindow({
    key: `rate-limit:error-report:${userId}:minute:${minuteBucket}`,
    limit: 5,
    windowSeconds: 120,
  });

  await checkWindow({
    key: `rate-limit:error-report:${userId}:hour:${hourBucket}`,
    limit: 30,
    windowSeconds: 7200,
  });
}
